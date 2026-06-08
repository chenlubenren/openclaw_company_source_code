import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { getRawDb } from '../db/index.js';
import {
  createAgent,
  getUserAgents,
  getAgentsByCave,
  getUnassignedAgents,
  getAgentByIdAndUser,
  updateAgent,
  moveAgentToCave,
  deleteAgent,
  createCave,
  getUserCaves,
  updateCave,
  deleteCave,
  updateAgentConfig,
  uploadAgentAvatar,
  readAgentUserConfig,
  canEditAgentProfile,
  AgentProfileLockedError,
  type AgentUserConfig,
} from '../services/agent.service.js';
import {
  adoptOfficialAgentToUser,
  getPublishedMarketAgentForInstance,
  publishAgentToMarket,
  unpublishAgentFromMarket,
} from '../services/market.service.js';
import {
  listAgentSkills,
  uploadAgentSkill,
} from '../services/agent-skills.service.js';
import { getProviderById } from '../services/provider.service.js';
import { agentRunner, formatCliHealthFailure, type AgentPlatform } from '../services/agent-runner.service.js';
import { executeCozeAgentTurn, getCozeRuntimeInfo } from '../services/coze-market.service.js';
import {
  getTeaPartyAgentRuntimePath,
  resolveStoredPath,
} from '../services/workspace.service.js';
import { buildAgentRuntimePrompt } from '../services/agent-runtime-context.service.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
const skillUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});
const chatImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});
const TEA_PARTY_TURN_TIMEOUT_MS = Number(process.env.TEA_PARTY_TURN_TIMEOUT_MS || 75000);
const TEA_PARTY_SESSION_MAX_ROUNDS = Number(process.env.TEA_PARTY_SESSION_MAX_ROUNDS || 240);
const TEA_PARTY_MAX_SPEAKERS_PER_ROUND = 3;
const TEA_PARTY_ROUND_DELAY_MS = [500, 1400] as const;
const TEA_PARTY_BETWEEN_SPEAKER_DELAY_MS = [120, 450] as const;
const TEA_PARTY_STOP_PATTERN = /停止这个话题|停止话题|暂停这个话题|结束这个话题|先停一下|stop this topic|stop topic/i;
const TEA_PARTY_WHITEBOARD_COLUMNS = ['ideas', 'questions', 'actions', 'risks'] as const;
function getPublicBackendUrl(req: Request): string {
  const configuredUrl = process.env.PUBLIC_BACKEND_URL?.trim().replace(/\/+$/, '');
  if (configuredUrl) return configuredUrl;

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol;
  const host = req.get('host');
  return host ? `${protocol}://${host}` : '';
}
const TEA_PARTY_BOARD_WIDTH = 1800;
const TEA_PARTY_NOTE_WIDTH = 220;
const TEA_PARTY_NOTE_HEIGHT = 148;
const TEA_PARTY_NOTE_START_Y = 118;
const TEA_PARTY_RUNTIME_BLOCKED_ENTRIES = [
  '.claude',
  '.openclaw',
  'AGENTS.md',
  'BOOTSTRAP.md',
  'HEARTBEAT.md',
  'IDENTITY.md',
  'MEMORY.md',
  'TOOLS.md',
  'USER.md',
  'memory',
  'skills',
];

type TeaPartyWhiteboardColumn = typeof TEA_PARTY_WHITEBOARD_COLUMNS[number];

interface TeaPartyMemberInput {
  id: string;
  name: string;
  role?: string | null;
  description?: string | null;
}

interface TeaPartyMessageInput {
  id?: string;
  sessionId?: string;
  senderId?: string;
  senderName?: string;
  content?: string;
  timestamp?: string;
}

interface TeaPartyWhiteboardNoteInput {
  id?: string;
  sessionId?: string;
  column?: string;
  text?: string;
  authorName?: string;
  createdAt?: string;
  updatedAt?: string;
  x?: number;
  y?: number;
}

interface TeaPartyMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
}

interface TeaPartyWhiteboardNote {
  id: string;
  sessionId: string;
  column: TeaPartyWhiteboardColumn;
  text: string;
  authorName: string;
  createdAt: string;
  updatedAt?: string;
  x: number;
  y: number;
}

interface TeaPartyRunLog {
  id: string;
  sessionId: string;
  agentName: string;
  status: 'running' | 'success' | 'error';
  message: string;
  timestamp: string;
}

interface TeaPartySessionTask {
  userId: string;
  sessionId: string;
  sessionName: string;
  members: TeaPartyMemberInput[];
  messages: TeaPartyMessage[];
  whiteboardNotes: TeaPartyWhiteboardNote[];
  runLogs: TeaPartyRunLog[];
  runningAgents: string[];
  active: boolean;
  stopRequested: boolean;
  round: number;
  lastSpeakerIds: string[];
  silenceRounds: Record<string, number>;
  pendingMentionIds: string[];
  createdAt: string;
  updatedAt: string;
  loopPromise?: Promise<void>;
}

interface TeaPartyTurnInput {
  agentId: string;
  prompt: string;
  sessionName?: string;
  topic?: string;
  members: TeaPartyMemberInput[];
  messages: Array<{ senderName?: string; content?: string }>;
  whiteboardNotes: Array<{ column?: string; text?: string; authorName?: string }>;
}

interface TeaPartyTurnResult {
  agent: {
    id: string;
    name: string;
    platform: string;
  };
  content: string;
}

const teaPartyTasks = new Map<string, TeaPartySessionTask>();

function getPlatformFromManifest(manifestJson?: string): string | null {
  if (!manifestJson) return null;
  try {
    const manifest = JSON.parse(manifestJson);
    return typeof manifest?.entrypoint?.type === 'string' ? manifest.entrypoint.type : null;
  } catch {
    return null;
  }
}

function withPlatform<T extends { manifest?: string; workspacePath?: string }>(
  agent: T
): T & { platform: string | null; config: AgentUserConfig } {
  return {
    ...agent,
    platform: getPlatformFromManifest(agent.manifest),
    config: agent.workspacePath ? readAgentUserConfig(agent as any) : {},
  };
}

function parseAgentTags(rawTags?: string | string[] | null): string[] {
  if (Array.isArray(rawTags)) return rawTags;
  if (!rawTags) return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : [];
  } catch {
    return [];
  }
}

function getOwnerUsername(userId: string): string {
  const row = getRawDb()
    .prepare('SELECT username FROM users WHERE id = ?')
    .get(userId) as { username?: string } | undefined;
  return row?.username || '当前用户';
}

