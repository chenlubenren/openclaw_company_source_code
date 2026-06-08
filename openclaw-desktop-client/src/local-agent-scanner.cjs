const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const AGENT_TYPES = ['claude-code', 'codex', 'opencode', 'hermes', 'openclaw'];
const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MAX_SCANNED_DIRS = 1200;
const DEFAULT_MAX_CANDIDATES = 200;
const DEFAULT_MAX_FILES = 1000;
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;

const SKIP_DIR_NAMES = new Set([
  '.git',
  '.next',
  '.turbo',
  'node_modules',
  'dist',
  'build',
  'target',
  '__pycache__',
  'AppData',
  'Library',
  '.cache',
  '.npm',
  '.pnpm-store',
  '.yarn',
  'sessions',
  'todos',
  'history',
  'logs',
]);

const UPLOAD_SKIP_DIR_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.next',
  '.turbo',
  'node_modules',
  'dist',
  'build',
  'target',
  'coverage',
  '__pycache__',
  '.cache',
]);

const SENSITIVE_UPLOAD_PATH_PATTERNS = [
  /(^|\/)\.env($|[./])/i,
  /(^|\/)(id_rsa|id_ed25519|id_ecdsa|.*\.(pem|key|p12|pfx|pkcs8))$/i,
  /(^|\/)(secrets?|credentials?|tokens?|api[_-]?keys?)\.(json|ya?ml|toml|ini|env|txt)$/i,
  /(^|\/)(auth|credentials)\.(json|toml)$/i,
  /(^|\/)agent\.config\.json$/i,
  /(^|\/)settings\.local\.json$/i,
  /(^|\/)\.openclaw($|\/)/i,
  /(^|\/)auth-profiles\.json$/i,
  /(^|\/)\.codex\/(auth|credentials)\.(json|toml)$/i,
  /(^|\/)\.codex\/sessions($|\/)/i,
  /(^|\/)\.claude\/settings\.local\.json$/i,
  /(^|\/)\.claude\/projects($|\/)/i,
  /(^|\/)\.claude\/todos($|\/)/i,
  /(^|\/)\.opencode\/sessions($|\/)/i,
  /(^|\/)\.hermes\/sessions($|\/)/i,
];

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

