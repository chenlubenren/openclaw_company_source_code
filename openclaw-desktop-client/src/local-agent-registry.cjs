const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanLocalAgents, detectAgentWorkspace } = require('./local-agent-scanner.cjs');

function normalize(filePath) {
  return filePath.replace(/\\/g, '/');
}

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function hashPath(filePath) {
  return crypto.createHash('sha1').update(path.resolve(filePath).toLowerCase()).digest('hex').slice(0, 16);
}

function agentIdForPath(filePath) {
  return `local-agent-${hashPath(filePath)}`;
}

function registryPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.openclaw', 'desktop-agents.json');
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readRegistry(homeDir = os.homedir()) {
  const registry = readJsonFile(registryPath(homeDir), { agents: [] });
  return {
    agents: Array.isArray(registry.agents) ? registry.agents : [],
    hiddenAgentIds: Array.isArray(registry.hiddenAgentIds)
      ? registry.hiddenAgentIds.filter((id) => typeof id === 'string')
      : [],
  };
}

function writeRegistry(registry, homeDir = os.homedir()) {
  writeJsonFile(registryPath(homeDir), {
    agents: Array.isArray(registry.agents) ? registry.agents : [],
    hiddenAgentIds: Array.isArray(registry.hiddenAgentIds) ? registry.hiddenAgentIds : [],
  });
}

function recordFromCandidate(candidate, overrides = {}) {
  const workspacePath = path.resolve(overrides.workspacePath || candidate.path);
  const now = nowIso();
  return {
    id: overrides.id || agentIdForPath(workspacePath),
    name: overrides.name || candidate.name || path.basename(workspacePath) || 'Local Agent',
    description: overrides.description || '',
    avatar: overrides.avatar || '',
    platform: overrides.platform || candidate.type || 'unknown',
    workspacePath,
    confidence: candidate.confidence || 'low',
    reason: candidate.reason || '',
    imported: Boolean(overrides.imported),
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
  };
}

function listLocalAgents(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const scanned = scanLocalAgents({ homeDir });
  const registry = readRegistry(homeDir);
  const hiddenAgentIds = new Set(registry.hiddenAgentIds);
  const byId = new Map();

  for (const candidate of scanned.agents) {
    const record = recordFromCandidate(candidate, { imported: false });
    if (hiddenAgentIds.has(record.id)) continue;
    byId.set(record.id, record);
  }

  for (const record of registry.agents) {
    if (!record.workspacePath || !exists(record.workspacePath)) continue;
    const detected = detectAgentWorkspace(record.workspacePath);
    const id = record.id || agentIdForPath(record.workspacePath);
    if (hiddenAgentIds.has(id)) continue;
    byId.set(id, {
      ...byId.get(id),
      ...record,
      id,
      workspacePath: path.resolve(record.workspacePath),
      platform: record.platform || detected?.type || byId.get(id)?.platform || 'unknown',
      confidence: detected?.confidence || record.confidence || byId.get(id)?.confidence || 'low',
      reason: detected?.reason || record.reason || byId.get(id)?.reason || '',
      imported: true,
    });
  }

  return {
    homeDir,
    scannedDirs: scanned.scannedDirs,
    scanLimitReached: scanned.scanLimitReached,
    agents: Array.from(byId.values()).sort((a, b) => {
      if (a.imported !== b.imported) return a.imported ? -1 : 1;
      return a.name.localeCompare(b.name);
    }),
  };
}

function importLocalAgent(input = {}, options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const rawRootPath = input.rootPath || input.workspacePath;
  if (!rawRootPath) throw new Error('Local agent folder not found.');
  const rootPath = path.resolve(rawRootPath);
  if (!rootPath || !exists(rootPath)) throw new Error('Local agent folder not found.');

  const detected = detectAgentWorkspace(rootPath) || {
    type: input.agentType || 'unknown',
    confidence: 'low',
    path: rootPath,
    name: path.basename(rootPath) || 'Local Agent',
    reason: 'manual local import',
  };
  const id = agentIdForPath(rootPath);
  const registry = readRegistry(homeDir);
  const previous = registry.agents.find((agent) => agent.id === id);
  const record = recordFromCandidate(detected, {
    ...previous,
    id,
    workspacePath: rootPath,
    name: String(input.name || previous?.name || detected.name || '').trim() || path.basename(rootPath) || 'Local Agent',
    description: String(input.description || previous?.description || '').trim(),
    avatar: input.avatar || previous?.avatar || '',
    platform: input.agentType || previous?.platform || detected.type || 'unknown',
    imported: true,
    createdAt: previous?.createdAt || nowIso(),
    updatedAt: nowIso(),
  });

  writeRegistry({
    agents: [
      record,
      ...registry.agents.filter((agent) => agent.id !== id),
    ],
    hiddenAgentIds: registry.hiddenAgentIds.filter((hiddenId) => hiddenId !== id),
  }, homeDir);

  return {
    success: true,
    agent: record,
  };
}

function deleteLocalAgent(agentId, options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const registry = readRegistry(homeDir);
  const hiddenAgentIds = new Set(registry.hiddenAgentIds);
  const nextAgents = registry.agents.filter((agent) => agent.id !== agentId);
  const alreadyHidden = hiddenAgentIds.has(agentId);
  hiddenAgentIds.add(agentId);
  writeRegistry({
    agents: nextAgents,
    hiddenAgentIds: Array.from(hiddenAgentIds),
  }, homeDir);
  return { success: nextAgents.length !== registry.agents.length || !alreadyHidden };
}

module.exports = {
  agentIdForPath,
  deleteLocalAgent,
  importLocalAgent,
  listLocalAgents,
};
