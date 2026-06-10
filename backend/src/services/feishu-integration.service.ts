import crypto from 'crypto';
import path from 'path';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { conversations, feishuIntegrations, type Message, type UserAgentInstance } from '../db/schema.js';
import { agentRunner, type AgentPlatform, type ProviderConfig } from './agent-runner.service.js';
import {
  addMessage,
  createConversation,
  getAgentById,
  getAgentByIdAndUser,
  getConversationMessages,
  readAgentUserConfig,
} from './agent.service.js';
import { getArchitecture, getArchitectureByIdAnyUser } from './architecture.service.js';
import { buildAgentRuntimePrompt } from './agent-runtime-context.service.js';
import { executeCozeAgentTurn } from './coze-market.service.js';
import { getProviderById } from './provider.service.js';
import { workflowExecutor, type WorkflowDsl, type WorkflowExecution } from './workflow-executor.service.js';

export type FeishuIntegrationScope = 'agent' | 'team';

type RuntimeAgentPlatform = AgentPlatform | 'coze';

export interface FeishuWebhookInfo {
  scope: FeishuIntegrationScope;
  subjectId: string;
  subjectName: string;
  webhookUrl: string;
  backendBaseUrl: string;
  token: string;
  envStatus: {
    appIdConfigured: boolean;
    appSecretConfigured: boolean;
    verificationTokenConfigured: boolean;
    webhookSecretConfigured: boolean;
    publicBackendConfigured: boolean;
  };
}

export interface FeishuWebhookResult {
  accepted?: boolean;
  ignored?: boolean;
  challenge?: string;
  reason?: string;
}

export class FeishuIntegrationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface FeishuEventContext {
  scope: FeishuIntegrationScope;
  subjectId: string;
  body: Record<string, unknown>;
  eventType: string;
  eventId: string;
  messageId: string;
  chatId: string;
  senderId: string;
  text: string;
}

interface TenantTokenCache {
  token: string;
  expiresAt: number;
}

const SUPPORTED_PLATFORMS: RuntimeAgentPlatform[] = ['claude-code', 'openclaw', 'codex', 'hermes', 'opencode', 'coze'];
const processedEvents = new Map<string, number>();
const tenantTokenCache = new Map<string, TenantTokenCache>();

export async function getFeishuWebhookInfo(
  userId: string,
  scope: FeishuIntegrationScope,
  subjectId: string
): Promise<FeishuWebhookInfo | null> {
  const subjectName = await resolveSubjectNameForUser(userId, scope, subjectId);
  if (!subjectName) return null;

  const backendBaseUrl = getPublicBackendBaseUrl();

  // Look up per-config to use custom webhookSecret if available
  const db = getDb();
  const config = db
    .select()
    .from(feishuIntegrations)
    .where(
      and(
        eq(feishuIntegrations.userId, userId),
        eq(feishuIntegrations.scope, scope),
        eq(feishuIntegrations.subjectId, subjectId)
      )
    )
    .get();

  const token = createWebhookToken(scope, subjectId, config?.webhookSecret?.trim() || undefined);

  // Prefer per-config credentials over global env
  const appId = config?.appId?.trim() || getFeishuAppId();
  const appSecret = config?.appSecret?.trim() || getFeishuAppSecret();
  const verificationToken = config?.verificationToken?.trim() || getFeishuVerificationToken();

  return {
    scope,
    subjectId,
    subjectName,
    webhookUrl: `${backendBaseUrl}/api/integrations/feishu/${scope}/${encodeURIComponent(subjectId)}/${token}`,
    backendBaseUrl,
    token,
    envStatus: {
      appIdConfigured: Boolean(appId),
      appSecretConfigured: Boolean(appSecret),
      verificationTokenConfigured: Boolean(verificationToken),
      webhookSecretConfigured: Boolean(config?.webhookSecret?.trim() || process.env.FEISHU_WEBHOOK_SECRET?.trim()),
      publicBackendConfigured: Boolean(getConfiguredPublicBackendBaseUrl()),
    },
  };
}