function isDirectory(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function readSmallText(filePath, maxBytes = 256 * 1024) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > maxBytes) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function listDirSafe(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function hasAnyFile(dirPath, names) {
  return names.some((name) => exists(path.join(dirPath, name)));
}

function scoreClaude(dirPath) {
  const hits = [];
  if (path.basename(dirPath).toLowerCase() === '.claude') hits.push('home .claude folder');
  if (exists(path.join(dirPath, 'settings.json'))) hits.push('settings.json');
  if (exists(path.join(dirPath, 'agents'))) hits.push('agents/');
  if (exists(path.join(dirPath, 'skills'))) hits.push('skills/');
  if (exists(path.join(dirPath, '.claude'))) hits.push('.claude/');
  if (exists(path.join(dirPath, '.claude', 'settings.json'))) hits.push('.claude/settings.json');
  if (exists(path.join(dirPath, 'CLAUDE.md'))) hits.push('CLAUDE.md');
  if (exists(path.join(dirPath, '.claude', 'agents'))) hits.push('.claude/agents/');
  if (exists(path.join(dirPath, '.claude', 'skills'))) hits.push('.claude/skills/');
  return { score: hits.length ? hits.length * 4 : 0, hits };
}

function scoreCodex(dirPath) {
  const hits = [];
  if (path.basename(dirPath).toLowerCase() === '.codex') hits.push('home .codex folder');
  if (exists(path.join(dirPath, 'config.toml'))) hits.push('config.toml');
  if (exists(path.join(dirPath, 'AGENTS.md'))) hits.push('AGENTS.md');
  if (exists(path.join(dirPath, '.codex'))) hits.push('.codex/');
  if (exists(path.join(dirPath, 'codex.toml'))) hits.push('codex.toml');
  if (exists(path.join(dirPath, 'codex.json'))) hits.push('codex.json');
  if (exists(path.join(dirPath, 'AGENTS.override.md'))) hits.push('AGENTS.override.md');
  const agentsMd = readSmallText(path.join(dirPath, 'AGENTS.md')).toLowerCase();
  if (agentsMd.includes('[codex]') || agentsMd.includes('openai codex')) hits.push('AGENTS.md codex hint');
  return { score: hits.length ? hits.length * 4 : 0, hits };
}

function scoreOpenCode(dirPath) {
  const hits = [];
  const baseName = path.basename(dirPath).toLowerCase();
  if (baseName === 'opencode' || baseName === '.opencode') hits.push('home opencode folder');
  if (exists(path.join(dirPath, 'agents'))) hits.push('agents/');
  if (exists(path.join(dirPath, 'config.json'))) hits.push('config.json');
  if (exists(path.join(dirPath, '.opencode'))) hits.push('.opencode/');
  if (exists(path.join(dirPath, '.opencode', 'agents'))) hits.push('.opencode/agents/');
  if (exists(path.join(dirPath, 'opencode.json'))) hits.push('opencode.json');
  if (baseName === 'opencode') hits.push('folder name opencode');
  return { score: hits.length ? hits.length * 4 : 0, hits };
}

function scoreHermes(dirPath) {
  const hits = [];
  if (path.basename(dirPath).toLowerCase() === '.hermes') hits.push('home .hermes folder');
  if (exists(path.join(dirPath, 'memories'))) hits.push('memories/');
  if (exists(path.join(dirPath, 'cron'))) hits.push('cron/');
  if (exists(path.join(dirPath, '.hermes'))) hits.push('.hermes/');
  if (exists(path.join(dirPath, '.hermes', 'memories'))) hits.push('.hermes/memories/');
  if (exists(path.join(dirPath, '.hermes', 'cron'))) hits.push('.hermes/cron/');
  if (exists(path.join(dirPath, '.hermes', 'sessions'))) hits.push('.hermes/sessions/');
  if (hasAnyFile(dirPath, ['hermes.yaml', 'hermes.yml', 'hermes.json'])) hits.push('hermes config');
  return { score: hits.length ? hits.length * 4 : 0, hits };
}

function scoreOpenClaw(dirPath) {
  const hits = [];
  const openclawBootstrap = ['SOUL.md', 'IDENTITY.md', 'BOOTSTRAP.md', 'BOOT.md', 'HEARTBEAT.md', 'TOOLS.md', 'USER.md', 'MEMORY.md'];
  for (const file of openclawBootstrap) {
    if (exists(path.join(dirPath, file))) hits.push(file);
  }

  const manifestPath = path.join(dirPath, 'agent.manifest.json');
  if (exists(manifestPath)) {
    hits.push('agent.manifest.json');
    const manifest = readSmallText(manifestPath).toLowerCase();
    if (manifest.includes('"openclaw"')) hits.push('manifest type openclaw');
  }

  const normalized = normalize(dirPath).toLowerCase();
  if (/\/(openclaw|\.openclaw)\/data\/workspaces\/users\/[^/]+\/agents\/[^/]+\/workspace$/.test(normalized)) {
    hits.push('openclaw backend workspace layout');
  }
  if (/\/(\.openclaw|openclaw)\/workspace[^/]*$/.test(normalized)) {
    hits.push('home .openclaw workspace layout');
  }
  if (/\/(\.openclaw|openclaw)\/workspaces\/[^/]+$/.test(normalized)) {
    hits.push('home openclaw workspaces layout');
  }
  if (exists(path.join(dirPath, '.openclaw')) && hits.length > 0) {
    hits.push('.openclaw runtime state');
  }

  return { score: hits.length ? hits.length * 5 : 0, hits };
}

function detectAgentWorkspace(dirPath) {
  const scorers = {
    'claude-code': scoreClaude,
    codex: scoreCodex,
    opencode: scoreOpenCode,
    hermes: scoreHermes,
    openclaw: scoreOpenClaw,
  };

  const scores = {};
  for (const type of AGENT_TYPES) {
    scores[type] = scorers[type](dirPath);
  }

  const ranked = Object.entries(scores)
    .filter(([, result]) => result.score > 0)
    .sort((a, b) => b[1].score - a[1].score);

  if (!ranked.length) return null;

  const [type, result] = ranked[0];
  const second = ranked[1]?.[1].score || 0;
  const confidence = result.score >= 8 && result.score > second ? 'high' : 'low';

  return {
    type,
    confidence,
    path: dirPath,
    name: path.basename(dirPath) || type,
    reason: result.hits.join(', '),
    scores: Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, value.score])),
  };
}

function candidateRoots(homeDir) {
  const roots = [
    path.join(homeDir, '.claude'),
    path.join(homeDir, '.codex'),
    path.join(homeDir, '.hermes'),
    path.join(homeDir, 'opencode'),
    path.join(homeDir, '.opencode'),
  ];
  return Array.from(new Set(roots.filter(isDirectory)));
}

function shouldSkipDir(dirent, parentPath) {
  if (!dirent.isDirectory()) return true;
  if (SKIP_DIR_NAMES.has(dirent.name)) return true;
  if (dirent.name.startsWith('.') && !['.claude', '.codex', '.opencode', '.hermes', '.openclaw'].includes(dirent.name)) {
    return true;
  }
  const fullPath = path.join(parentPath, dirent.name);
  return !isDirectory(fullPath);
}

function collectOpenClawSpecialRoots(homeDir) {
  const roots = [];
  for (const rootName of ['.openclaw', 'openclaw']) {
    const openclawRoot = path.join(homeDir, rootName);
    for (const entry of listDirSafe(openclawRoot)) {
      if (!entry.isDirectory()) continue;
      const lower = entry.name.toLowerCase();
      if (lower === 'workspaces') {
        for (const workspaceEntry of listDirSafe(path.join(openclawRoot, entry.name))) {
          if (workspaceEntry.isDirectory()) {
            roots.push(path.join(openclawRoot, entry.name, workspaceEntry.name));
          }
        }
        continue;
      }
      if (lower.startsWith('workspace')) {
        roots.push(path.join(openclawRoot, entry.name));
      }
      if (lower === 'data') {
        roots.push(...collectBackendWorkspaceRoots(path.join(openclawRoot, entry.name)));
      }
    }
  }
  return roots;
}

