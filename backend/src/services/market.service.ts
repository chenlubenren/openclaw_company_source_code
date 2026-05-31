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
  calculateDirChecksum,
  getDirectorySize,
} from './workspace.service.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const PROFILE_CACHE_ROOT = path.join(process.cwd(), 'data', 'claw_profile');

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
  ownerUsername?: string;
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

  let query = db
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
        visibility ? eq(marketAgents.visibility, visibility) : undefined
      )
    )
    .orderBy(desc(marketAgents.downloadCount), desc(marketAgents.rating))
    .limit(limit)
    .offset(offset);

  if (search) {
    query = query.where(
      and(
        eq(marketAgents.status, status),
        like(marketAgents.name, `%${search}%`)
      )
    ) as any;
  }

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
      tags: typeof agent.tags === 'string' ? JSON.parse(agent.tags) : agent.tags || [],
      hasWorkspace,
      workspaceSize,
      cachedAvatarUrl: cachedAvatar.url,
      cachedCoverUrl: cachedCover?.url,
    });
  }

  return agentsWithStats;
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
    tags: typeof result.tags === 'string' ? JSON.parse(result.tags) : result.tags || [],
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

  // Handle file URLs
  if (url.startsWith('file://')) {
    const sourcePath = url.replace('file://', '');
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
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
    const marketAgentId = crypto.randomUUID().replace(/-/g, '');

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

    // Copy workspace to market
    const marketPath = getMarketAgentPath(marketAgentId, '1.0.0');
    const { cloneDirectory } = await import('./workspace.service.js');
    
    if (fs.existsSync(agent.workspacePath)) {
      cloneDirectory(agent.workspacePath, marketPath);
    }

    // Calculate checksum
    const checksum = calculateDirChecksum(marketPath) || '';

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
      JSON.stringify(tags),
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
