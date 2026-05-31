# Multi-stage Dockerfile for OpenClaw Backend
# Stage 1: Build
FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build


# Stage 2: Runtime
FROM node:22-slim AS runtime

# Install runtime dependencies and CLI tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    unzip \
    zip \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code
RUN curl -fsSL https://docs.anthropic.com/claude-admin/docs/getting-started/install.sh | sh

# Install Hermes Agent
RUN curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash

# Install OpenClaw globally
RUN npm install -g openclaw

# Install OpenCode
RUN curl -fsSL https://storage.googleapis.com/epic-opencode/releases/latest/opencode-linux-x86_64 -o /usr/local/bin/opencode \
    && chmod +x /usr/local/bin/opencode

# Create non-root user for security
RUN useradd -m -s /bin/bash appuser

# Create workspace directory
RUN mkdir -p /app/data/workspaces && chown -R appuser:appuser /app

WORKDIR /app

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy environment file template
COPY .env.example .env

# Switch to non-root user
USER appuser

# Expose ports
EXPOSE 3002 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

# Start command
CMD ["node", "dist/index.js"]