async function withAgentCardMeta<T extends { id: string; userId?: string; manifest?: string; workspacePath?: string; sourceMarketAgentId?: string | null }>(
  agent: T,
  userId: string,
  ownerUsername = getOwnerUsername(userId)
): Promise<T & {
  platform: string | null;
  config: AgentUserConfig;
  ownerUsername: string;
  isPublishedToMarket: boolean;
  marketAgentId: string | null;
  canEditProfile: boolean;
}> {
  const published = await getPublishedMarketAgentForInstance(userId, agent.id);
  const canEditProfile = await canEditAgentProfile(
    { sourceMarketAgentId: agent.sourceMarketAgentId ?? null },
    userId
  );
  return {
    ...withPlatform(agent),
    ownerUsername,
    isPublishedToMarket: Boolean(published),
    marketAgentId: published?.id || null,
    canEditProfile,
  };
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

function preferSelectedModel(models: string[], selectedModel?: string): string[] {
  const model = selectedModel?.trim();
  if (!model || (models.length > 0 && !models.includes(model))) return models;
  return [model, ...models.filter((item) => item !== model)];
}

function prepareTeaPartyRuntimeWorkspace(workspacePath: string, sourceWorkspacePath: string): void {
  fs.mkdirSync(workspacePath, { recursive: true });
  for (const entry of TEA_PARTY_RUNTIME_BLOCKED_ENTRIES) {
    const entryPath = path.join(workspacePath, entry);
    if (fs.existsSync(entryPath)) {
      fs.rmSync(entryPath, { recursive: true, force: true });
    }
  }

  const sourceSoulPath = path.join(resolveStoredPath(sourceWorkspacePath), 'SOUL.md');
  if (fs.existsSync(sourceSoulPath) && fs.statSync(sourceSoulPath).isFile()) {
    fs.copyFileSync(sourceSoulPath, path.join(workspacePath, 'SOUL.md'));
  }

  fs.writeFileSync(
    path.join(workspacePath, 'README.md'),
    [
      '# Tea Party Runtime Workspace',
      '',
      'This isolated workspace is used only for group-chat turns.',
      'The uploaded agent persona is injected by the backend prompt; bootstrap and task skills are intentionally not copied here.',
    ].join('\n'),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(workspacePath, 'AGENTS.md'),
    [
      '# Tea Party Runtime',
      '',
      'This directory is only for OpenClaw tea-party group-chat turns.',
      'Use SOUL.md and the backend prompt as persona reference, then answer the current group conversation directly.',
      'Do not run bootstrap, onboarding, identity setup, or skill initialization protocols in this runtime.',
      'Do not report file status, online status, or initialization status to the user.',
    ].join('\n'),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(workspacePath, 'CLAUDE.md'),
    [
      '# Tea Party Runtime',
      '',
      'This directory is only for tea-party group-chat turns.',
      'Use SOUL.md and the backend prompt as persona reference, then answer the current group conversation directly.',
      'Do not run bootstrap, onboarding, identity setup, or skill initialization protocols in this runtime.',
      'Do not report file status, online status, or initialization status to the user.',
    ].join('\n'),
    'utf-8'
  );
}

function isTeaPartyBootstrapNoise(content: string): boolean {
  const text = content.trim();
  if (!text) return false;

  let score = 0;
  if (/素人|blank\s+slate|ordinary\s+person/i.test(text)) score += 3;
  if (/\bBOOTSTRAP(?:\.md)?\b|birth\s+certificate/i.test(text)) score += 3;
  if (/\bIDENTITY(?:\.md)?\b/i.test(text)) score += 2;
  if (/初始化|未初始化|啟動|启动|onboarding|还没填|還沒填|没填|未填|不完整/i.test(text)) score += 2;
  if (/收到消息|我也在线|我在線|我在线|上线|online/i.test(text)) score += 1;
  if (/\bSOUL(?:\.md)?\b/i.test(text) && /状态|狀態|文件|上传|上傳|读取|讀取|missing|empty|status/i.test(text)) {
    score += 2;
  }

  return score >= 3;
}

function buildTeaPartyRetryPrompt(prompt: string, invalidReply: string): string {
  return [
    prompt,
    '',
    '[TEA_PARTY_RETRY_GUARD]',
    'Your previous reply was invalid for this tea-party group chat because it reported bootstrap, identity-file, SOUL-file, initialization, or online-status information.',
    `Invalid reply excerpt: ${invalidReply.slice(0, 800)}`,
    'Reply again as the same uploaded agent. Output only a useful group-chat contribution about the current topic.',
    'Do not mention BOOTSTRAP, IDENTITY, SOUL file status, initialization, onboarding, being uninitialized, being a blank/ordinary person, receiving the message, or being online.',
    '[/TEA_PARTY_RETRY_GUARD]',
  ].join('\n');
}

function buildTeaPartyPrompt(data: {
  agentName: string;
  agentRole?: string | null;
  agentDescription?: string | null;
  sessionName?: string;
  topic?: string;
  prompt: string;
  members: Array<{ id?: string; name?: string; role?: string | null; description?: string | null }>;
  messages: Array<{ senderName?: string; content?: string }>;
  whiteboardNotes: Array<{ column?: string; text?: string; authorName?: string }>;
}): string {
  const members = data.members
    .map((member) => `- ${member.name || 'Unnamed'}${member.role ? ` (${member.role})` : ''}${member.description ? `: ${member.description}` : ''}`)
    .join('\n') || '- No other agents';
  const messages = data.messages
    .slice(-12)
    .map((message) => `${message.senderName || 'Unknown'}: ${message.content || ''}`)
    .join('\n') || 'No previous messages.';
  const board = data.whiteboardNotes
    .slice(-20)
    .map((note) => `- [${note.column || 'note'}] ${note.text || ''}${note.authorName ? ` (${note.authorName})` : ''}`)
    .join('\n') || 'No whiteboard notes yet.';

  return [
    '你正在参加一个多 Agent 群聊。请真实扮演当前 Agent，不要冒充其他 Agent。',
    '',
    `当前 Agent: ${data.agentName}`,
    `角色: ${data.agentRole || '未设置'}`,
    `简介: ${data.agentDescription || '未设置'}`,
    `茶话会: ${data.sessionName || '未命名茶话会'}`,
    `当前上下文: ${data.topic || '群聊消息'}`,
    '',
    '参会 Agent:',
    members,
    '',
    '最近讨论记录:',
    messages,
    '',
    '共同白板:',
    board,
    '',
    '发言规则:',
    '- 只代表“当前 Agent”发言。',
    '- 像群聊发言一样自然、简短，优先 3 到 8 句话。',
    '- 如果本轮输入显式 @ 了你，请直接回应；如果没有 @，请根据你的角色补充最相关的一点。',
    '- 如果需要另一个 Agent 接话，可以在最后自然地 @AgentName，但不要 @所有人，也不要强行点名。',
    '- 可以提出一个应写入白板的观点、问题、行动或风险，但不要输出 JSON，直接自然语言回答。',
    '- 不要汇报自己是否在线、是否初始化，也不要提 BOOTSTRAP/IDENTITY/SOUL 等文件状态。',
    '- 不要说自己是“素人”、未完成初始化、BOOTSTRAP 还在、IDENTITY 还没填；身份信息不完整时，直接按当前 Agent 名称、简介和 SOUL 风格参与讨论。',
    '',
    '本轮输入:',
    data.prompt,
  ].join('\n');
}

function makeTeaPartyId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function getTeaPartyTaskKey(userId: string, sessionId: string): string {
  return `${userId}:${sessionId}`;
}

function randomBetween([min, max]: readonly [number, number]): number {
  return Math.floor(min + Math.random() * (max - min));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTeaPartyMembers(value: unknown): TeaPartyMemberInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): TeaPartyMemberInput | null => {
      const member = item as Partial<TeaPartyMemberInput>;
      const id = typeof member.id === 'string' ? member.id.trim() : '';
      const name = typeof member.name === 'string' ? member.name.trim() : '';
      if (!id || !name) return null;
      return {
        id,
        name,
        role: typeof member.role === 'string' ? member.role : undefined,
        description: typeof member.description === 'string' ? member.description : undefined,
      };
    })
    .filter((member): member is TeaPartyMemberInput => Boolean(member));
}