function collectBackendWorkspaceRoots(dataRoot) {
  const roots = [];
  const usersRoot = path.join(dataRoot, 'workspaces', 'users');
  for (const userEntry of listDirSafe(usersRoot)) {
    if (!userEntry.isDirectory()) continue;
    const agentsRoot = path.join(usersRoot, userEntry.name, 'agents');
    for (const agentEntry of listDirSafe(agentsRoot)) {
      if (!agentEntry.isDirectory()) continue;
      const workspacePath = path.join(agentsRoot, agentEntry.name, 'workspace');
      if (isDirectory(workspacePath)) roots.push(workspacePath);
    }
  }
  return roots;
}

function scanLocalAgents(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : DEFAULT_MAX_DEPTH;
  const maxCandidates = Number.isFinite(options.maxCandidates) ? options.maxCandidates : DEFAULT_MAX_CANDIDATES;
  const maxScannedDirs = Number.isFinite(options.maxScannedDirs) ? options.maxScannedDirs : DEFAULT_MAX_SCANNED_DIRS;
  const queue = [
    ...candidateRoots(homeDir).map((root) => ({ dirPath: root, depth: 0 })),
    ...collectOpenClawSpecialRoots(homeDir).map((root) => ({ dirPath: root, depth: 0 })),
  ];
  const seenDirs = new Set();
  const found = [];
  const foundPaths = new Set();

  while (queue.length && found.length < maxCandidates && seenDirs.size < maxScannedDirs) {
    const item = queue.shift();
    const dirPath = path.resolve(item.dirPath);
    const key = normalize(dirPath).toLowerCase();
    if (seenDirs.has(key)) continue;
    seenDirs.add(key);

    const detected = detectAgentWorkspace(dirPath);
    if (detected && !foundPaths.has(key)) {
      found.push(detected);
      foundPaths.add(key);
    }

    if (item.depth >= maxDepth) continue;

    for (const entry of listDirSafe(dirPath)) {
      if (shouldSkipDir(entry, dirPath)) continue;
      queue.push({ dirPath: path.join(dirPath, entry.name), depth: item.depth + 1 });
    }
  }

  return {
    homeDir,
    scannedDirs: seenDirs.size,
    scanLimitReached: queue.length > 0 && seenDirs.size >= maxScannedDirs,
    agents: found.sort((a, b) => (b.confidence === 'high' ? 1 : 0) - (a.confidence === 'high' ? 1 : 0)),
  };
}

function collectFolderForUpload(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const maxFiles = Number.isFinite(options.maxFiles) ? options.maxFiles : DEFAULT_MAX_FILES;
  const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : DEFAULT_MAX_BYTES;
  const files = [];
  const skippedSamples = [];
  let totalBytes = 0;
  let skippedCount = 0;

  function recordSkipped(relativePath, reason) {
    skippedCount += 1;
    if (skippedSamples.length < 20) {
      skippedSamples.push({
        path: normalize(relativePath),
        reason,
      });
    }
  }

  function getUploadSkipReason(relativePath, isDirectory) {
    const normalized = normalize(relativePath).replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) return null;
    const segments = normalized.split('/').filter(Boolean);
    const skippedDir = segments.find((segment) => UPLOAD_SKIP_DIR_NAMES.has(segment.toLowerCase()));
    if (skippedDir) {
      return `跳过本地缓存或构建目录：${skippedDir}`;
    }
    if (isDirectory && normalized === '.claude') {
      return null;
    }
    if (SENSITIVE_UPLOAD_PATH_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return '自动过滤敏感配置或运行态文件';
    }
    return null;
  }

  function walk(dirPath) {
    for (const entry of listDirSafe(dirPath)) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = normalize(path.relative(root, fullPath));
      if (entry.isSymbolicLink && entry.isSymbolicLink()) {
        recordSkipped(relativePath, '跳过符号链接');
        continue;
      }
      const skipReason = getUploadSkipReason(relativePath, entry.isDirectory());
      if (skipReason) {
        recordSkipped(relativePath, skipReason);
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;
      totalBytes += stat.size;
      if (files.length >= maxFiles) throw new Error(`Too many files; max is ${maxFiles}.`);
      if (totalBytes > maxBytes) throw new Error(`Folder is too large; max is ${Math.round(maxBytes / 1024 / 1024)}MB.`);

      files.push({
        path: relativePath,
        content: fs.readFileSync(fullPath).toString('base64'),
      });
    }
  }

  walk(root);
  const detected = detectAgentWorkspace(root);
  return {
    rootPath: root,
    agentType: detected?.type || 'unknown',
    detected,
    fileCount: files.length,
    totalBytes,
    skippedCount,
    skippedSamples,
    files,
  };
}

module.exports = {
  AGENT_TYPES,
  detectAgentWorkspace,
  scanLocalAgents,
  collectFolderForUpload,
};

if (require.main === module) {
  const homeArg = process.argv[2];
  const result = scanLocalAgents({ homeDir: homeArg || os.homedir() });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
