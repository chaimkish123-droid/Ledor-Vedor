# L'Dor VaDor — a single self-contained image.
#
# The archive itself lives on a mounted volume at /data, never inside the
# image, so redeploying the application never touches the family's data.

FROM node:22-slim AS deps
WORKDIR /app
# better-sqlite3 falls back to compiling when no prebuilt binary matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    LDOR_DATA_DIR=/data \
    LDOR_BACKUP_DIR=/data/backups

# Run as an unprivileged user that owns the data directory.
RUN groupadd --system --gid 1001 family \
    && useradd --system --uid 1001 --gid family family \
    && mkdir -p /data/backups \
    && chown -R family:family /data

COPY --from=builder --chown=family:family /app/public ./public
COPY --from=builder --chown=family:family /app/.next/standalone ./
COPY --from=builder --chown=family:family /app/.next/static ./.next/static
# The native SQLite binding is not traced into the standalone bundle.
COPY --from=builder --chown=family:family /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder --chown=family:family /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder --chown=family:family /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

USER family
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
