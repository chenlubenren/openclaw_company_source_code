# OpenClaw Desktop Client

This is the desktop shell for OpenClaw. It loads the same local web app by default and exposes local-only Agent and project APIs to the web UI.

## Current Capabilities

- Wide desktop shell that loads the local web app at `http://127.0.0.1:3000` by default.
- Web/desktop unified UI: all regular pages come from `next-lobster-platform`.
- Desktop-only import mode: the web upload page becomes "Import Agent" when `window.openclawDesktop` is available.
- No visible login/register flow in desktop mode; local pages are allowed through the desktop bridge.
- Local Agent scanner for five workspace families:
  - Claude Code
  - Codex
  - OpenCode
  - Hermes
  - OpenClaw
- OpenClaw workspaces are treated as local Agents, including `~/.openclaw/workspace*`, `~/openclaw/workspace*`, `~/openclaw/workspaces/*`, and nested `.openclaw/data/workspaces/users/<user>/agents/<agent>/workspace` layouts.
- Local Agent import flow: select a scanned Agent, set its name, description, and avatar, then register the local folder without uploading it to the backend.
- Local project creation uses `C:\Users\<username>\openclaw\projects\<project>` so project workspaces do not collide with OpenClaw Agent workspaces.
- Local project file APIs can list and preview files inside the selected project workspace.

## Commands

```powershell
npm run scan
```

```powershell
npm install
npm run dev
```

Set this when you want the desktop shell to load a different Next.js URL:

```powershell
$env:OPENCLAW_DESKTOP_WEB_URL="http://localhost:3000"
npm run dev
```

Set this only when you need the old standalone renderer fallback:

```powershell
$env:OPENCLAW_DESKTOP_LEGACY_RENDERER="1"
npm run dev
```

## Import Notes

1. Start the web app.
2. Open `/upload`; in desktop mode it is shown as "Import Agent".
3. Select a scanned local Agent, finish the setup dialog, and import it.

The desktop import flow stores a local registry entry under the user's OpenClaw desktop state and keeps the original Agent folder in place.
