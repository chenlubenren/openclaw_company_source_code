import fs from 'fs';
import path from 'path';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { projects, type Project } from '../db/schema.js';
import { getProjectWorkspacePath, resolveStoredPath, writeFile } from './workspace.service.js';

const DEFAULT_PROJECT_ICON = '/project-icons/folder-blue.svg';
const PROJECT_TREE_MAX_DEPTH = 5;
const PROJECT_TREE_MAX_ENTRIES = 600;
const PROJECT_FILE_PREVIEW_MAX_BYTES = 512 * 1024;
const PROJECT_FILE_IGNORED_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  '.next',
  '.openclaw',
  'build',
  'dist',
  'node_modules',
]);

export interface ProjectFileNode {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  children?: ProjectFileNode[];
}

export interface ProjectFileTree {
  projectId: string;
  root: ProjectFileNode;
  truncated: boolean;
  totalEntries: number;
}

export interface ProjectFileContent {
  name: string;
  path: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
  content: string;
  truncated: boolean;
  binary: boolean;
}

export interface ProjectWorkspaceArchive {
  filename: string;
  buffer: Buffer;
  fileCount: number;
}

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeIcon(value: unknown): string {
  const icon = normalizeText(value);
  return icon || DEFAULT_PROJECT_ICON;
}

function normalizeJsonArray(value: unknown): string {
  if (!Array.isArray(value)) return '[]';
  return JSON.stringify(value);
}

