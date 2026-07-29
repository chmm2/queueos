const Token = require('../models/Token');
const Branch = require('../models/Branch');
const Service = require('../models/Service');
const Counter = require('../models/Counter');
const AuditLog = require('../models/AuditLog');
const { nextTokenNumber } = require('./sequenceService');
const { predictEta, recalcServiceEtas, openCounterCount } = require('./etaService');
const { generateTokenQr } = require('./qrService');
const { signSession } = require('./tokenService');
const { notify } = require('./notificationService');
const { emitQueueUpdate, emitTokenCalled } = require('../sockets');
const { randomUUID } = require('crypto');

/**
 * Single source of truth for issuing a token and calling the next one.
 * Both the staff console (routes/tokens.js) and the public QR-join flow
 * (routes/public.js) go through here, so numbering, ETA, QR, audit and
 * real-time broadcast behave identically no matter who issued the token.
 */

async function issueToken({
  organization,
  branchId,
  serviceId,
  source = 'walk-in',
  isPriority = false,
  customerName = null,
  customerPhone = null,
  customerEmail = null,
  user = null,
  actorId = null,
}) {
  const [branch, service] = await Promise.all([
    Branch.findById(branchId),
    Service.findById(serviceId),
  ]);
  if (!branch) throw Object.assign(new Error('Branch not found'), { statusCode: 404 });
  if (!service) throw Object.assign(new Error('Service not found'), { statusCode: 404 });

  const tokenNumber = await nextTokenNumber({
    organization,
    branch: branch._id,
    service: service._id,
    prefix: service.tokenPrefix,
    timezone: branch.timezone,
  });

  // Position = how many are already waiting for this service + this one.
  const ahead = await Token.countDocuments({
    branch: branch._id,
    service: service._id,
    status: 'waiting',
  });
  const priority = isPriority || service.queueType === 'vip' || service.queueType === 'emergency';
  const openCounters = await openCounterCount(branch._id);
  const queuePosition = ahead + 1;
  const avgServiceSeconds = service.avgServiceTimeSeconds;
  const { etaSeconds, source: etaSource } = await predictEta({
    organization,
    queuePosition,
    isPriority: priority,
    avgServiceSeconds,
    openCounters,
  });

  const sessionId = randomUUID();
  const token = await Token.create({
    organization,
    branch: branch._id,
    service: service._id,
    tokenNumber,
    source,
    isPriority: priority,
    customerName,
    customerPhone,
    sessionId,
    user: user || null,
    predictedEtaSeconds: etaSeconds,
    etaSource,
    // Snapshot the features so this token becomes a labeled training example
    // once it's served (features + measured actual wait).
    etaFeatures: { queuePosition, avgServiceSeconds, openCounters },
  });

  const sessionToken = signSession(token._id, sessionId);
  token.qrCode = await generateTokenQr(token, sessionToken);
  await token.save();

  await AuditLog.create({
    organization,
    token: token._id,
    branch: branch._id,
    actor: actorId,
    action: 'TOKEN_ISSUED',
    toStatus: 'waiting',
    metadata: { source, isPriority: priority, service: service.name },
  });

  // Fire notification off the critical path.
  notify(
    { ...token.toObject(), organization, branchName: branch.name, customerEmail },
    'issued'
  ).catch(() => {});

  emitQueueUpdate(branch._id, { type: 'issued', tokenId: token._id, service: service._id });

  return {
    token,
    sessionToken,
    position: ahead + 1,
    serviceName: service.name,
    branchName: branch.name,
  };
}

/**
 * Race-safe "call next": atomically claims the highest-priority waiting token
 * among the counter's services and moves it to `serving`. The conditional
 * update ({ status: 'waiting' }) guarantees two staff can't grab the same
 * token — the second claim simply finds nothing and retries.
 */
async function callNext({ counter, actorId }) {
  const services = counter.services && counter.services.length ? counter.services : null;
  const baseFilter = {
    branch: counter.branch,
    organization: counter.organization,
    status: 'waiting',
    ...(services ? { service: { $in: services } } : {}),
  };

  // Try a few candidates in priority/FIFO order in case of contention.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const candidate = await Token.findOne(baseFilter).sort({ isPriority: -1, issuedAt: 1 });
    if (!candidate) return null; // queue empty

    const now = new Date();
    // eslint-disable-next-line no-await-in-loop
    const claimed = await Token.findOneAndUpdate(
      { _id: candidate._id, status: 'waiting' }, // guard: still waiting
      { status: 'serving', counter: counter._id, calledAt: now, startedAt: now },
      { new: true }
    );
    if (!claimed) continue; // someone else took it — retry

    // eslint-disable-next-line no-await-in-loop
    await Promise.all([
      Counter.findByIdAndUpdate(counter._id, { currentToken: claimed._id, status: 'open' }),
      AuditLog.create({
        organization: counter.organization,
        token: claimed._id,
        branch: counter.branch,
        actor: actorId,
        action: 'TOKEN_SERVING',
        fromStatus: 'waiting',
        toStatus: 'serving',
        metadata: { counter: counter.name },
      }),
    ]);

    emitTokenCalled(counter.branch, {
      tokenNumber: claimed.tokenNumber,
      counterId: counter._id,
      counterName: counter.name,
    });

    // Tell the customer it's their turn (WhatsApp/SMS/email — off the hot path).
    notify(
      { ...claimed.toObject(), organization: counter.organization, counterName: counter.name },
      'your_turn'
    ).catch(() => {});

    // eslint-disable-next-line no-await-in-loop
    await recalcServiceEtas(counter.branch, claimed.service);
    return claimed;
  }
  return null;
}

module.exports = { issueToken, callNext };
