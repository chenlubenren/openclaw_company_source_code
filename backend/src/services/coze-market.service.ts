import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getRawDb } from '../db/index.js';
import type { UserAgentInstance } from '../db/schema.js';
import {
  cloneDirectory,
  deleteDirectory,
  generateAgentKey,
  getAgentBaselinePath,
  getAgentWorkspacePath,
} from './workspace.service.js';

export interface CozeMarketAgent {
  id: string;
  botId: string;
  name: string;
  description: string;
  icon: string;
  coverImage?: string;
  tags: string[];
  category: string;
  creator: string;
  rating: number;
  deployCount: number;
  sourceUrl: string;
  featured?: boolean;
}

export interface CozeChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ExecuteCozeTurnInput {
  userId: string;
  message: string;
  conversationId?: string;
  history?: CozeChatHistoryMessage[];
}

const FALLBACK_COZE_AGENTS: CozeMarketAgent[] = [
  {
    id: 'coze-writing-companion',
    botId: 'replace-with-coze-writing-bot-id',
    name: 'Coze 内容策划助手',
    description: '适合选题、短文案、社媒脚本和内容结构整理的 Coze Bot。请在 COZE_MARKET_BOTS 中替换为真实热门 Bot ID。',
    icon: '/lobsters/market-red-hood.png',
    tags: ['Coze', '内容', '写作'],
    category: '内容创作',
    creator: 'Coze',
    rating: 4.8,
    deployCount: 12800,
    sourceUrl: 'https://www.coze.com',
    featured: true,
  },
  {
    id: 'coze-research-analyst',
    botId: 'replace-with-coze-research-bot-id',
    name: 'Coze 研究分析助手',
    description: '面向资料整理、竞品分析和观点提炼的 Coze Bot 示例。上线前请配置真实 Bot ID 与介绍。',
    icon: '/lobsters/market-research-cat.png',
    tags: ['Coze', '研究', '分析'],
    category: '研究分析',
    creator: 'Coze',
    rating: 4.7,
    deployCount: 9600,
    sourceUrl: 'https://www.coze.com',
    featured: true,
  },
  {
    id: 'coze-coding-helper',
    botId: 'replace-with-coze-coding-bot-id',
    name: 'Coze 代码助手',
    description: '用于代码问答、调试思路和实现拆解的 Coze Bot 示例。真实热门 Bot 通过环境变量注入。',
    icon: '/lobsters/market-code-hero.png',
    tags: ['Coze', '代码', '工程'],
    category: '工程效率',
    creator: 'Coze',
    rating: 4.6,
    deployCount: 8400,
    sourceUrl: 'https://www.coze.com',
  },
];

function normalizeCozeApiBase(): string {
  return (process.env.COZE_API_BASE || 'https://api.coze.com').trim().replace(/\/+$/, '');
}

export function isCozeRuntimeConfigured(): boolean {
  return Boolean(getCozeApiToken());
}

export function getCozeRuntimeInfo(): { apiBase: string; configured: boolean } {
  return {
    apiBase: normalizeCozeApiBase(),
    configured: isCozeRuntimeConfigured(),
  };
}

function getCozeApiToken(): string {
  return (
    process.env.COZE_API_TOKEN ||
    process.env.COZE_PAT ||
    process.env.COZE_BEARER_TOKEN ||
    ''
  ).trim();
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCatalogAgent(raw: unknown, index: number): CozeMarketAgent | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const botId = asString(record.botId ?? record.bot_id);
  if (!botId) return null;

  const name = asString(record.name, `Coze Bot ${index + 1}`);
  const id = asString(record.id, `coze-${botId}`.replace(/[^A-Za-z0-9_-]+/g, '-'));

  return {
    id,
    botId,
    name,
    description: asString(record.description, '来自 Coze 的跨平台 Bot。'),
    icon: asString(record.icon ?? record.avatar, '/lobsters/lobster-merchant.png'),
    coverImage: asString(record.coverImage ?? record.cover_image),
    tags: asTags(record.tags),
    category: asString(record.category, 'Coze'),
    creator: asString(record.creator ?? record.author, 'Coze'),
    rating: asNumber(record.rating, 4.5),
    deployCount: asNumber(record.deployCount ?? record.deploy_count ?? record.downloadCount, 0),
    sourceUrl: asString(record.sourceUrl ?? record.source_url, `https://www.coze.com/store/bot/${botId}`),
    featured: Boolean(record.featured),
  };
}

