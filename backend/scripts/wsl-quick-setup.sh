#!/bin/bash
# Quick Setup Script - Run this inside WSL terminal
# Paste the entire script into WSL terminal

set -e

echo "=========================================="
echo "  WSL Setup for OpenClaw Backend"
echo "=========================================="

# 1. Install Node.js 22
echo "[1/4] Installing Node.js..."
mkdir -p ~/.local
cd ~/.local
if [ ! -f node ]; then
    curl -fsSL https://npmmirror.com/mirrors/node/v22.16.0/node-v22.16.0-linux-x64.tar.xz -o node.tar.xz
    tar -xJf node.tar.xz --strip-components=1
    rm node.tar.xz
fi
mkdir -p ~/bin
cp ~/.local/bin/node ~/.local/bin/npm ~/.local/bin/npx ~/bin/ 2>/dev/null || true
export PATH="$HOME/bin:$PATH"

echo "  Node.js: $(node --version)"
echo "  npm: $(npm --version)"

# 2. Navigate to project
echo "[2/4] Navigating to project..."
cd /mnt/j/Desktop/code练习/cursor_project/openclaw_company_source_code/backend

# 3. Install dependencies
echo "[3/4] Installing npm dependencies..."
npm install

# 4. Create workspace directory
echo "[4/4] Creating workspace directory..."
mkdir -p data/workspaces

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "To start backend, run:"
echo "  cd /mnt/j/Desktop/code练习/cursor_project/openclaw_company_source_code/backend"
echo "  npm run dev"
echo ""
echo "Backend will be available at:"
echo "  - REST API: http://localhost:3002"
echo "  - WebSocket: ws://localhost:3003"
