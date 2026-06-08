import { Lobster, Architecture, Message, Conversation, WorkflowDsl, WorkflowExecution, SessionMessage, WhiteboardNote, Project, ProjectInput, ProjectFileContent, ProjectFileTree, RuntimeHealth } from '@/types';

const API_BASE = 'http://localhost:3002';

export type FeishuIntegrationScope = 'agent' | 'team';

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

// Auth helper
function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('lobster-auth');
  if (token) {
    try {
      const parsed = JSON.parse(token);
      return { Authorization: `Bearer ${parsed.state?.token}` };
    } catch {
      return {};
    }
  }
  return {};
}

// ==================== Auth API ====================
export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || '登录失败');
  }
  return res.json();
}

export async function register(email: string, username: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, username, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || '注册失败');
  }
  return res.json();
}

// ==================== Agents API ====================
export async function fetchAgents(caveId?: string): Promise<any[]> {
  try {
    const headers = getAuthHeaders();
    const query = caveId ? `?caveId=${encodeURIComponent(caveId)}` : '';
    const res = await fetch(`${API_BASE}/api/agents${query}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    return data.agents || [];
  } catch {
    return [];
  }
}

export async function fetchAgentById(id: string): Promise<any | null> {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/agents/${id}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    return data.agent || null;
  } catch {
    return null;
  }
}

export interface TeaPartyTurnRequest {
  agentId: string;
  prompt: string;
  sessionName?: string;
  topic?: string;
  members?: Array<{
    id: string;
    name: string;
    role?: string;
    description?: string;
  }>;
  messages?: Array<{
    senderName: string;
    content: string;
  }>;
  whiteboardNotes?: Array<{
    column: string;
    text: string;
    authorName: string;
  }>;
}

export interface TeaPartyTurnResponse {
  agent: {
    id: string;
    name: string;
    platform: string;
  };
  content: string;
}

export async function executeTeaPartyTurn(data: TeaPartyTurnRequest): Promise<TeaPartyTurnResponse> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/agents/tea-party/turn`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error('后端连接失败或调用超时，请确认后端服务和 Agent CLI 正常运行');
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '真实 Agent 调用失败');
  }
  return payload;
}

export interface TeaPartySessionMember {
  id: string;
  name: string;
  role?: string;
  description?: string;
}

export interface TeaPartyRunLog {
  id: string;
  sessionId: string;
  agentName: string;
  status: 'running' | 'success' | 'error';
  message: string;
  timestamp: string;
}

export interface TeaPartySessionState {
  sessionId: string;
  sessionName: string;
  active: boolean;
  stopRequested: boolean;
  round: number;
  members: TeaPartySessionMember[];
  messages: SessionMessage[];
  whiteboardNotes: WhiteboardNote[];
  runLogs: TeaPartyRunLog[];
  runningAgents: string[];
  updatedAt: string;
}

export interface SendTeaPartySessionMessageRequest {
  sessionName: string;
  userMessage: SessionMessage;
  members: TeaPartySessionMember[];
  messages: SessionMessage[];
  whiteboardNotes: WhiteboardNote[];
}

export async function sendTeaPartySessionMessage(
  sessionId: string,
  data: SendTeaPartySessionMessageRequest
): Promise<TeaPartySessionState> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${API_BASE}/api/agents/tea-party/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '茶话会后台任务启动失败');
  }
  return payload;
}

export async function fetchTeaPartySession(sessionId: string): Promise<TeaPartySessionState> {
  const headers = getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/agents/tea-party/sessions/${encodeURIComponent(sessionId)}`, {
    headers,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '获取茶话会后台状态失败');
  }
  return payload;
}

export async function stopTeaPartySession(sessionId: string): Promise<TeaPartySessionState> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${API_BASE}/api/agents/tea-party/sessions/${encodeURIComponent(sessionId)}/stop`, {
    method: 'POST',
    headers,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '停止茶话会后台任务失败');
  }
  return payload;
}

export async function createAgent(data: Partial<Lobster>): Promise<Lobster> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${API_BASE}/api/agents`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create');
  return res.json();
}

export async function adoptOfficialLobster(name: string): Promise<Lobster> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${API_BASE}/api/agents/official-lobster/adopt`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || '领取官方龙虾失败');
  }
  return data.agent;
}