function normalizeTeaPartyMessage(
  raw: TeaPartyMessageInput,
  sessionId: string,
  fallbackSenderId = 'user',
  fallbackSenderName = '用户'
): TeaPartyMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const content = typeof raw.content === 'string' ? raw.content.trim() : '';
  if (!content) return null;
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : makeTeaPartyId('msg'),
    sessionId,
    senderId: typeof raw.senderId === 'string' && raw.senderId.trim() ? raw.senderId : fallbackSenderId,
    senderName: typeof raw.senderName === 'string' && raw.senderName.trim() ? raw.senderName : fallbackSenderName,
    content,
    timestamp: typeof raw.timestamp === 'string' && raw.timestamp.trim() ? raw.timestamp : new Date().toISOString(),
  };
}

function normalizeTeaPartyMessages(value: unknown, sessionId: string): TeaPartyMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeTeaPartyMessage(item as TeaPartyMessageInput, sessionId))
    .filter((message): message is TeaPartyMessage => Boolean(message))
    .slice(-80);
}

function normalizeTeaPartyColumn(value: unknown): TeaPartyWhiteboardColumn {
  return TEA_PARTY_WHITEBOARD_COLUMNS.includes(value as TeaPartyWhiteboardColumn)
    ? (value as TeaPartyWhiteboardColumn)
    : 'ideas';
}

function clampTeaPartyNotePosition(x: number, y: number): { x: number; y: number } {
  const safeX = Number.isFinite(x) ? x : 36;
  const safeY = Number.isFinite(y) ? y : TEA_PARTY_NOTE_START_Y;
  return {
    x: Math.max(16, Math.min(TEA_PARTY_BOARD_WIDTH - TEA_PARTY_NOTE_WIDTH - 16, safeX)),
    y: Math.max(82, Math.min(1320 - TEA_PARTY_NOTE_HEIGHT - 16, safeY)),
  };
}

function getDefaultTeaPartyNotePosition(index: number): { x: number; y: number } {
  const slotWidth = TEA_PARTY_NOTE_WIDTH + 62;
  const slotHeight = TEA_PARTY_NOTE_HEIGHT + 34;
  const slotsPerRow = Math.max(1, Math.floor((TEA_PARTY_BOARD_WIDTH - 64) / slotWidth));
  const row = Math.floor(index / slotsPerRow);
  const slot = index % slotsPerRow;
  return clampTeaPartyNotePosition(
    32 + slot * slotWidth + (row % 2) * 18,
    TEA_PARTY_NOTE_START_Y + row * slotHeight
  );
}

function normalizeTeaPartyWhiteboardNote(
  raw: TeaPartyWhiteboardNoteInput,
  sessionId: string,
  index: number
): TeaPartyWhiteboardNote | null {
  if (!raw || typeof raw !== 'object') return null;
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!text) return null;
  const fallback = getDefaultTeaPartyNotePosition(index);
  const position = clampTeaPartyNotePosition(
    typeof raw.x === 'number' ? raw.x : fallback.x,
    typeof raw.y === 'number' ? raw.y : fallback.y
  );
  const createdAt = typeof raw.createdAt === 'string' && raw.createdAt.trim()
    ? raw.createdAt
    : new Date().toISOString();
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : makeTeaPartyId('note'),
    sessionId,
    column: normalizeTeaPartyColumn(raw.column),
    text,
    authorName: typeof raw.authorName === 'string' && raw.authorName.trim() ? raw.authorName : '茶话会',
    createdAt,
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt.trim() ? raw.updatedAt : createdAt,
    x: position.x,
    y: position.y,
  };
}

function normalizeTeaPartyWhiteboardNotes(value: unknown, sessionId: string): TeaPartyWhiteboardNote[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => normalizeTeaPartyWhiteboardNote(item as TeaPartyWhiteboardNoteInput, sessionId, index))
    .filter((note): note is TeaPartyWhiteboardNote => Boolean(note))
    .slice(-60);
}

function mergeTeaPartyMessages(task: TeaPartySessionTask, messages: TeaPartyMessage[]) {
  const current = new Map(task.messages.map((message) => [message.id, message]));
  for (const message of messages) {
    current.set(message.id, message);
  }
  task.messages = Array.from(current.values())
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-160);
}

function mergeTeaPartyWhiteboardNotes(task: TeaPartySessionTask, notes: TeaPartyWhiteboardNote[]) {
  const current = new Map(task.whiteboardNotes.map((note) => [note.id, note]));
  for (const note of notes) {
    current.set(note.id, note);
  }
  task.whiteboardNotes = Array.from(current.values())
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-80);
}

function pushTeaPartyRunLog(
  task: TeaPartySessionTask,
  agentName: string,
  status: TeaPartyRunLog['status'],
  message: string
) {
  task.runLogs = [
    ...task.runLogs,
    {
      id: makeTeaPartyId('run'),
      sessionId: task.sessionId,
      agentName,
      status,
      message,
      timestamp: new Date().toISOString(),
    },
  ].slice(-80);
  task.updatedAt = new Date().toISOString();
}

function setTeaPartyAgentRunning(task: TeaPartySessionTask, agentName: string, running: boolean) {
  task.runningAgents = running
    ? Array.from(new Set([...task.runningAgents, agentName]))
    : task.runningAgents.filter((name) => name !== agentName);
  task.updatedAt = new Date().toISOString();
}

function getTeaPartyMentions(content: string, members: TeaPartyMemberInput[]): TeaPartyMemberInput[] {
  const explicit = members.filter((member) => content.includes(`@${member.name}`));
  if (explicit.length > 0) return explicit;
  if (/@(all|ALL|大家|全体|所有Agent|所有)/.test(content)) {
    return members.slice(0, Math.min(2, members.length));
  }
  return [];
}

function mergeUniqueIds(...groups: string[][]): string[] {
  return Array.from(new Set(groups.flat().filter(Boolean)));
}

function teaPartyRoleRelevanceScore(member: TeaPartyMemberInput, content: string): number {
  const profile = `${member.name} ${member.role || ''} ${member.description || ''}`.toLowerCase();
  const lower = content.toLowerCase();
  const groups: Array<{ keywords: string[]; roles: string[]; score: number }> = [
    { keywords: ['ui', 'ux', '前端', '界面', '布局', '视觉', '设计', 'html', 'css'], roles: ['ui', 'ux', 'front', 'design', 'layout', '视觉', '设计', '前端'], score: 8 },
    { keywords: ['api', '后端', '接口', '数据库', '服务', '错误', 'bug'], roles: ['backend', 'api', '工程', '代码', '后端', 'developer'], score: 8 },
    { keywords: ['风险', '测试', '验证', '质量', '边界', '安全'], roles: ['test', 'qa', 'risk', 'quality', '安全', '测试', '审查'], score: 7 },
    { keywords: ['产品', '用户', '体验', '需求', '流程', '策略'], roles: ['product', '产品', '策略', '需求', '体验'], score: 6 },
    { keywords: ['文案', '内容', '表达', '说明', '介绍'], roles: ['copy', 'content', 'writing', '文案', '内容', '写作'], score: 5 },
  ];

  return groups.reduce((score, group) => {
    if (!group.keywords.some((keyword) => lower.includes(keyword))) return score;
    return score + (group.roles.some((role) => profile.includes(role.toLowerCase())) ? group.score : 0);
  }, 0);
}

