const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_ICON = '/project-icons/folder-blue.svg';
const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MAX_ENTRIES = 1200;
const DEFAULT_MAX_FILE_BYTES = 256 * 1024;

const SKIP_DIR_NAMES = new Set([
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
  '.openclaw',
]);

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

function listDirSafe(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function nowIso() {
  return new Date().toISOString();
}

function hashPath(filePath) {
  return crypto.createHash('sha1').update(path.resolve(filePath).toLowerCase()).digest('hex').slice(0, 16);
}

function projectIdForPath(filePath) {
  return `local-project-${hashPath(filePath)}`;
}

function desktopStateDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.openclaw');
}

function projectRegistryPath(homeDir = os.homedir()) {
  return path.join(desktopStateDir(homeDir), 'desktop-projects.json');
}

function projectWorkspaceRoot(homeDir = os.homedir()) {
  return path.join(homeDir, 'openclaw', 'projects');
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
  const registry = readJsonFile(projectRegistryPath(homeDir), { projects: [] });
  return {
    projects: Array.isArray(registry.projects) ? registry.projects : [],
  };
}

function writeRegistry(registry, homeDir = os.homedir()) {
  writeJsonFile(projectRegistryPath(homeDir), {
    projects: Array.isArray(registry.projects) ? registry.projects : [],
  });
}

function safeName(value, fallback) {
  const trimmed = String(value || '').trim();
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/[. ]+$/g, '')
    .slice(0, 64);
  return slug || fallback;
}

function uniqueWorkspacePath(projectName, homeDir = os.homedir()) {
  const root = projectWorkspaceRoot(homeDir);
  const base = safeName(projectName, `project-${Date.now()}`);
  let candidate = path.join(root, base);
  let index = 2;
  while (exists(candidate)) {
    candidate = path.join(root, `${base}-${index}`);
    index += 1;
  }
  return candidate;
}

function projectFromRecord(record, workspacePath = record.workspacePath) {
  const now = nowIso();
  return {
    id: record.id || projectIdForPath(workspacePath),
    userId: 'local-desktop',
    name: record.name || path.basename(workspacePath) || 'Local Project',
    description: record.description || '',
    notes: record.notes || '',
    icon: record.icon || DEFAULT_ICON,
    workspacePath,
    teamIds: Array.isArray(record.teamIds) ? record.teamIds : [],
    agentIds: Array.isArray(record.agentIds) ? record.agentIds : [],
    ganttEnabled: Boolean(record.ganttEnabled),
    ganttPlan: Array.isArray(record.ganttPlan) ? record.ganttPlan : [],
    gitRemote: record.gitRemote || '',
    gitBranch: record.gitBranch || '',
    gitCommit: record.gitCommit || '',
    status: record.status || 'active',
    lastOpenedAt: record.lastOpenedAt || null,
    createdAt: record.createdAt || now,
    updatedAt: record.updatedAt || record.createdAt || now,
  };
}

function localProjectFolderRoots(homeDir = os.homedir()) {
  const roots = [];
  const projectsRoot = projectWorkspaceRoot(homeDir);
  for (const entry of listDirSafe(projectsRoot)) {
    if (entry.isDirectory()) {
      roots.push(path.join(projectsRoot, entry.name));
    }
  }
  return roots;
}

function listLocalProjects(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const registry = readRegistry(homeDir);
  const byId = new Map();

  for (const workspacePath of localProjectFolderRoots(homeDir)) {
    const id = projectIdForPath(workspacePath);
    byId.set(id, projectFromRecord({ id, workspacePath, name: path.basename(workspacePath) }, workspacePath));
  }

  for (const record of registry.projects) {
    if (!record.workspacePath || !isDirectory(record.workspacePath)) continue;
    const project = projectFromRecord(record, record.workspacePath);
    byId.set(project.id, {
      ...byId.get(project.id),
      ...project,
    });
  }

  return Array.from(byId.values()).sort((a, b) => {
    const aTime = new Date(a.lastOpenedAt || a.updatedAt || a.createdAt).getTime();
    const bTime = new Date(b.lastOpenedAt || b.updatedAt || b.createdAt).getTime();
    return bTime - aTime;
  });
}

function findProject(projectId, homeDir = os.homedir()) {
  return listLocalProjects({ homeDir }).find((project) => project.id === projectId) || null;
}

function saveProjectRecord(project, homeDir = os.homedir()) {
  const registry = readRegistry(homeDir);
  const nextProjects = [
    project,
    ...registry.projects.filter((item) => item.id !== project.id),
  ];
  writeRegistry({ projects: nextProjects }, homeDir);
}

function createLocalProject(input = {}, options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const workspacePath = uniqueWorkspacePath(input.name || 'project', homeDir);
  fs.mkdirSync(workspacePath, { recursive: true });

  const createdAt = nowIso();
  const project = projectFromRecord({
    id: projectIdForPath(workspacePath),
    name: String(input.name || '').trim() || path.basename(workspacePath),
    description: String(input.description || '').trim(),
    notes: String(input.notes || '').trim(),
    icon: input.icon || DEFAULT_ICON,
    teamIds: Array.isArray(input.teamIds) ? input.teamIds : [],
    agentIds: Array.isArray(input.agentIds) ? input.agentIds : [],
    ganttEnabled: Boolean(input.ganttEnabled),
    ganttPlan: Array.isArray(input.ganttPlan) ? input.ganttPlan : [],
    gitRemote: input.gitRemote || '',
    gitBranch: input.gitBranch || '',
    gitCommit: input.gitCommit || '',
    workspacePath,
    createdAt,
    updatedAt: createdAt,
    lastOpenedAt: createdAt,
  }, workspacePath);

  const metadataDir = path.join(workspacePath, '.openclaw');
  fs.mkdirSync(metadataDir, { recursive: true });
  writeJsonFile(path.join(metadataDir, 'project.json'), project);

  const readmePath = path.join(workspacePath, 'README.md');
  if (!exists(readmePath)) {
    fs.writeFileSync(
      readmePath,
      [`# ${project.name}`, '', project.description || 'Local OpenClaw desktop project.', ''].join('\n'),
      'utf8'
    );
  }

  saveProjectRecord(project, homeDir);
  return project;
}

