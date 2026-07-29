const jwt = require('jsonwebtoken');

let ioInstance = null;

/**
 * Wires up Socket.IO on top of the existing HTTP server. Clients join a
 * room per branch (`branch:<id>`) so updates only broadcast to people
 * watching that branch's queue, not the whole platform.
 */
function initSocket(io) {
  ioInstance = io;

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (token) {
        // Optional auth: anonymous kiosk displays can connect without a
        // token (read-only), but authenticated staff get their role
        // attached to the socket for any role-gated events later.
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
      }
      next();
    } catch (err) {
      next(); // treat as anonymous rather than rejecting the handshake
    }
  });

  io.on('connection', (socket) => {
    socket.on('joinBranch', (branchId) => {
      socket.join(`branch:${branchId}`);
    });

    socket.on('leaveBranch', (branchId) => {
      socket.leave(`branch:${branchId}`);
    });

    socket.on('disconnect', () => {});
  });
}

/**
 * Broadcast helpers used by route handlers after a state change.
 * Keeping these here means routes never touch `io` directly.
 */
function emitQueueUpdate(branchId, payload) {
  if (!ioInstance) return;
  ioInstance.to(`branch:${branchId}`).emit('queue:update', payload);
}

function emitTokenCalled(branchId, payload) {
  if (!ioInstance) return;
  ioInstance.to(`branch:${branchId}`).emit('token:called', payload);
}

module.exports = { initSocket, emitQueueUpdate, emitTokenCalled };
