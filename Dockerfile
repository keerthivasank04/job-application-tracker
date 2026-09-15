# Multi-stage Dockerfile for Job Tracker API
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install all dependencies including devDependencies for build
RUN npm install

# Copy source code and Prisma contract files
COPY . .

# Emit contract and compile TypeScript
RUN npx prisma contract emit && npm run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy compiled code, prisma contracts, and config from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/prisma ./src/prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/index.js ./index.js

EXPOSE 3000

CMD ["node", "dist/index.js"]