function updateLocalProject(projectId, input = {}, options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const current = findProject(projectId, homeDir);
  if (!current) throw new Error('Local project not found.');

  const updated = projectFromRecord({
    ...current,
    ...input,
    id: current.id,
    workspacePath: current.workspacePath,
    updatedAt: nowIso(),
  }, current.workspacePath);

  saveProjectRecord(updated, homeDir);
  writeJsonFile(path.join(updated.workspacePath, '.openclaw', 'project.json'), updated);
  return updated;
}

function openLocalProject(projectId, options = {}) {
  const homeDir = options.homeDir || os.homedir();
  return updateLocalProject(projectId, { lastOpenedAt: nowIso() }, { homeDir });
}

function deleteLocalProject(projectId, options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const registry = readRegistry(homeDir);
  writeRegistry({
    projects: registry.projects.filter((item) => item.id !== projectId),
  }, homeDir);
  return { success: true };
}

function ensureInsideRoot(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const rootKey = process.platform === 'win32' ? resolvedRoot.toLowerCase() : resolvedRoot;
  const targetKey = process.platform === 'win32' ? resolvedTarget.toLowerCase() : resolvedTarget;
  if (targetKey !== rootKey && !targetKey.startsWith(`${rootKey}${path.sep}`)) {
    throw new Error('Path escapes the local project workspace.');
  }
  return resolvedTarget;
}

function resolveProjectChild(project, relativePath = '') {
  return ensureInsideRoot(project.workspacePath, path.join(project.workspacePath, relativePath || ''));
}

function fileNode(root, fullPath, relativePath, depth, state, options) {
  const stat = fs.statSync(fullPath);
  const isDir = stat.isDirectory();
  const node = {
    name: path.basename(fullPath) || path.basename(root),
    path: fullPath,
    relativePath: normalize(relativePath),
    isDirectory: isDir,
    size: isDir ? 0 : stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };

  if (!isDir || depth >= options.maxDepth || state.totalEntries >= options.maxEntries) {
    if (isDir && depth >= options.maxDepth) state.truncated = true;
    return node;
  }

  const children = [];
  for (const entry of listDirSafe(fullPath)) {
    if (state.totalEntries >= options.maxEntries) {
      state.truncated = true;
      break;
    }
    if (entry.isDirectory() && SKIP_DIR_NAMES.has(entry.name)) continue;
    if (entry.isSymbolicLink && entry.isSymbolicLink()) continue;
    const childPath = path.join(fullPath, entry.name);
    const childRelative = path.join(relativePath, entry.name);
    try {
      state.totalEntries += 1;
      children.push(fileNode(root, childPath, childRelative, depth + 1, state, options));
    } catch {
      state.truncated = true;
    }
  }

  children.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { ...node, children };
}

function readLocalProjectTree(projectId, relativePath = '', options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const project = findProject(projectId, homeDir);
  if (!project) throw new Error('Local project not found.');

  const rootPath = resolveProjectChild(project, relativePath);
  if (!isDirectory(rootPath)) throw new Error('Local project path is not a directory.');

  const state = { totalEntries: 0, truncated: false };
  const root = fileNode(project.workspacePath, rootPath, path.relative(project.workspacePath, rootPath), 0, state, {
    maxDepth: Number.isFinite(options.maxDepth) ? options.maxDepth : DEFAULT_MAX_DEPTH,
    maxEntries: Number.isFinite(options.maxEntries) ? options.maxEntries : DEFAULT_MAX_ENTRIES,
  });

  return {
    projectId,
    root,
    truncated: state.truncated,
    totalEntries: state.totalEntries,
  };
}

function isBinaryBuffer(buffer) {
  const sampleSize = Math.min(buffer.length, 8192);
  for (let index = 0; index < sampleSize; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

function readLocalProjectFile(projectId, relativePath, options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const project = findProject(projectId, homeDir);
  if (!project) throw new Error('Local project not found.');

  const fullPath = resolveProjectChild(project, relativePath);
  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) throw new Error('Local project path is not a file.');

  const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : DEFAULT_MAX_FILE_BYTES;
  const buffer = fs.readFileSync(fullPath);
  const binary = isBinaryBuffer(buffer);
  const truncated = buffer.length > maxBytes;
  const contentBuffer = truncated ? buffer.subarray(0, maxBytes) : buffer;

  return {
    name: path.basename(fullPath),
    path: fullPath,
    relativePath: normalize(path.relative(project.workspacePath, fullPath)),
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    content: binary ? '' : contentBuffer.toString('utf8'),
    truncated,
    binary,
  };
}

module.exports = {
  createLocalProject,
  deleteLocalProject,
  listLocalProjects,
  openLocalProject,
  readLocalProjectFile,
  readLocalProjectTree,
  updateLocalProject,
};
