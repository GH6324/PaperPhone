# ── Stage 1: deps ───────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: production image ────────────────────────────────────
FROM node:20-alpine AS runner
LABEL org.opencontainers.image.title="PaperPhone Server" \
      org.opencontainers.image.description="PaperPhone IM — E2E encrypted messaging backend" \
      org.opencontainers.image.source="https://github.com/yourname/paperphone"

# Non-root user for security
RUN addgroup -S paperphone && adduser -S paperphone -G paperphone

WORKDIR /app

# Copy production deps + source
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY db  ./db
COPY package.json ./

USER paperphone

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]
