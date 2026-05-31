#!/bin/bash
# Agent CLI Tools Installation Script for Linux/WSL
# Run this script on Linux or WSL

set -e

echo "=========================================="
echo "  Installing Agent CLI Tools"
echo "=========================================="

# Update package list
echo "[1/6] Updating package list..."
sudo apt-get update -qq

# Install prerequisites
echo "[2/6] Installing prerequisites..."
sudo apt-get install -y curl git unzip zip

# ==================== Claude Code ====================
echo "[3/6] Installing Claude Code..."
if ! command -v claude &> /dev/null; then
    curl -fsSL https://docs.anthropic.com/claude-admin/docs/getting-started/install.sh | sh
    echo "Claude Code installed: $(claude --version)"
else
    echo "Claude Code already installed: $(claude --version)"
fi

# ==================== Hermes ====================
echo "[4/6] Installing Hermes Agent..."
if ! command -v hermes &> /dev/null; then
    curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
    # Reload shell to pick up hermes command
    export PATH="$HOME/.local/bin:$PATH"
    echo "Hermes installed: $(hermes --version 2>/dev/null || echo 'v0.x.x')"
else
    echo "Hermes already installed: $(hermes --version)"
fi

# ==================== OpenClaw ====================
echo "[5/6] Installing OpenClaw..."
if ! command -v openclaw &> /dev/null; then
    npm install -g openclaw
    echo "OpenClaw installed: $(openclaw --version)"
else
    echo "OpenClaw already installed: $(openclaw --version)"
fi

# ==================== Codex ====================
echo "[6/6] Installing Codex..."
# Codex is installed via npx, no global install needed
if command -v npx &> /dev/null; then
    echo "npx available: $(npx --version)"
else
    echo "Installing Node.js for Codex..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "Codex can be used via: npx @openai/codex"

# ==================== OpenCode ====================
echo "[Extra] Installing OpenCode..."
if ! command -v opencode &> /dev/null; then
    curl -fsSL https://storage.googleapis.com/epic-opencode/releases/latest/opencode-linux-x86_64 -o /tmp/opencode
    chmod +x /tmp/opencode
    sudo mv /tmp/opencode /usr/local/bin/opencode
    echo "OpenCode installed: $(opencode --version)"
else
    echo "OpenCode already installed: $(opencode --version)"
fi

echo ""
echo "=========================================="
echo "  Installation Complete!"
echo "=========================================="
echo ""
echo "Installed tools:"
command -v claude &> /dev/null && echo "  - Claude Code: $(claude --version)"
command -v hermes &> /dev/null && echo "  - Hermes: $(hermes --version)"
command -v openclaw &> /dev/null && echo "  - OpenClaw: $(openclaw --version)"
command -v opencode &> /dev/null && echo "  - OpenCode: $(opencode --version)"
command -v npx &> /dev/null && echo "  - npx (for Codex): $(npx --version)"

echo ""
echo "Run 'source ~/.bashrc' or restart terminal to pick up new commands."
