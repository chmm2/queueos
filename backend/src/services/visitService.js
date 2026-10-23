const Token = require('../models/Token');
const Room = require('../models/Room');
const Department = require('../models/Department');
const Counter = require('../models/Counter');
const AuditLog = require('../models/AuditLog');
const { canTransition } = require('./tokenStateMachine');
const { issueToken } = require('./queueService');
const { recalcDepartmentEtas } = require('./etaService');
const { emitQueueUpdate } = require('../sockets');

/**
 * A VISIT is one person's trip through a branch, made of one or more STOPS.
 * Every stop is an ordinary token — its own number, its own place in line, its
 * own timings — so numbering, the state machine, the audit log and the wait
 * model all treat a transferred patient exactly like anyone else who joined
 * that queue. A transfer used to move the SAME token to a new department,
 * which carried its original place in line (and its original issue time, and
 * so a wait that included the previous stop) into the new queue.
 *
 * The patient only ever holds one link, the one issued with the first token.
 * It keeps working because lookups start from that token and follow
 * `transferredTo` to whichever stop is current.
 */

// A visit this long is a bug, not a patient. Bounds the walk so a corrupted
// chain can never loop forever.
const MAX_STOPS = 20;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

/** The stop a visit is at now: follow `transferredTo` from any earlier token. */
async function currentToken(token) {
  let current = token;
  for (let hops = 0; current.transferredTo && hops < MAX_STOPS; hops += 1) {
    // eslint-disable-next-line no-await-in-loop
    const next = await Token.findById(current.transferredTo);
    if (!next) break; // dangling link: stay on the last token that exists
    current = next;
  }
  return current;
}

/** Every stop of the visit, oldest first, with department and room names. */
async function visitStops(token) {
  return Token.find({ visit: token.visit || token._id })
    .sort({ issuedAt: 1 })
    .populate('department', 'name')
    .populate('room', 'name');
}

/**
 * Work out where the patient is being sent. A room is what a counter can see
 * and choose; a room may serve several departments, in which case the counter
 * must say which. Sending by department alone is accepted too.
 */
async function resolveDestination({ token, roomId, departmentId, organization }) {
  let room = null;
  let department = null;

  if (roomId) {
    room = await Room.findOne({
      _id: roomId, branch: token.branch, organization, isActive: true,
    }).populate({ path: 'departments', match: { isActive: true } });
    if (!room) throw httpError('That room is not part of this branch', 404);

    const served = room.departments || [];
    if (served.length === 0) throw httpError('That room does not serve any department yet', 400);
    if (departmentId) {
      department = served.find((d) => String(d._id) === String(departmentId));
      if (!department) throw httpError('That room does not serve that department', 400);
    } else if (served.length === 1) {
      [department] = served;
    } else {
      throw httpError('Choose which department in that room', 400);
    }
  } else if (departmentId) {
    department = await Department.findOne({
      _id: departmentId, branch: token.branch, organization, isActive: true,
    });
    if (!department) throw httpError('Department not found', 404);
    room = await Room.findOne({
      branch: token.branch, organization, departments: department._id, isActive: true,
    });
  } else {
    throw httpError('Choose where to send them', 400);
  }

  if (String(department._id) === String(token.department)) {
    throw httpError('They are already in that department', 409);
  }
  return { room, department };
}

/**
 * Send a patient on to another room's queue.
 *
 * The old token ends (`transferred`) and a NEW token — new ID, new number,
 * joining the back of the destination queue like anyone else — continues the
 * visit under the same session, so the link the patient already has follows
 * them there.
 */
async function transferToken({ token, roomId, departmentId, actorId = null, organization }) {
  if (!canTransition(token.status, 'transferred')) {
    throw httpError(`Cannot send a ${token.status} token onward`, 409);
  }
  const { room, department } = await resolveDestination({ token, roomId, departmentId, organization });

  const priorStatus = token.status;
  const visit = token.visit || token._id;

  // Claim the old token first. If two counters (or a double click) race to move
  // the same patient, exactly one claim matches; the other finds nothing.
  const claimed = await Token.findOneAndUpdate(
    { _id: token._id, status: priorStatus, transferredTo: null },
    { status: 'transferred', completedAt: new Date(), recallDeadline: null, visit },
    { new: true }
  );
  if (!claimed) throw httpError('That patient was just moved or served', 409);

  let next;
  try {
    next = await issueToken({
      organization,
      branchId: token.branch,
      departmentId: department._id,
      roomId: room ? room._id : null,
      source: token.source,
      customerName: token.customerName,
      customerPhone: token.customerPhone,
      user: token.user,
      actorId,
      visit,
      sessionId: token.sessionId,
    });
  } catch (err) {
    // Never strand a patient: if the new token could not be made, give the old one back.
    await Token.updateOne(
      { _id: token._id, status: 'transferred', transferredTo: null },
      { status: priorStatus, completedAt: null }
    );
    throw err;
  }

  const linked = await Token.findByIdAndUpdate(
    token._id,
    { transferredTo: next.token._id },
    { new: true }
  );
  if (priorStatus === 'serving' && token.counter) {
    await Counter.updateOne({ _id: token.counter, currentToken: token._id }, { currentToken: null });
  }

  await AuditLog.create({
    organization,
    token: token._id,
    branch: token.branch,
    actor: actorId,
    action: 'TOKEN_TRANSFERRED',
    fromStatus: priorStatus,
    toStatus: 'transferred',
    metadata: {
      fromDepartment: token.department,
      toDepartment: department._id,
      toRoom: room ? room._id : null,
      newToken: next.token.tokenNumber,
      newTokenId: next.token._id,
    },
  });

  await Promise.all([
    recalcDepartmentEtas(token.branch, token.department),
    recalcDepartmentEtas(token.branch, department._id),
  ]);
  emitQueueUpdate(token.branch, { type: 'transfer', tokenId: next.token._id, department: department._id });

  return { from: linked, to: next.token, department, room };
}

module.exports = { currentToken, visitStops, transferToken, MAX_STOPS };