function safeProject(project: Project) {
  return {
    id: project.id,
    userId: project.userId,
    name: project.name,
    description: project.description,
    notes: project.notes,
    icon: project.icon,
    workspacePath: project.workspacePath,
    teamIds: parseJsonArray(project.teamIds),
    agentIds: parseJsonArray(project.agentIds),
    ganttEnabled: Boolean(project.ganttEnabled),
    ganttPlan: parseJsonArray(project.ganttPlan),
    gitRemote: project.gitRemote,
    gitBranch: project.gitBranch,
    gitCommit: project.gitCommit,
    status: project.status,
    lastOpenedAt: project.lastOpenedAt?.toISOString?.() ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

type SafeProject = ReturnType<typeof safeProject>;

function writeProjectMetadata(project: SafeProject): void {
  writeFile(
    path.join(project.workspacePath, '.openclaw-project.json'),
    JSON.stringify(
      {
        ...project,
        git: {
          remote: project.gitRemote,
          branch: project.gitBranch,
          commit: project.gitCommit,
        },
      },
      null,
      2
    )
  );
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function nextRecentProjectTimestamp(userId: string): Promise<Date> {
  const db = getDb();
  const rows = await db
    .select({
      lastOpenedAt: projects.lastOpenedAt,
      updatedAt: projects.updatedAt,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(eq(projects.userId, userId));

  const maxExisting = rows.reduce((max, row) => {
    const candidates = [row.lastOpenedAt, row.updatedAt, row.createdAt]
      .filter((value): value is Date => value instanceof Date);
    const rowMax = candidates.reduce((innerMax, value) => Math.max(innerMax, value.getTime()), 0);
    return Math.max(max, rowMax);
  }, 0);
  const now = Date.now();
  return new Date(Math.max(now, maxExisting + 1000));
}

export interface CreateProjectInput {
  name: unknown;
  description?: unknown;
  notes?: unknown;
  icon?: unknown;
  teamIds?: unknown;
  agentIds?: unknown;
  ganttEnabled?: unknown;
  ganttPlan?: unknown;
  gitRemote?: unknown;
  gitBranch?: unknown;
  gitCommit?: unknown;
}

export async function listProjects(userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.lastOpenedAt), desc(projects.updatedAt));
  return rows.map(safeProject);
}

export async function getProject(userId: string, projectId: string) {
  const db = getDb();
  const row = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return row[0] ? safeProject(row[0]) : null;
}

export async function createProject(userId: string, input: CreateProjectInput) {
  const db = getDb();
  const name = normalizeText(input.name);
  if (!name) {
    throw new Error('项目名称不能为空');
  }

  const now = new Date();
  const id = generateId();
  const workspacePath = getProjectWorkspacePath(userId, id);
  const gitBranch = normalizeText(input.gitBranch, 'main') || 'main';

  await db.insert(projects).values({
    id,
    userId,
    name,
    description: normalizeText(input.description),
    notes: normalizeText(input.notes),
    icon: normalizeIcon(input.icon),
    workspacePath,
    teamIds: JSON.stringify(parseStringArray(input.teamIds)),
    agentIds: JSON.stringify(parseStringArray(input.agentIds)),
    ganttEnabled: input.ganttEnabled === true,
    ganttPlan: normalizeJsonArray(input.ganttPlan),
    gitRemote: normalizeText(input.gitRemote),
    gitBranch,
    gitCommit: normalizeText(input.gitCommit),
    status: 'active',
    lastOpenedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const created = await getProject(userId, id);
  if (created) {
    writeProjectMetadata(created);
  }

  return created;
}

export async function updateProject(userId: string, projectId: string, input: Partial<CreateProjectInput>) {
  const db = getDb();
  const existing = await getProject(userId, projectId);
  if (!existing) return null;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const name = normalizeText(input.name);
    if (!name) throw new Error('项目名称不能为空');
    updateData.name = name;
  }
  if (input.description !== undefined) updateData.description = normalizeText(input.description);
  if (input.notes !== undefined) updateData.notes = normalizeText(input.notes);
  if (input.icon !== undefined) updateData.icon = normalizeIcon(input.icon);
  if (input.teamIds !== undefined) updateData.teamIds = JSON.stringify(parseStringArray(input.teamIds));
  if (input.agentIds !== undefined) updateData.agentIds = JSON.stringify(parseStringArray(input.agentIds));
  if (input.ganttEnabled !== undefined) updateData.ganttEnabled = input.ganttEnabled === true;
  if (input.ganttPlan !== undefined) updateData.ganttPlan = normalizeJsonArray(input.ganttPlan);
  if (input.gitRemote !== undefined) updateData.gitRemote = normalizeText(input.gitRemote);
  if (input.gitBranch !== undefined) updateData.gitBranch = normalizeText(input.gitBranch, 'main') || 'main';
  if (input.gitCommit !== undefined) updateData.gitCommit = normalizeText(input.gitCommit);

  await db
    .update(projects)
    .set(updateData)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

  const updated = await getProject(userId, projectId);
  if (updated) {
    writeProjectMetadata(updated);
  }
  return updated;
}

export async function touchProject(userId: string, projectId: string) {
  const db = getDb();
  const existing = await getProject(userId, projectId);
  if (!existing) return null;
  const touchedAt = await nextRecentProjectTimestamp(userId);

  await db
    .update(projects)
    .set({ lastOpenedAt: touchedAt, updatedAt: touchedAt })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  const touched = await getProject(userId, projectId);
  if (touched) {
    writeProjectMetadata(touched);
  }
  return touched;
}

export async function deleteProject(userId: string, projectId: string) {
  const db = getDb();
  const existing = await getProject(userId, projectId);
  if (!existing) return false;

  await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return true;
}

export function ensureProjectWorkspace(workspacePath: string): void {
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }
}

function normalizeRequestedRelativePath(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  if (path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
    throw new Error('只能访问当前项目工作区内的相对路径');
  }

  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) {
    throw new Error('路径不能跳出当前项目工作区');
  }
  return parts.join('/');
}

function resolveProjectChildPath(workspacePath: string, relativePath: string): { rootPath: string; targetPath: string } {
  const rootPath = path.resolve(resolveStoredProjectPath(workspacePath));
  const targetPath = path.resolve(rootPath, relativePath);
  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error('路径不能跳出当前项目工作区');
  }
  return { rootPath, targetPath };
}

function resolveStoredProjectPath(workspacePath: string): string {
  return resolveStoredPath(workspacePath);
}

const OPENCLAW_SCAFFOLD_FILES = new Set([
  'AGENTS.md',
  'BOOTSTRAP.md',
  'HEARTBEAT.md',
  'IDENTITY.md',
  'SOUL.md',
  'TOOLS.md',
  'USER.md',
]);

const PROJECT_FILE_PROTECTED_PREFIXES = [
  '.git/',
  '.openclaw/',
  '.next/',
  'build/',
  'dist/',
  'node_modules/',
];

function shouldHideProjectTreeEntry(name: string, relativePath: string, isDirectory: boolean): boolean {
  if (isDirectory && PROJECT_FILE_IGNORED_DIRS.has(name)) return true;
  if (relativePath === '.openclaw-project.json') return true;
  if (!isDirectory && relativePath === name && OPENCLAW_SCAFFOLD_FILES.has(name)) return true;
  return false;
}

function sanitizeArchiveName(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'project';
}

function assertMutableProjectFilePath(relativePath: string): void {
  if (!relativePath) {
    throw new Error('请选择要操作的文件');
  }
  const normalized = normalizeRelativeProjectPath(relativePath);
  if (
    normalized === '.openclaw-project.json' ||
    PROJECT_FILE_PROTECTED_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    OPENCLAW_SCAFFOLD_FILES.has(path.basename(normalized))
  ) {
    throw new Error('该文件属于系统配置或运行态文件，不能在项目文件列表中修改');
  }
}

function fileNodeFromStat(name: string, relativePath: string, stats: fs.Stats, children?: ProjectFileNode[]): ProjectFileNode {
  return {
    name,
    path: relativePath,
    relativePath,
    isDirectory: stats.isDirectory(),
    size: stats.isDirectory() ? 0 : stats.size,
    modifiedAt: stats.mtime.toISOString(),
    ...(children ? { children } : {}),
  };
}

export async function listProjectFiles(userId: string, projectId: string, requestedPath?: unknown): Promise<ProjectFileTree | null> {
  const project = await getProject(userId, projectId);
  if (!project) return null;

  const relativePath = normalizeRequestedRelativePath(requestedPath);
  const { rootPath, targetPath } = resolveProjectChildPath(project.workspacePath, relativePath);
  ensureProjectWorkspace(rootPath);

  if (!fs.existsSync(targetPath)) {
    throw new Error('项目文件夹不存在');
  }

  const rootStats = fs.statSync(targetPath);
  if (!rootStats.isDirectory()) {
    throw new Error('请选择项目文件夹路径');
  }

  let totalEntries = 0;
  let truncated = false;

  const walk = (dirPath: string, depth: number): ProjectFileNode[] => {
    if (depth > PROJECT_TREE_MAX_DEPTH || totalEntries >= PROJECT_TREE_MAX_ENTRIES) {
      truncated = true;
      return [];
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        const entryRelativePath = normalizeRelativeProjectPath(path.relative(rootPath, fullPath));
        return !shouldHideProjectTreeEntry(entry.name, entryRelativePath, entry.isDirectory());
      })
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' });
      });

    const nodes: ProjectFileNode[] = [];
    for (const entry of entries) {
      if (totalEntries >= PROJECT_TREE_MAX_ENTRIES) {
        truncated = true;
        break;
      }

      const fullPath = path.join(dirPath, entry.name);
      const stats = fs.statSync(fullPath);
      if (!stats.isDirectory() && !stats.isFile()) continue;

      totalEntries += 1;
      const entryRelativePath = normalizeRelativeProjectPath(path.relative(rootPath, fullPath));
      const children = entry.isDirectory() ? walk(fullPath, depth + 1) : undefined;
      nodes.push(fileNodeFromStat(entry.name, entryRelativePath, stats, children));
    }

    return nodes;
  };

  const rootRelativePath = normalizeRelativeProjectPath(path.relative(rootPath, targetPath));
  return {
    projectId,
    root: fileNodeFromStat(
      rootRelativePath ? path.basename(targetPath) : 'workspace',
      rootRelativePath,
      rootStats,
      walk(targetPath, 0)
    ),
    truncated,
    totalEntries,
  };
}

