import { eq, and, desc, like, sql } from 'drizzle-orm';
import { getDb, getRawDb } from '../db/index.js';
import {
  marketAgents,
  marketAgentVersions,
  userAgentInstances,
  users,
} from '../db/schema.js';
import {
  deleteDirectory,
  getMarketAgentPath,
  getAgentWorkspacePath,
  getAgentBaselinePath,
  cloneDirectory,
  generateAgentKey,
  calculateDirChecksum,
  getDirectorySize,
  resolveStoredPath,
} from './workspace.service.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import {
  formatPublishSanitizationMessage,
  sanitizePublishFileForMarket,
  shouldSkipPublishPath,
  type PublishRisk,
} from './publish-safety.service.js';

const PROFILE_CACHE_ROOT = path.join(process.cwd(), 'data', 'claw_profile');
const SOURCE_INSTANCE_TAG_PREFIX = 'sourceInstance:';
export const OFFICIAL_AGENT_MARKET_ID = 'official-agent';
export const OFFICIAL_AGENT_NAME = '官方agent';
export const OFFICIAL_AGENT_VERSION = '1.0.0';
export const OFFICIAL_AGENT_AVATAR = '/claw_profile/03.png';
export const OFFICIAL_AGENT_DESCRIPTION = '从官方 OpenClaw workspace 领养得到的固定官方 Agent。';
const OFFICIAL_AGENT_DEFAULT_SOURCE_WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const LEGACY_OFFICIAL_LOBSTER_NAME = '官方龙虾';
const OFFICIAL_AGENT_SYSTEM_USER_ID = 'official-system';
const OFFICIAL_AGENT_SYSTEM_EMAIL = 'official@openclaw.local';
const OFFICIAL_AGENT_SYSTEM_USERNAME = 'OpenClaw Official';
const OFFICIAL_AGENT_TAGS = [
  'official-agent',
  'official-lobster',
  'quick-adopt',
  'openclaw-workspace',
];
const OFFICIAL_AGENT_SKIP_DIR_NAMES = new Set([
  '.claude',
  '.clawhub',
  '.codex',
  '.learnings',
  'memory',
  'temp',
]);
const OFFICIAL_AGENT_SKIP_FILE_NAMES = new Set([
  'memory.md',
  'user.md',
  'swarm-orchestrator-last-status.json',
]);
let officialAgentMarketEnsured = false;

function ensureProfileDir(): void {
  if (!fs.existsSync(PROFILE_CACHE_ROOT)) {
    fs.mkdirSync(PROFILE_CACHE_ROOT, { recursive: true });
  }
}

// ==================== Market Agent Management ====================

export interface MarketAgentWithStats {
  id: string;
  name: string;
  description: string;
  ownerUserId: string;
  ownerUsername?: string | null;
  latestVersion: string;
  visibility: string;
  status: string;
  tags: string[];
  icon: string;
  coverImage: string;
  downloadCount: number;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
  hasWorkspace: boolean;
  workspaceSize: number;
  cachedAvatarUrl?: string;
  cachedCoverUrl?: string;
}

function parseMarketTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) {
    return rawTags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
  }
  if (typeof rawTags !== 'string' || rawTags.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function uniqueTags(tags: unknown[]): string[] {
  return Array.from(
    new Set(
      tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

function getSourceInstanceTag(agentInstanceId: string): string {
  return `${SOURCE_INSTANCE_TAG_PREFIX}${agentInstanceId}`;
}

export function resolveOfficialAgentSourceWorkspace(): string {
  const configuredPath = process.env.OFFICIAL_AGENT_WORKSPACE?.trim() || process.env.OFFICIAL_LOBSTER_WORKSPACE?.trim();
  return resolveStoredPath(configuredPath || OFFICIAL_AGENT_DEFAULT_SOURCE_WORKSPACE);
}

function shouldSkipOfficialAgentWorkspacePath(relativePath: string, isDirectory = false): boolean {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) return false;

  if (shouldSkipPublishPath(normalized, isDirectory)) {
    return true;
  }

  const segments = normalized.split('/').filter(Boolean).map((segment) => segment.toLowerCase());
  if (segments.some((segment) => OFFICIAL_AGENT_SKIP_DIR_NAMES.has(segment))) {
    return true;
  }

  if (!isDirectory) {
    const basename = path.posix.basename(normalized).toLowerCase();
    if (OFFICIAL_AGENT_SKIP_FILE_NAMES.has(basename)) {
      return true;
    }
    if (basename.startsWith('tmp_') || basename.startsWith('resume_')) {
      return true;
    }
  }

  return false;
}

function copyOfficialAgentWorkspace(
  source: string,
  destination: string,
  root: string = source,
  sanitizedRisks: PublishRisk[] = []
): boolean {
  try {
    if (!fs.existsSync(source)) return false;
    fs.mkdirSync(destination, { recursive: true });

    const entries = fs.readdirSync(source, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const relativePath = path.relative(root, srcPath).replace(/\\/g, '/');

      if (entry.isSymbolicLink() || shouldSkipOfficialAgentWorkspacePath(relativePath, entry.isDirectory())) {
        continue;
      }

      const destPath = path.join(destination, entry.name);
      if (entry.isDirectory()) {
        if (!copyOfficialAgentWorkspace(srcPath, destPath, root, sanitizedRisks)) {
          return false;
        }
        continue;
      }

      if (entry.isFile()) {
        const buffer = fs.readFileSync(srcPath);
        const sanitized = sanitizePublishFileForMarket(relativePath, buffer);
        sanitizedRisks.push(...sanitized.risks);
        if (sanitized.action === 'omit' || !sanitized.buffer) {
          continue;
        }

        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, sanitized.buffer);
      }
    }

    return true;
  } catch (error) {
    console.warn('Failed to copy official agent workspace entry:', error);
    return false;
  }
}

function writeOfficialAgentManifest(marketPath: string): string {
  const manifest = {
    schemaVersion: '1.0',
    name: OFFICIAL_AGENT_NAME,
    version: OFFICIAL_AGENT_VERSION,
    description: OFFICIAL_AGENT_DESCRIPTION,
    entrypoint: { type: 'openclaw' },
    metadata: {
      source: 'official-agent',
      sourceWorkspace: 'fixed-official-workspace',
    },
  };
  const manifestJson = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(path.join(marketPath, 'agent.manifest.json'), manifestJson, 'utf-8');
  return manifestJson;
}

function ensureOfficialAgentOwner(now: number): void {
  const rawDb = getRawDb();
  const existing = rawDb.prepare('SELECT id FROM users WHERE id = ?').get(OFFICIAL_AGENT_SYSTEM_USER_ID);
  if (existing) return;

  rawDb.prepare(`
    INSERT INTO users (id, email, username, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    OFFICIAL_AGENT_SYSTEM_USER_ID,
    OFFICIAL_AGENT_SYSTEM_EMAIL,
    OFFICIAL_AGENT_SYSTEM_USERNAME,
    'official-agent-system-user',
    now,
    now
  );
}

function hideLegacyOfficialLobsterMarketRows(now: number): void {
  getRawDb().prepare(`
    UPDATE market_agents
    SET status = 'disabled', visibility = 'unlisted', updated_at = ?
    WHERE id <> ?
      AND name = ?
      AND (icon LIKE ? OR tags LIKE ?)
  `).run(
    now,
    OFFICIAL_AGENT_MARKET_ID,
    LEGACY_OFFICIAL_LOBSTER_NAME,
    '%03.png%',
    '%official-lobster%'
  );
}

export async function ensureOfficialAgentMarketEntry(
  options: { forceSyncWorkspace?: boolean } = {}
): Promise<{ success: boolean; marketAgentId?: string; sourceWorkspace?: string; workspacePath?: string; error?: string }> {
  try {
    const sourceWorkspace = resolveOfficialAgentSourceWorkspace();
    if (!fs.existsSync(sourceWorkspace) || !fs.statSync(sourceWorkspace).isDirectory()) {
      return { success: false, error: `Official workspace not found: ${sourceWorkspace}`, sourceWorkspace };
    }

    const rawDb = getRawDb();
    const now = Date.now();
    const marketPath = getMarketAgentPath(OFFICIAL_AGENT_MARKET_ID, OFFICIAL_AGENT_VERSION);
    const existing = rawDb.prepare('SELECT id FROM market_agents WHERE id = ?').get(OFFICIAL_AGENT_MARKET_ID);
    const shouldSyncWorkspace = options.forceSyncWorkspace || !existing || !fs.existsSync(path.join(marketPath, 'agent.manifest.json'));

    if (shouldSyncWorkspace) {
      deleteDirectory(marketPath);
      const sanitizedRisks: PublishRisk[] = [];
      if (!copyOfficialAgentWorkspace(sourceWorkspace, marketPath, sourceWorkspace, sanitizedRisks)) {
        deleteDirectory(marketPath);
        return { success: false, error: 'Failed to copy official workspace into market template', sourceWorkspace };
      }
      writeOfficialAgentManifest(marketPath);
      if (sanitizedRisks.length > 0) {
        console.info(formatPublishSanitizationMessage(sanitizedRisks));
      }
    } else {
      writeOfficialAgentManifest(marketPath);
    }

    ensureOfficialAgentOwner(now);

    const checksum = calculateDirChecksum(marketPath) || '';
    const fileSize = getDirectorySize(marketPath);
    const tags = JSON.stringify(OFFICIAL_AGENT_TAGS);

    rawDb.prepare(`
      INSERT INTO market_agents (
        id, name, description, owner_user_id, latest_version,
        visibility, status, tags, icon, cover_image,
        download_count, rating, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        owner_user_id = excluded.owner_user_id,
        latest_version = excluded.latest_version,
        visibility = excluded.visibility,
        status = excluded.status,
        tags = excluded.tags,
        icon = excluded.icon,
        cover_image = excluded.cover_image,
        updated_at = excluded.updated_at
    `).run(
      OFFICIAL_AGENT_MARKET_ID,
      OFFICIAL_AGENT_NAME,
      OFFICIAL_AGENT_DESCRIPTION,
      OFFICIAL_AGENT_SYSTEM_USER_ID,
      OFFICIAL_AGENT_VERSION,
      'public',
      'active',
      tags,
      OFFICIAL_AGENT_AVATAR,
      '',
      0,
      0,
      now,
      now
    );

    rawDb.prepare('DELETE FROM market_agent_versions WHERE market_agent_id = ? AND version = ?')
      .run(OFFICIAL_AGENT_MARKET_ID, OFFICIAL_AGENT_VERSION);
    rawDb.prepare(`
      INSERT INTO market_agent_versions (
        id, market_agent_id, version, manifest_path, source_workspace_path,
        checksum, changelog, file_size, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID().replace(/-/g, ''),
      OFFICIAL_AGENT_MARKET_ID,
      OFFICIAL_AGENT_VERSION,
      path.join(marketPath, 'agent.manifest.json'),
      marketPath,
      checksum,
      'Synced official OpenClaw workspace',
      fileSize,
      now
    );

    hideLegacyOfficialLobsterMarketRows(now);
    officialAgentMarketEnsured = true;
    return {
      success: true,
      marketAgentId: OFFICIAL_AGENT_MARKET_ID,
      sourceWorkspace,
      workspacePath: marketPath,
    };
  } catch (error) {
    console.error('Failed to ensure official agent market entry:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync official agent market entry',
    };
  }
}

export async function adoptOfficialAgentToUser(
  userId: string,
  requestedName: string
): Promise<{ success: boolean; agentId?: string; error?: string }> {
  const displayName = requestedName.trim();
  if (!displayName) {
    return { success: false, error: '请先给官方 Agent 起一个名字' };
  }

  const ensured = await ensureOfficialAgentMarketEntry({ forceSyncWorkspace: true });
  if (!ensured.success) {
    return { success: false, error: ensured.error || '官方 Agent 模板不可用' };
  }

  const db = getRawDb();
  const now = Date.now();
  const agentId = crypto.randomUUID().replace(/-/g, '');
  const workspacePath = getAgentWorkspacePath(userId, agentId);
  const baselinePath = getAgentBaselinePath(userId, agentId);
  const agentRoot = path.dirname(workspacePath);
  const marketPath = getMarketAgentPath(OFFICIAL_AGENT_MARKET_ID, OFFICIAL_AGENT_VERSION);

  try {
    if (!cloneDirectory(marketPath, workspacePath)) {
      deleteDirectory(agentRoot);
      return { success: false, error: '复制官方 Agent workspace 失败' };
    }

    let manifest: Record<string, unknown> = {};
    const manifestPath = path.join(workspacePath, 'agent.manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          manifest = parsed as Record<string, unknown>;
        }
      } catch {
        manifest = {};
      }
    }

    manifest = {
      schemaVersion: '1.0',
      ...manifest,
      name: displayName,
      version: String(manifest.version || OFFICIAL_AGENT_VERSION),
      description: OFFICIAL_AGENT_DESCRIPTION,
      entrypoint: {
        type: 'openclaw',
        ...((manifest.entrypoint && typeof manifest.entrypoint === 'object') ? manifest.entrypoint as Record<string, unknown> : {}),
      },
      metadata: {
        ...((manifest.metadata && typeof manifest.metadata === 'object') ? manifest.metadata as Record<string, unknown> : {}),
        source: 'official-agent',
        sourceMarketAgentId: OFFICIAL_AGENT_MARKET_ID,
        sourceWorkspace: 'fixed-official-workspace',
      },
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    fs.writeFileSync(
      path.join(workspacePath, 'agent.config.json'),
      JSON.stringify(
        {
          agentId,
          name: displayName,
          description: OFFICIAL_AGENT_DESCRIPTION,
          avatar: OFFICIAL_AGENT_AVATAR,
          platform: 'openclaw',
          providerId: null,
          updatedAt: new Date(now).toISOString(),
        },
        null,
        2
      ),
      'utf-8'
    );

    cloneDirectory(workspacePath, baselinePath);

    db.prepare(`
      INSERT INTO user_agent_instances (
        id, user_id, source_market_agent_id, source_version, name, description,
        avatar, agent_key, workspace_path, state_dir, baseline_snapshot_path, status,
        manifest, tags, cave_id, provider_id, conversation_count, total_messages,
        last_active_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      agentId,
      userId,
      OFFICIAL_AGENT_MARKET_ID,
      OFFICIAL_AGENT_VERSION,
      displayName,
      OFFICIAL_AGENT_DESCRIPTION,
      OFFICIAL_AGENT_AVATAR,
      generateAgentKey(),
      workspacePath,
      path.join(workspacePath, '.openclaw'),
      baselinePath,
      'idle',
      JSON.stringify(manifest),
      JSON.stringify(OFFICIAL_AGENT_TAGS),
      null,
      null,
      0,
      0,
      null,
      now,
      now
    );

    await incrementDownloadCount(OFFICIAL_AGENT_MARKET_ID);
    return { success: true, agentId };
  } catch (error) {
    deleteDirectory(agentRoot);
    console.error('Failed to adopt official agent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '官方 Agent 领养失败',
    };
  }
}

function copyPublishableWorkspace(
  source: string,
  destination: string,
  root: string = source,
  sanitizedRisks: PublishRisk[] = []
): boolean {
  try {
    if (!fs.existsSync(source)) return false;
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    const entries = fs.readdirSync(source, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const relativePath = path.relative(root, srcPath).replace(/\\/g, '/');

      if (shouldSkipPublishPath(relativePath, entry.isDirectory()) || entry.isSymbolicLink()) {
        continue;
      }

      const destPath = path.join(destination, entry.name);
      if (entry.isDirectory()) {
        if (!copyPublishableWorkspace(srcPath, destPath, root, sanitizedRisks)) {
          return false;
        }
      } else if (entry.isFile()) {
        const buffer = fs.readFileSync(srcPath);
        const sanitized = sanitizePublishFileForMarket(relativePath, buffer);
        sanitizedRisks.push(...sanitized.risks);
        if (sanitized.action === 'omit' || !sanitized.buffer) {
          continue;
        }

        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, sanitized.buffer);
      }
    }

    return true;
  } catch (error) {
    console.warn('Failed to copy publishable workspace entry:', error);
    return false;
  }
}

function stripInternalMarketTags(tags: unknown): string[] {
  return parseMarketTags(tags).filter((tag) => !tag.startsWith(SOURCE_INSTANCE_TAG_PREFIX));
}

export async function getPublishedMarketAgentForInstance(
  userId: string,
  agentInstanceId: string
): Promise<{ id: string; status: string } | null> {
  const rawDb = getRawDb();
  const sourceTag = getSourceInstanceTag(agentInstanceId);
  const rows = rawDb.prepare(`
    SELECT id, status, tags, name, description
    FROM market_agents
    WHERE owner_user_id = ? AND status = 'active'
    ORDER BY updated_at DESC
  `).all(userId) as Array<{ id: string; status: string; tags: string; name: string; description: string }>;

  const match = rows.find((row) => parseMarketTags(row.tags).includes(sourceTag));
  if (match) return { id: match.id, status: match.status };

  const sourceAgent = rawDb.prepare(`
    SELECT name, description
    FROM user_agent_instances
    WHERE id = ? AND user_id = ?
  `).get(agentInstanceId, userId) as { name: string; description: string } | undefined;

  const legacyMatch = sourceAgent
    ? rows.find((row) => row.name === sourceAgent.name && row.description === sourceAgent.description)
    : undefined;

  if (legacyMatch) {
    const tags = uniqueTags([...parseMarketTags(legacyMatch.tags), sourceTag]);
    rawDb.prepare('UPDATE market_agents SET tags = ? WHERE id = ?').run(JSON.stringify(tags), legacyMatch.id);
    return { id: legacyMatch.id, status: legacyMatch.status };
  }

  return null;
}

export async function getMarketAgents(
  options: {
    status?: string;
    visibility?: string;
    search?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  } = {}
): Promise<MarketAgentWithStats[]> {
  const db = getDb();
  const { status = 'active', visibility = 'public', search, limit = 50, offset = 0 } = options;

  if (!officialAgentMarketEnsured && status === 'active' && visibility === 'public') {
    const ensured = await ensureOfficialAgentMarketEntry();
    if (!ensured.success) {
      console.warn(ensured.error || 'Official agent market entry is not available');
    }
  }

  const query = db
    .select({
      id: marketAgents.id,
      name: marketAgents.name,
      description: marketAgents.description,
      ownerUserId: marketAgents.ownerUserId,
      latestVersion: marketAgents.latestVersion,
      visibility: marketAgents.visibility,
      status: marketAgents.status,
      tags: marketAgents.tags,
      icon: marketAgents.icon,
      coverImage: marketAgents.coverImage,
      downloadCount: marketAgents.downloadCount,
      rating: marketAgents.rating,
      createdAt: marketAgents.createdAt,
      updatedAt: marketAgents.updatedAt,
      ownerUsername: users.username,
    })
    .from(marketAgents)
    .leftJoin(users, eq(marketAgents.ownerUserId, users.id))
    .where(
      and(
        status ? eq(marketAgents.status, status) : undefined,
        visibility ? eq(marketAgents.visibility, visibility) : undefined,
        search ? like(marketAgents.name, `%${search}%`) : undefined
      )
    )
    .orderBy(desc(marketAgents.downloadCount), desc(marketAgents.rating))
    .limit(limit)
    .offset(offset);

  const results = await query;

  // Check workspace validity and cache avatars for each agent
  const agentsWithStats: MarketAgentWithStats[] = [];
  for (const agent of results) {
    const workspacePath = getMarketAgentPath(agent.id, agent.latestVersion);
    const hasWorkspace = fs.existsSync(workspacePath) && fs.readdirSync(workspacePath).length > 0;
    const workspaceSize = hasWorkspace ? getDirectorySize(workspacePath) : 0;

    // Cache avatar
    const cachedAvatar = await getOrCacheAvatar(agent.id, agent.icon);

    // Cache cover image
    const cachedCover = agent.coverImage ? await getOrCacheAvatar(`${agent.id}_cover`, agent.coverImage) : null;

    agentsWithStats.push({
      ...agent,
      tags: stripInternalMarketTags(agent.tags),
      hasWorkspace,
      workspaceSize,
      cachedAvatarUrl: cachedAvatar.url,
      cachedCoverUrl: cachedCover?.url,
    });
  }

  return agentsWithStats.sort((a, b) => {
    if (a.id === OFFICIAL_AGENT_MARKET_ID) return -1;
    if (b.id === OFFICIAL_AGENT_MARKET_ID) return 1;
    return 0;
  });
}

export async function getMarketAgentById(marketAgentId: string): Promise<MarketAgentWithStats | null> {
  const db = getDb();
  const result = await db
    .select({
      id: marketAgents.id,
      name: marketAgents.name,
      description: marketAgents.description,
      ownerUserId: marketAgents.ownerUserId,
      latestVersion: marketAgents.latestVersion,
      visibility: marketAgents.visibility,
      status: marketAgents.status,
      tags: marketAgents.tags,
      icon: marketAgents.icon,
      coverImage: marketAgents.coverImage,
      downloadCount: marketAgents.downloadCount,
      rating: marketAgents.rating,
      createdAt: marketAgents.createdAt,
      updatedAt: marketAgents.updatedAt,
      ownerUsername: users.username,
    })
    .from(marketAgents)
    .leftJoin(users, eq(marketAgents.ownerUserId, users.id))
    .where(eq(marketAgents.id, marketAgentId))
    .get();

  if (!result) return null;

  const workspacePath = getMarketAgentPath(result.id, result.latestVersion);
  const hasWorkspace = fs.existsSync(workspacePath) && fs.readdirSync(workspacePath).length > 0;
  const workspaceSize = hasWorkspace ? getDirectorySize(workspacePath) : 0;

  // Cache avatar
  const cachedAvatar = await getOrCacheAvatar(result.id, result.icon);
  const cachedCover = result.coverImage ? await getOrCacheAvatar(`${result.id}_cover`, result.coverImage) : null;

  return {
    ...result,
    tags: stripInternalMarketTags(result.tags),
    hasWorkspace,
    workspaceSize,
    cachedAvatarUrl: cachedAvatar.url,
    cachedCoverUrl: cachedCover?.url,
  };
}

export async function getMarketAgentVersions(marketAgentId: string) {
  const db = getDb();
  return db
    .select()
    .from(marketAgentVersions)
    .where(eq(marketAgentVersions.marketAgentId, marketAgentId))
    .orderBy(desc(marketAgentVersions.createdAt))
    .all();
}

export async function cleanInvalidMarketAgents(): Promise<{
  deleted: number;
  errors: string[];
}> {
  const db = getDb();
  const errors: string[] = [];
  let deleted = 0;

  // Get all market agents
  const allAgents = await db.select().from(marketAgents).all();

  for (const agent of allAgents) {
    try {
      const workspacePath = getMarketAgentPath(agent.id, agent.latestVersion);
      const hasValidWorkspace = fs.existsSync(workspacePath) && 
        fs.readdirSync(workspacePath).length > 0;

      if (!hasValidWorkspace) {
        console.log(`Cleaning invalid market agent: ${agent.name} (${agent.id})`);
        
        // Delete from database
        await db.delete(marketAgentVersions)
          .where(eq(marketAgentVersions.marketAgentId, agent.id))
          .run();
        
        await db.delete(marketAgents)
          .where(eq(marketAgents.id, agent.id))
          .run();

        // Clean up workspace directory
        const agentRoot = path.join(process.cwd(), 'data', 'workspaces', 'market', 'agents', agent.id);
        if (fs.existsSync(agentRoot)) {
          fs.rmSync(agentRoot, { recursive: true, force: true });
        }

        deleted++;
      }
    } catch (error) {
      const msg = `Failed to clean agent ${agent.name}: ${error instanceof Error ? error.message : error}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  return { deleted, errors };
}

// ==================== Avatar Caching ====================

export interface CachedAvatar {
  agentId: string;
  localPath: string;
  url: string;
  cached: boolean;
}

export async function getOrCacheAvatar(
  agentId: string,
  avatarUrl: string
): Promise<CachedAvatar> {
  ensureProfileDir();

  const cacheFileName = `${agentId}.png`;
  const localPath = path.join(PROFILE_CACHE_ROOT, cacheFileName);
  const url = `/profile/${cacheFileName}`;

  // Check if already cached
  if (fs.existsSync(localPath)) {
    return {
      agentId,
      localPath,
      url: `/api/profile/${cacheFileName}`,
      cached: true,
    };
  }

  if (avatarUrl.startsWith('/') && !avatarUrl.startsWith('/api/')) {
    return {
      agentId,
      localPath: '',
      url: avatarUrl,
      cached: true,
    };
  }

  // Download and cache if not exists
  if (avatarUrl) {
    try {
      await downloadAndCacheImage(avatarUrl, localPath);
      return {
        agentId,
        localPath,
        url: `/api/profile/${cacheFileName}`,
        cached: true,
      };
    } catch (error) {
      console.error(`Failed to cache avatar for ${agentId}:`, error);
    }
  }

  // Return placeholder
  return {
    agentId,
    localPath: '',
    url: '/assets/default-avatar.png',
    cached: false,
  };
}

// Cache all market agent icons
export async function cacheAllMarketAgentIcons(): Promise<{
  cached: number;
  failed: number;
  errors: string[];
}> {
  const db = getDb();
  const errors: string[] = [];
  let cached = 0;
  let failed = 0;

  const agents = await db.select().from(marketAgents).all();

  for (const agent of agents) {
    if (agent.icon) {
      try {
        const result = await getOrCacheAvatar(agent.id, agent.icon);
        if (result.cached) {
          cached++;
        } else {
          failed++;
        }
      } catch (error) {
        const msg = `Failed to cache icon for ${agent.name}: ${error instanceof Error ? error.message : error}`;
        console.error(msg);
        errors.push(msg);
        failed++;
      }
    }
  }

  return { cached, failed, errors };
}

// Get cached avatar URL for market agent (returns cached URL or original)
export async function getMarketAgentCachedIcon(
  marketAgentId: string,
  originalIcon: string
): Promise<{ url: string; cached: boolean }> {
  if (!originalIcon) {
    return { url: '/api/profile/default/market', cached: false };
  }

  const result = await getOrCacheAvatar(marketAgentId, originalIcon);
  return { url: result.url, cached: result.cached };
}

function copyImageIfExists(sourcePath: string, destPath: string): boolean {
  if (!fs.existsSync(sourcePath)) return false;
  if (path.resolve(sourcePath) !== path.resolve(destPath)) {
    fs.copyFileSync(sourcePath, destPath);
  }
  return true;
}

function resolveLocalApiImage(url: string): string | null {
  const agentAvatarMatch = url.match(/^\/api\/agents\/([^/]+)\/avatar\/([^/?#]+)$/);
  if (agentAvatarMatch) {
    const [, agentId, rawFilename] = agentAvatarMatch;
    const filename = path.basename(decodeURIComponent(rawFilename));
    const row = getRawDb()
      .prepare('SELECT workspace_path AS workspacePath FROM user_agent_instances WHERE id = ?')
      .get(agentId) as { workspacePath?: string } | undefined;

    if (!row?.workspacePath) return null;
    return path.join(path.dirname(resolveStoredPath(row.workspacePath)), 'avatars', filename);
  }

  const profileMatch = url.match(/^\/api\/profile\/([^/?#]+)$/);
  if (profileMatch) {
    const filename = path.basename(decodeURIComponent(profileMatch[1]));
    return path.join(PROFILE_CACHE_ROOT, filename);
  }

  return null;
}

async function downloadAndCacheImage(url: string, destPath: string): Promise<void> {
  // Handle data URLs (base64)
  if (url.startsWith('data:image')) {
    const base64Data = url.split(',')[1];
    if (base64Data) {
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(destPath, buffer);
      return;
    }
  }

  if (url.startsWith('/api/')) {
    const sourcePath = resolveLocalApiImage(url);
    if (sourcePath && copyImageIfExists(sourcePath, destPath)) {
      return;
    }
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      if (parsed.pathname.startsWith('/api/')) {
        const sourcePath = resolveLocalApiImage(decodeURI(parsed.pathname));
        if (sourcePath && copyImageIfExists(sourcePath, destPath)) {
          return;
        }
      }
    } catch {
      // Fall through to network fetch below.
    }
  }

  // Handle file URLs
  if (url.startsWith('file://')) {
    const sourcePath = url.replace('file://', '');
    if (copyImageIfExists(sourcePath, destPath)) {
      return;
    }
  }

  // Handle URLs
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const response = await fetch(url);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(destPath, Buffer.from(buffer));
      return;
    }
  }

  throw new Error(`Cannot download image from: ${url}`);
}

export function getCachedAvatarPath(agentId: string): string | null {
  const localPath = path.join(PROFILE_CACHE_ROOT, `${agentId}.png`);
  return fs.existsSync(localPath) ? localPath : null;
}

export function clearAvatarCache(agentId?: string): void {
  ensureProfileDir();
  
  if (agentId) {
    const localPath = path.join(PROFILE_CACHE_ROOT, `${agentId}.png`);
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
  } else {
    // Clear all
    const files = fs.readdirSync(PROFILE_CACHE_ROOT);
    for (const file of files) {
      if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')) {
        fs.unlinkSync(path.join(PROFILE_CACHE_ROOT, file));
      }
    }
  }
}

export async function downloadMarketAgentToUser(
  userId: string,
  marketAgentId: string
): Promise<{ success: boolean; agentId?: string; error?: string }> {
  const agent = await getMarketAgentById(marketAgentId);
  if (!agent) {
    return { success: false, error: '市场 Agent 不存在' };
  }

  if (agent.status !== 'active') {
    return { success: false, error: '市场 Agent 当前不可下载' };
  }

  if (agent.visibility === 'private' && agent.ownerUserId !== userId) {
    return { success: false, error: '无权下载此市场 Agent' };
  }

  if (!agent.hasWorkspace) {
    return { success: false, error: '市场 Agent 缺少可下载的工作区' };
  }

  const db = getRawDb();
  const now = Date.now();
  const agentId = crypto.randomUUID().replace(/-/g, '');
  const workspacePath = getAgentWorkspacePath(userId, agentId);
  const baselinePath = getAgentBaselinePath(userId, agentId);
  const agentRoot = path.dirname(workspacePath);
  const marketPath = getMarketAgentPath(marketAgentId, agent.latestVersion);

  try {
    if (!cloneDirectory(marketPath, workspacePath)) {
      deleteDirectory(agentRoot);
      return { success: false, error: '复制市场 Agent 工作区失败' };
    }

    cloneDirectory(workspacePath, baselinePath);

    const manifestPath = path.join(workspacePath, 'agent.manifest.json');
    const manifest = fs.existsSync(manifestPath)
      ? fs.readFileSync(manifestPath, 'utf-8')
      : '{}';
    const avatarResult = await getOrCacheAvatar(marketAgentId, agent.icon);
    const avatar = avatarResult.cached ? avatarResult.url : agent.cachedAvatarUrl || agent.icon || '';

    db.prepare(`
      INSERT INTO user_agent_instances (
        id, user_id, source_market_agent_id, source_version, name, description,
        avatar, agent_key, workspace_path, state_dir, baseline_snapshot_path, status,
        manifest, tags, cave_id, provider_id, conversation_count, total_messages,
        last_active_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      agentId,
      userId,
      marketAgentId,
      agent.latestVersion || '1.0.0',
      agent.name,
      agent.description || '',
      avatar,
      generateAgentKey(),
      workspacePath,
      path.join(workspacePath, '.openclaw'),
      baselinePath,
      'idle',
      manifest,
      JSON.stringify(agent.tags || []),
      null,
      null,
      0,
      0,
      null,
      now,
      now
    );

    await incrementDownloadCount(marketAgentId);
    return { success: true, agentId };
  } catch (error) {
    deleteDirectory(agentRoot);
    console.error('Failed to download market agent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '下载市场 Agent 失败',
    };
  }
}

// ==================== Download Tracking ====================

export async function incrementDownloadCount(marketAgentId: string): Promise<void> {
  const db = getRawDb();
  db.prepare(`
    UPDATE market_agents 
    SET download_count = download_count + 1 
    WHERE id = ?
  `).run(marketAgentId);
}

export async function updateRating(marketAgentId: string, newRating: number): Promise<void> {
  const db = getRawDb();
  db.prepare(`
    UPDATE market_agents 
    SET rating = ? 
    WHERE id = ?
  `).run(newRating, marketAgentId);
}

// ==================== Publish to Market ====================

export async function publishAgentToMarket(
  userId: string,
  agentInstanceId: string,
  name: string,
  description: string,
  tags: string[],
  visibility: 'public' | 'private' | 'unlisted' = 'public'
): Promise<{ success: boolean; marketAgentId?: string; error?: string }> {
  try {
    const db = getDb();
    const rawDb = getRawDb();
    const now = Date.now();

    // Verify user owns the agent
    const agent = await db
      .select()
      .from(userAgentInstances)
      .where(and(
        eq(userAgentInstances.id, agentInstanceId),
        eq(userAgentInstances.userId, userId)
      ))
      .get();

    if (!agent) {
      return { success: false, error: 'Agent不存在或无权访问' };
    }

    const existing = await getPublishedMarketAgentForInstance(userId, agentInstanceId);
    if (existing) {
      return { success: true, marketAgentId: existing.id };
    }

    const workspacePath = resolveStoredPath(agent.workspacePath);
    if (!fs.existsSync(workspacePath)) {
      return { success: false, error: 'Agent workspace 不存在，无法发布到市场' };
    }

    // Copy workspace to market
    const marketAgentId = crypto.randomUUID().replace(/-/g, '');
    const marketPath = getMarketAgentPath(marketAgentId, '1.0.0');
    const sanitizedRisks: PublishRisk[] = [];

    if (!copyPublishableWorkspace(workspacePath, marketPath, workspacePath, sanitizedRisks)) {
      deleteDirectory(marketPath);
      return { success: false, error: '复制 Agent workspace 到市场目录失败' };
    }
    if (sanitizedRisks.length > 0) {
      console.info(formatPublishSanitizationMessage(sanitizedRisks));
    }

    // Calculate checksum
    const checksum = calculateDirChecksum(marketPath) || '';

    const storedTags = uniqueTags([
      ...parseMarketTags(tags),
      getSourceInstanceTag(agentInstanceId),
    ]);

    // Insert market agent
    rawDb.prepare(`
      INSERT INTO market_agents (
        id, name, description, owner_user_id, latest_version,
        visibility, status, tags, icon, cover_image,
        download_count, rating, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      marketAgentId,
      name,
      description,
      userId,
      '1.0.0',
      visibility,
      'active',
      JSON.stringify(storedTags),
      agent.avatar || '',
      '',
      0,
      0,
      now,
      now
    );

    // Insert version record
    rawDb.prepare(`
      INSERT INTO market_agent_versions (
        id, market_agent_id, version, manifest_path, source_workspace_path,
        checksum, changelog, file_size, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID().replace(/-/g, ''),
      marketAgentId,
      '1.0.0',
      path.join(marketPath, 'agent.manifest.json'),
      marketPath,
      checksum,
      'Initial release',
      getDirectorySize(marketPath),
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

export async function unpublishMarketAgent(
  userId: string,
  marketAgentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const rawDb = getRawDb();
    const agent = rawDb.prepare(`
      SELECT id, owner_user_id AS ownerUserId
      FROM market_agents
      WHERE id = ?
    `).get(marketAgentId) as { id: string; ownerUserId: string } | undefined;

    if (!agent || agent.ownerUserId !== userId) {
      return { success: false, error: '市场 Agent 不存在或无权下架' };
    }

    rawDb.prepare('DELETE FROM market_agent_versions WHERE market_agent_id = ?').run(marketAgentId);
    rawDb.prepare('DELETE FROM market_agents WHERE id = ?').run(marketAgentId);

    const marketAgentRoot = path.join(process.cwd(), 'data', 'workspaces', 'market', 'agents', marketAgentId);
    deleteDirectory(marketAgentRoot);

    return { success: true };
  } catch (error) {
    console.error('Failed to unpublish market agent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '下架市场 Agent 失败',
    };
  }
}

export async function unpublishAgentFromMarket(
  userId: string,
  agentInstanceId: string
): Promise<{ success: boolean; error?: string }> {
  const existing = await getPublishedMarketAgentForInstance(userId, agentInstanceId);
  if (!existing) {
    return { success: false, error: '此 Agent 尚未上架到市场' };
  }
  return unpublishMarketAgent(userId, existing.id);
}