export async function acceptFeishuWebhook(
  scope: FeishuIntegrationScope,
  subjectId: string,
  token: string,
  body: unknown
): Promise<FeishuWebhookResult> {
  // Look up per-agent/team config first (subjectId is globally unique)
  const db = getDb();
  const config = db
    .select()
    .from(feishuIntegrations)
    .where(
      and(
        eq(feishuIntegrations.scope, scope),
        eq(feishuIntegrations.subjectId, subjectId)
      )
    )
    .get();

  // Validate token using per-config webhookSecret if available
  const webhookSecret = config?.webhookSecret?.trim() || undefined;
  if (!isValidWebhookToken(scope, subjectId, token, webhookSecret)) {
    throw new FeishuIntegrationError(403, '飞书回调地址 token 无效');
  }

  const payload = asRecord(body);
  if (!payload) {
    throw new FeishuIntegrationError(400, '飞书回调体格式无效');
  }

  if (typeof payload.encrypt === 'string' && payload.encrypt.trim()) {
    throw new FeishuIntegrationError(400, '当前接入暂不启用飞书事件加密，请在飞书后台将 Encrypt Key 留空后重试');
  }

  // Use per-config verification token if available
  if (config?.verificationToken) {
    const actual = getString(payload.token) || getNestedString(payload, ['header', 'token']);
    if (actual !== config.verificationToken) {
      throw new FeishuIntegrationError(401, '飞书 Verification Token 校验失败');
    }
  } else {
    verifyFeishuCallbackToken(payload);
  }

  const challenge = getString(payload.challenge);
  if (challenge) {
    return { challenge };
  }

  const context = buildEventContext(scope, subjectId, payload);
  if (!context) {
    return { ignored: true, reason: '非文本消息事件或事件结构未匹配' };
  }

  if (isProcessedEvent(context.eventId || context.messageId)) {
    return { accepted: true, reason: 'duplicate' };
  }

  // Optional chatId filter
  if (config?.chatId && context.chatId !== config.chatId) {
    return { ignored: true, reason: 'chatId 不匹配，当前配置仅监听指定群聊' };
  }

  void processFeishuMessage(context, config).catch((error: unknown) => {
    console.error('Feishu message processing failed:', error);
  });

  return { accepted: true };
}

function getConfiguredPublicBackendBaseUrl(): string {
  return (
    process.env.FEISHU_PUBLIC_BASE_URL ||
    process.env.PUBLIC_BACKEND_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    ''
  ).trim();
}

function getPublicBackendBaseUrl(): string {
  const configured = getConfiguredPublicBackendBaseUrl();
  const fallback = `http://localhost:${process.env.PORT || 3002}`;
  return (configured || fallback).replace(/\/+$/, '');
}

function getWebhookSecret(): string {
  return (
    process.env.FEISHU_WEBHOOK_SECRET ||
    process.env.JWT_SECRET ||
    process.env.FEISHU_APP_SECRET ||
    'fallback-secret-change-in-production'
  );
}

function createWebhookToken(scope: FeishuIntegrationScope, subjectId: string, secret?: string): string {
  return crypto
    .createHmac('sha256', secret || getWebhookSecret())
    .update(`${scope}:${subjectId}`)
    .digest('base64url')
    .slice(0, 32);
}