export async function updateAgent(agentId: string, updates: Partial<Lobster>): Promise<Lobster> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${API_BASE}/api/agents/${agentId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update');
  const data = await res.json();
  return data.agent;
}

export async function publishAgentToMarket(agentId: string): Promise<{ success: boolean; marketAgentId?: string }> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${API_BASE}/api/agents/${agentId}/market`, {
    method: 'POST',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || '发布到 agent 市场失败');
  }
  return data;
}

export async function unpublishAgentFromMarket(agentId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/agents/${agentId}/market`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || '下架到 agent 市场失败');
  }
  return data;
}

// ==================== Caves API ====================
export async function fetchCaves(): Promise<any[]> {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/agents/caves`, { headers });
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    return Array.isArray(data) ? data : data.caves || [];
  } catch {
    return [];
  }
}

export async function createCave(name: string, color: string): Promise<any> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${API_BASE}/api/agents/caves`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, color }),
  });
  if (!res.ok) throw new Error('Failed to create');
  const data = await res.json();
  return data.cave || data;
}

export async function deleteCave(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/agents/caves/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Failed to delete cave');
  }
  return data;
}

// ==================== Conversations API ====================
export async function fetchConversations(agentId?: string): Promise<any[]> {
  try {
    const headers = getAuthHeaders();
    const url = agentId
      ? `${API_BASE}/api/conversations/${agentId}`
      : `${API_BASE}/api/conversations`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Failed to fetch');
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchMessages(conversationId: string): Promise<any[]> {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages`, { headers });
    if (!res.ok) throw new Error('Failed to fetch');
    return await res.json();
  } catch {
    return [];
  }
}

// ==================== Upload API ====================
export interface UploadResult {
  success: boolean;
  agentId?: string;
  agentKey?: string;
  workspacePath?: string;
  fileCount?: number;
  agentType?: string;
  error?: string;
}

export async function uploadFolder(
  files: { path: string; content: string }[],
  name: string,
  agentType?: string
): Promise<UploadResult> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name,
      uploadType: 'folder',
      files,
      agentType,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || '上传失败');
  }
  return data;
}

export async function uploadZip(
  base64: string,
  name: string,
  agentType?: string
): Promise<UploadResult> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name,
      uploadType: 'zip',
      file: base64,
      agentType,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || '上传失败');
  }
  return data;
}

// ==================== Architecture API ====================
export async function fetchArchitectures(): Promise<Architecture[]> {
  try {
    const res = await fetch(`${API_BASE}/api/architectures`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch');
    const payload = await res.json();
    return Array.isArray(payload) ? payload : payload.architectures || [];
  } catch {
    return [];
  }
}

export async function fetchArchitectureById(id: string): Promise<Architecture | null> {
  try {
    const res = await fetch(`${API_BASE}/api/architectures/${encodeURIComponent(id)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch');
    const payload = await res.json();
    return payload.architecture || payload;
  } catch {
    return null;
  }
}

export async function createArchitecture(data: Partial<Architecture>): Promise<Architecture> {
  const res = await fetch(`${API_BASE}/api/architectures`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.message || 'Failed to create');
  return payload.architecture || payload;
}

export async function updateArchitecture(id: string, data: Partial<Architecture>): Promise<Architecture> {
  const res = await fetch(`${API_BASE}/api/architectures/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.message || 'Failed to update');
  return payload.architecture || payload;
}

export async function updateArchitectureStatus(
  archId: string,
  agentId: string,
  status: 'standby' | 'active' | 'executing'
): Promise<void> {
  console.log(`Updating ${agentId} in ${archId} to ${status}`);
}

// ==================== Project API ====================
export async function fetchProjects(): Promise<Project[]> {
  const headers = getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/projects`, { headers });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '获取项目列表失败');
  }
  return Array.isArray(payload.projects) ? payload.projects : [];
}

export async function fetchProjectById(projectId: string): Promise<Project | null> {
  const headers = getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}`, { headers });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(payload.message || '获取项目失败');
  }
  return payload.project || null;
}

export async function createProject(data: ProjectInput): Promise<Project> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${API_BASE}/api/projects`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '创建项目失败');
  }
  return payload.project;
}

