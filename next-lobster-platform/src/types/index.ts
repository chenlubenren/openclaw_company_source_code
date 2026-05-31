export interface Lobster {
  id: string;
  name: string;
  description?: string;
  role: string;
  status: 'idle' | 'working' | 'busy' | 'error' | 'offline';
  avatar?: string;
  createdAt: string;
  conversations: Conversation[];
  tags?: string[];
  caveId?: string;
  updatedAt?: string;
  platform?: string;
  config?: AgentConfig;
  // OpenClaw configuration
  openclawPath?: string;
  openclawPort?: number;
  isConnected?: boolean;
  sessionKey?: string;
}

export interface AgentConfig {
  apiKeys?: Record<string, string>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface Conversation {
  id: string;
  role: 'user' | 'lobster';
  content: string;
  timestamp: string;
}

export interface ArchitectureNode {
  id: string;
  type: string;
  position?: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface ArchitectureEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  /** React Flow 源端口 id，如条件节点的「否」为 `no` */
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface Architecture {
  id: string;
  name: string;
  description: string;
  agents: ArchitectureAgent[];
  nodes?: ArchitectureNode[];
  edges?: ArchitectureEdge[];
  createdAt: string;
}

export interface ArchitectureAgent {
  id: string;
  name: string;
  role: string;
  status: 'standby' | 'active' | 'executing';
  isManager?: boolean;
  // Input/Output ports for node connections
  inputs?: string[];
  outputs?: string[];
  // OpenClaw integration
  linkedLobsterId?: string;
  openclawPath?: string;
  openclawPort?: number;
}

export type CreateMode = 'canvas' | 'chat';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
}

export interface OpenClawConfig {
  workspacePath: string;
  port: number;
  isActive: boolean;
  sessionKey?: string;
}

export interface Cave {
  id: string;
  name: string;
  color: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
}

// Auth types
export interface User {
  id: string;
  email: string;
  username: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  username: string;
  password: string;
}

// Session / Group Chat
export interface Session {
  id: string;
  name: string;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
}
