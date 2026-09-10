# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# ERP frontend — builds the SPA and serves it with nginx, proxying /api to the
# backend so browser and API share one origin (no production CORS needed).
# Build:  docker build -t erp-frontend ./frontend
# -----------------------------------------------------------------------------

FROM node:22-bookworm-slim AS build
WORKDIR /app
# package-lock.json is the committed lockfile for this project.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
