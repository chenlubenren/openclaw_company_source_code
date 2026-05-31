import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getRawDb } from '../db/index.js';
import {
  getAgentWorkspacePath,
  getAgentBaselinePath,
  generateAgentKey,
  cloneDirectory,
} from './workspace.service.js';
import {
  resolveAgentType,
  type AgentPlatformType,
} from './agent-type.service.js';

export interface AgentManifest {
  schemaVersion?: string;
  name: string;
  version?: string;
  description?: string;
  entrypoint?: {
    type: string;
    agentId?: string;
  };
  capabilities?: string[];
}

export interface UploadResult {
  success: boolean;
  agentId?: string;
  agentKey?: string;
  workspacePath?: string;
  manifest?: AgentManifest;
  agentType?: AgentPlatformType;
  fileCount?: number;
  error?: string;
}

export interface FolderFileInput {
  path: string;
  content: string; // base64
}

const MAX_FILES = 1000;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200MB
const MANIFEST_NAMES = ['agent.manifest.json', 'manifest.json'];

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function isPathSafe(basePath: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
}

function sanitizeRelativePath(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');

  if (!normalized || normalized.includes('..')) {
    return null;
  }

  const segments = normalized.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    return null;
  }

  // Block Windows drive paths like C:
  if (/^[a-zA-Z]:/.test(normalized)) {
    return null;
  }

  return normalized;
}

function stripCommonRootPrefix(paths: string[]): string {
  if (paths.length === 0) return '';

  const splitPaths = paths.map((p) => p.split('/'));
  const first = splitPaths[0];
  if (first.length <= 1) return '';

  const root = first[0];
  const allShareRoot = splitPaths.every((parts) => parts.length > 1 && parts[0] === root);
  return allShareRoot ? `${root}/` : '';
}

function createDefaultManifest(agentName: string): AgentManifest {
  return {
    schemaVersion: '1.0',
    name: agentName,
    version: '1.0.0',
    description: `用户上传的 Agent: ${agentName}`,
    entrypoint: { type: 'folder' },
    capabilities: ['chat'],
  };
}

function findManifestFile(dir: string): string | null {
  for (const name of MANIFEST_NAMES) {
    const found = findFile(dir, name);
    if (found) return found;
  }
  return null;
}

function findFile(dir: string, filename: string): string | null {
  if (!fs.existsSync(dir)) return null;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(fullPath, filename);
      if (found) return found;
    } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
      return fullPath;
    }
  }
  return null;
}

function readManifestFromDir(dir: string, fallbackName: string): AgentManifest {
  const manifestPath = findManifestFile(dir);
  if (manifestPath) {
    try {
      const content = fs.readFileSync(manifestPath, 'utf-8');
      const parsed = JSON.parse(content) as AgentManifest;
      if (parsed.name) return parsed;
    } catch {
      // fall through to default
    }
  }
  return createDefaultManifest(fallbackName);
}

function applyAgentType(manifest: AgentManifest, agentType: AgentPlatformType): AgentManifest {
  return {
    ...manifest,
    entrypoint: {
      ...manifest.entrypoint,
      type: agentType === 'unknown' ? (manifest.entrypoint?.type || 'folder') : agentType,
    },
  };
}

function buildTags(manifest: AgentManifest, agentType: AgentPlatformType): string {
  const caps = manifest.capabilities || [];
  const platformTag = agentType !== 'unknown' ? `platform:${agentType}` : null;
  const tags = platformTag ? [platformTag, ...caps.filter((t) => !t.startsWith('platform:'))] : caps;
  return JSON.stringify(tags);
}

