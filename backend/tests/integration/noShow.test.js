const mongoose = require('mongoose');
const Token = require('../../src/models/Token');
const AuditLog = require('../../src/models/AuditLog');
const { recordNoShow } = require('../../src/services/noShowService');

/**
 * The no-show penalty is the rule customers feel most directly, so it gets
 * real coverage: each miss must cost them a specific, escalating number of
 * places, and the token must eventually be spent.
 */
const { connect, disconnect } = require('../helpers/db');

beforeAll(connect);
afterAll(disconnect);
afterEach(async () => {
  await Promise.all([Token.deleteMany({}), AuditLog.deleteMany({})]);
});

const org = new mongoose.Types.ObjectId();
const branch = new mongoose.Types.ObjectId();
const department = new mongoose.Types.ObjectId();

// A queue of `n` waiting tokens, one second apart, plus the one being served.
async function buildQueue(n) {
  const base = Date.now();
  const waiting = [];
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    waiting.push(await Token.create({
      organization: org, branch, department,
      tokenNumber: `W-${String(i + 1).padStart(3, '0')}`,
      status: 'waiting',
      orderKey: new Date(base + i * 1000),
    }));
  }
  const serving = await Token.create({
    organization: org, branch, department,
    tokenNumber: 'S-001',
    status: 'serving',
    counter: new mongoose.Types.ObjectId(),
    orderKey: new Date(base - 1000), // was at the front
  });
  return { waiting, serving };
}

// The queue as a customer would see it.
async function queueOrder() {
  const rows = await Token.find({ department, status: 'waiting' })
    .sort({ isPriority: -1, orderKey: 1 })
    .select('tokenNumber');
  return rows.map((r) => r.tokenNumber);
}

describe('progressive no-show penalty', () => {
  test('a first no-show puts them back in at position 2', async () => {
    const { serving } = await buildQueue(6);
    const result = await recordNoShow({ token: serving, organization: null });

    expect(result.outcome).toBe('requeued');
    expect(result.noShowCount).toBe(1);
    expect(result.position).toBe(2);
    expect(await queueOrder()).toEqual(['W-001', 'S-001', 'W-002', 'W-003', 'W-004', 'W-005', 'W-006']);
  });

  test('a second no-show drops them further, to position 4', async () => {
    const { serving } = await buildQueue(6);
    await recordNoShow({ token: serving, organization: null });

    // They get called again and miss again.
    serving.status = 'serving';
    serving.counter = new mongoose.Types.ObjectId();
    await serving.save();

    const result = await recordNoShow({ token: serving, organization: null });
    expect(result.noShowCount).toBe(2);
    expect(result.position).toBe(4);
    expect((await queueOrder())[3]).toBe('S-001');
  });

  test('the third no-show spends the token — a new one is needed', async () => {
    const { serving } = await buildQueue(6);
    for (let i = 0; i < 2; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await recordNoShow({ token: serving, organization: null });
      serving.status = 'serving';
      // eslint-disable-next-line no-await-in-loop
      await serving.save();
    }

    const result = await recordNoShow({ token: serving, organization: null });
    expect(result.outcome).toBe('removed');
    expect(result.noShowCount).toBe(3);

    const fresh = await Token.findById(serving._id);
    expect(fresh.status).toBe('missed');
    expect(await queueOrder()).not.toContain('S-001');
  });

  test('a short queue just puts them at the back rather than failing', async () => {
    const { serving } = await buildQueue(1);
    const result = await recordNoShow({ token: serving, organization: null });
    expect(result.outcome).toBe('requeued');
    expect(await queueOrder()).toEqual(['W-001', 'S-001']);
  });

  test('the policy is configurable per organization', async () => {
    const { serving } = await buildQueue(8);
    const organization = { settings: { noShow: { penaltyPositions: [5], maxNoShows: 2 } } };

    const first = await recordNoShow({ token: serving, organization });
    expect(first.position).toBe(5);

    serving.status = 'serving';
    await serving.save();
    const second = await recordNoShow({ token: serving, organization });
    expect(second.outcome).toBe('removed'); // maxNoShows of 2 reached
  });

  test('every no-show is written to the audit log', async () => {
    const { serving } = await buildQueue(4);
    await recordNoShow({ token: serving, organization: null });

    const logs = await AuditLog.find({ token: serving._id });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('TOKEN_NO_SHOW_REQUEUED');
    expect(logs[0].metadata.noShowCount).toBe(1);
  });

  test('a penalised customer never leapfrogs a priority token', async () => {
    const { serving } = await buildQueue(4);
    // Someone in the same queue holds a priority pass.
    await Token.create({
      organization: org, branch, department,
      tokenNumber: 'P-001', status: 'waiting', isPriority: true,
      priorityReason: 'Elderly', orderKey: new Date(),
    });

    await recordNoShow({ token: serving, organization: null });
    expect((await queueOrder())[0]).toBe('P-001'); // priority still first
  });
});