export async function readProjectFileContent(
  userId: string,
  projectId: string,
  requestedPath?: unknown
): Promise<ProjectFileContent | null> {
  const project = await getProject(userId, projectId);
  if (!project) return null;

  const relativePath = normalizeRequestedRelativePath(requestedPath);
  if (!relativePath) {
    throw new Error('请选择要预览的文件');
  }

  const { targetPath } = resolveProjectChildPath(project.workspacePath, relativePath);
  if (!fs.existsSync(targetPath)) {
    throw new Error('文件不存在');
  }

  const stats = fs.statSync(targetPath);
  if (!stats.isFile()) {
    throw new Error('只能预览文件，不能预览文件夹');
  }

  const bytesToRead = Math.min(stats.size, PROJECT_FILE_PREVIEW_MAX_BYTES);
  const buffer = Buffer.alloc(bytesToRead);
  if (bytesToRead > 0) {
    const fd = fs.openSync(targetPath, 'r');
    try {
      fs.readSync(fd, buffer, 0, bytesToRead, 0);
    } finally {
      fs.closeSync(fd);
    }
  }

  const binary = buffer.includes(0);
  return {
    name: path.basename(targetPath),
    path: relativePath,
    relativePath,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    content: binary ? '' : buffer.toString('utf-8').replace(/^\uFEFF/, ''),
    truncated: stats.size > PROJECT_FILE_PREVIEW_MAX_BYTES,
    binary,
  };
}

