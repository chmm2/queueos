process.env.JWT_SECRET = process.env.JWT_SECRET || 'transfer-test-secret';
// Wait-time predictions call out to the ML service. These tests are about
// transfers, so make that call fail instantly (and fall back to the formula)
// rather than depend on whether a model service happens to be running — or
// answering slowly — on whatever machine runs them.
process.env.ML_SERVICE_URL = 'http://127.0.0.1:9/predict';
// Windows takes ~2s to report a refused local connection (Linux is instant), so
// cap the wait as well; otherwise every issued token costs a couple of seconds.
process.env.ML_TIMEOUT_MS = '50';

// Rendering the QR image takes ~2s under Jest (11ms in plain Node) and has
// nothing to do with transfers, so it is stubbed out here.
jest.mock('../../src/services/qrService', () => ({
  generateTokenQr: async () => 'data:image/png;base64,stub',
  generateBranchQr: async () => ({ url: 'http://test', dataUrl: 'data:image/png;base64,stub', expiresInSeconds: 45 }),
}));

const mongoose = require('mongoose');
const Token = require('../../src/models/Token');
const Branch = require('../../src/models/Branch');
const Department = require('../../src/models/Department');
const Room = require('../../src/models/Room');
const Counter = require('../../src/models/Counter');
const AuditLog = require('../../src/models/AuditLog');
const TokenSequence = require('../../src/models/TokenSequence');
const { issueToken } = require('../../src/services/queueService');
const { transferToken, currentToken, visitStops } = require('../../src/services/visitService');

/**
 * Sending a patient to another room. The rule that matters most is that the
 * patient's existing link keeps working, so the tests are written from their
 * side: they hold the FIRST token's id, and must always find the visit.
 */
const { connect, disconnect } = require('../helpers/db');

beforeAll(connect);
afterAll(disconnect);

const org = new mongoose.Types.ObjectId();
let branch; let otherBranch;
let reg; let pharm; let lab; let multi; // departments
let regRoom; let pharmRoom; let frontDesk; let emptyRoom; let foreignRoom;

beforeEach(async () => {
  await Promise.all([
    Token.deleteMany({}), AuditLog.deleteMany({}), Counter.deleteMany({}),
    Room.deleteMany({}), Department.deleteMany({}), Branch.deleteMany({}), TokenSequence.deleteMany({}),
  ]);
  branch = await Branch.create({ organization: org, name: 'Main' });
  otherBranch = await Branch.create({ organization: org, name: 'Annex' });
  reg = await Department.create({ organization: org, branch: branch._id, name: 'Registration', tokenPrefix: 'R' });
  pharm = await Department.create({ organization: org, branch: branch._id, name: 'Pharmacy', tokenPrefix: 'P' });
  lab = await Department.create({ organization: org, branch: branch._id, name: 'Lab', tokenPrefix: 'L' });
  multi = await Department.create({ organization: org, branch: branch._id, name: 'Billing', tokenPrefix: 'B' });
  regRoom = await Room.create({ organization: org, branch: branch._id, name: 'Registration', departments: [reg._id] });
  pharmRoom = await Room.create({ organization: org, branch: branch._id, name: 'Pharmacy', departments: [pharm._id] });
  frontDesk = await Room.create({ organization: org, branch: branch._id, name: 'Front desk', departments: [lab._id, multi._id] });
  emptyRoom = await Room.create({ organization: org, branch: branch._id, name: 'Empty', departments: [] });
  foreignRoom = await Room.create({ organization: org, branch: otherBranch._id, name: 'Elsewhere', departments: [] });
});

// A patient who just joined Registration, holding the link for `first`.
async function patient(name = 'Asha') {
  const { token } = await issueToken({
    organization: org, branchId: branch._id, departmentId: reg._id, roomId: regRoom._id,
    source: 'online', customerName: name, customerPhone: '+911234567890',
  });
  return token;
}

const send = (token, roomId, departmentId) =>
  transferToken({ token, roomId, departmentId, actorId: null, organization: org });

