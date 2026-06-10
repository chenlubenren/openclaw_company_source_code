# ShrimpCrab

[简体中文](README.md) | [English](README.en.md)

<p align="center">
  <img src="claw_profile/03.png" alt="ShrimpCrab Mascot" width="160" />
</p>

<p align="center">
  A multi-agent collaboration platform for complex knowledge work
</p>

<p align="center">
  <a href="http://121.40.242.77/">Live Demo</a> ·
  <a href="https://my.feishu.cn/wiki/XioNwVrxOiYDy5kiwOtcUWdjnFb">Product Doc</a> ·
  <a href="https://my.feishu.cn/wiki/ToFZwV492ilwqEkxRgGckd65nSc">Tech Doc</a>
</p>

## One-line Summary

ShrimpCrab is a multi-agent collaboration platform for complex knowledge work, unifying single-agent usage, team orchestration, and project workspace persistence.

## What Problem It Solves

Many AI products can answer questions, but they struggle to support real work: capabilities are fragmented, collaboration structure is opaque, results do not persist, and context is hard to reuse. ShrimpCrab focuses on connecting capability acquisition, team orchestration, task execution, and artifact persistence into one working flow.

It mainly serves two kinds of usage:

- everyday scenarios where a single agent is enough to complete a task quickly
- complex knowledge-work scenarios where multiple agents need to collaborate and produce lasting outputs

## Product Architecture

![ShrimpCrab Product Structure](docs/readme-assets/product-structure.jpg)

The product is built around two core capability lines and three supporting modules:

- **Single Agent**: agent acquisition, configuration, conversations, and daily use
- **Agent Team**: multi-agent organization, orchestration, collaboration flow, and task execution
- **Project Workspace**: persistence for context, execution history, logs, and artifacts
- **Agent Market**: capability discovery, reuse, and circulation
- **Multi-surface & Integrations**: web, mobile, desktop, and external entry points such as Feishu

Together, these five modules form a full path: acquire capability, organize collaboration, then persist both process and outputs as reusable working assets.

## Core User Flow

1. Adopt a ready-made agent from Agent Market, or upload your own.
2. Configure and use it in Single Agent mode with isolated conversations.
3. Organize multiple agents into a team through natural language or a canvas.
4. Execute complex work through workflows and persist messages, files, logs, and artifacts in Project Workspace.
5. Reuse those assets across desktop flows, local imports, and external collaboration entry points.

## Product Screenshots

### Home

![ShrimpCrab Home](docs/readme-assets/product-home.png)

### Team Canvas

![ShrimpCrab Team Canvas](docs/readme-assets/product-canvas.png)

### Desktop Client

![ShrimpCrab Desktop Client](docs/readme-assets/product-desktop.png)

### Local Agent Import

![ShrimpCrab Local Agent Import](docs/readme-assets/product-local-import.png)

## Technical Architecture

From an implementation perspective, ShrimpCrab uses a layered collaboration architecture:

- **Client Layer**: web, mobile, and desktop
- **Platform Service Layer**: Express API, authentication, file services, provider management, market APIs, and integrations
- **Orchestration Runtime Layer**: Workflow DSL, A2A Wrapper, Workflow Executor, and Agent Runner
- **Agent Execution Layer**: OpenClaw, Claude Code, Codex, Hermes, OpenCode, Coze, and other execution backends
- **Persistence Layer**: SQLite, conversations, messages, project workspace, runtime directories, artifacts, and logs

### Overall System Architecture

![Overall System Architecture](docs/readme-assets/arch-system.jpg)

### How Product Modules Map to Technical Layers

- `Single Agent`: agent management APIs, provider configuration, conversation system, runtime dispatch
- `Agent Team`: Workflow DSL, A2A Wrapper, Executor
- `Project Workspace`: project models, workspace directories, runtime directories, artifact storage
- `Agent Market`: market resource models, download and reuse flow, publish flow
- `Multi-surface & Integrations`: multi-surface UI, desktop shell, Feishu integration

### DSL Execution State Machine

![DSL Execution State Machine](docs/readme-assets/arch-workflow-state.jpg)

### Realtime Message Flow

![Realtime Message Flow](docs/readme-assets/arch-message-flow.jpg)

### Core ERD

![Core ERD](docs/readme-assets/arch-erd.jpg)

## Tech Stack

| Layer | Stack |
| --- | --- |
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Framer Motion, Zustand, `@xyflow/react` |
| Backend | Node.js 22, Express, TypeScript, WebSocket (`ws`) |
| Data | SQLite, `better-sqlite3`, Drizzle ORM |
| Auth | JWT, `bcryptjs` |
| Files & Uploads | `multer`, local filesystem workspaces |
| Desktop | Electron |

## Repository Layout

```text
.
├── backend/                  # Express API, workflow runtime, SQLite, WebSocket
├── next-lobster-platform/    # Next.js Web / Mobile frontend
├── openclaw-desktop-client/  # Electron desktop shell
├── docs/                     # Product / technical docs and README assets
├── diagrams/                 # Diagrams and design outputs
└── claw_profile/             # Mascots and pixel assets
```

## Quick Start

### Prerequisites

- Node.js 22+
- npm
- macOS / Linux / Windows / WSL

### Start Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Default endpoints:

- REST API: `http://localhost:3002`
- WebSocket: `ws://localhost:3003`

### Start Frontend

```bash
cd next-lobster-platform
cp .env.example .env.local
npm install
npm run dev
```

Default URL:

- Web: `http://localhost:3000`

### Start Desktop Client (Optional)

```bash
cd openclaw-desktop-client
npm install
npm run dev
```

## Related Documents

- [Product Doc](https://my.feishu.cn/wiki/XioNwVrxOiYDy5kiwOtcUWdjnFb)
- [Technical Doc](https://my.feishu.cn/wiki/ToFZwV492ilwqEkxRgGckd65nSc)
- [`docs/agent-platform-prd.md`](docs/agent-platform-prd.md)
- [`backend/DEPLOY.md`](backend/DEPLOY.md)

## Current Boundaries

- Some flows in the public demo require login for the full experience
- Agent execution depends on external or local CLI runtimes such as OpenClaw, Codex, Claude Code, Hermes, and OpenCode
- SQLite is currently the primary persistence layer, which fits fast iteration and lightweight deployment
- The repository already covers the main product skeleton, workflow orchestration path, project workspace model, and multi-entry UI