function loadConfiguredCatalog(): CozeMarketAgent[] {
  const raw = process.env.COZE_MARKET_BOTS;
  if (!raw?.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeCatalogAgent)
      .filter((agent): agent is CozeMarketAgent => Boolean(agent));
  } catch (error) {
    console.error('Failed to parse COZE_MARKET_BOTS:', error);
    return [];
  }
}

function getCatalog(): CozeMarketAgent[] {
  const configured = loadConfiguredCatalog();
  return configured.length > 0 ? configured : FALLBACK_COZE_AGENTS;
}

export function listCozeMarketAgents(options: {
  search?: string;
  category?: string;
  limit?: number;
} = {}): CozeMarketAgent[] {
  const search = options.search?.trim().toLowerCase();
  const category = options.category?.trim().toLowerCase();
  const limit = Math.min(Math.max(options.limit || 50, 1), 100);

  return getCatalog()
    .filter((agent) => {
      const matchesSearch = !search || [
        agent.name,
        agent.description,
        agent.creator,
        agent.category,
        ...agent.tags,
      ].some((value) => value.toLowerCase().includes(search));

      const matchesCategory = !category || agent.category.toLowerCase() === category;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.deployCount - a.deployCount || b.rating - a.rating)
    .slice(0, limit);
}

export function getCozeMarketAgent(botId: string): CozeMarketAgent | null {
  const decodedBotId = decodeURIComponent(botId);
  return getCatalog().find((agent) => agent.botId === decodedBotId || agent.id === decodedBotId) || null;
}

function buildCozeManifest(agent: CozeMarketAgent): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    name: agent.name,
    description: agent.description,
    source: {
      type: 'coze',
      botId: agent.botId,
      url: agent.sourceUrl,
    },
    entrypoint: {
      type: 'coze',
      botId: agent.botId,
      apiBase: normalizeCozeApiBase(),
    },
    runtime: {
      provider: 'coze',
      api: 'chat-v3',
      auth: 'server-env',
    },
    metadata: {
      creator: agent.creator,
      category: agent.category,
      tags: agent.tags,
    },
  };
}

