const mongoose = require('mongoose');

const { nextTokenNumber } = require('../../src/services/sequenceService');
const stateMachine = require('../../src/services/tokenStateMachine');
const Token = require('../../src/models/Token');
const AuditLog = require('../../src/models/AuditLog');

/**
 * Integration tests against a real MongoDB — these prove the two
 * correctness-under-load claims that pure unit tests can't. Uses an in-memory
 * MongoDB by default; set TEST_MONGO_URI to point at a throwaway database
 * instead (useful in sandboxes that can't download the mongod binary).
 */
let mongod;
beforeAll(async () => {
  let uri = process.env.TEST_MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
  }
  await mongoose.connect(uri);
});
afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});
afterEach(async () => {
  await Promise.all([Token.deleteMany({}), AuditLog.deleteMany({})]);
});

describe('atomic token numbering', () => {
  test('never collides, even under concurrent issuance', async () => {
    const ids = {
      organization: new mongoose.Types.ObjectId(),
      branch: new mongoose.Types.ObjectId(),
      department: new mongoose.Types.ObjectId(),
    };
    // Fire 30 issuances at once — the exact race the atomic $inc guards against.
    const numbers = await Promise.all(
      Array.from({ length: 30 }, () => nextTokenNumber({ ...ids, prefix: 'A', timezone: 'UTC' }))
    );
    expect(new Set(numbers).size).toBe(30); // all unique
    expect(numbers).toContain('A-001');
    expect(numbers).toContain('A-030');
  });

  test('numbering is independent per department', async () => {
    const base = { organization: new mongoose.Types.ObjectId(), branch: new mongoose.Types.ObjectId(), timezone: 'UTC' };
    const d1 = new mongoose.Types.ObjectId();
    const d2 = new mongoose.Types.ObjectId();
    const a = await nextTokenNumber({ ...base, department: d1, prefix: 'A' });
    const b = await nextTokenNumber({ ...base, department: d2, prefix: 'B' });
    expect(a).toBe('A-001');
    expect(b).toBe('B-001'); // separate counter, not A-002
  });
});

describe('state-machine transitions + audit log', () => {
  const org = new mongoose.Types.ObjectId();
  const branch = new mongoose.Types.ObjectId();

  test('a valid transition updates status AND writes an audit entry', async () => {
    const token = await Token.create({ organization: org, branch, tokenNumber: 'A-001', status: 'waiting' });
    const updated = await stateMachine.transition(token._id, 'serving');
    expect(updated.status).toBe('serving');
    expect(updated.startedAt).toBeInstanceOf(Date);

    const logs = await AuditLog.find({ token: token._id });
    expect(logs).toHaveLength(1);
    expect(logs[0].fromStatus).toBe('waiting');
    expect(logs[0].toStatus).toBe('serving');
  });

  test('an illegal transition throws a 409 and changes nothing', async () => {
    const token = await Token.create({ organization: org, branch, tokenNumber: 'A-002', status: 'waiting' });
    await expect(stateMachine.transition(token._id, 'completed')).rejects.toMatchObject({ statusCode: 409 });

    const fresh = await Token.findById(token._id);
    expect(fresh.status).toBe('waiting'); // untouched
    expect(await AuditLog.countDocuments({ token: token._id })).toBe(0);
  });
});