function isValidWebhookToken(scope: FeishuIntegrationScope, subjectId: string, token: string, secret?: string): boolean {
  const expected = createWebhookToken(scope, subjectId, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(token || '');
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

async function resolveSubjectNameForUser(
  userId: string,
  scope: FeishuIntegrationScope,
  subjectId: string
): Promise<string | null> {
  if (scope === 'agent') {
    const agent = await getAgentByIdAndUser(subjectId, userId);
    return agent?.name || null;
  }

  const architecture = await getArchitecture(userId, subjectId);
  return architecture?.name || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return asRecord(value);
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getNestedString(record: Record<string, unknown> | null, keys: string[]): string {
  let cursor: unknown = record;
  for (const key of keys) {
    const next = getRecord(cursor)?.[key];
    cursor = next;
  }
  return getString(cursor);
}

function verifyFeishuCallbackToken(payload: Record<string, unknown>): void {
  const expected = getFeishuVerificationToken();
  if (!expected) return;

  const actual = getString(payload.token) || getNestedString(payload, ['header', 'token']);
  if (actual !== expected) {
    throw new FeishuIntegrationError(401, '飞书 Verification Token 校验失败');
  }
}

function buildEventContext(
  scope: FeishuIntegrationScope,
  subjectId: string,
  body: Record<string, unknown>
): FeishuEventContext | null {
  const header = getRecord(body.header);
  const event = getRecord(body.event);
  const message = getRecord(event?.message);
  const eventType = getString(header?.event_type) || getString(body.type);

  if (eventType && eventType !== 'im.message.receive_v1') {
    return null;
  }
  if (!event || !message) return null;

  const text = extractTextMessage(message);
  if (!text) return null;

  const sender = getRecord(event.sender);
  const senderId = getNestedString(sender, ['sender_id', 'open_id']) ||
    getNestedString(sender, ['sender_id', 'user_id']) ||
    getString(sender?.sender_type);
  const chatId = getString(message.chat_id) || senderId || 'feishu-chat';
  const messageId = getString(message.message_id);

  return {
    scope,
    subjectId,
    body,
    eventType: eventType || 'im.message.receive_v1',
    eventId: getString(header?.event_id) || messageId || crypto.randomUUID(),
    messageId,
    chatId,
    senderId,
    text,
  };
}

function extractTextMessage(message: Record<string, unknown>): string {
  const messageType = getString(message.message_type);
  if (messageType && messageType !== 'text') return '';

  const rawContent = getString(message.content);
  if (!rawContent) return '';

  try {
    const parsed = JSON.parse(rawContent);
    const text = getString(getRecord(parsed)?.text);
    return text.replace(/\s+/g, ' ').trim();
  } catch {
    return rawContent.replace(/\s+/g, ' ').trim();
  }
}

function isProcessedEvent(eventId: string): boolean {
  const now = Date.now();
  for (const [key, timestamp] of processedEvents) {
    if (now - timestamp > 10 * 60 * 1000) {
      processedEvents.delete(key);
    }
  }
  if (!eventId) return false;
  if (processedEvents.has(eventId)) return true;
  processedEvents.set(eventId, now);
  return false;
}

async function processFeishuMessage(
  context: FeishuEventContext,
  config?: typeof feishuIntegrations.$inferSelect
): Promise<void> {
  if (context.scope === 'agent') {
    await processAgentMessage(context, config);
    return;
  }

  await processTeamMessage(context, config);
}

async function processAgentMessage(
  context: FeishuEventContext,
  config?: typeof feishuIntegrations.$inferSelect
): Promise<void> {
  const agent = await getAgentById(context.subjectId);
  if (!agent) {
    await tryReply(context.messageId, '当前 Agent 不存在，无法处理飞书消息。', config);
    return;
  }

  const userId = agent.userId;
  const sessionKey = buildFeishuSessionKey(context);
  const conversation = await getOrCreateFeishuConversation(
    userId,
    agent.id,
    sessionKey,
    `飞书 - ${agent.name}`
  );
  const previousMessages = await getConversationMessages(conversation.id, userId);
  const runtime = await resolveAgentRuntime(agent, userId);

  await addMessage(conversation.id, 'user', context.text, {
    source: 'feishu',
    scope: context.scope,
    messageId: context.messageId,
    chatId: context.chatId,
  });

  try {
    const runtimePrompt = buildAgentRuntimePrompt(agent, {
      userMessage: context.text,
      mode: 'direct-chat',
      platform: runtime.platform,
      providerConfig: runtime.providerConfig,
      extraInstructions: [
        'This message came from a Feishu remote conversation.',
        `Feishu message id: ${context.messageId || 'unknown'}`,
        `OpenClaw conversation id: ${conversation.id}`,
        ...formatRecentConversationInstructions(previousMessages),
      ],
    });
    const response = runtime.platform === 'coze'
      ? await executeCozeAgentTurn(agent, {
          userId,
          conversationId: conversation.id,
          message: runtimePrompt,
          history: previousMessages
            .filter((message) => message.role === 'user' || message.role === 'assistant')
            .slice(-18)
            .map((message) => ({
              role: message.role as 'user' | 'assistant',
              content: message.content,
            })),
        })
      : await agentRunner.executeMessage(
          agent.id,
          runtime.platform,
          agent.workspacePath,
          runtimePrompt,
          runtime.providerConfig,
          getNumberEnv('FEISHU_AGENT_TIMEOUT_MS', 300000)
        );

    await addMessage(conversation.id, 'assistant', response, {
      source: 'feishu',
      scope: context.scope,
      messageId: context.messageId,
      chatId: context.chatId,
    });
    await tryReply(context.messageId, response, config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await addMessage(conversation.id, 'system', message, {
      source: 'feishu',
      scope: context.scope,
      outputType: 'error',
    });
    await tryReply(context.messageId, `Agent 执行失败：${message}`, config);
  }
}

async function processTeamMessage(
  context: FeishuEventContext,
  config?: typeof feishuIntegrations.$inferSelect
): Promise<void> {
  const resolved = await getArchitectureByIdAnyUser(context.subjectId);
  if (!resolved) {
    await tryReply(context.messageId, '当前团队不存在，无法处理飞书消息。', config);
    return;
  }

  const { architecture, userId } = resolved;
  if (!isWorkflowDsl(architecture.workflowDsl)) {
    await tryReply(context.messageId, '当前团队还没有可执行的 Workflow DSL，请先在团队画布中保存架构。', config);
    return;
  }

  await tryReply(context.messageId, `已收到，团队「${architecture.name}」开始处理：${context.text}`, config);

  try {
    const execution = await workflowExecutor.start({
      userId,
      architectureId: architecture.id,
      workflowDsl: architecture.workflowDsl,
      task: context.text,
      dryRun: process.env.FEISHU_TEAM_DRY_RUN === '1',
    });
    const finalExecution = await waitForWorkflowCompletion(
      userId,
      execution.id,
      getNumberEnv('FEISHU_TEAM_TIMEOUT_MS', 600000)
    );

    if (!finalExecution) {
      await tryReply(
        context.messageId,
        `团队任务仍在执行中。执行 ID：${execution.id}，可回到平台的团队详情页查看进度。`,
        config
      );
      return;
    }

    await tryReply(context.messageId, formatWorkflowReply(architecture.name, finalExecution), config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await tryReply(context.messageId, `团队执行失败：${message}`);
  }
}

async function getOrCreateFeishuConversation(
  userId: string,
  agentId: string,
  sessionKey: string,
  title: string
) {
  const db = getDb();
  const existing = db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        eq(conversations.agentInstanceId, agentId),
        eq(conversations.sessionId, sessionKey)
      )
    )
    .get();

  if (existing) return existing;
  return createConversation(userId, agentId, title, sessionKey);
}

function buildFeishuSessionKey(context: FeishuEventContext): string {
  const source = [context.scope, context.subjectId, context.chatId, context.senderId].filter(Boolean).join(':');
  return `feishu_${crypto.createHash('sha256').update(source).digest('hex').slice(0, 28)}`;
}

async function resolveAgentRuntime(
  agent: UserAgentInstance,
  userId: string
): Promise<{ platform: RuntimeAgentPlatform; providerConfig?: ProviderConfig }> {
  const config = readAgentUserConfig(agent);
  const platform = normalizeAgentPlatform(config.platform || getPlatformFromManifest(agent.manifest) || 'openclaw');
  const providerId = config.providerId ?? agent.providerId ?? null;
  if (!providerId) return { platform };

  const provider = await getProviderById(providerId, userId);
  if (!provider) return { platform };

  const models = parseProviderModels(provider.models);
  const selectedModel = typeof config.model === 'string' && config.model.trim()
    ? config.model.trim()
    : undefined;

  return {
    platform,
    providerConfig: {
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl || undefined,
      models: selectedModel
        ? [selectedModel, ...models.filter((model) => model !== selectedModel)]
        : models,
      stateDir: agent.stateDir ? path.join(agent.stateDir, 'feishu') : undefined,
      providerType: provider.type,
    },
  };
}

function getPlatformFromManifest(manifestJson?: string): string | null {
  if (!manifestJson) return null;
  try {
    const manifest = JSON.parse(manifestJson);
    return typeof manifest?.entrypoint?.type === 'string' ? manifest.entrypoint.type : null;
  } catch {
    return null;
  }
}

function normalizeAgentPlatform(value: string): RuntimeAgentPlatform {
  return SUPPORTED_PLATFORMS.includes(value as RuntimeAgentPlatform)
    ? value as RuntimeAgentPlatform
    : 'openclaw';
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

function formatRecentConversationInstructions(messages: Message[]): string[] {
  const recent = messages
    .filter((message) => message.content.trim())
    .slice(-12)
    .map((message) => `${message.role}: ${message.content.replace(/\s+/g, ' ').slice(0, 600)}`);

  if (recent.length === 0) return [];
  return [
    'Recent Feishu conversation history follows. Use it only as conversational context:',
    recent.join('\n'),
  ];
}

function isWorkflowDsl(value: unknown): value is WorkflowDsl {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.schemaVersion === '1.0' &&
    typeof row.name === 'string' &&
    typeof row.entryNodeId === 'string' &&
    Array.isArray(row.nodes) &&
    Array.isArray(row.edges) &&
    Boolean(row.execution && typeof row.execution === 'object');
}

async function waitForWorkflowCompletion(
  userId: string,
  executionId: string,
  timeoutMs: number
): Promise<WorkflowExecution | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const execution = workflowExecutor.get(executionId, userId);
    if (execution && ['succeeded', 'failed', 'cancelled'].includes(execution.status)) {
      return execution;
    }
    await sleep(1200);
  }
  return null;
}

function formatWorkflowReply(teamName: string, execution: WorkflowExecution): string {
  const lines = [
    `团队「${teamName}」执行${execution.status === 'succeeded' ? '完成' : '结束'}。`,
    `状态：${execution.status}`,
  ];

  if (execution.finalOutput?.trim()) {
    lines.push('', truncateReplyText(execution.finalOutput.trim(), 2400));
  }

  if (execution.error) {
    lines.push('', `错误：${execution.error}`);
  }

  const artifacts = execution.artifacts.slice(0, 8);
  if (artifacts.length > 0) {
    lines.push('', '生成的文件：');
    for (const artifact of artifacts) {
      lines.push(`- ${artifact.relativePath || artifact.path}`);
    }
  }

  lines.push('', `执行 ID：${execution.id}`);
  return lines.join('\n');
}

async function tryReply(
  messageId: string,
  text: string,
  config?: typeof feishuIntegrations.$inferSelect
): Promise<void> {
  if (!messageId) return;
  try {
    await sendFeishuReply(messageId, text, config);
  } catch (error) {
    console.error('Failed to reply Feishu message:', error);
  }
}

async function sendFeishuReply(
  messageId: string,
  text: string,
  config?: typeof feishuIntegrations.$inferSelect
): Promise<void> {
  const token = config
    ? await getTenantAccessToken(config.appId, config.appSecret)
    : await getTenantAccessToken();
  const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      msg_type: 'text',
      content: JSON.stringify({ text: truncateReplyText(text, 5000) }),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || Number((payload as Record<string, unknown>).code || 0) !== 0) {
    throw new Error(`飞书回复失败：${JSON.stringify(payload)}`);
  }
}

async function getTenantAccessToken(
  appIdArg?: string,
  appSecretArg?: string
): Promise<string> {
  const appId = (appIdArg || getFeishuAppId()).trim();
  const appSecret = (appSecretArg || getFeishuAppSecret()).trim();
  if (!appId || !appSecret) {
    throw new Error('请在 backend/.env 配置 FEISHU_APP_ID 与 FEISHU_APP_SECRET');
  }

  const now = Date.now();
  const cached = tenantTokenCache.get(appId);
  if (cached && cached.expiresAt > now + 60000) {
    return cached.token;
  }

  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  const token = getString(payload.tenant_access_token);
  if (!response.ok || Number(payload.code || 0) !== 0 || !token) {
    throw new Error(`获取飞书 tenant_access_token 失败：${JSON.stringify(payload)}`);
  }

  const expireSec = typeof payload.expire === 'number' ? payload.expire : 7200;
  tenantTokenCache.set(appId, {
    token,
    expiresAt: now + Math.max(60, expireSec - 60) * 1000,
  });
  return token;
}

function getFeishuAppId(): string {
  return (process.env.FEISHU_APP_ID || process.env.LARK_APP_ID || '').trim();
}

function getFeishuAppSecret(): string {
  return (process.env.FEISHU_APP_SECRET || process.env.LARK_APP_SECRET || '').trim();
}

function getFeishuVerificationToken(): string {
  return (process.env.FEISHU_VERIFICATION_TOKEN || process.env.LARK_VERIFICATION_TOKEN || '').trim();
}

function getNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function truncateReplyText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 80).trimEnd()}\n\n[内容较长，已截断；请回到 OpenClaw 查看完整结果]`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==================== Per-Agent/Team Feishu Config ====================

export interface FeishuConfigInput {
  appId: string;
  appSecret: string;
  chatId?: string;
  verificationToken?: string;
  webhookSecret?: string;
}

export async function getFeishuConfig(
  userId: string,
  scope: FeishuIntegrationScope,
  subjectId: string
) {
  const db = getDb();
  const row = db
    .select()
    .from(feishuIntegrations)
    .where(
      and(
        eq(feishuIntegrations.userId, userId),
        eq(feishuIntegrations.scope, scope),
        eq(feishuIntegrations.subjectId, subjectId)
      )
    )
    .get();
  return row || null;
}

export async function saveFeishuConfig(
  userId: string,
  scope: FeishuIntegrationScope,
  subjectId: string,
  input: FeishuConfigInput
) {
  const db = getDb();
  const existing = await getFeishuConfig(userId, scope, subjectId);
  const now = new Date();

  if (existing) {
    await db
      .update(feishuIntegrations)
      .set({
        appId: input.appId.trim(),
        appSecret: input.appSecret.trim(),
        chatId: input.chatId?.trim() || null,
        verificationToken: input.verificationToken?.trim() || null,
        webhookSecret: input.webhookSecret?.trim() || null,
        updatedAt: now,
      })
      .where(eq(feishuIntegrations.id, existing.id));
    return existing.id;
  }

  const id = crypto.randomUUID();
  await db.insert(feishuIntegrations).values({
    id,
    userId,
    scope,
    subjectId,
    appId: input.appId.trim(),
    appSecret: input.appSecret.trim(),
    chatId: input.chatId?.trim() || null,
    verificationToken: input.verificationToken?.trim() || null,
    webhookSecret: input.webhookSecret?.trim() || null,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function deleteFeishuConfig(
  userId: string,
  scope: FeishuIntegrationScope,
  subjectId: string
) {
  const db = getDb();
  await db
    .delete(feishuIntegrations)
    .where(
      and(
        eq(feishuIntegrations.userId, userId),
        eq(feishuIntegrations.scope, scope),
        eq(feishuIntegrations.subjectId, subjectId)
      )
    );
}
