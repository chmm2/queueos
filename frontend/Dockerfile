# Build the React app, then serve the static bundle with nginx.
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

# API/socket URLs are baked in at build time (Vite env). Override via
# --build-arg for a real deployment.
ARG VITE_API_URL=http://localhost:5000/api
ARG VITE_SOCKET_URL=http://localhost:5000
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
