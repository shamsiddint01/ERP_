# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# ERP backend — production image.
# Build:  docker build -t erp-backend ./backend
# Run:    docker run --env-file backend/.env -p 3001:3001 erp-backend
# Migrate (one-off, before first run / on each deploy):
#         docker run --rm --env-file backend/.env erp-backend npx prisma migrate deploy
# -----------------------------------------------------------------------------

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Prisma's query engine needs OpenSSL at generate time to pick a binary target.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# package-lock.json is the committed lockfile for this project.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# `prisma generate` only reads the schema, but prisma.config.ts resolves
# env('DATABASE_URL') at load time — give it a throwaway value for this step.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" npx prisma generate \
  && npm run build

# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Bring the already-installed dependencies (incl. the generated Prisma client
# and the Prisma CLI, needed for `prisma migrate deploy`) and the build output.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./package.json

# Run as the non-root user that the base image already provides.
USER node
EXPOSE 3001

# Container-level liveness check (compose/orchestrator can also use it).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main"]