function pickTeaPartyAgentByTopic(
  members: TeaPartyMemberInput[],
  content: string,
  turn: number
): TeaPartyMemberInput | null {
  if (members.length === 0) return null;
  const lower = content.toLowerCase();
  const keywordGroups: Array<{ keywords: string[]; roleWords: string[] }> = [
    {
      keywords: ['代码', '开发', 'bug', '接口', '前端', '后端', 'code', 'api', 'engineering', 'frontend', 'backend'],
      roleWords: ['开发', '代码', '工程', 'code', 'engineering', 'api', 'frontend', 'backend'],
    },
    {
      keywords: ['设计', '视觉', '交互', '页面', '布局', 'ui', 'ux', 'product', 'design', 'layout'],
      roleWords: ['设计', '视觉', 'ui', 'ux', '产品', 'product', 'design'],
    },
    {
      keywords: ['风险', '测试', '质量', '验证', 'risk', 'test', 'quality', 'verification'],
      roleWords: ['测试', '质量', '审核', '安全', 'risk', 'test', 'quality', 'safety', 'verification'],
    },
  ];

  for (const group of keywordGroups) {
    if (!group.keywords.some((keyword) => lower.includes(keyword))) continue;
    const matched = members.find((member) => {
      const profile = `${member.name} ${member.role || ''} ${member.description || ''}`.toLowerCase();
      return group.roleWords.some((word) => profile.includes(word.toLowerCase()));
    });
    if (matched) return matched;
  }

  return members[turn % members.length];
}

function desiredTeaPartySpeakerCount(content: string, membersCount: number, round: number): number {
  if (membersCount <= 1) return membersCount;
  if (round === 0) return Math.min(2, membersCount);
  const isQuestionOrDebate = /[?？]|怎么|如何|为什么|方案|风险|评估|讨论|要不要|是否|能不能/.test(content);
  const base = isQuestionOrDebate ? 2 : 1;
  const extra = membersCount >= 3 && Math.random() > 0.58 ? 1 : 0;
  return Math.min(TEA_PARTY_MAX_SPEAKERS_PER_ROUND, membersCount, base + extra);
}

