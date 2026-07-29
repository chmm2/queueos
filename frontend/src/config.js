/**
 * Runtime configuration. On a deployed host, the nginx container writes
 * `window.__CONFIG__` at startup from environment variables (see
 * docker-entrypoint.sh), so the SAME built image works against any backend
 * URL without rebuilding. In local dev it falls back to Vite env vars, then
 * to localhost.
 */
const cfg = (typeof window !== 'undefined' && window.__CONFIG__) || {};

export const API_URL = cfg.API_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const SOCKET_URL = cfg.SOCKET_URL || import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
