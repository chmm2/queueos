# Build the React app, then serve the static bundle with nginx.
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

# API/socket URLs are provided at RUNTIME (see docker-entrypoint.sh), so the
# same built image works against any backend without rebuilding.
COPY . .
RUN npm run build

FROM nginx:1.27-alpine

# Listen port is templated so the container honours a platform-injected PORT
# (Render/Fly/etc.); defaults to 80. Only PORT is substituted, so nginx vars
# like $uri are left untouched.
ENV PORT=80
ENV NGINX_ENVSUBST_FILTER=PORT
COPY default.conf.template /etc/nginx/templates/default.conf.template

COPY --from=build /app/dist /usr/share/nginx/html

# Writes runtime-config.js from env vars before nginx starts.
COPY docker-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

EXPOSE 80
# Inherit the base image's ENTRYPOINT (runs /docker-entrypoint.d/*) and CMD.
