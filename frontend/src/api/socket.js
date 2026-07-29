import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

let socket = null;

export function getSocket(token) {
  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: token ? { token } : {},
      autoConnect: true,
    });
  }
  return socket;
}

export function joinBranch(branchId) {
  socket?.emit('joinBranch', branchId);
}

export function leaveBranch(branchId) {
  socket?.emit('leaveBranch', branchId);
}