export async function buildProjectWorkspaceArchive(
  userId: string,
  projectId: string
): Promise<ProjectWorkspaceArchive | null> {
  const project = await getProject(userId, projectId);
  if (!project) return null;

  const rootPath = path.resolve(resolveStoredProjectPath(project.workspacePath));
  ensureProjectWorkspace(rootPath);

  const AdmZip = await import('adm-zip');
  const zip = new AdmZip.default();
  let fileCount = 0;

  const walk = (dirPath: string): void => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' });
    });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = normalizeRelativeProjectPath(path.relative(rootPath, fullPath));
      if (shouldHideProjectTreeEntry(entry.name, relativePath, entry.isDirectory())) continue;

      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        walk(fullPath);
      } else if (stats.isFile()) {
        zip.addLocalFile(fullPath, path.posix.dirname(relativePath) === '.' ? '' : path.posix.dirname(relativePath));
        fileCount += 1;
      }
    }
  };

  walk(rootPath);
  return {
    filename: `${sanitizeArchiveName(project.name)}-${project.id.slice(0, 8)}.zip`,
    buffer: zip.toBuffer(),
    fileCount,
  };
}

export async function renameProjectFile(
  userId: string,
  projectId: string,
  requestedPath: unknown,
  requestedName: unknown
): Promise<ProjectFileNode | null> {
  const project = await getProject(userId, projectId);
  if (!project) return null;

  const relativePath = normalizeRequestedRelativePath(requestedPath);
  assertMutableProjectFilePath(relativePath);

  const newName = normalizeText(requestedName);
  if (!newName || newName === '.' || newName === '..' || newName.includes('/') || newName.includes('\\') || path.basename(newName) !== newName) {
    throw new Error('文件名无效');
  }

  const parentPath = normalizeRelativeProjectPath(path.posix.dirname(relativePath));
  const nextRelativePath = parentPath && parentPath !== '.'
    ? normalizeRelativeProjectPath(path.posix.join(parentPath, newName))
    : newName;
  assertMutableProjectFilePath(nextRelativePath);

  const { rootPath, targetPath } = resolveProjectChildPath(project.workspacePath, relativePath);
  const { targetPath: nextPath } = resolveProjectChildPath(project.workspacePath, nextRelativePath);
  if (!fs.existsSync(targetPath)) {
    throw new Error('文件不存在');
  }
  const stats = fs.statSync(targetPath);
  if (!stats.isFile()) {
    throw new Error('只能重命名文件，不能重命名文件夹');
  }
  if (fs.existsSync(nextPath)) {
    throw new Error('目标文件名已存在');
  }

  fs.renameSync(targetPath, nextPath);
  const nextStats = fs.statSync(nextPath);
  return fileNodeFromStat(newName, normalizeRelativeProjectPath(path.relative(rootPath, nextPath)), nextStats);
}

export async function deleteProjectFile(
  userId: string,
  projectId: string,
  requestedPath: unknown
): Promise<boolean | null> {
  const project = await getProject(userId, projectId);
  if (!project) return null;

  const relativePath = normalizeRequestedRelativePath(requestedPath);
  assertMutableProjectFilePath(relativePath);

  const { targetPath } = resolveProjectChildPath(project.workspacePath, relativePath);
  if (!fs.existsSync(targetPath)) {
    throw new Error('文件不存在');
  }
  const stats = fs.statSync(targetPath);
  if (!stats.isFile()) {
    throw new Error('只能删除文件，不能删除文件夹');
  }

  fs.unlinkSync(targetPath);
  return true;
}

function normalizeRelativeProjectPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}
