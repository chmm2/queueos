# Backend API + Socket.IO server
FROM node:20-alpine

# tini gives us proper signal handling (SIGTERM -> graceful shutdown).
RUN apk add --no-cache tini wget

WORKDIR /app

# Install deps first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 5000

# Run as the built-in non-root `node` user.
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:5000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
