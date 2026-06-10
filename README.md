# OpenClaw Company Source Code

OpenClaw is a split frontend/backend AI agent management platform.

- Frontend: `next-lobster-platform`, Next.js 14 + React + Tailwind CSS
- Backend: `backend`, Express + TypeScript + SQLite + WebSocket
- Desktop helper: `openclaw-desktop-client`, optional local Electron client

This repository is prepared for separate deployment: the frontend can run on one server, while the backend API and WebSocket service run on another server.

## Repository Layout

```text
.
├── backend/                 # Express API, SQLite data, WebSocket chat server
├── next-lobster-platform/   # Next.js frontend
├── openclaw-desktop-client/ # Optional desktop client
├── docs/                    # Product and design notes
└── docker-compose.yml       # Backend Docker deployment helper
```

## Security Rules

Do not commit real secrets.

Ignored by git:

- `.env`, `.env.*`, `.env.local`, `.env.production`
- `backend/data/`
- `node_modules/`, `.next/`, `dist/`, logs, local tool output

Only commit example files such as `.env.example`.

If a token, server password, or API key was ever pasted into a chat, terminal, README, git remote URL, or issue, rotate it immediately. Use SSH keys and a deploy user for servers instead of password-based root login.

## Local Development

Requirements:

- Node.js 22+
- npm
- Windows, Linux, or WSL

Install and run the backend:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

The backend listens on:

- HTTP API: `http://localhost:3002`
- WebSocket: `ws://localhost:3003`

Install and run the frontend:

```bash
cd next-lobster-platform
cp .env.example .env.local
npm install
npm run dev
```

The frontend listens on `http://localhost:3000`.

## Environment Variables

### Backend: `backend/.env`

```bash
NODE_ENV=production
PORT=3002
WS_PORT=3003
WORKSPACE_ROOT=/opt/openclaw/data/workspaces
JWT_SECRET=replace-with-a-long-random-secret
PUBLIC_BACKEND_URL=http://121.40.242.77
FEISHU_PUBLIC_BASE_URL=http://121.40.242.77
CORS_ORIGIN=http://121.40.242.77
COZE_API_BASE=https://api.coze.com
COZE_API_TOKEN=
COZE_MARKET_BOTS=[]
```

Notes:

- `JWT_SECRET` must be changed in production.
- `WORKSPACE_ROOT` must point to a writable directory on the backend server.
- `PUBLIC_BACKEND_URL` is the public browser-accessible backend URL.
- `FEISHU_PUBLIC_BASE_URL` is used when generating Feishu event callback URLs. If `http://121.40.242.77` does not proxy `/api` to the backend, set it to `http://121.40.242.77:3002` instead.
- `CORS_ORIGIN` must match the frontend origin. Multiple origins can be comma-separated.

### Frontend: `next-lobster-platform/.env.production`

```bash
NEXT_PUBLIC_API_URL=http://121.40.242.77
NEXT_PUBLIC_WS_URL=ws://121.40.242.77/ws
BACKEND_INTERNAL_URL=http://127.0.0.1:3002
```

Notes:

- `NEXT_PUBLIC_API_URL` is baked into the browser bundle during `npm run build`.
- `NEXT_PUBLIC_WS_URL` is the browser-facing WebSocket URL.
- `BACKEND_INTERNAL_URL` is only used by Next.js rewrites. It can be omitted if the frontend calls the backend directly through `NEXT_PUBLIC_API_URL`.

## Build Check

Run these before publishing:

```bash
cd backend
npm run build

cd ../next-lobster-platform
npm run build
```

## Upload to GitHub

Use a private repository first unless you have completed a full secret review.

```bash
git status
git remote -v
git add .
git commit -m "Prepare production deployment docs and configuration"
git push origin main
```

Do not put a GitHub personal access token inside the remote URL. Use GitHub CLI or SSH:

```bash
gh auth login
```

or:

```bash
git remote set-url origin git@github.com:<owner>/<repo>.git
```

## Production Deployment Overview

Recommended public URLs:

- Frontend: `https://app.example.com`
- Backend API: `https://api.example.com`
- Backend WebSocket: `wss://api.example.com/ws`

Temporary IP-based deployment is also possible:

