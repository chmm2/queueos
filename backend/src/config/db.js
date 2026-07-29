const mongoose = require('mongoose');

/**
 * Connects to MongoDB with production-sensible timeouts and connection-event
 * logging so transient drops are visible in logs (Mongoose buffers and
 * auto-reconnects). The initial connect failing is fatal — there's nothing
 * useful the API can do without its database.
 */
async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/queue-platform';

  mongoose.connection.on('disconnected', () => console.warn('[db] disconnected'));
  mongoose.connection.on('reconnected', () => console.log('[db] reconnected'));
  mongoose.connection.on('error', (err) => console.error('[db] error:', err.message));

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000, // fail fast if no server is reachable
      socketTimeoutMS: 45000,
      maxPoolSize: 20,
    });
    console.log('[db] connected');
  } catch (err) {
    console.error('[db] initial connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
