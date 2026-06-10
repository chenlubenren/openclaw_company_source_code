# Agent Platform Backend Deployment Guide

## Prerequisites

- Node.js 22+
- npm or yarn
- Agent CLI tools (Claude Code, Hermes, OpenClaw, Codex, OpenCode)

## Development (Windows)

```bash
cd backend
npm install
npm run dev
```

The backend runs on:
- REST API: http://localhost:3002
- WebSocket: ws://localhost:3003

## Development (WSL/Linux)

### 1. Install CLI Tools

```bash
cd backend
chmod +x scripts/install-cli-tools.sh
./scripts/install-cli-tools.sh
```

Or manually:

```bash
# Claude Code
curl -fsSL https://docs.anthropic.com/claude-admin/docs/getting-started/install.sh | sh

# Hermes Agent
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash

# OpenClaw
npm install -g openclaw

# OpenCode
curl -fsSL https://storage.googleapis.com/epic-opencode/releases/latest/opencode-linux-x86_64 -o /usr/local/bin/opencode
chmod +x /usr/local/bin/opencode
```

### 2. Install Node Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
npm run dev
```

## Production (Docker)

### Build and Run with Docker Compose

```bash
# Copy environment file
cp .env.example .env
# Edit .env with your production values

# Build and start
docker-compose up -d --build

# Check logs
docker-compose logs -f backend
```

### Build Docker Image Only

```bash
docker build -t openclaw-backend:latest ./backend
```

### Run Container

```bash
docker run -d \
  -p 3002:3002 \
  -p 3003:3003 \
  -e NODE_ENV=production \
  -e JWT_SECRET=your-production-secret \
  -e CORS_ORIGIN=https://your-frontend.com \
  -v ./data:/app/data \
  --name openclaw-backend \
  openclaw-backend:latest
```

## Production (Systemd on Linux Server)

### 1. Install Dependencies

```bash
# As root or with sudo
apt update && apt install -y curl git unzip

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
apt install -y nodejs

# Install CLI tools (as deploy user)
su - deploy
./scripts/install-cli-tools.sh
```

### 2. Build Application

```bash
cd /opt/openclaw-backend
npm ci --production
npm run build
```

### 3. Create Systemd Service

```bash
sudo tee /etc/systemd/system/openclaw-backend.service > /dev/null <<EOF
[Unit]
Description=OpenClaw Backend API
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/openclaw-backend
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3002
EnvironmentFile=/opt/openclaw-backend/.env

[Install]
WantedBy=multi-user.target
EOF
```

### 4. Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable openclaw-backend
sudo systemctl start openclaw-backend
sudo systemctl status openclaw-backend
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKSPACE_ROOT` | `./data/workspaces` | Directory for agent workspaces |
| `JWT_SECRET` | - | Secret key for JWT signing (REQUIRED) |
| `PORT` | `3002` | REST API port |
| `WS_PORT` | `3003` | WebSocket port |
| `NODE_ENV` | `development` | Environment mode |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `PUBLIC_BACKEND_URL` | `http://localhost:3002` | Public browser-facing backend URL for absolute asset URLs |
| `FEISHU_PUBLIC_BASE_URL` | `PUBLIC_BACKEND_URL` | Public base URL used to generate Feishu event callback URLs |

For the current IP-based deployment, set:

```bash
PUBLIC_BACKEND_URL=http://121.40.242.77
FEISHU_PUBLIC_BASE_URL=http://121.40.242.77
CORS_ORIGIN=http://121.40.242.77
```

If port `80` does not proxy `/api` and `/auth` to the backend, use `http://121.40.242.77:3002` for `PUBLIC_BACKEND_URL` and `FEISHU_PUBLIC_BASE_URL`.

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `GET /auth/me` - Get current user

### Agents
- `GET /api/agents` - List user's agents
- `POST /api/agents` - Create agent
- `GET /api/agents/:id` - Get agent details
- `PATCH /api/agents/:id` - Update agent
- `DELETE /api/agents/:id` - Delete agent

### Caves
- `GET /api/agents/caves` - List caves
- `POST /api/agents/caves` - Create cave
- `PATCH /api/agents/caves/:id` - Update cave
- `DELETE /api/agents/caves/:id` - Delete cave

### Conversations
- `GET /api/conversations` - List conversations
- `GET /api/conversations/:id` - Get conversation
- `POST /api/conversations` - Create conversation
- `DELETE /api/conversations/:id` - Delete conversation

### Upload
- `POST /api/upload` - Upload workspace
- `GET /api/upload/template` - Get template

## WebSocket Chat

Connect to: `ws://localhost:3003?token=<jwt>&agentId=<agentId>`

Message format:
```json
{
  "type": "message",
  "payload": "Your message here"
}
```

## Troubleshooting

### CLI tools not found
Ensure the CLI tools are in PATH. Run `which claude`, `which hermes`, etc.

### WebSocket connection fails
Check that `WS_PORT` is not blocked by firewall.

### Agent process doesn't start
Check that the workspace directory exists and is writable.

### Database locked
SQLite doesn't support concurrent writes. Consider PostgreSQL for production.
