import { Lobster, Architecture, Message, Conversation } from '@/types';
import { mockArchitectures, mockMessages } from './mockData';

const API_BASE = 'http://localhost:3002';

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
export async function fetchAgents(): Promise<any[]> {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/agents`, { headers });
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

// ==================== Caves API ====================
export async function fetchCaves(): Promise<any[]> {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/agents/caves`, { headers });
    if (!res.ok) throw new Error('Failed to fetch');
    return await res.json();
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
  return res.json();
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
    const res = await fetch(`${API_BASE}/architectures`);
    if (!res.ok) throw new Error('Failed to fetch');
    return await res.json();
  } catch {
    return mockArchitectures;
  }
}

export async function fetchArchitectureById(id: string): Promise<Architecture | null> {
  try {
    const res = await fetch(`${API_BASE}/architectures/${id}`);
    if (!res.ok) throw new Error('Failed to fetch');
    return await res.json();
  } catch {
    return mockArchitectures.find((a) => a.id === id) || null;
  }
}

export async function createArchitecture(data: Partial<Architecture>): Promise<Architecture> {
  const res = await fetch(`${API_BASE}/architectures`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create');
  return res.json();
}

export async function updateArchitectureStatus(
  archId: string,
  agentId: string,
  status: 'standby' | 'active' | 'executing'
): Promise<void> {
  console.log(`Updating ${agentId} in ${archId} to ${status}`);
}

// ==================== Messages API ====================
export async function fetchMessagesAPI(): Promise<Message[]> {
  try {
    const res = await fetch(`${API_BASE}/messages`);
    if (!res.ok) throw new Error('Failed to fetch');
    return await res.json();
  } catch {
    return mockMessages;
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
