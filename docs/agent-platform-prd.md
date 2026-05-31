# 龙虾 Agent 平台 PRD 与技术方案草案

版本：v0.1  
日期：2026-05-24  
适用项目：`next-lobster-platform` 假前端向真实 Web/桌面端平台演进

## 1. 背景与目标

当前项目已经有龙虾市场、我的龙虾窝、上传、单 Agent 对话、架构编排等前端雏形。下一阶段目标是把这些页面背后的 mock 数据替换成真实的 Agent workspace 管理、OpenClaw/A2A 调度与用户体系。

平台分为两种模式：

1. Web 模式：多用户通过浏览器访问平台，在服务器/WSL 机器上管理市场、私人 Agent、团队编排和运行记录。
2. 桌面端模式：面向本机用户，使用同一套 Agent manifest、A2AWrapper 和路由协议，但数据和运行时优先落在本机，后续可与 Web 账号同步。

本 PRD 先以 Web 模式为主，桌面端保留接口和目录兼容性。

## 2. 产品定位

龙虾平台是一个可上传、克隆、对话、组合和调度多个 Agent 的 workspace 平台。每个 Agent 都以一个 workspace 为核心资产，平台负责：

- 管理市场中的公开 Agent workspace。
- 管理用户自己的私有 Agent workspace。
- 为每个 Agent 分配可路由的 agent key/session key。
- 支持用户与单个 Agent 对话。
- 支持用户通过默认 Orchestrator 调用多个 Agent 组成团队。
- 保证团队运行不破坏单 Agent 的原始 workspace 和历史对话。

## 3. 用户与角色

MVP 阶段至少包含两类角色：

- 普通用户：注册/登录、浏览市场、克隆 Agent、上传私有 Agent、发布到市场、单 Agent 对话、创建团队、运行团队任务。
- 管理员：审核市场 Agent、禁用异常 Agent、查看运行状态、管理平台配置。

账号系统必须只保存密码哈希，不能保存明文密码。推荐使用 Argon2id 或 bcrypt，并加入登录限流、会话过期和 CSRF 防护。

## 4. 核心概念

### 4.1 Market Agent

市场中的 Agent 模板。它来自用户发布或官方预置，一旦发布某个版本，源 workspace 应视为不可变。

关键字段：

- `market_agent_id`
- `name`
- `description`
- `owner_user_id`
- `version`
- `manifest_path`
- `source_workspace_path`
- `visibility`: public/private/unlisted
- `status`: pending/active/disabled

### 4.2 User Agent Instance

用户从市场克隆或自己上传后的私人 Agent 实例。它属于某个用户，有自己的 workspace、配置、对话历史和运行 key。

关键字段：

- `agent_instance_id`
- `user_id`
- `source_market_agent_id`
- `source_version`
- `agent_key`
- `workspace_path`
- `baseline_snapshot_path`
- `status`
- `created_at`

### 4.3 Team / Architecture

用户基于自己 `agents` 文件夹里的 Agent 组成的团队。团队只是编排关系和运行策略，不应直接改动成员 Agent 的 solo workspace。

关键字段：

- `team_id`
- `user_id`
- `orchestrator_agent_id`
- `members`
- `routing_policy`
- `team_manifest_path`
- `created_at`

### 4.4 Team Runtime Workspace

每次团队运行时，平台从成员 Agent 的 solo workspace 创建隔离副本、git worktree 或 overlay workspace。团队任务只改运行副本，运行结束后由用户选择是否把结果合并回某个 Agent 的私人 workspace。

推荐链路：

```text
Market immutable workspace
  -> User agent solo workspace
    -> Team runtime workspace / run snapshot
```

## 5. Web 模式需求

### 5.1 用户账号

需求：

- 用户可注册、登录、退出。
- 后台保存用户基本信息和密码哈希。
- 用户只能访问自己的私有 workspace、团队、对话和运行记录。
- 管理员可以审核市场内容，但不能直接读取用户敏感密钥。

建议：

- MVP 可使用 cookie session 或 JWT。
- 密码字段命名为 `password_hash`，不要出现 `password` 明文字段。
- 每次 Agent 运行使用服务端权限访问 workspace，前端不暴露真实文件路径和 gateway token。

### 5.2 龙虾市场

需求：

- 服务器有一个 `market` 根目录，保存所有发布到市场的 Agent workspace。
- 市场按 Agent + version 管理，发布后版本不可变。
- 用户可以浏览市场 Agent，并克隆到自己的 workspace。
- 用户上传 Agent 时可选择只放入私人空间，或申请发布到市场。