function insertAgentRecord(
  agentId: string,
  userId: string,
  agentName: string,
  workspacePath: string,
  baselinePath: string,
  manifest: AgentManifest,
  agentType: AgentPlatformType
): string {
  const db = getRawDb();
  const agentKey = generateAgentKey();
  const now = Date.now();
  const finalManifest = applyAgentType(manifest, agentType);

  // Use better-sqlite3 native API (db.insert is Drizzle, not better-sqlite3)
  const stmt = db.prepare(`
    INSERT INTO user_agent_instances (
      id, user_id, source_market_agent_id, source_version, name, description,
      avatar, agent_key, workspace_path, state_dir, baseline_snapshot_path, status,
      manifest, tags, cave_id, provider_id, conversation_count, total_messages,
      last_active_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    agentId,
    userId,
    null,
    finalManifest.version || '1.0.0',
    agentName,
    finalManifest.description || '',
    '',
    agentKey,
    workspacePath,
    path.join(workspacePath, '.openclaw'),
    baselinePath,
    'idle',
    JSON.stringify(finalManifest),
    buildTags(finalManifest, agentType),
    null,
    null,
    0,
    0,
    null,
    now,
    now
  );

  return agentKey;
}

/** 直接上传文件夹（浏览器 webkitdirectory） */
export async function processFolderUpload(
  userId: string,
  files: FolderFileInput[],
  agentName: string,
  userAgentType?: string
): Promise<UploadResult> {
  if (!files.length) {
    return { success: false, error: '文件夹为空，请选择包含文件的目录' };
  }

  if (files.length > MAX_FILES) {
    return { success: false, error: `文件数量过多，最多 ${MAX_FILES} 个文件` };
  }

  const agentId = generateId();
  const workspacePath = getAgentWorkspacePath(userId, agentId);
  const baselinePath = getAgentBaselinePath(userId, agentId);

  try {
    const sanitizedPaths = files.map((f) => ({
      ...f,
      safePath: sanitizeRelativePath(f.path),
    }));

    if (sanitizedPaths.some((f) => !f.safePath)) {
      return { success: false, error: '包含非法文件路径，已拒绝上传' };
    }

    const pathList = sanitizedPaths.map((f) => f.safePath!);
    const rootPrefix = stripCommonRootPrefix(pathList);

    let totalBytes = 0;
    let writtenCount = 0;

    for (const file of sanitizedPaths) {
      const relativePath = file.safePath!.startsWith(rootPrefix)
        ? file.safePath!.slice(rootPrefix.length)
        : file.safePath!;

      const destPath = path.join(workspacePath, relativePath);
      if (!isPathSafe(workspacePath, destPath)) {
        return { success: false, error: '检测到路径穿越，已拒绝上传' };
      }

      const buffer = Buffer.from(file.content, 'base64');
      totalBytes += buffer.length;

      if (totalBytes > MAX_TOTAL_BYTES) {
        deleteDirectorySafe(workspacePath);
        return { success: false, error: `总大小超过 ${MAX_TOTAL_BYTES / 1024 / 1024}MB 限制` };
      }

      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, buffer);
      writtenCount++;
    }

    const manifest = readManifestFromDir(workspacePath, agentName);
    const relativePaths = sanitizedPaths.map((f) => {
      const relativePath = f.safePath!.startsWith(rootPrefix)
        ? f.safePath!.slice(rootPrefix.length)
        : f.safePath!;
      return relativePath;
    });
    const agentType = resolveAgentType(
      userAgentType,
      relativePaths,
      manifest.entrypoint?.type
    );

    if (agentType === 'unknown') {
      deleteDirectorySafe(workspacePath);
      return { success: false, error: '无法识别 Agent 类型，请手动选择平台类型' };
    }

    cloneDirectory(workspacePath, baselinePath);
    const agentKey = insertAgentRecord(
      agentId,
      userId,
      agentName,
      workspacePath,
      baselinePath,
      manifest,
      agentType
    );

    return {
      success: true,
      agentId,
      agentKey,
      workspacePath,
      manifest: applyAgentType(manifest, agentType),
      agentType,
      fileCount: writtenCount,
    };
  } catch (error) {
    deleteDirectorySafe(workspacePath);
    console.error('Folder upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '文件夹上传失败',
    };
  }
}

/** 上传 zip（manifest 可选） */
export async function processZipUpload(
  userId: string,
  zipBuffer: Buffer,
  agentName: string,
  userAgentType?: string
): Promise<UploadResult> {
  const tmpDir = path.join(process.cwd(), 'data', 'tmp', `upload_${Date.now()}`);

  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    const zipPath = path.join(tmpDir, 'upload.zip');
    fs.writeFileSync(zipPath, zipBuffer);

    const extractDir = path.join(tmpDir, 'extracted');
    fs.mkdirSync(extractDir, { recursive: true });
    await extractZip(zipPath, extractDir);

    const agentId = generateId();
    const workspacePath = getAgentWorkspacePath(userId, agentId);
    const baselinePath = getAgentBaselinePath(userId, agentId);

    cloneDirectory(extractDir, workspacePath);

    const manifest = readManifestFromDir(workspacePath, agentName);
    const allPaths = listRelativePaths(workspacePath);
    const agentType = resolveAgentType(
      userAgentType,
      allPaths,
      manifest.entrypoint?.type
    );

    if (agentType === 'unknown') {
      deleteDirectorySafe(workspacePath);
      return { success: false, error: '无法识别 Agent 类型，请手动选择平台类型' };
    }

    cloneDirectory(workspacePath, baselinePath);
    const agentKey = insertAgentRecord(
      agentId,
      userId,
      agentName,
      workspacePath,
      baselinePath,
      manifest,
      agentType
    );

    const fileCount = countFiles(workspacePath);

    return {
      success: true,
      agentId,
      agentKey,
      workspacePath,
      manifest: applyAgentType(manifest, agentType),
      agentType,
      fileCount,
    };
  } catch (error) {
    console.error('Zip upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '压缩包上传失败',
    };
  } finally {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  }
}

function listRelativePaths(dir: string, base: string = dir): string[] {
  const result: string[] = [];
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      result.push(...listRelativePaths(full, base));
    } else {
      result.push(rel);
    }
  }
  return result;
}

function deleteDirectorySafe(dirPath: string): void {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
}

function countFiles(dir: string): number {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countFiles(full);
    else count++;
  }
  return count;
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const AdmZip = await import('adm-zip');
  const adm = new AdmZip.default(zipPath);
  adm.extractAllTo(destDir, true);
}

/**
 * Publish an agent to the market (scrubs sensitive files)
 */
export async function publishToMarket(
  userId: string,
  agentId: string,
  agentName: string,
  manifest?: AgentManifest
): Promise<{ success: boolean; marketAgentId?: string; error?: string }> {
  try {
    const db = getRawDb();
    const { getAgentWorkspacePath } = await import('./workspace.service.js');
    
    // Get agent workspace path
    const workspacePath = getAgentWorkspacePath(userId, agentId);
    
    // Generate market agent ID
    const marketAgentId = crypto.randomUUID().replace(/-/g, '');
    const now = Date.now();
    
    // Sensitive file patterns to remove
    const sensitivePatterns = [
      /\.env$/i, /\.env\.local$/i, /\.env\.production$/i,
      /secrets\.json$/i, /credentials\.json$/i, /config\.secret\.json$/i,
      /\.pem$/i, /\.key$/i, /id_rsa/i, /id_ed25519/i,
    ];
    
    // Remove sensitive files from workspace
    if (fs.existsSync(workspacePath)) {
      const removeSensitiveFiles = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            removeSensitiveFiles(fullPath);
          } else {
            const fileName = entry.name.toLowerCase();
            if (sensitivePatterns.some(pattern => pattern.test(fileName))) {
              try {
                fs.unlinkSync(fullPath);
                console.log(`Removed sensitive file: ${fullPath}`);
              } catch (e) {
                console.error(`Failed to remove sensitive file: ${fullPath}`, e);
              }
            }
          }
        }
      };
      removeSensitiveFiles(workspacePath);
    }
    
    // Insert into market_agents table
    const insertMarketAgent = db.prepare(`
      INSERT INTO market_agents (
        id, name, description, owner_user_id, latest_version,
        visibility, status, tags, icon, cover_image,
        download_count, rating, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const tags = JSON.stringify(manifest?.capabilities || []);
    
    insertMarketAgent.run(
      marketAgentId,
      agentName,
      manifest?.description || '',
      userId,
      manifest?.version || '1.0.0',
      'public',
      'active',
      tags,
      '',
      '',
      0,
      0,
      now,
      now
    );
    
    return { success: true, marketAgentId };
  } catch (error) {
    console.error('Failed to publish to market:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '发布到市场失败'
    };
  }
}

// 兼容旧调用
export const processUpload = processZipUpload;
