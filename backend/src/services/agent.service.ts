import fs from 'fs';
import path from 'path';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { getDb, getRawDb } from '../db/index.js';
import {
  userAgentInstances,
  marketAgents,
  providers,
  caves,
  conversations,
  messages,
  type UserAgentInstance,
  type NewUserAgentInstance,
  type Cave,
  type NewCave,
  type Conversation,
  type NewConversation,
  type Message,
  type NewMessage,
} from '../db/schema.js';
import {
  getAgentWorkspacePath,
  getAgentBaselinePath,
  getAgentConversationsPath,
  getUserAgentsRoot,
  ensureAgentRuntimeDirs,
  resolveStoredPath,
  generateAgentKey,
  cloneDirectory,
  writeFile,
  deleteDirectory,
} from './workspace.service.js';

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function parseStoredJsonArray(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function getAgentRootPath(agent: UserAgentInstance): string {
  const workspacePath = resolveStoredPath(agent.workspacePath);
  return path.basename(workspacePath) === 'workspace' ? path.dirname(workspacePath) : workspacePath;
}

function unlinkAgentFromArchitectureManifest(manifestPath: string, agentId: string): void {
  const resolvedManifestPath = resolveStoredPath(manifestPath);
  if (!fs.existsSync(resolvedManifestPath)) return;

  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(resolvedManifestPath, 'utf-8'));
  } catch (error) {
    console.warn(`Failed to parse architecture manifest while deleting agent ${agentId}:`, error);
    return;
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return;

  let changed = false;
  const clearRecord = (record: Record<string, unknown>) => {
    for (const key of ['linkedLobsterId', 'agentInstanceId', 'lobsterId']) {
      if (record[key] === agentId) {
        delete record[key];
        changed = true;
      }
    }

    const linkedLobster = record.linkedLobster;
    if (
      linkedLobster &&
      typeof linkedLobster === 'object' &&
      !Array.isArray(linkedLobster) &&
      (linkedLobster as Record<string, unknown>).id === agentId
    ) {
      record.linkedLobster = null;
      changed = true;
    }
  };

  const root = manifest as Record<string, unknown>;
  for (const key of ['agents', 'nodes']) {
    const items = root[key];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      clearRecord(record);

      const data = record.data;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        clearRecord(data as Record<string, unknown>);
      }
    }
  }

  const workflowDsl = root.workflowDsl;
  if (workflowDsl && typeof workflowDsl === 'object' && !Array.isArray(workflowDsl)) {
    const workflowNodes = (workflowDsl as Record<string, unknown>).nodes;
    if (Array.isArray(workflowNodes)) {
      for (const node of workflowNodes) {
        if (node && typeof node === 'object' && !Array.isArray(node)) {
          clearRecord(node as Record<string, unknown>);
        }
      }
    }
  }

  if (!changed) return;

  try {
    fs.writeFileSync(resolvedManifestPath, JSON.stringify(root, null, 2), 'utf-8');
  } catch (error) {
    console.warn(`Failed to update architecture manifest while deleting agent ${agentId}:`, error);
  }
}

const PLATFORM_TO_PROVIDER_TYPE: Record<string, string> = {
  'claude-code': 'claude',
  codex: 'codex',
  hermes: 'hermes',
  opencode: 'opencode',
  openclaw: 'openclaw',
};

function getPlatformFromManifest(manifestJson?: string): string | null {
  if (!manifestJson) return null;
  try {
    const manifest = JSON.parse(manifestJson);
    return typeof manifest?.entrypoint?.type === 'string' ? manifest.entrypoint.type : null;
  } catch {
    return null;
  }
}

export interface AgentUserConfig {
  agentId?: string;
  name?: string;
  description?: string;
  platform?: string | null;
  avatar?: string;
  providerId?: string | null;
  apiKeys?: Record<string, string>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  updatedAt?: string;
}

export function readAgentUserConfig(agent: Pick<UserAgentInstance, 'workspacePath'>): AgentUserConfig {
  const configPath = path.join(resolveStoredPath(agent.workspacePath), 'agent.config.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeModelId(model: unknown): string {
  if (typeof model === 'string') return model;
  if (model && typeof model === 'object') {
    const value = model as { id?: unknown; name?: unknown };
    if (typeof value.id === 'string') return value.id;
    if (typeof value.name === 'string') return value.name;
  }
  return '';
}

function parseProviderModels(rawModels?: string | null): string[] {
  if (!rawModels) return [];
  try {
    const parsed = JSON.parse(rawModels);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeModelId).filter(Boolean);
  } catch {
    return [];
  }
}