export async function deployCozeAgentToUser(
  userId: string,
  botId: string
): Promise<{ success: boolean; agentId?: string; error?: string }> {
  const cozeAgent = getCozeMarketAgent(botId);
  if (!cozeAgent) {
    return { success: false, error: 'Coze Agent 不存在或尚未配置到跨次元市场' };
  }

  const db = getRawDb();
  const now = Date.now();
  const agentId = crypto.randomUUID().replace(/-/g, '');
  const workspacePath = getAgentWorkspacePath(userId, agentId);
  const baselinePath = getAgentBaselinePath(userId, agentId);
  const agentRoot = path.dirname(workspacePath);
  const manifest = buildCozeManifest(cozeAgent);

  try {
    fs.writeFileSync(
      path.join(workspacePath, 'agent.manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(workspacePath, 'README.md'),
      [
        `# ${cozeAgent.name}`,
        '',
        'This agent is backed by a Coze Bot API.',
        '',
        `- Coze bot id: ${cozeAgent.botId}`,
        `- Source: ${cozeAgent.sourceUrl}`,
        '- Runtime token: configured on the backend with COZE_API_TOKEN',
      ].join('\n'),
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
      null,
      `coze:${cozeAgent.botId}`,
      cozeAgent.name,
      cozeAgent.description,
      '/lobsters/lobster-merchant.png',
      generateAgentKey(),
      workspacePath,
      path.join(workspacePath, '.openclaw'),
      baselinePath,
      'idle',
      JSON.stringify(manifest),
      JSON.stringify(['coze', 'cross-dimensional', ...cozeAgent.tags]),
      null,
      null,
      0,
      0,
      null,
      now,
      now
    );

    return { success: true, agentId };
  } catch (error) {
    deleteDirectory(agentRoot);
    console.error('Failed to deploy Coze agent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '部署 Coze Agent 失败',
    };
  }
}

function parseManifest(manifestJson?: string): Record<string, unknown> {
  if (!manifestJson) return {};
  try {
    const parsed = JSON.parse(manifestJson);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function getNestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function getCozeBotIdFromAgent(agent: Pick<UserAgentInstance, 'manifest'>): string | null {
  const manifest = parseManifest(agent.manifest);
  const entrypoint = getNestedRecord(manifest.entrypoint);
  const source = getNestedRecord(manifest.source);
  const metadata = getNestedRecord(manifest.metadata);
  const candidates = [
    entrypoint?.botId,
    entrypoint?.bot_id,
    source?.botId,
    source?.bot_id,
    metadata?.cozeBotId,
    metadata?.coze_bot_id,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function buildCozeMessages(input: ExecuteCozeTurnInput): Array<Record<string, string>> {
  const history = (input.history || [])
    .filter((message) => message.role === 'user' && message.content.trim())
    .slice(-18)
    .map((message) => ({
      role: 'user',
      content: message.content,
      content_type: 'text',
    }));

  const hasCurrentUserMessage = history.some(
    (message) => message.role === 'user' && message.content.trim() === input.message.trim()
  );

  if (!hasCurrentUserMessage) {
    history.push({
      role: 'user',
      content: input.message,
      content_type: 'text',
    });
  }

  return history;
}

function extractStringField(value: unknown, keys: string[]): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (!value || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractStringField(item, keys);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === 'string' && direct.trim()) return direct;
    const nested = extractStringField(direct, keys);
    if (nested) return nested;
  }

  for (const nested of Object.values(record)) {
    const found = extractStringField(nested, keys);
    if (found) return found;
  }

  return null;
}

function extractCozeTextFromJson(payload: unknown): string {
  const text = extractStringField(payload, [
    'answer',
    'content',
    'text',
    'message',
    'reply',
    'response',
    'output',
  ]);
  return text?.trim() || '';
}

function extractCozeTextFromSse(rawText: string): string {
  const chunks: string[] = [];
  const completed: string[] = [];
  let currentEvent = '';
  let failedMessage = '';

  for (const line of rawText.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice('event:'.length).trim();
      continue;
    }
    if (!line.startsWith('data:')) continue;

    const data = line.slice('data:'.length).trim();
    if (!data || data === '[DONE]') continue;

    try {
      const parsed = JSON.parse(data);
      const content = extractCozeTextFromJson(parsed);
      if (currentEvent.includes('failed') || currentEvent.includes('error')) {
        failedMessage = content || JSON.stringify(parsed);
      } else if (currentEvent.includes('delta')) {
        if (content) chunks.push(content);
      } else if (currentEvent.includes('message.completed')) {
        if (content) completed.push(content);
      }
    } catch {
      if (currentEvent.includes('delta')) chunks.push(data);
    }
  }

  if (failedMessage) {
    throw new Error(failedMessage);
  }
  return (chunks.join('') || completed.join('\n')).trim();
}

export async function executeCozeAgentTurn(
  agent: Pick<UserAgentInstance, 'id' | 'manifest'>,
  input: ExecuteCozeTurnInput
): Promise<string> {
  const token = getCozeApiToken();
  if (!token) {
    throw new Error('Coze 后端令牌未配置。请在 backend/.env 中设置 COZE_API_TOKEN。');
  }

  const botId = getCozeBotIdFromAgent(agent);
  if (!botId) {
    throw new Error('当前 Agent 缺少 Coze botId，无法调用 Coze API。');
  }

  const response = await fetch(`${normalizeCozeApiBase()}/v3/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
    },
    body: JSON.stringify({
      bot_id: botId,
      user_id: input.userId,
      stream: true,
      auto_save_history: true,
      additional_messages: buildCozeMessages(input),
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    let detail = rawText;
    try {
      detail = extractCozeTextFromJson(JSON.parse(rawText)) || rawText;
    } catch {
      // Keep raw response text.
    }
    throw new Error(detail || `Coze API request failed with ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  let content = '';
  if (contentType.includes('text/event-stream') || rawText.includes('event:')) {
    content = extractCozeTextFromSse(rawText);
  } else {
    try {
      content = extractCozeTextFromJson(JSON.parse(rawText));
    } catch {
      content = rawText.trim();
    }
  }

  if (!content) {
    throw new Error('Coze API 没有返回可展示的回复内容。');
  }

  return content;
}
