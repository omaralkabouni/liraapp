# =============================================================
# Backend Dockerfile - Multi-stage build
# =============================================================

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && \
    npm cache clean --force

# Stage 2: Development
FROM node:20-alpine AS development
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["npm", "run", "dev"]

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeapp -u 1001

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=nodeapp:nodejs . .

RUN mkdir -p /app/logs && chown nodeapp:nodejs /app/logs

USER nodeapp
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "src/app.js"]