// ==================== AGENTS ====================

export interface CreateAgentDto {
  name: string;
  description?: string;
  avatar?: string;
  tags?: string[];
  manifest?: Record<string, unknown>;
  sourceMarketAgentId?: string;
  sourceVersion?: string;
  providerId?: string;
}

export interface AgentWithConversations extends UserAgentInstance {
  conversationList?: Conversation[];
}

export class AgentProfileLockedError extends Error {
  constructor() {
    super('从 Agent 市场下载的他人 Agent 不能修改名称和介绍');
    this.name = 'AgentProfileLockedError';
  }
}

export async function canEditAgentProfile(
  agent: Pick<UserAgentInstance, 'sourceMarketAgentId'>,
  userId: string
): Promise<boolean> {
  if (!agent.sourceMarketAgentId) return true;

  const db = getDb();
  const source = db
    .select({ ownerUserId: marketAgents.ownerUserId })
    .from(marketAgents)
    .where(eq(marketAgents.id, agent.sourceMarketAgentId))
    .get();

  return !source || source.ownerUserId === userId;
}

export async function createAgent(
  userId: string,
  dto: CreateAgentDto
): Promise<UserAgentInstance> {
  const db = getDb();
  const now = new Date();
  const agentId = generateId();
  const agentKey = generateAgentKey();
  const sourceMarketAgent = dto.sourceMarketAgentId
    ? db
        .select({
          id: marketAgents.id,
          name: marketAgents.name,
          description: marketAgents.description,
          ownerUserId: marketAgents.ownerUserId,
          latestVersion: marketAgents.latestVersion,
          icon: marketAgents.icon,
        })
        .from(marketAgents)
        .where(eq(marketAgents.id, dto.sourceMarketAgentId))
        .get()
    : null;
  const shouldLockSourceProfile = Boolean(sourceMarketAgent && sourceMarketAgent.ownerUserId !== userId);

  // Create workspace directory
  const workspacePath = getAgentWorkspacePath(userId, agentId);
  const baselinePath = getAgentBaselinePath(userId, agentId);

  // Create initial manifest if provided
  if (dto.manifest) {
    writeFile(
      `${workspacePath}/agent.manifest.json`,
      JSON.stringify(dto.manifest, null, 2)
    );
  }

  // Create baseline snapshot
  cloneDirectory(workspacePath, baselinePath);

  const runtimeDirs = ensureAgentRuntimeDirs(workspacePath);

  const newAgent: NewUserAgentInstance = {
    id: agentId,
    userId,
    sourceMarketAgentId: sourceMarketAgent?.id || null,
    sourceVersion: dto.sourceVersion || sourceMarketAgent?.latestVersion || '1.0.0',
    name: shouldLockSourceProfile ? sourceMarketAgent!.name : dto.name,
    description: shouldLockSourceProfile ? sourceMarketAgent!.description : dto.description || '',
    avatar: dto.avatar || (shouldLockSourceProfile ? sourceMarketAgent!.icon || '' : ''),
    agentKey,
    workspacePath,
    baselineSnapshotPath: baselinePath,
    stateDir: runtimeDirs.stateDir,
    status: 'idle',
    manifest: dto.manifest ? JSON.stringify(dto.manifest) : '{}',
    tags: JSON.stringify(dto.tags || []),
    caveId: null,
    providerId: dto.providerId || null,
    conversationCount: 0,
    totalMessages: 0,
    lastActiveAt: null,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(userAgentInstances).values(newAgent).run();
  return newAgent as UserAgentInstance;
}

export async function getAgentById(agentId: string): Promise<UserAgentInstance | null> {
  const db = getDb();
  return db.select().from(userAgentInstances).where(eq(userAgentInstances.id, agentId)).get() || null;
}

export async function getAgentByIdAndUser(
  agentId: string,
  userId: string
): Promise<UserAgentInstance | null> {
  const db = getDb();
  return (
    db
      .select()
      .from(userAgentInstances)
      .where(and(eq(userAgentInstances.id, agentId), eq(userAgentInstances.userId, userId)))
      .get() || null
  );
}

export async function getUserAgents(userId: string): Promise<UserAgentInstance[]> {
  const db = getDb();
  return db
    .select()
    .from(userAgentInstances)
    .where(eq(userAgentInstances.userId, userId))
    .orderBy(desc(userAgentInstances.updatedAt))
    .all();
}

export async function getAgentsByCave(userId: string, caveId: string): Promise<UserAgentInstance[]> {
  const db = getDb();
  return db
    .select()
    .from(userAgentInstances)
    .where(
      and(
        eq(userAgentInstances.userId, userId),
        eq(userAgentInstances.caveId, caveId)
      )
    )
    .orderBy(desc(userAgentInstances.updatedAt))
    .all();
}

export async function getUnassignedAgents(userId: string): Promise<UserAgentInstance[]> {
  const db = getDb();
  return db
    .select()
    .from(userAgentInstances)
    .where(and(eq(userAgentInstances.userId, userId), isNull(userAgentInstances.caveId)))
    .orderBy(desc(userAgentInstances.updatedAt))
    .all();
}

export async function updateAgent(
  agentId: string,
  userId: string,
  updates: Partial<UserAgentInstance>
): Promise<UserAgentInstance | null> {
  const db = getDb();
  const existing = await getAgentByIdAndUser(agentId, userId);
  if (!existing) return null;

  const now = new Date();
  const updateData: Record<string, unknown> = { updatedAt: now };
  const isProfileChange =
    (updates.name !== undefined && updates.name !== existing.name) ||
    (updates.description !== undefined && updates.description !== existing.description);

  if (isProfileChange && !(await canEditAgentProfile(existing, userId))) {
    throw new AgentProfileLockedError();
  }

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.avatar !== undefined) updateData.avatar = updates.avatar;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.tags !== undefined) updateData.tags = typeof updates.tags === 'string' ? updates.tags : JSON.stringify(updates.tags);
  if (updates.caveId !== undefined) updateData.caveId = updates.caveId;

  db.update(userAgentInstances).set(updateData).where(eq(userAgentInstances.id, agentId)).run();
  return getAgentById(agentId);
}

