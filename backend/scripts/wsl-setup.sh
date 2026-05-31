#!/bin/bash
# WSL Testing Setup Script
# Run this inside your WSL environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

echo "=========================================="
echo "  WSL Testing Setup for OpenClaw Backend"
echo "=========================================="

# Check if running in WSL
if [[ ! -f /proc/version ]] || ! grep -qi microsoft /proc/version; then
    echo "Warning: This doesn't appear to be WSL. Continuing anyway..."
fi

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "[1/4] Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "[1/4] Node.js already installed: $(node --version)"
fi

# Install CLI tools
echo "[2/4] Installing Agent CLI Tools..."

# Claude Code
if ! command -v claude &> /dev/null; then
    echo "  - Installing Claude Code..."
    curl -fsSL https://docs.anthropic.com/claude-admin/docs/getting-started/install.sh | sh
else
    echo "  - Claude Code: $(claude --version)"
fi

# Hermes
if ! command -v hermes &> /dev/null; then
    echo "  - Installing Hermes Agent..."
    curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
    source ~/.bashrc 2>/dev/null || true
else
    echo "  - Hermes: $(hermes --version)"
fi

# OpenClaw
if ! command -v openclaw &> /dev/null; then
    echo "  - Installing OpenClaw..."
    npm install -g openclaw
else
    echo "  - OpenClaw: $(openclaw --version)"
fi

# OpenCode
if ! command -v opencode &> /dev/null; then
    echo "  - Installing OpenCode..."
    curl -fsSL https://storage.googleapis.com/epic-opencode/releases/latest/opencode-linux-x86_64 -o /tmp/opencode
    chmod +x /tmp/opencode
    sudo mv /tmp/opencode /usr/local/bin/opencode
else
    echo "  - OpenCode: $(opencode --version)"
fi

# Install Node dependencies
echo "[3/4] Installing backend dependencies..."
cd "$BACKEND_DIR/backend"
npm install

# Create workspace directory
echo "[4/4] Setting up workspace..."
mkdir -p data/workspaces

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "To start the backend:"
echo "  cd $BACKEND_DIR/backend"
echo "  npm run dev"
echo ""
echo "Backend will be available at:"
echo "  - REST API: http://localhost:3002"
echo "  - WebSocket: ws://localhost:3003"
echo ""
echo "Installed CLI tools:"
command -v claude &> /dev/null && echo "  - Claude Code: $(claude --version)"
command -v hermes &> /dev/null && echo "  - Hermes: $(hermes --version)"
command -v openclaw &> /dev/null && echo "  - OpenClaw: $(openclaw --version)"
command -v opencode &> /dev/null && echo "  - OpenCode: $(opencode --version)"

echo ""
echo "=========================================="
echo "  CLI Tools Health Check"
echo "=========================================="
for tool in claude hermes openclaw opencode; do
    if command -v $tool &> /dev/null; then
        echo "✅ $tool is installed"
    else
        echo "❌ $tool is NOT installed"
    fi
done
