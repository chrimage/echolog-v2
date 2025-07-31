# Use Node.js 18 LTS as base image
FROM node:18-slim

# Install system dependencies required for audio processing and Discord voice
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Create recordings directory with proper permissions
RUN mkdir -p recordings && chown -R node:node recordings

# Switch to node user for security
USER node

# Expose web server port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]