上传校验：

- 必须包含 `agent.manifest.json`。
- 禁止 zip 路径穿越，例如 `../`、绝对路径、Windows drive path。
- 限制包大小、文件数量、单文件大小。
- 记录 checksum，避免重复包和损坏包。
- 发布到市场前应做基础安全扫描和人工/半自动审核。

### 5.3 我的 Agent

需求：

- 每个用户拥有一个独立 workspace 根目录。
- 其中 `agents` 文件夹保存用户从市场克隆的 Agent workspace，或用户上传到私人空间的 Agent workspace。
- 每个 Agent 拥有唯一 `agent_instance_id` 和 `agent_key`。
- 单 Agent 对话始终绑定该 Agent 的 solo workspace 和独立 conversation。

重要约束：

- 市场源 workspace 不应被用户运行直接修改。
- 用户私有 Agent workspace 是该用户的可变副本。
- 团队运行不能污染单 Agent 对话使用的 workspace。

### 5.4 单 Agent 对话

需求：

- 用户进入某个 Agent 详情页后可以发消息。
- 平台根据 `agent_instance_id` 找到 workspace、manifest 和运行方式。
- 后端自动创建或复用 session key。
- Agent 回复写入 conversation/messages 表。
- 前端展示运行状态、错误、重试和历史记录。

建议接口：

```http
POST /api/agents/:agentInstanceId/chat
GET  /api/agents/:agentInstanceId/conversations
GET  /api/conversations/:conversationId/messages
```

当前代码映射：

- `src/app/my-den/[id]/page.tsx` 可演进为单 Agent 详情与对话页。
- `src/app/api/lobsters/[id]/chat/route.ts` 是当前 PoC，可改造成通用 `agents/:agentInstanceId/chat`。

### 5.5 Orchestrator 与团队调度

需求：

- 用户可以用自然语言或画布创建团队。
- 每个用户都有调用默认 Orchestrator 的权限。
- Orchestrator 只能调度该用户有权限访问的 Agent。
- Orchestrator 根据任务，把子任务分发给用户 `agents` 文件夹中的 Agent。
- 支持高并发，至少要有队列、运行状态、并发限制和取消任务。

推荐策略：

- MVP 先使用 OpenClaw 成品 Agent 作为默认 Orchestrator。
- 平台自己实现 OrchestratorProvider 接口，把 OpenClaw 隔离在 adapter 后面。
- 后续如果需要复杂调度、成本控制、权限策略，再自研 Orchestrator 核心。

团队运行原则：

- 不改 Market workspace。
- 不直接改成员 Agent 的 solo workspace。
- 每次 run 创建 `runtime copy/worktree`。
- 运行结果作为 artifact、patch 或 summary 保存。
- 用户确认后再 merge/promote 到某个 Agent 的 solo workspace。

当前代码映射：

- `src/app/architectures/create/page.tsx`：创建团队。
- `src/app/architectures/create/ChatMode.tsx`：自然语言生成团队。
- `src/app/architectures/create/NodeCanvas.tsx`：画布编排。
- `src/app/architectures/mine/[id]/page.tsx`：团队运行详情。

### 5.6 A2AWrapper + 标准路由

你的框架使用“自建 A2AWrapper + 标准路由”是合理的。它能把不同来源、不同运行方式的 Agent 包装成统一协议，避免前端和 Orchestrator 直接理解每种 workspace 内部细节。

推荐分层：

```text
Next.js Frontend
  -> Platform API
    -> Auth / DB / Workspace Manager
    -> A2A Router
      -> A2AWrapper(agent A)
      -> A2AWrapper(agent B)
      -> OpenClaw Gateway Adapter
```

Wrapper 最小能力：

```http
GET  /health
GET  /manifest
POST /v1/chat
POST /v1/tasks
GET  /v1/runs/:runId
GET  /v1/runs/:runId/events
POST /v1/runs/:runId/cancel
```

标准请求体建议：

```json
{
  "userId": "user_123",
  "agentInstanceId": "agentinst_123",
  "workspaceRef": "users/user_123/agents/agentinst_123/workspace",
  "sessionId": "sess_123",
  "input": {
    "type": "chat",
    "message": "请分析这个任务"
  },
  "context": {
    "teamId": "team_123",
    "runId": "run_123",
    "role": "researcher"
  }
}
```

