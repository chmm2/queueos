const mongoose = require('mongoose');

/**
 * Test database lifecycle.
 *
 * Jest runs test FILES in parallel workers, so each worker gets its own
 * database name — otherwise one file's cleanup deletes documents another file
 * is still using, producing failures that look like real bugs but aren't.
 *
 * Uses an in-memory MongoDB by default; set TEST_MONGO_URI to point at a
 * throwaway server instead (useful in sandboxes that can't download mongod).
 */
let mongod;

async function connect() {
  const worker = process.env.JEST_WORKER_ID || '1';
  let uri = process.env.TEST_MONGO_URI;

  if (uri) {
    // Give this worker its own database on the shared server.
    uri = uri.replace(/(\/[^/?]*)(\?|$)/, `$1-w${worker}$2`);
  } else {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
  }
  await mongoose.connect(uri);
}

async function disconnect() {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

module.exports = { connect, disconnect };
