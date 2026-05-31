import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import 'dotenv/config';

// Default workspace root (can be overridden by env)
const DEFAULT_WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.join(process.cwd(), 'data', 'workspaces');
const MARKET_ROOT = path.join(DEFAULT_WORKSPACE_ROOT, 'market');
const USERS_ROOT = path.join(DEFAULT_WORKSPACE_ROOT, 'users');
const RUNTIME_ROOT = path.join(DEFAULT_WORKSPACE_ROOT, 'runtime');

// Ensure directories exist
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function initWorkspaceRoot(): void {
  ensureDir(DEFAULT_WORKSPACE_ROOT);
  ensureDir(MARKET_ROOT);
  ensureDir(USERS_ROOT);
  ensureDir(path.join(MARKET_ROOT, 'agents'));
  ensureDir(path.join(MARKET_ROOT, 'uploads'));
  ensureDir(RUNTIME_ROOT);
  console.log(`Workspace root initialized at: ${DEFAULT_WORKSPACE_ROOT}`);
}

// ==================== Path Utilities ====================

export function getUserWorkspaceRoot(userId: string): string {
  const userRoot = path.join(USERS_ROOT, userId);
  ensureDir(userRoot);
  return userRoot;
}

export function getUserAgentsRoot(userId: string): string {
  const agentsRoot = path.join(getUserWorkspaceRoot(userId), 'agents');
  ensureDir(agentsRoot);
  return agentsRoot;
}

export function getAgentWorkspacePath(userId: string, agentInstanceId: string): string {
  const agentRoot = path.join(getUserAgentsRoot(userId), agentInstanceId);
  ensureDir(agentRoot);
  const workspaceDir = path.join(agentRoot, 'workspace');
  ensureDir(workspaceDir);
  return workspaceDir;
}

export function getAgentBaselinePath(userId: string, agentInstanceId: string): string {
  const agentRoot = path.join(getUserAgentsRoot(userId), agentInstanceId);
  ensureDir(agentRoot);
  const baselineDir = path.join(agentRoot, 'baseline');
  ensureDir(baselineDir);
  return baselineDir;
}

export function getAgentSnapshotsPath(userId: string, agentInstanceId: string): string {
  const agentRoot = path.join(getUserAgentsRoot(userId), agentInstanceId);
  ensureDir(agentRoot);
  const snapshotsDir = path.join(agentRoot, 'snapshots');
  ensureDir(snapshotsDir);
  return snapshotsDir;
}

export function getAgentConversationsPath(userId: string, agentInstanceId: string): string {
  const agentRoot = path.join(getUserAgentsRoot(userId), agentInstanceId);
  ensureDir(agentRoot);
  const convDir = path.join(agentRoot, 'conversations');
  ensureDir(convDir);
  return convDir;
}

export function getMarketAgentPath(marketAgentId: string, version: string): string {
  const agentRoot = path.join(MARKET_ROOT, 'agents', marketAgentId);
  ensureDir(agentRoot);
  const versionRoot = path.join(agentRoot, 'versions', version, 'source');
  ensureDir(versionRoot);
  return versionRoot;
}

export function getTeamRuntimePath(userId: string, teamId: string, runId: string): string {
  const teamRoot = path.join(getUserWorkspaceRoot(userId), 'teams', teamId, 'runs', runId);
  ensureDir(teamRoot);
  const membersDir = path.join(teamRoot, 'members');
  ensureDir(membersDir);
  const artifactsDir = path.join(teamRoot, 'artifacts');
  ensureDir(artifactsDir);
  const logsDir = path.join(teamRoot, 'logs');
  ensureDir(logsDir);
  return teamRoot;
}

// ==================== File Operations ====================

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: Date;
}

export function listDirectory(dirPath: string): FileInfo[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.map(entry => {
    const fullPath = path.join(dirPath, entry.name);
    const stats = fs.statSync(fullPath);
    return {
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory(),
      size: stats.size,
      modifiedAt: stats.mtime,
    };
  });
}

export function readFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function writeFile(filePath: string, content: string): boolean {
  try {
    const dir = path.dirname(filePath);
    ensureDir(dir);
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export function deleteFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch {
    return false;
  }
}

export function deleteDirectory(dirPath: string): boolean {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
    return true;
  } catch {
    return false;
  }
}

// ==================== Clone Operations ====================

export function cloneDirectory(source: string, destination: string): boolean {
  try {
    ensureDir(destination);
    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        cloneDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function createSnapshot(sourceDir: string, snapshotName: string): string | null {
  try {
    // Create snapshot as a copy with timestamp
    const snapshotDir = path.join(path.dirname(sourceDir), 'snapshots', snapshotName);
    const success = cloneDirectory(sourceDir, snapshotDir);
    return success ? snapshotDir : null;
  } catch {
    return null;
  }
}

// ==================== Checksum ====================

export function calculateChecksum(filePath: string): string | null {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch {
    return null;
  }
}

export function calculateDirChecksum(dirPath: string): string | null {
  try {
    const files = getAllFiles(dirPath);
    const hashSum = crypto.createHash('sha256');

    for (const file of files.sort()) {
      const relativePath = path.relative(dirPath, file);
      const content = fs.readFileSync(file);
      hashSum.update(`${relativePath}:${content.length}:`);
    }

    return hashSum.digest('hex');
  } catch {
    return null;
  }
}

function getAllFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

// ==================== Workspace Size ====================

export function getDirectorySize(dirPath: string): number {
  try {
    const files = getAllFiles(dirPath);
    return files.reduce((total, file) => {
      const stats = fs.statSync(file);
      return total + stats.size;
    }, 0);
  } catch {
    return 0;
  }
}

// ==================== Agent Key Generation ====================

export function generateAgentKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `ak_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// Initialize on module load
initWorkspaceRoot();
