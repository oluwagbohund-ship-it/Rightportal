# Dave Timi EdTech Systems - Production Container Image
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy application files and build static bundle
COPY . .
RUN npm run build

# Production runtime image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    SQLITE_DB_PATH=/app/data/dt_edtech.sqlite \
    NODE_OPTIONS="--experimental-strip-types"

# Install production and runtime packages
COPY package.json package-lock.json ./
RUN npm ci

# Copy built frontend assets from builder
COPY --from=builder /app/dist ./dist

# Copy application source, migrations, and assets
COPY src ./src
COPY server.ts vite.config.ts index.html ./
COPY public ./public

# Prepare persistent storage directory for SQLite database and uploaded documents
RUN mkdir -p /app/data /app/data/uploads && chown -R node:node /app

USER node

EXPOSE 3000

# Persist SQLite database and file uploads
VOLUME ["/app/data"]

CMD ["node", "server.ts"]
