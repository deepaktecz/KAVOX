# ═════════════════════════════════════════════════════════════════════════════
# DOCKERFILE - Kavox Microservices
# Multi-stage build for production-ready images
# ═════════════════════════════════════════════════════════════════════════════

FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# ─── Main Stage ───────────────────────────────────────────────────────────
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs && chmod 755 logs

# Set environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.GATEWAY_PORT || 3000) + '/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init to run Node
ENTRYPOINT ["dumb-init", "--"]

# Default command
CMD ["npm", "start"]

# Labels
LABEL maintainer="Kavox Team <development@kavox.com>"
LABEL version="1.0.0"
LABEL description="Kavox - Full-stack eCommerce Platform with Qikink POD Integration"