Agent manifest 建议：

```json
{
  "schemaVersion": "1.0",
  "name": "research-bot",
  "version": "0.1.0",
  "description": "Research planning agent",
  "entrypoint": {
    "type": "openclaw",
    "agentId": "research-bot-td"
  },
  "capabilities": ["chat", "task", "file-read", "artifact-write"],
  "runtime": {
    "command": "npm start",
    "workingDirectory": ".",
    "envSchema": ["OPENAI_API_KEY"]
  },
  "limits": {
    "cpu": 2,
    "memoryMb": 2048,
    "timeoutSec": 600
  }
}
```

## 6. 技术架构

### 6.1 推荐服务拆分

MVP 可以先保持一个仓库，但逻辑上分成四层：

1. Web 前端：现有 Next.js 页面。
2. Platform API：用户、市场、Agent、团队、对话、运行记录。
3. Workspace Manager：上传、解压、克隆、snapshot、runtime copy、artifact 保存。
4. Agent Runtime：A2A Router、A2AWrapper、OpenClaw Gateway Adapter、worker queue。

如果开发速度优先，Platform API 可先放在 Next.js API routes 中；如果并发和长任务优先，建议尽快拆成独立 Node/Fastify 或 Python/FastAPI 服务。考虑当前项目是 TypeScript/Next.js，MVP 使用 Node/TypeScript 后端更省上下文切换。

### 6.2 数据库

不要只靠文件夹当数据库。文件夹保存 workspace，数据库保存索引、权限、状态、版本、对话和运行记录。

推荐：

- MVP：PostgreSQL + Redis。
- 本机快速原型：SQLite 可以临时使用，但不要承载多人并发。
- 文件存储：本机 FS 起步，未来切 MinIO/S3。

核心表：

- `users`
- `sessions`
- `market_agents`
- `market_agent_versions`
- `user_agent_instances`
- `agent_keys`
- `conversations`
- `messages`
- `teams`
- `team_members`
- `team_runs`
- `team_run_steps`
- `workspace_snapshots`
- `artifacts`
- `worker_nodes`

### 6.3 并发与运行队列

高并发不要让请求线程直接执行长任务。推荐：

- Web 请求只创建 run，并返回 `runId`。
- Redis/BullMQ、Temporal、Celery 或自研轻量队列负责执行。
- 每个用户、每个 Agent、每台机器都设置并发上限。
- 对会写 workspace 的任务加锁。
- UI 通过轮询或 SSE/WebSocket 获取状态。

状态流：

```text
queued -> starting -> running -> waiting_agent -> collecting -> completed
                            -> failed
                            -> cancelled
```

### 6.4 多服务器预留

现在所有计算在一台 WSL 机器上可行，但需要从第一版就避免把路径写死在前端或业务表里。

预留字段：

- `worker_node_id`
- `workspace_storage_uri`
- `runtime_base_url`
- `capacity`
- `labels`
- `heartbeat_at`

未来多服务器时：

- A2A Router 根据 worker registry 选择节点。
- workspace 从本机路径升级为 `storage://bucket/key` 或共享卷。
- 每台机器运行一组 wrapper/worker。
- 前端和 Orchestrator 不需要知道 Agent 实际在哪台机器上。

## 7. WSL 文件夹组织建议

当前项目在 Windows J 盘：

```text
J:\Desktop\code练习\cursor_project\openclaw_company_source_code
```

在 WSL 中大致对应：

```bash
/mnt/j/Desktop/code练习/cursor_project/openclaw_company_source_code
```

建议：

- 代码可以继续放 J 盘，方便 Cursor/Windows 编辑。
- 运行时 workspace、market、数据库文件、缓存和日志不要放 `/mnt/j`，优先放 WSL ext4 文件系统，例如 `/srv/openclaw-platform`。这样文件监听、权限、软链接和大量小文件性能更稳定。

推荐目录：

```bash
/srv/openclaw-platform/
  market/
    agents/
      {marketAgentId}/
        versions/
          {version}/
            source/              # 发布后不可变
            agent.manifest.json
            checksum.txt
    uploads/                     # 待审核上传包
  users/
    {userId}/
      agents/
        {agentInstanceId}/
          workspace/             # 单 Agent 对话使用的私人 workspace
          baseline/              # 克隆/上传时的初始备份
          snapshots/
          conversations/
      teams/
        {teamId}/
          team.manifest.json
          runs/
            {runId}/
              members/
                {agentInstanceId}/
                  workspace/     # 团队运行隔离副本
              artifacts/
              logs/
  runtime/
    wrappers/
    orchestrators/
    queues/
  db/                            # 仅限本地 SQLite/备份，不建议生产放这里
  logs/
  tmp/
```