function selectTeaPartyTaskSpeakers(
  task: TeaPartySessionTask,
  content: string,
  latestSenderId?: string
): TeaPartyMemberInput[] {
  const members = task.members;
  if (members.length === 0) return [];

  const mentioned = task.pendingMentionIds
    .map((id) => members.find((member) => member.id === id))
    .filter((member): member is TeaPartyMemberInput => Boolean(member));
  if (mentioned.length > 0) {
    return mentioned.slice(0, TEA_PARTY_MAX_SPEAKERS_PER_ROUND);
  }

  const speakerCount = desiredTeaPartySpeakerCount(content, members.length, task.round);
  const topicFallback = pickTeaPartyAgentByTopic(members, content, task.round);
  const scored = members
    .map((member, index) => {
      const recentlySpoke = task.lastSpeakerIds.includes(member.id);
      const silenceBonus = task.silenceRounds[member.id] || 0;
      const topicBonus = topicFallback?.id === member.id ? 7 : 0;
      const latestSenderPenalty = latestSenderId === member.id ? 7 : 0;
      const score =
        teaPartyRoleRelevanceScore(member, content) +
        topicBonus +
        silenceBonus * 1.6 -
        (recentlySpoke ? 5 : 0) -
        latestSenderPenalty +
        Math.random() * 4 +
        index * 0.01;
      return { member, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, speakerCount).map((item) => item.member);
}

function updateTeaPartyRuntimeAfterSpeakers(task: TeaPartySessionTask, speakers: TeaPartyMemberInput[]) {
  const speakerIds = new Set(speakers.map((speaker) => speaker.id));
  task.lastSpeakerIds = speakers.map((speaker) => speaker.id);
  task.silenceRounds = Object.fromEntries(
    task.members.map((member) => [
      member.id,
      speakerIds.has(member.id) ? 0 : (task.silenceRounds[member.id] || 0) + 1,
    ])
  );
}

function classifyTeaPartyNote(content: string): TeaPartyWhiteboardColumn {
  if (/[?？]|问题|不确定|需要确认|谁来/.test(content)) return 'questions';
  if (/风险|注意|阻塞|担心|代价|失败|限制/.test(content)) return 'risks';
  if (/行动|下一步|建议|负责|先做|可以把|需要做/.test(content)) return 'actions';
  return 'ideas';
}

function summarizeTeaPartyNoteKeywords(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, 'image')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/@\S+/g, ' ')
    .replace(/[`*_>#~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'key point';
  const phrases = Array.from(
    new Set(
      cleaned
        .split(/[\n。！？!?；;，,、|/]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

  return (phrases.length > 0 ? phrases : [cleaned])
    .slice(0, 4)
    .map((item) => (item.length > 24 ? `${item.slice(0, 24)}...` : item))
    .join('\n');
}

function buildTeaPartyNoteFromMessage(
  task: TeaPartySessionTask,
  content: string,
  authorName: string
): TeaPartyWhiteboardNote {
  const position = getDefaultTeaPartyNotePosition(task.whiteboardNotes.length);
  const createdAt = new Date().toISOString();
  return {
    id: makeTeaPartyId('note'),
    sessionId: task.sessionId,
    column: classifyTeaPartyNote(content),
    text: summarizeTeaPartyNoteKeywords(content),
    authorName,
    createdAt,
    updatedAt: createdAt,
    x: position.x,
    y: position.y,
  };
}

function getOrCreateTeaPartyTask(userId: string, sessionId: string, sessionName?: string): TeaPartySessionTask {
  const key = getTeaPartyTaskKey(userId, sessionId);
  const existing = teaPartyTasks.get(key);
  if (existing) {
    if (sessionName?.trim()) existing.sessionName = sessionName.trim();
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  const now = new Date().toISOString();
  const task: TeaPartySessionTask = {
    userId,
    sessionId,
    sessionName: sessionName?.trim() || '茶话会',
    members: [],
    messages: [],
    whiteboardNotes: [],
    runLogs: [],
    runningAgents: [],
    active: false,
    stopRequested: false,
    round: 0,
    lastSpeakerIds: [],
    silenceRounds: {},
    pendingMentionIds: [],
    createdAt: now,
    updatedAt: now,
  };
  teaPartyTasks.set(key, task);
  return task;
}

function serializeTeaPartyTask(task: TeaPartySessionTask) {
  return {
    sessionId: task.sessionId,
    sessionName: task.sessionName,
    active: task.active,
    stopRequested: task.stopRequested,
    round: task.round,
    members: task.members,
    messages: task.messages,
    whiteboardNotes: task.whiteboardNotes,
    runLogs: task.runLogs,
    runningAgents: task.runningAgents,
    updatedAt: task.updatedAt,
  };
}

function emptyTeaPartyTaskState(sessionId: string) {
  return {
    sessionId,
    sessionName: '',
    active: false,
    stopRequested: false,
    round: 0,
    members: [],
    messages: [],
    whiteboardNotes: [],
    runLogs: [],
    runningAgents: [],
    updatedAt: new Date().toISOString(),
  };
}

async function executeTeaPartyAgentTurn(
  userId: string,
  input: TeaPartyTurnInput
): Promise<TeaPartyTurnResult> {
  const agent = await getAgentByIdAndUser(input.agentId, userId);
  if (!agent) {
    const error = new Error('Agent不存在');
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }

  const agentConfig = readAgentUserConfig(agent);
  const selectedModel = typeof agentConfig.model === 'string' ? agentConfig.model : undefined;
  let providerConfig: { apiKey: string; baseUrl?: string; models?: string[]; stateDir?: string | null; providerType?: string } | undefined;

  if (agent.providerId) {
    const provider = await getProviderById(String(agent.providerId), userId);
    if (provider) {
      providerConfig = {
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl || undefined,
        models: preferSelectedModel(parseProviderModels(provider.models), selectedModel),
        stateDir: agent.stateDir,
        providerType: provider.type,
      };
    }
  }

  const platform = getPlatformFromManifest(agent.manifest) || 'openclaw';
  const runtimePrompt = buildTeaPartyPrompt({
    agentName: agent.name,
    agentRole: null,
    agentDescription: agent.description,
    sessionName: input.sessionName,
    topic: input.topic,
    prompt: input.prompt,
    members: input.members,
    messages: input.messages,
    whiteboardNotes: input.whiteboardNotes,
  });
  const agentRuntimePrompt = buildAgentRuntimePrompt(agent, {
    userMessage: runtimePrompt,
    mode: 'group-chat',
    platform,
    providerConfig,
    extraInstructions: [
      'This turn is initiated by the tea-party group chat. Reply as this single agent only.',
      'Do not impersonate other members. Mention other agents naturally only when useful.',
      'This is a WeChat-like group conversation, not a formal single-assistant answer.',
      'Keep the reply conversational and concise. React to the latest speaker, add one useful angle, or lightly disagree when appropriate.',
      'If another member should continue, @ exactly one member by name. Do not force every member to answer.',
      'If the user asks to stop the topic, do not continue the discussion.',
    ],
  });

  if (platform === 'coze') {
    let content = await executeCozeAgentTurn(agent, {
      userId,
      conversationId: `tea-party-${input.sessionName || 'session'}-${agent.id}`,
      message: agentRuntimePrompt,
    });
    if (content && isTeaPartyBootstrapNoise(content)) {
      content = await executeCozeAgentTurn(agent, {
        userId,
        conversationId: `tea-party-${input.sessionName || 'session'}-${agent.id}`,
        message: buildTeaPartyRetryPrompt(agentRuntimePrompt, content),
      });
    }

    return {
      agent: {
        id: agent.id,
        name: agent.name,
        platform,
      },
      content: content || `${agent.name} 没有返回内容。`,
    };
  }

  const teaPartyRuntime = getTeaPartyAgentRuntimePath(userId, agent.id);
  prepareTeaPartyRuntimeWorkspace(teaPartyRuntime.workspacePath, agent.workspacePath);
  const runnerPlatform = platform as AgentPlatform;
  const cliCheck = await agentRunner.checkCliAvailable(runnerPlatform);
  if (!cliCheck.available) {
    const error = new Error(formatCliHealthFailure(runnerPlatform, cliCheck));
    (error as Error & { statusCode?: number; platform?: string }).statusCode = 400;
    (error as Error & { statusCode?: number; platform?: string }).platform = platform;
    throw error;
  }

  const createTeaPartyProviderConfig = () => {
    const turnStateDir = path.join(
      teaPartyRuntime.stateDir,
      `turn-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    );
    fs.mkdirSync(turnStateDir, { recursive: true });
    if (runnerPlatform !== 'openclaw') {
      return providerConfig;
    }
    return {
      apiKey: providerConfig?.apiKey || '',
      baseUrl: providerConfig?.baseUrl,
      models: providerConfig?.models,
      providerType: providerConfig?.providerType,
      stateDir: turnStateDir,
    };
  };

  let content = await agentRunner.executeMessage(
    agent.id,
    runnerPlatform,
    teaPartyRuntime.workspacePath,
    agentRuntimePrompt,
    createTeaPartyProviderConfig(),
    TEA_PARTY_TURN_TIMEOUT_MS
  );
  if (content && isTeaPartyBootstrapNoise(content)) {
    content = await agentRunner.executeMessage(
      agent.id,
      runnerPlatform,
      teaPartyRuntime.workspacePath,
      buildTeaPartyRetryPrompt(agentRuntimePrompt, content),
      createTeaPartyProviderConfig(),
      TEA_PARTY_TURN_TIMEOUT_MS
    );
  }

  return {
    agent: {
      id: agent.id,
      name: agent.name,
      platform,
    },
    content: content || `${agent.name} 没有返回内容。`,
  };
}