- Frontend: `http://<frontend-public-ip>`
- Backend API: `http://<backend-public-host>:3002`
- Backend WebSocket: `ws://<backend-public-host>:3003`

For public production, prefer domain names, HTTPS, Nginx reverse proxy, and closed direct access to Node.js ports.

## Deploy Backend on AutoDL

AutoDL instance IDs are not SSH addresses. In the AutoDL console, find the SSH host, SSH port, and public port mapping. The backend needs public access for HTTP and WebSocket.

Install runtime dependencies:

```bash
apt update
apt install -y git curl build-essential python3 nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pm2
```

Clone, configure, build, and start:

```bash
cd /opt
git clone https://github.com/chenlubenren/openclaw_company_source_code.git openclaw
cd /opt/openclaw/backend
cp .env.example .env
nano .env
npm ci
npm run build
pm2 start dist/index.js --name openclaw-backend
pm2 save
```

Verify locally:

```bash
curl http://127.0.0.1:3002/health
pm2 logs openclaw-backend
```

If you expose raw ports for a temporary test, map/open:

- `3002` for HTTP API
- `3003` for WebSocket

For production, use Nginx:

```nginx
server {
  listen 80;
  server_name api.example.com;

  location / {
    proxy_pass http://127.0.0.1:3002;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location /ws {
    proxy_pass http://127.0.0.1:3003;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Then set:

```bash
PUBLIC_BACKEND_URL=http://121.40.242.77
FEISHU_PUBLIC_BASE_URL=http://121.40.242.77
CORS_ORIGIN=http://121.40.242.77
```

If you expose backend port `3002` directly instead of proxying `/api` and `/auth` through port `80`, use `http://121.40.242.77:3002` for `PUBLIC_BACKEND_URL`, `FEISHU_PUBLIC_BASE_URL`, and `NEXT_PUBLIC_API_URL`.

## Deploy Frontend on Alibaba Cloud ECS

The `172.26.x.x` address is a private VPC address. Public users need the ECS public IP, EIP, or a domain pointing to the ECS public IP.

Install runtime dependencies:

```bash
apt update
apt install -y git curl nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pm2
```

Clone, configure, build, and start:

```bash
cd /opt
git clone https://github.com/chenlubenren/openclaw_company_source_code.git openclaw
cd /opt/openclaw/next-lobster-platform
cp .env.example .env.production
nano .env.production
npm ci
npm run build
pm2 start npm --name openclaw-frontend -- start -- -p 3000
pm2 save
```

Example `.env.production` for direct backend access:

```bash
NEXT_PUBLIC_API_URL=http://<backend-public-host>:3002
NEXT_PUBLIC_WS_URL=ws://<backend-public-host>:3003
```

Example `.env.production` for Nginx + HTTPS backend:

```bash
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_WS_URL=wss://api.example.com/ws
```

Nginx frontend proxy:

```nginx
server {
  listen 80;
  server_name app.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Open the ECS security group for:

- `80` and `443` for public web traffic
- SSH only from your own IP if possible

## Update Deployment

Backend:

```bash
cd /opt/openclaw
git pull
cd backend
npm ci
npm run build
pm2 restart openclaw-backend --update-env
```

Frontend:

```bash
cd /opt/openclaw
git pull
cd next-lobster-platform
npm ci
npm run build
pm2 restart openclaw-frontend --update-env
```

## Health Checks

Backend:

```bash
curl http://127.0.0.1:3002/health
curl https://api.example.com/health
```

Frontend:

```bash
curl http://127.0.0.1:3000
curl https://app.example.com
```

Runtime logs:

```bash
pm2 status
pm2 logs openclaw-backend
pm2 logs openclaw-frontend
```

## Common Problems

`CORS origin not allowed`

Set backend `CORS_ORIGIN` to the exact frontend origin, including protocol and port.

Frontend still calls localhost after deployment

Set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` before running `npm run build`, then rebuild and restart the frontend.

WebSocket fails

Check `NEXT_PUBLIC_WS_URL`, firewall rules, AutoDL port mapping, and Nginx `Upgrade` headers.

SQLite database missing or reset

Make sure `backend/data/` or the Docker volume is persistent and writable.

Cannot access `172.26.x.x`

That is a private address. Use the ECS public IP, EIP, VPN/VPC connectivity, or a domain bound to a public IP.