describe('sending a patient to another room', () => {
  test('creates a NEW token with a new id and a number from the destination queue', async () => {
    const first = await patient();
    const { to, from } = await send(first, pharmRoom._id);

    expect(String(to._id)).not.toBe(String(first._id));
    expect(to.tokenNumber).toMatch(/^P-/); // Pharmacy's own numbering, not Registration's
    expect(from.status).toBe('transferred');
    expect(String(from.transferredTo)).toBe(String(to._id));
    expect(String(to.department)).toBe(String(pharm._id));
    expect(String(to.room)).toBe(String(pharmRoom._id));
  });

  test('the patient’s link keeps working: the first token still leads to the visit', async () => {
    const first = await patient();
    const { to } = await send(first, pharmRoom._id);

    // The link only knows the first token's id and its session.
    const reloaded = await Token.findById(first._id);
    expect(String((await currentToken(reloaded))._id)).toBe(String(to._id));
    // Same session, so the credential already in the patient's browser still verifies.
    expect(to.sessionId).toBe(first.sessionId);
    // And the visit is identified by that first token.
    expect(String(to.visit)).toBe(String(first._id));
  });

  test('follows the patient through more than one transfer', async () => {
    const first = await patient();
    const { to: second } = await send(first, pharmRoom._id);
    const { to: third } = await send(second, frontDesk._id, lab._id);

    const reloaded = await Token.findById(first._id);
    expect(String((await currentToken(reloaded))._id)).toBe(String(third._id));

    const stops = await visitStops(reloaded);
    expect(stops.map((s) => s.status)).toEqual(['transferred', 'transferred', 'waiting']);
    expect(stops.map((s) => s.tokenNumber.charAt(0))).toEqual(['R', 'P', 'L']);
  });

  test('joins the BACK of the destination line, not its front', async () => {
    // Two people are already waiting at Pharmacy.
    const a = await issueToken({ organization: org, branchId: branch._id, departmentId: pharm._id, roomId: pharmRoom._id });
    const b = await issueToken({ organization: org, branchId: branch._id, departmentId: pharm._id, roomId: pharmRoom._id });
    const first = await patient();
    const { to } = await send(first, pharmRoom._id);

    const line = await Token.find({ department: pharm._id, status: 'waiting' })
      .sort({ isPriority: -1, orderKey: 1 });
    expect(line.map((t) => String(t._id))).toEqual([String(a.token._id), String(b.token._id), String(to._id)]);
    expect(to.etaFeatures.queuePosition).toBe(3); // a snapshot of THIS queue, for the wait model
  });

  test('a transfer from the counter releases that counter', async () => {
    const first = await patient();
    const counter = await Counter.create({
      organization: org, branch: branch._id, room: regRoom._id, name: 'Counter 1',
      email: 'c1@test.app', password: 'x', status: 'open',
    });
    await Token.updateOne({ _id: first._id }, { status: 'serving', counter: counter._id, startedAt: new Date() });
    await Counter.updateOne({ _id: counter._id }, { currentToken: first._id });

    await send(await Token.findById(first._id), pharmRoom._id);
    expect((await Counter.findById(counter._id)).currentToken).toBeNull();
  });

  test('a stop that was served and then sent on still counts as a served stop', async () => {
    const first = await patient();
    await Token.updateOne({ _id: first._id }, { status: 'serving', startedAt: new Date(Date.now() - 120000) });
    const { from } = await send(await Token.findById(first._id), pharmRoom._id);

    expect(Token.SERVED_STATUSES).toContain(from.status);
    expect(from.startedAt).toBeInstanceOf(Date);
    expect(from.completedAt).toBeInstanceOf(Date); // the service time at this stop is real
  });

  test('writes an audit entry naming where the patient went', async () => {
    const first = await patient();
    const { to } = await send(first, pharmRoom._id);
    const log = await AuditLog.findOne({ token: first._id, action: 'TOKEN_TRANSFERRED' });
    expect(log).not.toBeNull();
    expect(log.metadata.newToken).toBe(to.tokenNumber);
    expect(String(log.metadata.toRoom)).toBe(String(pharmRoom._id));
  });
});

describe('what a counter is allowed to ask for', () => {
  test('a room that serves several departments needs the department named', async () => {
    const first = await patient();
    await expect(send(first, frontDesk._id)).rejects.toMatchObject({ statusCode: 400 });
    const { to } = await send(first, frontDesk._id, multi._id);
    expect(to.tokenNumber).toMatch(/^B-/);
  });

  test('cannot name a department the chosen room does not serve', async () => {
    const first = await patient();
    await expect(send(first, pharmRoom._id, lab._id)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('cannot send someone to a room that serves nothing yet', async () => {
    const first = await patient();
    await expect(send(first, emptyRoom._id)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('cannot send someone to a room in another branch', async () => {
    const first = await patient();
    await expect(send(first, foreignRoom._id)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('cannot send someone to the queue they are already in', async () => {
    const first = await patient();
    await expect(send(first, regRoom._id)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('refuses to send a finished token onward', async () => {
    const first = await patient();
    await Token.updateOne({ _id: first._id }, { status: 'completed' });
    await expect(send(await Token.findById(first._id), pharmRoom._id)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('two counters moving the same patient', () => {
  test('exactly one transfer wins and the patient ends up in one queue', async () => {
    const first = await patient();
    const stale = await Token.findById(first._id); // both counters hold this same snapshot

    const results = await Promise.allSettled([
      send(stale, pharmRoom._id),
      send(stale, frontDesk._id, lab._id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    // One live token for this patient, not two.
    const live = await Token.countDocuments({ visit: first._id, status: 'waiting' });
    expect(live).toBe(1);
  });
});
