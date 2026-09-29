# syntax=docker/dockerfile:1

# ---------- Stage 1: full dependency install + typecheck ----------
FROM node:22-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
# Fail the build on type errors
RUN npx tsc --noEmit

# ---------- Stage 2: production runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=deps /app/tsconfig.json ./
COPY --from=deps /app/src ./src
COPY --from=deps /app/public ./public

RUN mkdir -p uploads/resumes && chown -R node:node /app/uploads
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# TypeScript is executed directly through tsx (handles ESM + JSON contract imports)
CMD ["node", "--import", "tsx", "src/index.ts"]