async function runTeaPartySessionLoop(task: TeaPartySessionTask) {
  if (task.loopPromise) return task.loopPromise;

  task.loopPromise = (async () => {
    task.active = true;
    task.stopRequested = false;
    task.updatedAt = new Date().toISOString();
    pushTeaPartyRunLog(task, '茶话会', 'running', '群聊已开始，发送“停止这个话题”可停止');

    try {
      while (task.active && !task.stopRequested && task.round < TEA_PARTY_SESSION_MAX_ROUNDS) {
        if (task.members.length === 0) {
          pushTeaPartyRunLog(task, '茶话会', 'error', '当前没有参会 Agent，已暂停');
          break;
        }

        const history = task.messages.filter((message) => message.senderId !== 'system');
        const latestMessage = history[history.length - 1];
        const selectionContent = latestMessage?.content || '';
        if (!selectionContent) break;

        const latestMentionIds = getTeaPartyMentions(selectionContent, task.members).map((member) => member.id);
        task.pendingMentionIds = mergeUniqueIds(task.pendingMentionIds, latestMentionIds);

        let speakers = selectTeaPartyTaskSpeakers(task, selectionContent, latestMessage?.senderId);
        if (speakers.length === 0) {
          const fallback = task.members.find((member) => member.id !== latestMessage?.senderId) || task.members[0];
          speakers = fallback ? [fallback] : [];
        }
        if (speakers.length === 0) break;

        const completedSpeakers: TeaPartyMemberInput[] = [];
        for (const speaker of speakers) {
          if (!task.active || task.stopRequested) break;

          setTeaPartyAgentRunning(task, speaker.name, true);
          pushTeaPartyRunLog(task, speaker.name, 'running', `${speaker.name}正在输入`);

          try {
            const liveHistory = task.messages
              .filter((message) => message.senderId !== 'system')
              .slice(-8)
              .map((message) => ({
                senderName: message.senderName,
                content: message.content,
              }));
            const prompt = task.messages.filter((message) => message.senderId !== 'system').slice(-1)[0]?.content || selectionContent;
            const result = await executeTeaPartyAgentTurn(task.userId, {
              agentId: speaker.id,
              prompt,
              sessionName: task.sessionName,
              topic: '群聊消息',
              members: task.members,
              messages: liveHistory,
              whiteboardNotes: task.whiteboardNotes.slice(-10).map((note) => ({
                column: note.column,
                text: note.text,
                authorName: note.authorName,
              })),
            });

            const reply = result.content.trim();
            if (task.stopRequested || !task.active) {
              pushTeaPartyRunLog(task, speaker.name, 'success', `${speaker.name} 已返回，但话题已停止，未展示`);
              continue;
            }

            task.messages.push({
              id: makeTeaPartyId('msg'),
              sessionId: task.sessionId,
              senderId: result.agent.id,
              senderName: result.agent.name,
              content: reply || `${speaker.name} 没有返回内容。`,
              timestamp: new Date().toISOString(),
            });
            task.messages = task.messages.slice(-160);
            if (reply) {
              task.whiteboardNotes.push(buildTeaPartyNoteFromMessage(task, reply, result.agent.name));
              task.whiteboardNotes = task.whiteboardNotes.slice(-80);
            }
            completedSpeakers.push(speaker);
            pushTeaPartyRunLog(task, speaker.name, 'success', `${speaker.name} 已回复`);

            const replyMentionIds = getTeaPartyMentions(reply, task.members)
              .filter((member) => member.id !== speaker.id)
              .map((member) => member.id);
            task.pendingMentionIds = mergeUniqueIds(task.pendingMentionIds, replyMentionIds);

            if (TEA_PARTY_STOP_PATTERN.test(reply)) {
              task.stopRequested = true;
              break;
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : '真实 Agent 调用失败';
            pushTeaPartyRunLog(task, speaker.name, 'error', `${speaker.name} 调用失败：${message}`);
          } finally {
            setTeaPartyAgentRunning(task, speaker.name, false);
          }

          if (speakers.length > 1 && !task.stopRequested) {
            await wait(randomBetween(TEA_PARTY_BETWEEN_SPEAKER_DELAY_MS));
          }
        }

        if (completedSpeakers.length === 0) {
          task.stopRequested = true;
          pushTeaPartyRunLog(task, '茶话会', 'error', '本轮没有 Agent 成功回复，已自动暂停');
          break;
        }

        task.pendingMentionIds = task.pendingMentionIds.filter(
          (id) => !completedSpeakers.some((speaker) => speaker.id === id)
        );
        updateTeaPartyRuntimeAfterSpeakers(task, completedSpeakers);
        task.round += 1;
        task.updatedAt = new Date().toISOString();

        if (!task.active || task.stopRequested) break;
        await wait(randomBetween(TEA_PARTY_ROUND_DELAY_MS));
      }
    } finally {
      const reachedLimit = task.round >= TEA_PARTY_SESSION_MAX_ROUNDS && !task.stopRequested;
      task.active = false;
      task.runningAgents = [];
      task.pendingMentionIds = [];
      task.loopPromise = undefined;
      task.updatedAt = new Date().toISOString();
      if (reachedLimit) {
        pushTeaPartyRunLog(task, '茶话会', 'success', '本轮持续讨论达到安全上限，已自动暂停');
      }
    }
  })();

  return task.loopPromise;
}

function sanitizeChatAssetName(filename: string): string {
  const parsed = path.parse(filename || 'image.png');
  const safeName = parsed.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60) || 'image';
  const safeExt = (parsed.ext || '.png').replace(/[^A-Za-z0-9.]+/g, '') || '.png';
  return `${safeName}${safeExt}`;
}

function getAgentChatAssetPath(workspacePath: string, filename: string): string {
  const safeFilename = sanitizeChatAssetName(filename);
  return path.join(resolveStoredPath(workspacePath), '.chat-assets', safeFilename);
}

router.get('/:id/chat-assets/:filename', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const filename = String(req.params.filename);
    const row = getRawDb()
      .prepare('SELECT workspace_path AS workspacePath FROM user_agent_instances WHERE id = ?')
      .get(id) as { workspacePath?: string } | undefined;

    if (!row?.workspacePath) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    const assetPath = getAgentChatAssetPath(row.workspacePath, filename);
    if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
      res.status(404).json({ message: 'Asset not found' });
      return;
    }

    res.sendFile(assetPath);
  } catch (error) {
    console.error('Serve chat asset error:', error);
    res.status(500).json({ message: 'Failed to serve chat asset' });
  }
});

// All routes require authentication
router.use(authMiddleware);

// ==================== AGENTS ====================

// POST /api/agents/tea-party/turn - Execute one real backend agent turn for tea party
router.post('/tea-party/turn', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const {
      agentId,
      prompt,
      sessionName,
      topic,
      members = [],
      messages = [],
      whiteboardNotes = [],
    } = req.body || {};

    if (typeof agentId !== 'string' || !agentId.trim()) {
      res.status(400).json({ message: 'agentId is required' });
      return;
    }
    if (typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ message: 'prompt is required' });
      return;
    }

    const result = await executeTeaPartyAgentTurn(userId, {
      agentId: agentId.trim(),
      prompt: prompt.trim(),
      sessionName: typeof sessionName === 'string' ? sessionName : undefined,
      topic: typeof topic === 'string' ? topic : undefined,
      members: normalizeTeaPartyMembers(members),
      messages: Array.isArray(messages) ? messages : [],
      whiteboardNotes: Array.isArray(whiteboardNotes) ? whiteboardNotes : [],
    });

    res.json(result);
  } catch (error) {
    console.error('Tea party turn error:', error);
    const statusCode = error instanceof Error && 'statusCode' in error
      ? Number((error as Error & { statusCode?: number }).statusCode) || 500
      : 500;
    res.status(statusCode).json({
      message: error instanceof Error ? error.message : '茶话会 Agent 调用失败',
    });
  }
});

// POST /api/agents/tea-party/sessions/:sessionId/messages - Start or wake a backend tea-party task
router.post('/tea-party/sessions/:sessionId/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const sessionId = String(req.params.sessionId || '').trim();
    if (!sessionId) {
      res.status(400).json({ message: 'sessionId is required' });
      return;
    }

    const {
      sessionName,
      userMessage,
      members = [],
      messages = [],
      whiteboardNotes = [],
    } = req.body || {};

    const task = getOrCreateTeaPartyTask(
      userId,
      sessionId,
      typeof sessionName === 'string' ? sessionName : undefined
    );
    task.members = normalizeTeaPartyMembers(members);
    task.silenceRounds = {
      ...Object.fromEntries(task.members.map((member) => [member.id, task.silenceRounds[member.id] || 0])),
    };

    mergeTeaPartyMessages(task, normalizeTeaPartyMessages(messages, sessionId));
    mergeTeaPartyWhiteboardNotes(task, normalizeTeaPartyWhiteboardNotes(whiteboardNotes, sessionId));

    const normalizedUserMessage = normalizeTeaPartyMessage(
      userMessage as TeaPartyMessageInput,
      sessionId,
      req.user!.userId,
      '我'
    );
    if (!normalizedUserMessage) {
      res.status(400).json({ message: 'userMessage.content is required' });
      return;
    }
    mergeTeaPartyMessages(task, [normalizedUserMessage]);

    const mentionIds = getTeaPartyMentions(normalizedUserMessage.content, task.members).map((member) => member.id);
    task.pendingMentionIds = mergeUniqueIds(task.pendingMentionIds, mentionIds);
    task.updatedAt = new Date().toISOString();

    if (TEA_PARTY_STOP_PATTERN.test(normalizedUserMessage.content)) {
      task.stopRequested = true;
      task.active = false;
      task.runningAgents = [];
      pushTeaPartyRunLog(task, '茶话会', 'success', '话题已停止');
      res.json(serializeTeaPartyTask(task));
      return;
    }

    if (task.members.length === 0) {
      pushTeaPartyRunLog(task, '茶话会', 'error', '当前没有参会 Agent，已等待邀请成员');
      res.json(serializeTeaPartyTask(task));
      return;
    }

    if (!task.loopPromise) {
      task.round = 0;
      task.lastSpeakerIds = [];
      task.stopRequested = false;
      void runTeaPartySessionLoop(task).catch((error) => {
        console.error('Tea party session loop error:', error);
        task.active = false;
        task.runningAgents = [];
        task.loopPromise = undefined;
        pushTeaPartyRunLog(
          task,
          '茶话会',
          'error',
          error instanceof Error ? error.message : '茶话会后台任务异常'
        );
      });
    }

    res.json(serializeTeaPartyTask(task));
  } catch (error) {
    console.error('Tea party session message error:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : '茶话会后台任务启动失败',
    });
  }
});