export async function moveAgentToCave(
  agentId: string,
  userId: string,
  caveId: string | null
): Promise<boolean> {
  const db = getDb();
  const existing = await getAgentByIdAndUser(agentId, userId);
  if (!existing) return false;

  db.update(userAgentInstances)
    .set({ caveId, updatedAt: new Date() })
    .where(eq(userAgentInstances.id, agentId))
    .run();

  return true;
}

export async function deleteAgent(agentId: string, userId: string): Promise<boolean> {
  const existing = await getAgentByIdAndUser(agentId, userId);
  if (!existing) return false;

  const rawDb = getRawDb();
  const conversationRows = rawDb
    .prepare('SELECT id FROM conversations WHERE agent_instance_id = ? AND user_id = ?')
    .all(agentId, userId) as Array<{ id: string }>;
  const teamRows = rawDb
    .prepare('SELECT id, manifest_path AS manifestPath FROM teams WHERE user_id = ?')
    .all(userId) as Array<{ id: string; manifestPath: string }>;
  const projectRows = rawDb
    .prepare('SELECT id, agent_ids AS agentIds FROM projects WHERE user_id = ?')
    .all(userId) as Array<{ id: string; agentIds: string }>;
  const now = Date.now();

  const deleteAgentTransaction = rawDb.transaction(() => {
    const deleteMessages = rawDb.prepare('DELETE FROM messages WHERE conversation_id = ?');
    for (const conversation of conversationRows) {
      deleteMessages.run(conversation.id);
    }

    rawDb.prepare('DELETE FROM conversations WHERE agent_instance_id = ? AND user_id = ?').run(agentId, userId);
    rawDb.prepare("DELETE FROM feishu_integrations WHERE scope = 'agent' AND subject_id = ? AND user_id = ?").run(agentId, userId);
    rawDb.prepare("DELETE FROM social_likes WHERE user_type = 'agent' AND user_id = ?").run(agentId);
    rawDb.prepare("DELETE FROM social_follows WHERE follower_type = 'agent' AND follower_id = ?").run(agentId);
    rawDb.prepare("DELETE FROM social_follows WHERE following_type = 'agent' AND following_id = ?").run(agentId);
    rawDb.prepare("UPDATE social_posts SET is_deleted = 1, updated_at = ? WHERE author_type = 'agent' AND author_id = ?").run(now, agentId);
    rawDb.prepare("UPDATE social_comments SET is_deleted = 1, updated_at = ? WHERE author_type = 'agent' AND author_id = ?").run(now, agentId);
    rawDb.prepare('DELETE FROM team_members WHERE agent_instance_id = ? AND team_id IN (SELECT id FROM teams WHERE user_id = ?)').run(agentId, userId);
    rawDb.prepare('UPDATE teams SET orchestrator_agent_id = NULL, updated_at = ? WHERE orchestrator_agent_id = ? AND user_id = ?').run(now, agentId, userId);
    rawDb.prepare(`
      UPDATE team_run_steps
      SET agent_instance_id = NULL
      WHERE agent_instance_id = ?
        AND run_id IN (
          SELECT team_run_steps.run_id
          FROM team_run_steps
          JOIN team_runs ON team_runs.id = team_run_steps.run_id
          WHERE team_runs.user_id = ?
        )
    `).run(agentId, userId);

    const updateProjectAgents = rawDb.prepare('UPDATE projects SET agent_ids = ?, updated_at = ? WHERE id = ? AND user_id = ?');
    for (const project of projectRows) {
      const currentAgentIds = parseStoredJsonArray(project.agentIds);
      const nextAgentIds = currentAgentIds.filter((id) => id !== agentId);
      if (nextAgentIds.length !== currentAgentIds.length) {
        updateProjectAgents.run(JSON.stringify(nextAgentIds), now, project.id, userId);
      }
    }

    rawDb.prepare('DELETE FROM user_agent_instances WHERE id = ? AND user_id = ?').run(agentId, userId);
  });

  deleteAgentTransaction();

  for (const team of teamRows) {
    unlinkAgentFromArchitectureManifest(team.manifestPath, agentId);
  }

  deleteDirectory(getAgentRootPath(existing));
  return true;
}

