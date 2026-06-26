# ── 1. deps ──────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── 2. build ─────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── 3. run ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Docker pone HOSTNAME=<id-contenedor> y el server.js de Next standalone se
# enlaza a ese hostname (su IP de eth0), no a 127.0.0.1. Eso hace que el
# healthcheck a localhost:3000 dé "connection refused" aunque el puerto
# publicado funcione. Forzar 0.0.0.0 hace que escuche en todas las interfaces.
ENV HOSTNAME=0.0.0.0
# Alpine no trae la base de zonas horarias; sin tzdata el TZ del contenedor se
# ignora y el reloj queda en UTC. Con tzdata, TZ=America/Caracas aplica a logs y
# a `new Date()`. (Las fechas críticas igual se calculan por zona vía lib/tz.ts.)
RUN apk add --no-cache tzdata
ENV TZ=America/Caracas

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
