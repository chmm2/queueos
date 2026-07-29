#!/bin/sh
set -e

# Runs automatically before nginx starts (the nginx image executes every
# /docker-entrypoint.d/*.sh). Generates the runtime config from environment
# variables so one built image works against any backend without rebuilding.
# Accepts either full URLs (API_URL / SOCKET_URL) or just a host (API_HOST),
# convenient on platforms that inject another service's hostname (e.g. Render
# `fromService`).
API_URL="${API_URL:-}"
SOCKET_URL="${SOCKET_URL:-}"

if [ -z "$API_URL" ] && [ -n "$API_HOST" ]; then
  API_URL="https://${API_HOST}/api"
fi
if [ -z "$SOCKET_URL" ] && [ -n "$API_HOST" ]; then
  SOCKET_URL="https://${API_HOST}"
fi

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__CONFIG__ = { API_URL: "${API_URL}", SOCKET_URL: "${SOCKET_URL}" };
EOF

echo "[runtime-config] API_URL='${API_URL}' SOCKET_URL='${SOCKET_URL}'"
