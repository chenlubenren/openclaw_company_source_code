import fs from 'fs';
import path from 'path';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import {
  userAgentInstances,
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
  generateAgentKey,
  cloneDirectory,
  writeFile,
  deleteDirectory,
} from './workspace.service.js';

function computeDefaultStateDir(workspacePath: string): string {
  return path.join(workspacePath, '.openclaw');
}

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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

export async function createAgent(
  userId: string,
  dto: CreateAgentDto
): Promise<UserAgentInstance> {
  const db = getDb();
  const now = new Date();
  const agentId = generateId();
  const agentKey = generateAgentKey();

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

  const newAgent: NewUserAgentInstance = {
    id: agentId,
    userId,
    sourceMarketAgentId: dto.sourceMarketAgentId || null,
    sourceVersion: dto.sourceVersion || '1.0.0',
    name: dto.name,
    description: dto.description || '',
    avatar: dto.avatar || '',
    agentKey,
    workspacePath,
    baselineSnapshotPath: baselinePath,
    stateDir: computeDefaultStateDir(workspacePath),
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
    .where(and(eq(userAgentInstances.userId, userId), eq(userAgentInstances.caveId, null)))
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
  const db = getDb();
  const existing = await getAgentByIdAndUser(agentId, userId);
  if (!existing) return false;

  // Delete workspace directory
  deleteDirectory(existing.workspacePath);

  // Delete from database
  db.delete(userAgentInstances).where(eq(userAgentInstances.id, agentId)).run();
  return true;
}

export async function updateAgentConfig(
  agentId: string,
  userId: string,
  config: {
    name?: string;
    platform?: string;
    avatar?: string;
    providerId?: string;
    apiKeys?: Record<string, string>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<boolean> {
  const existing = await getAgentByIdAndUser(agentId, userId);
  if (!existing) return false;

  // Write user config to workspace directory (does not affect market agent)
  const configPath = path.join(existing.workspacePath, 'agent.config.json');
  const userConfig = {
    agentId,
    name: config.name ?? existing.name,
    platform: config.platform ?? existing.platform,
    avatar: config.avatar,
    providerId: config.providerId,
    apiKeys: config.apiKeys,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    updatedAt: new Date().toISOString(),
  };
  
  try {
    fs.writeFileSync(configPath, JSON.stringify(userConfig, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to write agent config:', error);
    return false;
  }

  // Update database if name or providerId changed
  const db = getDb();
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (config.name && config.name !== existing.name) {
    updateData.name = config.name;
  }

  if (config.providerId !== undefined) {
    updateData.providerId = config.providerId || null;
  }

  if (config.name || config.providerId !== undefined) {
    db.update(userAgentInstances)
      .set(updateData)
      .where(eq(userAgentInstances.id, agentId))
      .run();
  }

  return true;
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

  // Update avatar URL in database (relative path for serving)
  const avatarUrl = `http://localhost:3002/api/agents/${agentId}/avatar/${filename}`;
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
  title?: string
): Promise<Conversation> {
  const db = getDb();
  const now = new Date();
  const convId = generateId();

  const newConv: NewConversation = {
    id: convId,
    userId,
    agentInstanceId,
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