export async function updateAgentConfig(
  agentId: string,
  userId: string,
  config: {
    name?: string;
    description?: string;
    platform?: string;
    avatar?: string;
    providerId?: string | null;
    apiKeys?: Record<string, string>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<UserAgentInstance | null> {
  const existing = await getAgentByIdAndUser(agentId, userId);
  if (!existing) return null;

  const db = getDb();
  const previousConfig = readAgentUserConfig(existing);
  const canEditProfile = await canEditAgentProfile(existing, userId);

  if (
    !canEditProfile &&
    ((config.name !== undefined && config.name !== existing.name) ||
      (config.description !== undefined && config.description !== existing.description))
  ) {
    throw new AgentProfileLockedError();
  }

  const platform = previousConfig.platform || getPlatformFromManifest(existing.manifest) || 'openclaw';
  const targetProviderId =
    config.providerId !== undefined
      ? config.providerId
      : previousConfig.providerId ?? existing.providerId ?? null;
  let targetProvider: typeof providers.$inferSelect | undefined;

  if (targetProviderId) {
    const provider = db
      .select()
      .from(providers)
      .where(and(eq(providers.id, targetProviderId), eq(providers.userId, userId)))
      .get();

    if (!provider) {
      console.error(`Provider not found or unauthorized: ${targetProviderId}`);
      return null;
    }

    const expectedProviderType = PLATFORM_TO_PROVIDER_TYPE[platform];
    if (expectedProviderType && provider.type !== expectedProviderType) {
      console.error(
        `Provider type mismatch for agent ${agentId}: platform ${platform} requires ${expectedProviderType}, got ${provider.type}`
      );
      return null;
    }

    targetProvider = provider;
  }

  const requestedModel = config.model !== undefined ? config.model.trim() : undefined;
  const previousProviderId = previousConfig.providerId ?? existing.providerId ?? null;
  const previousModel = previousConfig.model || undefined;
  if (requestedModel && targetProvider) {
    const providerModels = parseProviderModels(targetProvider.models);
    if (providerModels.length > 0 && !providerModels.includes(requestedModel)) {
      console.error(`Model ${requestedModel} is not configured for provider ${targetProvider.id}`);
      return null;
    }
  }

  // Write user config to workspace directory (does not affect market agent)
  const workspacePath = resolveStoredPath(existing.workspacePath);
  const configPath = path.join(workspacePath, 'agent.config.json');
  const userConfig: AgentUserConfig = {
    ...previousConfig,
    agentId,
    name: canEditProfile ? config.name ?? existing.name : existing.name,
    description: canEditProfile ? config.description ?? existing.description ?? undefined : existing.description ?? undefined,
    platform,
    avatar: config.avatar ?? previousConfig.avatar,
    providerId: targetProviderId,
    apiKeys: config.apiKeys ?? previousConfig.apiKeys,
    model: config.model !== undefined ? requestedModel || undefined : previousConfig.model,
    temperature: config.temperature ?? previousConfig.temperature,
    maxTokens: config.maxTokens ?? previousConfig.maxTokens,
    updatedAt: new Date().toISOString(),
  };
  
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const compactConfig = Object.fromEntries(
      Object.entries(userConfig).filter(([, value]) => value !== undefined)
    );
    fs.writeFileSync(configPath, JSON.stringify(compactConfig, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to write agent config:', error);
    return null;
  }

  // Update database if name or providerId changed
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (canEditProfile && config.name && config.name !== existing.name) {
    updateData.name = config.name;
  }

  if (canEditProfile && config.description !== undefined && config.description !== existing.description) {
    updateData.description = config.description;
  }

  if (config.providerId !== undefined) {
    updateData.providerId = config.providerId || null;
  }

  if ((canEditProfile && (config.name || config.description !== undefined)) || config.providerId !== undefined) {
    db.update(userAgentInstances)
      .set(updateData)
      .where(eq(userAgentInstances.id, agentId))
      .run();
  }

  const providerChanged =
    config.providerId !== undefined && (config.providerId || null) !== (previousProviderId || null);
  const modelChanged =
    config.model !== undefined && (requestedModel || undefined) !== (previousModel || undefined);

  if (providerChanged || modelChanged) {
    db.update(conversations)
      .set({ sessionId: null, updatedAt: new Date() })
      .where(and(eq(conversations.agentInstanceId, agentId), eq(conversations.userId, userId)))
      .run();
  }

  return getAgentByIdAndUser(agentId, userId);
}

export async function uploadAgentAvatar(
  agentId: string,
  userId: string,
  file: Express.Multer.File
): Promise<{ avatarUrl: string } | null> {
  const existing = await getAgentByIdAndUser(agentId, userId);
  if (!existing) return null;

  // Save avatar to user workspace (avatars folder at same level as workspace)
  const agentRoot = path.join(getUserAgentsRoot(userId), agentId);
  const avatarsDir = path.join(agentRoot, 'avatars');
  if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
  }

  const ext = path.extname(file.originalname) || '.png';
  const filename = `avatar${ext}`;
  const avatarPath = path.join(avatarsDir, filename);
  
  fs.writeFileSync(avatarPath, file.buffer);

  // Store a relative API URL so it survives non-localhost deployments.
  const avatarUrl = `/api/agents/${agentId}/avatar/${filename}`;
  const db = getDb();
  db.update(userAgentInstances)
    .set({ avatar: avatarUrl, updatedAt: new Date() })
    .where(eq(userAgentInstances.id, agentId))
    .run();

  return { avatarUrl };
}

export async function updateAgentStatus(
  agentId: string,
  status: 'idle' | 'busy' | 'error' | 'offline'
): Promise<void> {
  const db = getDb();
  const now = new Date();
  const updateData: Record<string, unknown> = {
    status,
    lastActiveAt: now,
    updatedAt: now,
  };

  if (status === 'idle') {
    updateData.lastActiveAt = now;
  }

  db.update(userAgentInstances).set(updateData).where(eq(userAgentInstances.id, agentId)).run();
}

// ==================== CAVES ====================

export async function createCave(userId: string, name: string, color: string): Promise<Cave> {
  const db = getDb();
  const now = new Date();
  const caveId = generateId();

  // Get max sort order
  const maxOrder = db
    .select()
    .from(caves)
    .where(eq(caves.userId, userId))
    .all()
    .reduce((max, c) => Math.max(max, c.sortOrder || 0), -1);

  const newCave: NewCave = {
    id: caveId,
    userId,
    name,
    color,
    description: '',
    sortOrder: maxOrder + 1,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(caves).values(newCave).run();
  return newCave as Cave;
}

export async function getUserCaves(userId: string): Promise<Cave[]> {
  const db = getDb();
  return db
    .select()
    .from(caves)
    .where(eq(caves.userId, userId))
    .orderBy(caves.sortOrder)
    .all();
}

export async function getCaveById(caveId: string, userId: string): Promise<Cave | null> {
  const db = getDb();
  return db.select().from(caves).where(and(eq(caves.id, caveId), eq(caves.userId, userId))).get() || null;
}

export async function updateCave(
  caveId: string,
  userId: string,
  updates: Partial<Cave>
): Promise<Cave | null> {
  const db = getDb();
  const existing = await getCaveById(caveId, userId);
  if (!existing) return null;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.color !== undefined) updateData.color = updates.color;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder;

  db.update(caves).set(updateData).where(and(eq(caves.id, caveId), eq(caves.userId, userId))).run();
  return getCaveById(caveId, userId);
}

export async function deleteCave(caveId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const existing = await getCaveById(caveId, userId);
  if (!existing) return false;

  // Unassign all agents from this cave
  db.update(userAgentInstances)
    .set({ caveId: null, updatedAt: new Date() })
    .where(and(eq(userAgentInstances.caveId, caveId), eq(userAgentInstances.userId, userId)))
    .run();

  // Delete the cave
  db.delete(caves).where(and(eq(caves.id, caveId), eq(caves.userId, userId))).run();
  return true;
}

// ==================== CONVERSATIONS ====================

export async function createConversation(
  userId: string,
  agentInstanceId: string,
  title?: string,
  sessionId?: string | null
): Promise<Conversation> {
  const db = getDb();
  const now = new Date();
  const convId = generateId();

  const newConv: NewConversation = {
    id: convId,
    userId,
    agentInstanceId,
    sessionId: sessionId || null,
    title: title || '新对话',
    lastMessage: '',
    messageCount: 0,
    isPinned: false,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(conversations).values(newConv).run();

  // Update agent conversation count
  db.update(userAgentInstances)
    .set({
      conversationCount: db
        .select()
        .from(conversations)
        .where(eq(conversations.agentInstanceId, agentInstanceId))
        .all().length,
      updatedAt: now,
    })
    .where(eq(userAgentInstances.id, agentInstanceId))
    .run();

  return newConv as Conversation;
}

export async function getConversationById(
  conversationId: string,
  userId: string
): Promise<Conversation | null> {
  const db = getDb();
  return db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .get() || null;
}

export async function getAgentConversations(
  userId: string,
  agentInstanceId: string
): Promise<Conversation[]> {
  const db = getDb();
  return db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        eq(conversations.agentInstanceId, agentInstanceId),
        eq(conversations.isArchived, false)
      )
    )
    .orderBy(desc(conversations.updatedAt))
    .all();
}

export async function getAllUserConversations(userId: string): Promise<Conversation[]> {
  const db = getDb();
  return db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.isArchived, false)))
    .orderBy(desc(conversations.updatedAt))
    .all();
}