// GET /api/agents/tea-party/sessions/:sessionId - Read backend tea-party task state
router.get('/tea-party/sessions/:sessionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const sessionId = String(req.params.sessionId || '').trim();
    if (!sessionId) {
      res.status(400).json({ message: 'sessionId is required' });
      return;
    }

    const task = teaPartyTasks.get(getTeaPartyTaskKey(userId, sessionId));
    res.json(task ? serializeTeaPartyTask(task) : emptyTeaPartyTaskState(sessionId));
  } catch (error) {
    console.error('Get tea party session error:', error);
    res.status(500).json({ message: '获取茶话会后台状态失败' });
  }
});

// POST /api/agents/tea-party/sessions/:sessionId/stop - Stop backend tea-party task
router.post('/tea-party/sessions/:sessionId/stop', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const sessionId = String(req.params.sessionId || '').trim();
    if (!sessionId) {
      res.status(400).json({ message: 'sessionId is required' });
      return;
    }

    const task = teaPartyTasks.get(getTeaPartyTaskKey(userId, sessionId));
    if (!task) {
      res.json(emptyTeaPartyTaskState(sessionId));
      return;
    }

    task.stopRequested = true;
    task.active = false;
    task.runningAgents = [];
    pushTeaPartyRunLog(task, '茶话会', 'success', '话题已停止');
    res.json(serializeTeaPartyTask(task));
  } catch (error) {
    console.error('Stop tea party session error:', error);
    res.status(500).json({ message: '停止茶话会后台任务失败' });
  }
});

// GET /api/agents/caves - Get user caves
// Keep this before /:id so "caves" is not treated as an agent id.
router.get('/caves', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const caves = await getUserCaves(userId);
    res.json({ caves });
  } catch (error) {
    console.error('Get caves error:', error);
    res.status(500).json({ message: '获取Agent窝失败' });
  }
});

// GET /api/agents - Get all user agents
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { caveId } = req.query;

    let agents;
    if (caveId === 'unassigned') {
      agents = await getUnassignedAgents(userId);
    } else if (caveId && typeof caveId === 'string') {
      agents = await getAgentsByCave(userId, caveId);
    } else {
      agents = await getUserAgents(userId);
    }

    const ownerUsername = getOwnerUsername(userId);
    const agentsWithMeta = await Promise.all(
      agents.map((agent) => withAgentCardMeta(agent, userId, ownerUsername))
    );

    res.json({ agents: agentsWithMeta });
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({ message: '获取Agent列表失败' });
  }
});

// POST /api/agents - Create a new agent
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, description, avatar, tags, manifest, sourceMarketAgentId, sourceVersion } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ message: '请提供Agent名称' });
      return;
    }

    const agent = await createAgent(userId, {
      name: name.trim(),
      description,
      avatar,
      tags,
      manifest,
      sourceMarketAgentId,
      sourceVersion,
    });

    res.status(201).json({ agent: await withAgentCardMeta(agent, userId) });
  } catch (error) {
    console.error('Create agent error:', error);
    res.status(500).json({ message: '创建Agent失败' });
  }
});

// POST /api/agents/official-lobster/adopt - Adopt a local copy of the fixed official Agent
router.post('/official-lobster/adopt', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const requestedName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const result = await adoptOfficialAgentToUser(userId, requestedName);

    if (!result.success || !result.agentId) {
      res.status(400).json({ message: result.error || '官方 Agent 领养失败' });
      return;
    }

    const agent = await getAgentByIdAndUser(result.agentId, userId);
    if (!agent) {
      res.status(500).json({ message: '官方 Agent 领养失败' });
      return;
    }

    res.status(201).json({ agent: await withAgentCardMeta(agent, userId) });
  } catch (error) {
    console.error('Adopt official agent error:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : '官方 Agent 领养失败' });
  }
});

// GET /api/agents/:id - Get a specific agent
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    const agent = await getAgentByIdAndUser(id, userId);
    if (!agent) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    res.json({ agent: await withAgentCardMeta(agent, userId) });
  } catch (error) {
    console.error('Get agent error:', error);
    res.status(500).json({ message: '获取Agent详情失败' });
  }
});

// PATCH /api/agents/:id - Update an agent
router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const { name, description, avatar, tags, status } = req.body;

    const agent = await updateAgent(id, userId, {
      name,
      description,
      avatar,
      tags,
      status,
    } as any);

    if (!agent) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    res.json({ agent: await withAgentCardMeta(agent, userId) });
  } catch (error) {
    if (error instanceof AgentProfileLockedError) {
      res.status(403).json({ message: error.message });
      return;
    }
    console.error('Update agent error:', error);
    res.status(500).json({ message: '更新Agent失败' });
  }
});

// POST /api/agents/:id/move - Move agent to/from cave
router.post('/:id/move', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const { caveId } = req.body; // null to remove from cave

    const success = await moveAgentToCave(id, userId, caveId || null);
    if (!success) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Move agent error:', error);
    res.status(500).json({ message: '移动Agent失败' });
  }
});

// POST /api/agents/:id/market - Publish a user agent to market
router.post('/:id/market', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const agent = await getAgentByIdAndUser(id, userId);

    if (!agent) {
      res.status(404).json({ message: 'Agent 不存在或无权访问' });
      return;
    }

    const result = await publishAgentToMarket(
      userId,
      id,
      agent.name,
      agent.description || '',
      parseAgentTags(agent.tags),
      'public'
    );

    if (!result.success) {
      res.status(400).json({ message: result.error || '发布到市场失败' });
      return;
    }

    res.json({ success: true, marketAgentId: result.marketAgentId });
  } catch (error) {
    console.error('Publish agent to market error:', error);
    res.status(500).json({ message: '发布到市场失败' });
  }
});

