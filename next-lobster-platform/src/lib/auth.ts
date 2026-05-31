import { AuthResponse, LoginDto, RegisterDto, User } from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const store = localStorage.getItem('lobster-auth');
  if (!store) return null;
  try {
    return JSON.parse(store).state?.token ?? null;
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
  }

  return data as T;
}

// ==================== AUTH ====================

export async function login(dto: LoginDto): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function register(dto: RegisterDto): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function getMe(): Promise<User> {
  return request<User>('/auth/me');
}

// ==================== TYPES ====================

export interface Agent {
  id: string;
  userId: string;
  sourceMarketAgentId: string | null;
  sourceVersion: string;
  name: string;
  description: string;
  avatar: string;
  agentKey: string;
  workspacePath: string;
  baselineSnapshotPath: string | null;
  status: 'idle' | 'busy' | 'error' | 'offline';
  manifest: string;
  tags: string;
  caveId: string | null;
  conversationCount: number;
  totalMessages: number;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Cave {
  id: string;
  userId: string;
  name: string;
  color: string;
  description: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  agentInstanceId: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: string;
  createdAt: string;
}

// ==================== AGENTS ====================

export async function getAgents(caveId?: string): Promise<{ agents: Agent[] }> {
  const query = caveId ? `?caveId=${caveId}` : '';
  return request<{ agents: Agent[] }>(`/api/agents${query}`);
}

export async function getAgent(id: string): Promise<{ agent: Agent }> {
  return request<{ agent: Agent }>(`/api/agents/${id}`);
}

export interface CreateAgentDto {
  name: string;
  description?: string;
  avatar?: string;
  tags?: string[];
  manifest?: Record<string, unknown>;
  sourceMarketAgentId?: string;
  sourceVersion?: string;
}

export async function createAgent(dto: CreateAgentDto): Promise<{ agent: Agent }> {
  return request<{ agent: Agent }>('/api/agents', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function updateAgent(
  id: string,
  updates: Partial<Agent>
): Promise<{ agent: Agent }> {
  return request<{ agent: Agent }>(`/api/agents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function moveAgent(
  id: string,
  caveId: string | null
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/agents/${id}/move`, {
    method: 'POST',
    body: JSON.stringify({ caveId }),
  });
}

export async function deleteAgent(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/agents/${id}`, {
    method: 'DELETE',
  });
}

// ==================== CAVES ====================

export async function getCaves(): Promise<{ caves: Cave[] }> {
  return request<{ caves: Cave[] }>('/api/agents/caves');
}

export async function createCave(
  name: string,
  color: string
): Promise<{ cave: Cave }> {
  return request<{ cave: Cave }>('/api/agents/caves', {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  });
}

export async function updateCave(
  id: string,
  updates: { name?: string; color?: string }
): Promise<{ cave: Cave }> {
  return request<{ cave: Cave }>(`/api/agents/caves/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteCave(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/agents/caves/${id}`, {
    method: 'DELETE',
  });
}

// ==================== CONVERSATIONS ====================

export async function getConversations(): Promise<{ conversations: Conversation[] }> {
  return request<{ conversations: Conversation[] }>('/api/conversations');
}

export async function getAgentConversations(
  agentId: string
): Promise<{ conversations: Conversation[] }> {
  return request<{ conversations: Conversation[] }>(
    `/api/conversations/${agentId}`
  );
}

export async function createConversation(
  agentInstanceId: string,
  title?: string
): Promise<{ conversation: Conversation }> {
  return request<{ conversation: Conversation }>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ agentInstanceId, title }),
  });
}

export async function deleteConversation(
  id: string
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/conversations/${id}`, {
    method: 'DELETE',
  });
}

export async function getMessages(
  conversationId: string
): Promise<{ messages: Message[] }> {
  return request<{ messages: Message[] }>(
    `/api/conversations/${conversationId}/messages`
  );
}

export async function addMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: Record<string, unknown>
): Promise<{ message: Message }> {
  return request<{ message: Message }>(
    `/api/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ role, content, metadata }),
    }
  );
}