export async function deleteConversation(conversationId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const existing = await getConversationById(conversationId, userId);
  if (!existing) return false;

  // Delete messages first
  db.delete(messages).where(eq(messages.conversationId, conversationId)).run();
  // Delete conversation
  db.delete(conversations).where(eq(conversations.id, conversationId)).run();
  return true;
}

export async function updateConversationTitle(
  conversationId: string,
  userId: string,
  title: string
): Promise<Conversation | null> {
  const db = getDb();
  const existing = await getConversationById(conversationId, userId);
  if (!existing) return null;

  const nextTitle = title.trim();
  const now = new Date();
  db.update(conversations)
    .set({ title: nextTitle, updatedAt: now })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .run();

  return {
    ...existing,
    title: nextTitle,
    updatedAt: now,
  };
}

// ==================== MESSAGES ====================

export async function addMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: Record<string, unknown>
): Promise<Message> {
  const db = getDb();
  const now = new Date();
  const msgId = generateId();

  const newMsg: NewMessage = {
    id: msgId,
    conversationId,
    role,
    content,
    metadata: JSON.stringify(metadata || {}),
    createdAt: now,
  };

  db.insert(messages).values(newMsg).run();

  // Update conversation
  db.update(conversations)
    .set({
      lastMessage: content.substring(0, 200),
      messageCount: db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .all().length,
      updatedAt: now,
    })
    .where(eq(conversations.id, conversationId))
    .run();

  // Update agent stats
  const conv = db.select().from(conversations).where(eq(conversations.id, conversationId)).get();
  if (conv) {
    db.update(userAgentInstances)
      .set({
        totalMessages: conv.messageCount,
        lastActiveAt: now,
        updatedAt: now,
      })
      .where(eq(userAgentInstances.id, conv.agentInstanceId))
      .run();
  }

  return newMsg as Message;
}

export async function getConversationMessages(
  conversationId: string,
  userId: string
): Promise<Message[]> {
  const db = getDb();
  // Verify user owns this conversation
  const conv = await getConversationById(conversationId, userId);
  if (!conv) return [];

  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .all();
}
