require('dotenv').config();
require('express-async-errors'); // route handlers that throw/reject reach the error handler
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const mongoose = require('mongoose');
const axios = require('axios');
const { Server } = require('socket.io');

const { validateEnv } = require('./config/env');
const connectDB = require('./config/db');
const { initSocket } = require('./sockets');
const { startAutoMiss, stopAutoMiss } = require('./services/autoMiss');
const { startTrainingScheduler, stopTrainingScheduler } = require('./services/trainingService');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const branchRoutes = require('./routes/branches');
const serviceRoutes = require('./routes/services');
const counterRoutes = require('./routes/counters');
const zoneRoutes = require('./routes/zones');
const tokenRoutes = require('./routes/tokens');
const analyticsRoutes = require('./routes/analytics');
const publicRoutes = require('./routes/public');

validateEnv(); // refuse to boot in an unsafe/misconfigured state

const app = express();
const server = http.createServer(app);

const { withScheme } = require('./config/urls');
const CLIENT_URL = withScheme(process.env.CLIENT_URL || '*');
const io = new Server(server, { cors: { origin: CLIENT_URL, methods: ['GET', 'POST'] } });

app.set('trust proxy', 1); // correct client IPs behind a reverse proxy (rate limiting)
app.use(helmet());
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: '100kb' })); // bound request bodies

// Baseline rate limit on the whole API; auth + public flows add tighter limits.
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth', rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }));

// Liveness: is the process up? (used by container HEALTHCHECK)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Readiness: are our dependencies reachable? (used by load balancers / k8s)
app.get('/ready', async (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  let mlUp = false;
  try {
    const base = (process.env.ML_SERVICE_URL || 'http://localhost:6000/predict').replace(/\/predict$/, '');
    await axios.get(`${base}/health`, { timeout: 1000 });
    mlUp = true;
  } catch {
    mlUp = false;
  }
  // The API is "ready" if the DB is up; ML is optional (there's a fallback).
  const ready = dbUp;
  res.status(ready ? 200 : 503).json({ ready, db: dbUp, ml: mlUp });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/counters', counterRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/public', publicRoutes); // unauthenticated customer + display endpoints

// Unknown API route -> JSON 404 (not an HTML error page).
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

// Centralized error handler. Client (4xx) messages are safe to return; for
// unexpected 5xx we log the detail but return a generic message so internals
// (stack traces, driver errors) never leak to callers.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  if (status >= 500) {
    console.error('[error]', err.stack || err.message);
    return res.status(status).json({ message: 'Internal server error' });
  }
  return res.status(status).json({ message: err.message });
});

initSocket(io);

const PORT = process.env.PORT || 5000;
let httpServer;

connectDB().then(() => {
  startAutoMiss(); // begin sweeping expired no-show tokens
  startTrainingScheduler(); // learn each org's ETA model from its real visits
  httpServer = server.listen(PORT, () => console.log(`[server] listening on port ${PORT}`));
});

/**
 * Graceful shutdown: on a container stop (SIGTERM) or Ctrl-C (SIGINT), stop
 * accepting work, finish what's in flight, and close resources cleanly so we
 * don't drop connections or leave the sweeper running.
 */
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received — shutting down gracefully`);
  stopAutoMiss();
  stopTrainingScheduler();
  io.close();
  const forceExit = setTimeout(() => {
    console.error('[server] forced exit after timeout');
    process.exit(1);
  }, 10000);
  try {
    if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
    await mongoose.connection.close();
    clearTimeout(forceExit);
    console.log('[server] closed cleanly');
    process.exit(0);
  } catch (err) {
    console.error('[server] error during shutdown:', err.message);
    process.exit(1);
  }
}

['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));

// Last-resort guards so an unexpected error is logged, not silently swallowed.
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  shutdown('uncaughtException');
});