export async function updateProject(projectId: string, data: Partial<ProjectInput>): Promise<Project> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '更新项目失败');
  }
  return payload.project;
}

export async function openProject(projectId: string): Promise<Project> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/open`, {
    method: 'POST',
    headers,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '打开项目失败');
  }
  return payload.project;
}

export async function deleteProject(projectId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '删除项目失败');
  }
  return payload;
}

export async function fetchProjectFiles(projectId: string, relativePath = ''): Promise<ProjectFileTree> {
  const params = new URLSearchParams();
  if (relativePath) params.set('path', relativePath);
  const query = params.toString();
  const res = await fetch(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/files${query ? `?${query}` : ''}`,
    { headers: getAuthHeaders() }
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '读取项目文件失败');
  }
  return payload.tree;
}

export async function fetchProjectFileContent(projectId: string, relativePath: string): Promise<ProjectFileContent> {
  const params = new URLSearchParams({ path: relativePath });
  const res = await fetch(
    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/files/content?${params.toString()}`,
    { headers: getAuthHeaders() }
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '读取文件内容失败');
  }
  return payload.file;
}

// ==================== Runtime Health API ====================
export async function fetchRuntimeHealth(): Promise<RuntimeHealth> {
  const res = await fetch(`${API_BASE}/api/providers/runtime-health`, {
    headers: getAuthHeaders(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '运行时预检失败');
  }
  return payload.health;
}

// ==================== Integrations API ====================
export async function fetchFeishuWebhookInfo(
  scope: FeishuIntegrationScope,
  subjectId: string
): Promise<FeishuWebhookInfo> {
  const res = await fetch(
    `${API_BASE}/api/integrations/feishu/webhook/${scope}/${encodeURIComponent(subjectId)}`,
    { headers: getAuthHeaders() }
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '获取飞书接入信息失败');
  }
  return payload.integration;
}

// ==================== Workflow API ====================
export interface GenerateWorkflowDslRequest {
  prompt: string;
  availableAgents?: Array<{
    id: string;
    name: string;
    role?: string;
    description?: string;
    tags?: string[];
  }>;
}

export interface GenerateWorkflowDslResponse {
  workflowDsl: WorkflowDsl;
  generator: 'deepseek' | 'pi' | 'fallback';
  warnings: string[];
}

export async function generateWorkflowDslFromPrompt(
  data: GenerateWorkflowDslRequest
): Promise<GenerateWorkflowDslResponse> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${API_BASE}/api/workflows/generate-dsl`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '生成 Workflow DSL 失败');
  }
  return payload;
}

export interface StartWorkflowExecutionRequest {
  workflowDsl: WorkflowDsl;
  task: string;
  architectureId?: string;
  projectId?: string;
  dryRun?: boolean;
}

export async function startWorkflowExecution(
  data: StartWorkflowExecutionRequest
): Promise<WorkflowExecution> {
  const headers = {
    ...getAuthHeaders(),
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${API_BASE}/api/workflows/execute`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '启动 Workflow 执行失败');
  }
  return payload.execution;
}

export async function fetchWorkflowExecution(executionId: string): Promise<WorkflowExecution> {
  const res = await fetch(`${API_BASE}/api/workflows/executions/${executionId}`, {
    headers: getAuthHeaders(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '获取 Workflow 执行状态失败');
  }
  return payload.execution;
}

export async function cancelWorkflowExecution(executionId: string): Promise<WorkflowExecution> {
  const res = await fetch(`${API_BASE}/api/workflows/executions/${executionId}/cancel`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.message || '取消 Workflow 执行失败');
  }
  return payload.execution;
}

// ==================== Messages API ====================
export async function fetchMessagesAPI(): Promise<Message[]> {
  try {
    const res = await fetch(`${API_BASE}/messages`);
    if (!res.ok) throw new Error('Failed to fetch');
    return await res.json();
  } catch {
    return [];
  }
}

export async function sendMessageAPI(message: Omit<Message, 'id' | 'timestamp'>): Promise<Message> {
  const res = await fetch(`${API_BASE}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) throw new Error('Failed to send');
  return res.json();
}
