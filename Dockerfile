# Production Dockerfile for Produktifa on Fly.io
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Set production environment defaults
ENV NODE_ENV=production
ENV PORT=3000

# Copy package descriptors first for Docker layer caching
COPY package*.json ./

# Install all dependencies (including build tools and tsx)
RUN npm ci --include=dev

# Copy application source code
COPY . .

# Build Vite frontend assets into /app/dist
RUN npm run build

# Create data directory for SQLite persistence
RUN mkdir -p /app/data

# Expose server port
EXPOSE 3000

# Health check to ensure Express & SQLite are responsive
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the full-stack server
CMD ["npm", "start"]
