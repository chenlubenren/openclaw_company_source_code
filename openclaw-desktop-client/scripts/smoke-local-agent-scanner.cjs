const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanLocalAgents, collectFolderForUpload } = require('../src/local-agent-scanner.cjs');

function write(filePath, content = '') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function mkdir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-desktop-scan-'));

try {
  write(path.join(root, '.claude', 'settings.json'), '{}');
  write(path.join(root, '.claude', 'agents', 'helper.md'), '# Claude agent');
  write(path.join(root, '.codex', 'config.toml'), 'model = "gpt-5"');
  write(path.join(root, '.codex', 'AGENTS.md'), '[codex]\nOpenAI Codex project');
  write(path.join(root, 'opencode', 'opencode.json'), '{}');
  write(path.join(root, 'opencode', 'agents', 'worker.md'), '# OpenCode agent');
  write(path.join(root, '.hermes', 'hermes.yaml'), 'name: hermes');
  write(path.join(root, '.hermes', 'memories', 'memo.md'), '# Memory');
  write(path.join(root, '.openclaw', 'workspace-main', 'SOUL.md'), '# Soul');
  write(path.join(root, '.openclaw', 'workspace-main', 'agent.manifest.json'), '{"entrypoint":{"type":"openclaw"}}');
  write(path.join(root, 'openclaw', 'workspaces', 'workspace-extra', 'SOUL.md'), '# Extra Soul');
  write(path.join(root, 'openclaw', 'workspaces', 'workspace-extra', 'agent.manifest.json'), '{"entrypoint":{"type":"openclaw"}}');
  write(path.join(root, '.openclaw', 'data', 'workspaces', 'users', 'user-a', 'agents', 'agent-a', 'workspace', 'SOUL.md'), '# Nested OpenClaw');
  write(path.join(root, '.openclaw', 'data', 'workspaces', 'users', 'user-a', 'agents', 'agent-a', 'workspace', 'IDENTITY.md'), '# Identity');
  write(path.join(root, '.openclaw', 'data', 'workspaces', 'users', 'user-a', 'agents', 'agent-a', 'workspace', 'skills', 'demo', 'SKILL.md'), '# Demo skill');
  write(path.join(root, '.openclaw', 'data', 'workspaces', 'users', 'user-a', 'agents', 'agent-a', 'workspace', '.env'), 'OPENAI_API_KEY=secret');
  write(path.join(root, '.openclaw', 'data', 'workspaces', 'users', 'user-a', 'agents', 'agent-a', 'workspace', '.env.local'), 'ANTHROPIC_API_KEY=secret');
  write(path.join(root, '.openclaw', 'data', 'workspaces', 'users', 'user-a', 'agents', 'agent-a', 'workspace', 'agent.config.json'), '{"apiKey":"secret"}');
  write(path.join(root, '.openclaw', 'data', 'workspaces', 'users', 'user-a', 'agents', 'agent-a', 'workspace', '.openclaw', 'auth-profiles.json'), '{"profiles":["secret"]}');
  write(path.join(root, '.openclaw', 'data', 'workspaces', 'users', 'user-a', 'agents', 'agent-a', 'workspace', '.openclaw', 'agents', 'agent-a', 'sessions', 'session.jsonl'), 'secret session');
  write(path.join(root, '.openclaw', 'data', 'workspaces', 'users', 'user-a', 'agents', 'agent-a', 'workspace', '.codex', 'auth.json'), '{"token":"secret"}');
  write(path.join(root, '.openclaw', 'data', 'workspaces', 'users', 'user-a', 'agents', 'agent-a', 'workspace', '.claude', 'settings.local.json'), '{"apiKey":"secret"}');
  write(path.join(root, '.openclaw', 'data', 'workspaces', 'users', 'user-a', 'agents', 'agent-a', 'workspace', '.claude', 'agents', 'helper.md'), '# Helper');

  const result = scanLocalAgents({ homeDir: root });
  const types = new Set(result.agents.map((agent) => agent.type));
  for (const type of ['claude-code', 'codex', 'opencode', 'hermes', 'openclaw']) {
    assert(types.has(type), `Expected scanner to find ${type}, got ${Array.from(types).join(', ')}`);
  }

  const openclawNested = result.agents.find((agent) =>
    agent.type === 'openclaw' &&
    agent.path.replace(/\\/g, '/').endsWith('/.openclaw/data/workspaces/users/user-a/agents/agent-a/workspace')
  );
  assert(openclawNested, 'Expected scanner to recognize nested OpenClaw backend workspace layout.');

  const upload = collectFolderForUpload(openclawNested.path);
  assert(upload.agentType === 'openclaw', `Expected upload agentType openclaw, got ${upload.agentType}`);
  assert(upload.skippedCount >= 6, `Expected sensitive/runtime entries to be skipped, got ${upload.skippedCount}.`);
  assert(upload.skippedSamples.some((item) => item.path === '.env'), 'Expected skipped sample for .env.');
  assert(upload.skippedSamples.some((item) => item.path === 'agent.config.json'), 'Expected skipped sample for agent.config.json.');
  assert(upload.skippedSamples.some((item) => item.path === '.openclaw'), 'Expected skipped sample for .openclaw runtime directory.');
  const uploadPaths = upload.files.map((file) => file.path).sort();
  assert(uploadPaths.includes('SOUL.md'), 'Expected SOUL.md in upload file list.');
  assert(uploadPaths.includes('IDENTITY.md'), 'Expected IDENTITY.md in upload file list.');
  assert(uploadPaths.includes('skills/demo/SKILL.md'), 'Expected useful skill file in upload file list.');
  assert(uploadPaths.includes('.claude/agents/helper.md'), 'Expected non-secret Claude agent helper in upload file list.');
  for (const forbiddenPath of [
    '.env',
    '.env.local',
    'agent.config.json',
    '.openclaw/auth-profiles.json',
    '.openclaw/agents/agent-a/sessions/session.jsonl',
    '.codex/auth.json',
    '.claude/settings.local.json',
  ]) {
    assert(!uploadPaths.includes(forbiddenPath), `Expected ${forbiddenPath} to be filtered from upload file list.`);
  }

  console.log(JSON.stringify({
    scannedDirs: result.scannedDirs,
    agentTypes: Array.from(types).sort(),
    openclawNestedPath: openclawNested.path,
    uploadFileCount: upload.fileCount,
    uploadAgentType: upload.agentType,
    uploadPaths,
    skippedCount: upload.skippedCount,
    skippedSamples: upload.skippedSamples,
    defaultDepthDetectedNestedOpenClaw: true,
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