// DELETE /api/agents/:id/market - Remove a user agent from market
router.delete('/:id/market', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    const result = await unpublishAgentFromMarket(userId, id);
    if (!result.success) {
      res.status(404).json({ message: result.error || '下架市场 Agent 失败' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Unpublish agent from market error:', error);
    res.status(500).json({ message: '下架市场 Agent 失败' });
  }
});

// DELETE /api/agents/:id - Delete an agent
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    const success = await deleteAgent(id, userId);
    if (!success) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({ message: '删除Agent失败' });
  }
});

// PATCH /api/agents/:id/config - Update agent user config (API keys, model settings, etc.)
router.patch('/:id/config', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const config = req.body;

    const agent = await updateAgentConfig(id, userId, config);
    if (!agent) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    if (config.providerId !== undefined || config.model !== undefined) {
      await agentRunner.stopSessionsByAgentId(id);
    }

    res.json({ success: true, agent: await withAgentCardMeta(agent, userId) });
  } catch (error) {
    if (error instanceof AgentProfileLockedError) {
      res.status(403).json({ message: error.message });
      return;
    }
    console.error('Update agent config error:', error);
    res.status(500).json({ message: '更新Agent配置失败' });
  }
});

// POST /api/agents/:id/avatar - Upload agent avatar
router.post('/:id/avatar', upload.single('avatar'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    // Get avatar file from multipart form
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: '请上传头像文件' });
      return;
    }

    const result = await uploadAgentAvatar(id, userId, file);
    if (!result) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    res.json({ success: true, avatarUrl: result.avatarUrl });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ message: '上传头像失败' });
  }
});

// POST /api/agents/:id/avatar/generate - Reserved shell for future AI avatar generation
router.post('/:id/avatar/generate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const agent = await getAgentByIdAndUser(id, userId);

    if (!agent) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    res.status(501).json({
      message: 'AI 头像生成功能即将接入固定 Agent 服务，当前为预留接口。',
      reserved: true,
    });
  } catch (error) {
    console.error('Generate avatar shell error:', error);
    res.status(500).json({ message: 'AI 头像接口预留失败' });
  }
});

// POST /api/agents/:id/chat-assets - Upload a chat image into the agent workspace
router.post('/:id/chat-assets', chatImageUpload.single('image'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const file = req.file;

    if (!file) {
      res.status(400).json({ message: 'Please upload an image file' });
      return;
    }

    if (!file.mimetype.startsWith('image/')) {
      res.status(400).json({ message: 'Only image uploads are supported' });
      return;
    }

    const agent = await getAgentByIdAndUser(id, userId);
    if (!agent) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }

    const safeFilename = sanitizeChatAssetName(file.originalname);
    const finalFilename = `${Date.now()}-${safeFilename}`;
    const workspaceRoot = resolveStoredPath(agent.workspacePath);
    const assetDir = path.join(workspaceRoot, '.chat-assets');
    fs.mkdirSync(assetDir, { recursive: true });

    const assetPath = path.join(assetDir, finalFilename);
    fs.writeFileSync(assetPath, file.buffer);

    res.status(201).json({
      success: true,
      asset: {
        filename: finalFilename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        relativePath: `.chat-assets/${finalFilename}`.replace(/\\/g, '/'),
        previewUrl: `${getPublicBackendUrl(req)}/api/agents/${id}/chat-assets/${encodeURIComponent(finalFilename)}`,
      },
    });
  } catch (error) {
    console.error('Upload chat asset error:', error);
    res.status(500).json({ message: 'Failed to upload chat image' });
  }
});

// GET /api/agents/:id/skills - List SKILL.md files from this agent workspace
router.get('/:id/skills', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    const skills = await listAgentSkills(id, userId);
    if (!skills) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }

    res.json({ skills });
  } catch (error) {
    console.error('List agent skills error:', error);
    res.status(500).json({ message: 'Failed to list agent skills' });
  }
});

// POST /api/agents/:id/skills - Upload a SKILL.md/.md file or zip containing skills
router.post('/:id/skills', skillUpload.single('skill'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const { name } = req.body;
    const file = req.file;

    if (!file) {
      res.status(400).json({ message: 'Please upload a skill file' });
      return;
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !['md', 'zip'].includes(extension)) {
      res.status(400).json({ message: 'Please upload a SKILL.md, .md, or .zip file' });
      return;
    }

    const result = await uploadAgentSkill(
      id,
      userId,
      file,
      typeof name === 'string' ? name : undefined
    );

    if (!result) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }

    res.status(201).json({ success: true, ...result });
  } catch (error) {
    console.error('Upload agent skill error:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to upload skill',
    });
  }
});

// ==================== CAVES ====================

// POST /api/caves - Create a new cave
router.post('/caves', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, color } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ message: '请提供窝名称' });
      return;
    }

    const cave = await createCave(userId, name.trim(), color || '#3b82f6');
    res.status(201).json({ cave });
  } catch (error) {
    console.error('Create cave error:', error);
    res.status(500).json({ message: '创建Agent窝失败' });
  }
});

// PATCH /api/caves/:id - Update a cave
router.patch('/caves/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const { name, color } = req.body;

    const cave = await updateCave(id, userId, { name, color } as any);
    if (!cave) {
      res.status(404).json({ message: 'Agent窝不存在' });
      return;
    }

    res.json({ cave });
  } catch (error) {
    console.error('Update cave error:', error);
    res.status(500).json({ message: '更新Agent窝失败' });
  }
});

// DELETE /api/caves/:id - Delete a cave
router.delete('/caves/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    const success = await deleteCave(id, userId);
    if (!success) {
      res.status(404).json({ message: 'Agent窝不存在' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete cave error:', error);
    res.status(500).json({ message: '删除Agent窝失败' });
  }
});

// POST /api/agents/:id/test - Test agent with provider config
router.post('/:id/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const agentId = String(req.params.id);

    const agent = await getAgentByIdAndUser(agentId, userId);
    if (!agent) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    let providerConfig: { apiKey: string; baseUrl?: string; models?: string[] } | undefined;
    const agentConfig = readAgentUserConfig(agent);
    const selectedModel = typeof agentConfig.model === 'string' ? agentConfig.model : undefined;

    if (agent.providerId) {
      const provider = await getProviderById(String(agent.providerId), userId);
      if (provider) {
        providerConfig = {
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl || undefined,
          models: preferSelectedModel(parseProviderModels(provider.models), selectedModel),
        };
      }
    }

    // Check if CLI is available
    const manifest = JSON.parse(agent.manifest || '{}');
    const platform = manifest?.entrypoint?.type || 'openclaw';
    const cliCheck = platform === 'coze'
      ? {
          available: getCozeRuntimeInfo().configured,
          version: getCozeRuntimeInfo().configured ? 'Coze Chat API v3' : 'COZE_API_TOKEN not configured',
        }
      : await agentRunner.checkCliAvailable(platform as any);

    res.json({
      agent: {
        id: agent.id,
        name: agent.name,
        platform,
      },
      provider: providerConfig ? {
        hasApiKey: true,
        apiKeyPrefix: providerConfig.apiKey.substring(0, 8) + '...',
        baseUrl: providerConfig.baseUrl || 'default',
        modelCount: providerConfig.models?.length || 0,
      } : null,
      cli: cliCheck,
    });
  } catch (error) {
    console.error('Test agent error:', error);
    res.status(500).json({ message: '测试失败' });
  }
});

export default router;