初始化命令：

```bash
sudo mkdir -p /srv/openclaw-platform/{market/agents,market/uploads,users,runtime/wrappers,runtime/orchestrators,runtime/queues,db,logs,tmp}
sudo chown -R "$USER:$USER" /srv/openclaw-platform
chmod -R 750 /srv/openclaw-platform
```

## 8. 环境配置

当前 WSL 发行版是 `Ubuntu-18.04`，可以做原型，但生产/长期开发建议升级到 Ubuntu 22.04 或 24.04。18.04 的系统包太旧，Node、Python、OpenSSL、Docker 相关兼容性都会更麻烦。

基础依赖：

```bash
sudo apt update
sudo apt install -y git curl unzip rsync build-essential ca-certificates
```

Node 建议：

```bash
# 推荐 Node 20 LTS
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20
```

后端依赖：

```bash
sudo apt install -y postgresql redis-server
```

环境变量建议：

```bash
APP_ENV=development
APP_BASE_URL=http://localhost:3000

DATABASE_URL=postgresql://lobster:lobster_dev_password@127.0.0.1:5432/lobster_platform
REDIS_URL=redis://127.0.0.1:6379/0

OPENCLAW_GATEWAY_BASE_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=replace_with_secret
OPENCLAW_DEFAULT_ORCHESTRATOR_AGENT_ID=research-bot-manager

OPENCLAW_DATA_ROOT=/srv/openclaw-platform
OPENCLAW_MARKET_ROOT=/srv/openclaw-platform/market
OPENCLAW_USER_ROOT=/srv/openclaw-platform/users
OPENCLAW_RUNTIME_ROOT=/srv/openclaw-platform/runtime

AGENT_MAX_CONCURRENCY_PER_USER=3
AGENT_MAX_CONCURRENCY_PER_NODE=8
TEAM_RUN_TIMEOUT_SEC=1800

SESSION_SECRET=replace_with_long_random_secret
PASSWORD_HASH_ALGO=argon2id
```

现有代码注意点：

- `src/lib/openclaw.ts` 里有硬编码 gateway token，后续应全部移动到服务端 env。
- 前端只能访问自己的 API，不应直接知道 OpenClaw gateway token。
- `src/app/api/lobsters/[id]/chat/route.ts` 已经开始使用 env，是更合理的方向。

当前 WSL 还提示 `/etc/wsl.conf` 第一行格式错误，建议后续修复，否则可能影响 localhost 映射、systemd 或挂载配置。

## 9. API 草案

认证：

```http
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

市场：

```http
GET  /api/market/agents
GET  /api/market/agents/:marketAgentId
POST /api/market/agents/:marketAgentId/clone
POST /api/market/uploads
POST /api/market/publish-requests
```

我的 Agent：

```http
GET    /api/agents
POST   /api/agents/upload
GET    /api/agents/:agentInstanceId
PATCH  /api/agents/:agentInstanceId
DELETE /api/agents/:agentInstanceId
POST   /api/agents/:agentInstanceId/chat
```

团队：

```http
GET   /api/teams
POST  /api/teams
GET   /api/teams/:teamId
PATCH /api/teams/:teamId
POST  /api/teams/:teamId/runs
GET   /api/team-runs/:runId
GET   /api/team-runs/:runId/events
POST  /api/team-runs/:runId/cancel
```

内部路由：

```http
POST /internal/a2a/route
POST /internal/workspaces/snapshot
POST /internal/workspaces/runtime-copy
POST /internal/artifacts
```

## 10. 前端页面与后端能力映射

| 现有页面/模块 | 产品能力 | 后续改造 |
| --- | --- | --- |
| `src/app/market/page.tsx` | 浏览市场 Agent | 接 `/api/market/agents`，支持 clone |
| `src/app/upload/page.tsx` | 上传 Agent | 接真实 zip 上传、manifest 校验、私人/发布选择 |
| `src/app/my-den/page.tsx` | 我的 Agent 列表 | 接 `/api/agents`，展示连接状态和 workspace 状态 |
| `src/app/my-den/[id]/page.tsx` | 单 Agent 对话 | 接 `/api/agents/:id/chat` 和 conversation |
| `src/app/architectures/create/*` | 创建团队 | 生成 team manifest，绑定用户已有 agents |
| `src/app/architectures/mine/page.tsx` | 我的团队列表 | 接 `/api/teams` |
| `src/app/architectures/mine/[id]/page.tsx` | 团队运行 | 创建 run，展示 step/event/artifact |
| `src/lib/api.ts` | mock API fallback | 逐步替换为真实 API client |
| `src/lib/openclaw.ts` | OpenClaw PoC client | 下沉到服务端 adapter |

## 11. 桌面端模式预留

桌面端不建议另起一套 Agent 协议。它应该复用：

- `agent.manifest.json`
- A2AWrapper
- A2A Router
- Workspace Manager
- Team manifest

差异点：

- 数据根目录可放在 `%APPDATA%/OpenClawLobster` 或 WSL `/srv/openclaw-platform`。
- 登录可弱化为本地 profile，但同步到 Web 时仍使用正式账号。
- 桌面端可以内置本地 API 服务，前端用 Tauri/Electron/本地 Next server 访问。
- Agent 运行默认在本机，未来支持登录后把 Agent 发布到 Web 市场。

## 12. 关键风险与建议

1. 文件夹思路合理，但必须配数据库。文件系统负责 workspace，数据库负责权限、状态、索引和审计。
2. Market workspace 必须版本不可变。否则用户克隆后的来源不可追踪，也无法回滚。
3. 团队运行必须使用隔离副本。不要让 Orchestrator 直接改成员 Agent 的 solo workspace。
4. 密码不能明文保存。只保存哈希。
5. gateway token 不能硬编码在前端或共享代码里。当前硬编码 token 要尽快移入服务端环境变量。
6. 高并发要靠队列和 worker，不要靠一次 HTTP 请求跑完整团队任务。
7. Ubuntu 18.04 只适合原型，建议升级 WSL 发行版后再做长期运行环境。
8. 用户上传 workspace 等于上传可执行代码，必须做 manifest 校验、权限隔离、资源限制和审核流程。

## 13. 分阶段路线

### M0：保留假前端，统一概念

- 修正类型命名：Lobster -> AgentInstance 可逐步兼容。
- 增加 manifest、team、run 的 TypeScript 类型。
- 页面仍可用 mock 数据。

### M1：用户与真实存储

- 增加用户注册/登录。
- 接 PostgreSQL。
- 建立 `/srv/openclaw-platform` 目录。
- 把 `market_agents`、`user_agent_instances` 落库。

### M2：上传、市场、克隆

- 实现 zip 上传和 manifest 校验。
- 私人上传写入 `users/{userId}/agents`。
- 发布市场写入 `market/uploads`，审核后进入 `market/agents`。
- 克隆市场 Agent 到用户私人 workspace。

### M3：单 Agent 对话

- 实现 `POST /api/agents/:id/chat`。
- agent key/session key 自动创建。
- 对话历史入库。
- OpenClaw Gateway 通过服务端 adapter 调用。

### M4：团队编排与 Orchestrator

- 创建 team manifest。
- 默认 Orchestrator 接入。
- Orchestrator 只能读取用户自己的 Agent registry。
- run 使用隔离 runtime workspace。

### M5：并发与可观测性

- 引入队列和 worker。
- 增加 run events、日志、取消、重试。
- 加入用户/节点/Agent 并发限制。

### M6：桌面端

- 复用 manifest 和 wrapper。
- 本地 profile + 本地 data root。
- 支持发布/同步到 Web。

### M7：多服务器

- 引入 worker node registry。
- runtime 按节点调度。
- workspace storage 抽象为本机 FS/MinIO/S3。
- A2A Router 负责跨节点路由。

## 14. 当前结论

整体框架是合理的，尤其是“市场不可变模板 + 用户私有 workspace + 团队运行隔离副本 + A2AWrapper 标准路由”的方向。最需要提前定死的是三件事：

1. workspace 生命周期：market source、user solo workspace、team runtime workspace 三层分开。
2. 权限边界：用户只能调度自己的 Agent，Orchestrator 也必须受这个边界约束。
3. 协议边界：前端只调用 Platform API，Platform API 再通过 A2A Router/OpenClaw Adapter 调 Agent。

按这个方向走，单 WSL 机器可以承载 MVP，后续扩到多服务器也不会推翻核心设计。
