'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/useAuthStore';
import { useAgentChat } from '@/hooks/useAgentChat';
import { PixelButton } from '@/components/ui/PixelButton';
import { PixelInput } from '@/components/ui/PixelInput';
import { BackButton } from '@/components/ui/BackButton';
import { AgentMonitorPanel } from '@/components/chat/AgentMonitorPanel';
import { AgentSettingsPanel } from '@/components/chat/AgentSettingsPanel';
import { CapabilitiesConfig } from '@/components/chat/CapabilitiesConfig';
import { TokenUsageDisplay } from '@/components/chat/TokenUsageDisplay';
import { MessageRenderer } from '@/components/chat/MessageRenderer';
import { getModelDisplayName, normalizeProviderModels } from '@/lib/providerPresets';
import { API_BASE } from '@/lib/runtime';

interface Agent {
  id: string;
  name: string;
  description: string;
  avatar: string;
  status: 'idle' | 'busy' | 'error' | 'offline';
  platform?: string;
  workspacePath: string;
  providerId?: string | null;
  stateDir?: string | null;
  config?: AgentConfig;
}

interface AgentConfig {
  skills?: string[];
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  [key: string]: unknown;
}

interface AgentProvider {
  id: string;
  name: string;
  type: string;
  baseUrl?: string | null;
  models: unknown[];
}

interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costEstimate?: string;
}

interface ConversationSession {
  id: string;
  agentInstanceId: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  sessionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoredChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: string;
  createdAt: string;
}

interface ToolCall {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  result?: string;
}

interface UploadedChatAsset {
  filename: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  relativePath: string;
  previewUrl: string;
}

type TabType = 'chat' | 'monitor' | 'capabilities';

function MessageActionButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center bg-transparent text-pixel-black/35 transition-colors hover:bg-pixel-black/10 hover:text-pixel-black/75 focus:outline-none focus:text-pixel-black/75"
    >
      {children}
    </button>
  );
}

function PlusIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M8 3v10M3 8h10" strokeLinecap="square" />
    </svg>
  );
}

function QuoteIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
      <path d="M6.5 4.5H4.5L3 7v4.5h4.5V7H5.1l1.4-2.5ZM13 4.5H11L9.5 7v4.5H14V7h-2.4L13 4.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HideIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
      <path d="M2 8c1.5-2.3 3.5-3.5 6-3.5S12.5 5.7 14 8c-1.5 2.3-3.5 3.5-6 3.5S3.5 10.3 2 8Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.8" />
      <path d="M3 13 13 3" strokeLinecap="round" />
    </svg>
  );
}

function parseModels(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseMessageMetadata(raw?: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function mapStoredMessage(message: StoredChatMessage): any {
  const metadata = parseMessageMetadata(message.metadata);
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.createdAt),
    sessionId: typeof metadata.sessionId === 'string' ? metadata.sessionId : null,
    conversationId: typeof metadata.conversationId === 'string' ? metadata.conversationId : null,
  };
}

export default function AgentChatPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  
  const { token, user } = useAuthStore();
  
  const [agent, setAgent] = useState<Agent | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [showSettings, setShowSettings] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<AgentProvider | null>(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [savingModel, setSavingModel] = useState(false);
  const [modelError, setModelError] = useState('');
  const [conversationSessions, setConversationSessions] = useState<ConversationSession[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [renamingSession, setRenamingSession] = useState(false);
  const [sessionTitleDraft, setSessionTitleDraft] = useState('');
  const [savingSessionTitle, setSavingSessionTitle] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [composerStatus, setComposerStatus] = useState('');
  
  // Agent state tracking
  const [agentState, setAgentState] = useState<'idle' | 'thinking' | 'executing' | 'responding'>('idle');
  const [currentTask, setCurrentTask] = useState<string>('');
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [tokenStats, setTokenStats] = useState<TokenStats>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null!);

  const {
    isConnected,
    isSessionActive,
    messages,
    error,
    currentSessionId,
    currentConversationId,
    sendMessage,
    startSession,
    stopSession,
    clearMessages,
    hydrateMessages,
  } = useAgentChat({
    agentId,
    token: token || '',
    conversationId: activeConversationId,
    autoConnect: Boolean(activeConversationId),
    autoStartSession: false,
  });

  const createSessionRecord = useCallback(async (title?: string): Promise<ConversationSession> => {
    if (!agent || !token) {
      throw new Error('无法创建会话');
    }

    const nextTitle = title?.trim() || `Session ${conversationSessions.length + 1}`;
    const res = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        agentInstanceId: agent.id,
        title: nextTitle,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.message || '创建会话失败');
    }

    return data.conversation as ConversationSession;
  }, [agent, token, conversationSessions.length]);

  const appendToComposer = useCallback((snippet: string) => {
    const cleanSnippet = snippet.trim();
    if (!cleanSnippet) return;

    setInputValue((current) => {
      const trimmed = current.trim();
      return trimmed ? `${trimmed}\n\n${cleanSnippet}` : cleanSnippet;
    });
  }, []);

  const buildQuoteSnippet = useCallback((message: { role: string; content: string }) => {
    const speaker =
      message.role === 'user'
        ? '你'
        : message.role === 'system'
          ? '系统'
          : agent?.name || 'Agent';

    const quoteLines = message.content
      .trim()
      .split(/\r?\n/)
      .map((line) => `> ${line}`)
      .join('\n');

    return `> 引用 ${speaker}\n${quoteLines}`;
  }, [agent?.name]);

  const buildImageAttachmentSnippet = useCallback((asset: UploadedChatAsset) => {
    const label = asset.originalName || asset.filename;
    return [
      `### 图片附件`,
      `- 文件名: ${label}`,
      `- 工作区路径: \`${asset.relativePath}\``,
      '',
      `![${label}](${asset.previewUrl})`,
    ].join('\n');
  }, []);

  // Fetch agent info
  useEffect(() => {
    async function fetchAgent() {
      if (!token) {
        router.push('/auth/login');
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/agents/${agentId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error('Failed to fetch agent');
        }

        const data = await res.json();
        setAgent(data.agent);
        setSelectedModel(data.agent?.config?.model || '');
      } catch (e) {
        console.error('Failed to fetch agent:', e);
        setErrorMessage('无法加载 Agent 信息');
      } finally {
        setIsLoading(false);
      }
    }

    fetchAgent();
  }, [agentId, token, router]);

  useEffect(() => {
    async function fetchSessions() {
      if (!token || !agent) return;
      setSessionsLoading(true);
      setSessionError('');
      try {
        const res = await fetch(`${API_BASE}/api/conversations/${agent.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('无法加载会话列表');
        const data = await res.json();
        let sessions: ConversationSession[] = Array.isArray(data.conversations) ? data.conversations : [];

        if (sessions.length === 0) {
          const createRes = await fetch(`${API_BASE}/api/conversations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              agentInstanceId: agent.id,
              title: 'Session 1',
            }),
          });
          if (!createRes.ok) throw new Error('无法创建默认会话');
          const created = await createRes.json();
          sessions = [created.conversation];
        }

        setConversationSessions(sessions);
        setActiveConversationId((current) =>
          current && sessions.some((session) => session.id === current)
            ? current
            : sessions[0]?.id || null
        );
      } catch (e) {
        console.error('Failed to fetch sessions:', e);
        setSessionError(e instanceof Error ? e.message : '无法加载会话');
      } finally {
        setSessionsLoading(false);
      }
    }

    fetchSessions();
  }, [agent?.id, token]);

  useEffect(() => {
    let cancelled = false;

    async function fetchConversationMessages() {
      if (!token || !activeConversationId) return;
      try {
        const res = await fetch(`${API_BASE}/api/conversations/${activeConversationId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('无法加载会话消息');
        const data = await res.json();
        if (cancelled) return;
        const storedMessages: StoredChatMessage[] = Array.isArray(data.messages) ? data.messages : [];
        hydrateMessages(storedMessages.map(mapStoredMessage));
      } catch (e) {
        if (cancelled) return;
        console.error('Failed to fetch conversation messages:', e);
        setSessionError(e instanceof Error ? e.message : '无法加载会话消息');
      }
    }

    fetchConversationMessages();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, hydrateMessages, token]);

  useEffect(() => {
    if (!activeConversationId || !currentSessionId) return;
    setConversationSessions((current) =>
      current.map((session) =>
        session.id === activeConversationId
          ? { ...session, sessionId: currentSessionId }
          : session
      )
    );
  }, [activeConversationId, currentSessionId]);

  useEffect(() => {
    if (!activeConversationId) return;
    const lastMessage = messages[messages.length - 1];
    setConversationSessions((current) =>
      current.map((session) =>
        session.id === activeConversationId
          ? {
              ...session,
              messageCount: messages.length,
              lastMessage: lastMessage?.content?.slice(0, 200) || session.lastMessage,
            }
          : session
      )
    );
  }, [activeConversationId, messages]);

  useEffect(() => {
    async function fetchActiveProvider() {
      if (!token || !agent?.providerId) {
        setActiveProvider(null);
        return;
      }

      setActiveProvider(null);
      try {
        const res = await fetch(`${API_BASE}/api/providers/${agent.providerId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setActiveProvider(null);
          return;
        }
        const data = await res.json();
        setActiveProvider({
          ...data.provider,
          models: parseModels(data.provider?.models),
        });
      } catch (e) {
        console.error('Failed to fetch active provider:', e);
        setActiveProvider(null);
      }
    }

    fetchActiveProvider();
  }, [agent?.providerId, token]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role !== 'user') {
      setAwaitingResponse(false);
    }
  }, [messages]);

  // Auto-start session when connected
  useEffect(() => {
    if (isConnected && !isSessionActive && agent && activeConversationId) {
      startSession();
    }
  }, [activeConversationId, isConnected, isSessionActive, agent, startSession]);

  // Update agent state based on messages
  useEffect(() => {
    if (messages.length === 0) {
      setAgentState('idle');
      setCurrentTask('');
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user' && awaitingResponse) {
      setAgentState('thinking');
      setCurrentTask('正在理解您的问题...');
    } else if (lastMessage.isToolCall) {
      setAgentState('executing');
      setCurrentTask(lastMessage.toolName || '正在执行工具...');
    } else if (lastMessage.isComplete === false) {
      setAgentState('responding');
      setCurrentTask('正在生成回复...');
    } else {
      setAgentState('idle');
      setCurrentTask('');
    }
  }, [awaitingResponse, messages]);

  // Simulate token counting (in real app, this comes from WebSocket)
  useEffect(() => {
    const totalInput = messages
      .filter(m => m.role === 'user')
      .reduce((acc, m) => acc + Math.ceil(m.content.length / 4), 0);
    const totalOutput = messages
      .filter(m => m.role === 'assistant')
      .reduce((acc, m) => acc + Math.ceil(m.content.length / 4), 0);
    
    setTokenStats({
      inputTokens: totalInput,
      outputTokens: totalOutput,
      totalTokens: totalInput + totalOutput,
      costEstimate: ((totalInput + totalOutput) * 0.00001).toFixed(4),
    });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;

    const message = inputValue.trim();
    setInputValue('');
    setAwaitingResponse(true);
    setComposerStatus('');
    sendMessage(message);
  }, [inputValue, sendMessage]);

  const handleQuoteMessage = useCallback((message: { role: string; content: string }) => {
    appendToComposer(buildQuoteSnippet(message));
    setComposerStatus('已插入引用');
  }, [appendToComposer, buildQuoteSnippet]);

  const handleAttachImages = useCallback(async (files: FileList) => {
    if (!agent || !token || isUploadingImage) return;

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setErrorMessage('请选择图片文件');
      return;
    }

    setIsUploadingImage(true);
    setErrorMessage('');
    setComposerStatus(`正在上传 ${imageFiles.length} 张图片...`);

    try {
      const snippets: string[] = [];

      for (const file of imageFiles) {
        const formData = new FormData();
        formData.append('image', file);

        const res = await fetch(`${API_BASE}/api/agents/${agent.id}/chat-assets`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.asset) {
          throw new Error(data?.message || `上传图片失败: ${file.name}`);
        }

        snippets.push(buildImageAttachmentSnippet(data.asset as UploadedChatAsset));
      }

      appendToComposer(snippets.join('\n\n'));
      setComposerStatus(`已插入 ${imageFiles.length} 张图片`);
    } catch (e) {
      console.error('Failed to upload chat images:', e);
      setErrorMessage(e instanceof Error ? e.message : '上传图片失败');
      setComposerStatus('');
    } finally {
      setIsUploadingImage(false);
    }
  }, [agent, token, isUploadingImage, buildImageAttachmentSnippet, appendToComposer]);

  const handleSelectConversation = useCallback((conversationId: string) => {
    if (!conversationId || conversationId === activeConversationId) return;
    setSessionError('');
    setAwaitingResponse(false);
    setRenamingSession(false);
    setSessionTitleDraft('');
    setActiveConversationId(conversationId);
  }, [activeConversationId]);

  const handleStartRenameSession = useCallback(() => {
    const session = conversationSessions.find((item) => item.id === activeConversationId);
    setSessionError('');
    setSessionTitleDraft(session?.title || '');
    setRenamingSession(true);
  }, [activeConversationId, conversationSessions]);

  const handleCancelRenameSession = useCallback(() => {
    setRenamingSession(false);
    setSessionTitleDraft('');
  }, []);

  const handleSaveSessionTitle = useCallback(async () => {
    if (!activeConversationId || !token || savingSessionTitle) return;
    const title = sessionTitleDraft.trim();
    if (!title) {
      setSessionError('请输入Session名称');
      return;
    }

    setSavingSessionTitle(true);
    setSessionError('');
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${activeConversationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || '重命名Session失败');

      const updated = data.conversation as ConversationSession;
      setConversationSessions((current) =>
        current.map((session) =>
          session.id === activeConversationId
            ? { ...session, ...updated, title: updated?.title || title }
            : session
        )
      );
      setRenamingSession(false);
      setSessionTitleDraft('');
    } catch (e) {
      console.error('Failed to rename session:', e);
      setSessionError(e instanceof Error ? e.message : '重命名Session失败');
    } finally {
      setSavingSessionTitle(false);
    }
  }, [activeConversationId, savingSessionTitle, sessionTitleDraft, token]);

  const handleNewSession = useCallback(async () => {
    if (!agent || !token || creatingSession) return;
    setCreatingSession(true);
    setSessionError('');
    try {
      const session = await createSessionRecord();
      setConversationSessions((current) => [session, ...current]);
      setAwaitingResponse(false);
      setRenamingSession(false);
      setSessionTitleDraft('');
      setActiveConversationId(session.id);
      hydrateMessages([]);
    } catch (e) {
      console.error('Failed to create session:', e);
      setSessionError(e instanceof Error ? e.message : '创建会话失败');
    } finally {
      setCreatingSession(false);
    }
  }, [agent, token, creatingSession, createSessionRecord, hydrateMessages]);

  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    if (!token || deletingConversationId) return;

    const targetSession = conversationSessions.find((session) => session.id === conversationId);
    const targetLabel = targetSession?.title?.trim() || '该对话记录';
    const confirmed = window.confirm(`是否真的要删除「${targetLabel}」？`);
    if (!confirmed) return;

    const isActiveConversation = conversationId === activeConversationId;
    setDeletingConversationId(conversationId);
    setSessionError('');
    setAwaitingResponse(false);
    setRenamingSession(false);
    setSessionTitleDraft('');

    try {
      if (isActiveConversation) {
        stopSession();
      }

      const res = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || '删除对话失败');
      }

      const remainingSessions = conversationSessions.filter((session) => session.id !== conversationId);
      if (remainingSessions.length === 0) {
        const replacementSession = await createSessionRecord('Session 1');
        setConversationSessions([replacementSession]);
        setActiveConversationId(replacementSession.id);
        hydrateMessages([]);
        return;
      }

      setConversationSessions(remainingSessions);
      if (isActiveConversation) {
        setActiveConversationId(remainingSessions[0].id);
        hydrateMessages([]);
      }
    } catch (e) {
      console.error('Failed to delete session:', e);
      setSessionError(e instanceof Error ? e.message : '删除对话失败');
    } finally {
      setDeletingConversationId(null);
    }
  }, [
    token,
    deletingConversationId,
    conversationSessions,
    activeConversationId,
    stopSession,
    createSessionRecord,
    hydrateMessages,
  ]);
  const handleExportSession = useCallback(async () => {
    if (!activeConversationId || !token || !agent) return;
    setSessionError('');
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${activeConversationId}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || '导出会话失败');

      const exportedSessionId = data.sessionId || currentSessionId || 'no-runtime-session';
      const exportData = {
        ...data,
        sessionId: exportedSessionId,
        agent: {
          id: agent.id,
          name: agent.name,
          platform: agent.platform,
        },
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${agent.name || 'agent'}-${exportedSessionId}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export session:', e);
      setSessionError(e instanceof Error ? e.message : '导出会话失败');
    }
  }, [activeConversationId, agent, currentSessionId, token]);

  const restartAgentSession = useCallback(() => {
    stopSession();
    setAgentState('idle');
    setCurrentTask('');
    setTimeout(() => {
      startSession();
    }, 500);
  }, [startSession, stopSession]);

  const handleModelChange = useCallback(async (modelId: string) => {
    if (!agent || !token) return;
    const previousModel = selectedModel;
    setSelectedModel(modelId);
    setSavingModel(true);
    setModelError('');
    try {
      const res = await fetch(`${API_BASE}/api/agents/${agent.id}/config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ model: modelId }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || '模型切换失败');
      }

      setAgent((current) => data?.agent || (current
        ? { ...current, config: { ...(current.config || {}), model: modelId } }
        : current
      ));
      restartAgentSession();
    } catch (e) {
      setSelectedModel(previousModel);
      setModelError(e instanceof Error ? e.message : '模型切换失败');
    } finally {
      setSavingModel(false);
    }
  }, [agent, token, selectedModel, restartAgentSession]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    stopSession();
    setAgentState('idle');
    setCurrentTask('');
  };

  const getStatusColor = () => {
    if (!isConnected) return 'bg-gray-400';
    switch (agentState) {
      case 'thinking': return 'bg-blue-400 animate-pulse';
      case 'executing': return 'bg-yellow-400 animate-pulse';
      case 'responding': return 'bg-green-400 animate-pulse';
      default: return 'bg-green-400';
    }
  };

  const getStatusText = () => {
    if (!isConnected) return '未连接';
    switch (agentState) {
      case 'thinking': return '思考中';
      case 'executing': return '执行中';
      case 'responding': return '响应中';
      default: return isSessionActive ? '就绪' : '空闲';
    }
  };

  const handleMobileBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/?mobileTab=contacts');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pixel-cream">
        <div className="font-pixel text-2xl text-pixel-black animate-pulse">
          加载中...
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-pixel-cream">
        <div className="font-pixel text-2xl text-pixel-black mb-4">
          Agent 不存在
        </div>
        <PixelButton onClick={() => router.push('/my-den')}>
          返回 Agent 窝
        </PixelButton>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-pixel-cream">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="shrink-0 border-b-4 border-pixel-black bg-pixel-cream"
      >
        <div className="relative px-3 py-2 md:px-4 md:py-3">
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2 md:gap-4">
              <button
                type="button"
                onClick={handleMobileBack}
                className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-pixel-black bg-pixel-white text-pixel-black md:hidden"
                style={{ boxShadow: '2px 2px 0px 0px #101010' }}
                aria-label="返回上一页"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                </svg>
              </button>
              <div className="hidden md:block">
                <BackButton href="/" />
              </div>
              
              {/* Agent Avatar */}
              <div className="relative">
                {agent.avatar ? (
                  <img
                    src={agent.avatar}
                    alt={agent.name}
                    className="h-9 w-9 border-2 border-pixel-black pixelated md:h-12 md:w-12 md:border-4"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center border-2 border-pixel-black bg-pixel-yellow font-pixel text-lg md:h-12 md:w-12 md:border-4 md:text-2xl">
                    🦞
                  </div>
                )}
                <div
                  className={`absolute -bottom-1 -right-1 w-4 h-4 border-2 border-pixel-black rounded-full ${getStatusColor()}`}
                  title={getStatusText()}
                />
              </div>
              
              <div className="min-w-0">
                <h1 className="truncate font-pixel text-base leading-none text-pixel-black md:text-xl">{agent.name}</h1>
                <div className="flex items-center gap-2">
                  <span className="hidden font-pixel text-xs text-pixel-black/60 sm:inline">
                    {agent.platform || 'unknown'}
                  </span>
                  <span className={`font-pixel text-xs px-2 py-0.5 border-2 border-pixel-black ${
                    agentState === 'idle' ? 'bg-pixel-white text-pixel-black' : 'bg-pixel-black text-pixel-white'
                  }`}>
                    {getStatusText()}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions & Quick Stats */}
            <div className="hidden items-center gap-4 md:flex">
              {/* Quick Token Stats */}
              <TokenUsageDisplay stats={tokenStats} compact />
              
              {/* Settings Toggle */}
              <PixelButton
                variant="secondary"
                onClick={() => setShowSettings(!showSettings)}
                className="text-lg"
                title="Agent 设置"
              >
                ⚙️
              </PixelButton>
              
              {isSessionActive && (
                <PixelButton
                  variant="danger"
                  onClick={handleStop}
                  className="font-pixel text-sm"
                >
                  停止
                </PixelButton>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-pixel-black bg-pixel-white font-pixel text-xl leading-none text-pixel-black md:hidden"
              style={{ boxShadow: '2px 2px 0px 0px #101010' }}
              aria-label="更多设置"
            >
              ...
            </button>
          </div>

          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute right-3 top-[calc(100%+6px)] z-50 w-64 border-4 border-pixel-black bg-pixel-white p-2 md:hidden"
                style={{ boxShadow: '4px 4px 0px 0px #101010' }}
              >
                <div className="grid grid-cols-3 gap-1 border-b-2 border-pixel-black pb-2">
                  {([
                    ['chat', '对话'],
                    ['monitor', '监控'],
                    ['capabilities', '能力'],
                  ] as Array<[TabType, string]>).map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab);
                        setMobileMenuOpen(false);
                      }}
                      className={`border-2 border-pixel-black px-2 py-1.5 font-pixel text-xs ${
                        activeTab === tab ? 'bg-pixel-black text-pixel-white' : 'bg-pixel-white text-pixel-black'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 grid gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      handleNewSession();
                      setMobileMenuOpen(false);
                    }}
                    disabled={creatingSession}
                    className="border-2 border-pixel-black bg-pixel-yellow px-3 py-2 text-left font-pixel text-xs text-pixel-black disabled:opacity-50"
                  >
                    {creatingSession ? '创建中' : '新对话'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleStartRenameSession();
                      setMobileMenuOpen(false);
                    }}
                    disabled={!activeConversationId || renamingSession}
                    className="border-2 border-pixel-black bg-pixel-white px-3 py-2 text-left font-pixel text-xs text-pixel-black disabled:opacity-50"
                  >
                    重命名对话
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleExportSession();
                      setMobileMenuOpen(false);
                    }}
                    disabled={!activeConversationId}
                    className="border-2 border-pixel-black bg-pixel-blue px-3 py-2 text-left font-pixel text-xs text-pixel-white disabled:opacity-50"
                  >
                    导出对话
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSettings(true);
                      setMobileMenuOpen(false);
                    }}
                    className="border-2 border-pixel-black bg-pixel-white px-3 py-2 text-left font-pixel text-xs text-pixel-black"
                  >
                    Agent 设置
                  </button>
                  {(isSessionActive || awaitingResponse || agentState !== 'idle') && (
                    <button
                      type="button"
                      onClick={() => {
                        handleStop();
                        setMobileMenuOpen(false);
                      }}
                      className="border-2 border-pixel-black bg-pixel-red px-3 py-2 text-left font-pixel text-xs text-pixel-white"
                    >
                      停止
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Current Task Progress */}
          {agentState !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-3 hidden border-2 border-pixel-black bg-pixel-black/10 px-4 py-2 md:block"
            >
              <div className="flex items-center gap-3">
                <div className="animate-spin w-4 h-4 border-2 border-pixel-black border-t-transparent rounded-full" />
                <span className="font-pixel text-sm text-pixel-black">
                  {currentTask}
                </span>
              </div>
              {/* Tool call progress */}
              {toolCalls.length > 0 && (
                <div className="mt-2 space-y-1">
                  {toolCalls.slice(-3).map((tool) => (
                    <div key={tool.id} className="flex items-center gap-2 text-xs font-pixel">
                      <span className={`w-2 h-2 rounded-full ${
                        tool.status === 'completed' ? 'bg-green-500' :
                        tool.status === 'failed' ? 'bg-red-500' :
                        'bg-yellow-500 animate-pulse'
                      }`} />
                      <span>{tool.name}</span>
                      <span className="text-pixel-black/50">
                        {tool.status === 'completed' ? '✓' : tool.status === 'failed' ? '✗' : '...'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="hidden border-t-2 border-pixel-black md:flex">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 px-4 py-2 font-pixel text-sm border-r-2 border-pixel-black transition-colors ${
              activeTab === 'chat' ? 'bg-pixel-black text-pixel-white' : 'bg-pixel-white text-pixel-black hover:bg-pixel-black/10'
            }`}
          >
            💬 对话
          </button>
          <button
            onClick={() => setActiveTab('monitor')}
            className={`flex-1 px-4 py-2 font-pixel text-sm border-r-2 border-pixel-black transition-colors ${
              activeTab === 'monitor' ? 'bg-pixel-black text-pixel-white' : 'bg-pixel-white text-pixel-black hover:bg-pixel-black/10'
            }`}
          >
            📊 监控
          </button>
          <button
            onClick={() => setActiveTab('capabilities')}
            className={`flex-1 px-4 py-2 font-pixel text-sm transition-colors ${
              activeTab === 'capabilities' ? 'bg-pixel-black text-pixel-white' : 'bg-pixel-white text-pixel-black hover:bg-pixel-black/10'
            }`}
          >
            🛠️ 能力配置
          </button>
        </div>
      </motion.div>

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Chat / Monitor / Settings Content */}
        <div className={`min-h-0 flex-1 ${activeTab === 'chat' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {activeTab === 'chat' && (
            <ChatView
              messages={messages}
              agent={agent}
              agentState={agentState}
              messagesEndRef={messagesEndRef}
              inputValue={inputValue}
              setInputValue={setInputValue}
              handleKeyDown={handleKeyDown}
              handleSend={handleSend}
              isConnected={isConnected}
              isSessionActive={isSessionActive}
              error={error ?? undefined}
              errorMessage={errorMessage}
              activeProvider={activeProvider}
              selectedModel={selectedModel}
              savingModel={savingModel}
              modelError={modelError}
              onModelChange={handleModelChange}
              conversationSessions={conversationSessions}
              activeConversationId={activeConversationId}
              currentSessionId={currentSessionId}
              currentConversationId={currentConversationId}
              sessionsLoading={sessionsLoading}
              creatingSession={creatingSession}
              sessionError={sessionError}
              renamingSession={renamingSession}
              sessionTitleDraft={sessionTitleDraft}
              savingSessionTitle={savingSessionTitle}
              setSessionTitleDraft={setSessionTitleDraft}
              onSelectConversation={handleSelectConversation}
              onStartRenameSession={handleStartRenameSession}
              onCancelRenameSession={handleCancelRenameSession}
              onSaveSessionTitle={handleSaveSessionTitle}
              onNewSession={handleNewSession}
              onExportSession={handleExportSession}
              onDeleteConversation={handleDeleteConversation}
              deletingConversationId={deletingConversationId}
              onStopGenerating={handleStop}
              canStopGenerating={awaitingResponse || agentState !== 'idle'}
              onQuoteMessage={handleQuoteMessage}
              onAttachImages={handleAttachImages}
              uploadingImage={isUploadingImage}
              composerStatus={composerStatus}
            />
          )}
          
          {activeTab === 'monitor' && (
            <MonitorView
              agent={agent}
              agentState={agentState}
              currentTask={currentTask}
              tokenStats={tokenStats}
              toolCalls={toolCalls}
              messages={messages}
            />
          )}
          
          {activeTab === 'capabilities' && agent && (
            <CapabilitiesConfig
              agent={{
                id: agent.id,
                name: agent.name,
                workspacePath: agent.workspacePath,
                providerId: agent.providerId,
              }}
              token={token || ''}
            />
          )}
        </div>

        {/* Settings Panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90] bg-pixel-black/40 p-0 md:flex md:items-stretch md:justify-end md:p-4"
              role="dialog"
              aria-modal="true"
              onClick={() => setShowSettings(false)}
            >
              <motion.div
                initial={{ x: 400, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 400, opacity: 0 }}
                className="h-full w-full overflow-y-auto border-pixel-black bg-white text-pixel-black shadow-pixel md:w-[420px] md:border-4"
                onClick={(event) => event.stopPropagation()}
              >
                <AgentSettingsPanel
                  agent={agent}
                  token={token || ''}
                  onClose={() => setShowSettings(false)}
                  onAgentUpdate={(updatedAgent) => {
                    setAgent((current) => current ? { ...current, ...updatedAgent } : updatedAgent);
                    setSelectedModel(updatedAgent.config?.model || '');
                    setModelError('');
                    restartAgentSession();
                  }}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Chat View Component
interface ChatViewProps {
  messages: any[];
  agent: Agent;
  agentState: string;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSend: () => void;
  isConnected: boolean;
  isSessionActive: boolean;
  error?: string;
  errorMessage: string;
  activeProvider: AgentProvider | null;
  selectedModel: string;
  savingModel: boolean;
  modelError: string;
  onModelChange: (modelId: string) => void;
  conversationSessions: ConversationSession[];
  activeConversationId: string | null;
  currentSessionId: string | null;
  currentConversationId: string | null;
  sessionsLoading: boolean;
  creatingSession: boolean;
  sessionError: string;
  renamingSession: boolean;
  sessionTitleDraft: string;
  savingSessionTitle: boolean;
  setSessionTitleDraft: (title: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onStartRenameSession: () => void;
  onCancelRenameSession: () => void;
  onSaveSessionTitle: () => void;
  onNewSession: () => void;
  onExportSession: () => void;
  onDeleteConversation: (conversationId: string) => void;
  deletingConversationId: string | null;
  onStopGenerating: () => void;
  canStopGenerating: boolean;
  onQuoteMessage: (message: { role: string; content: string }) => void;
  onAttachImages: (files: FileList) => void | Promise<void>;
  uploadingImage: boolean;
  composerStatus: string;
}

function ChatView(props: ChatViewProps) {
  const {
    messages,
    agent,
    agentState,
    messagesEndRef,
    inputValue,
    setInputValue,
    handleKeyDown,
    handleSend,
    isConnected,
    isSessionActive,
    error,
    errorMessage,
    activeProvider,
    selectedModel,
    savingModel,
    modelError,
    onModelChange,
    conversationSessions,
    activeConversationId,
    currentSessionId,
    currentConversationId,
    sessionsLoading,
    creatingSession,
    sessionError,
    renamingSession,
    sessionTitleDraft,
    savingSessionTitle,
    setSessionTitleDraft,
    onSelectConversation,
    onStartRenameSession,
    onCancelRenameSession,
    onSaveSessionTitle,
    onNewSession,
    onExportSession,
    onDeleteConversation,
    deletingConversationId,
    onStopGenerating,
    canStopGenerating,
    onQuoteMessage,
    onAttachImages,
    uploadingImage,
    composerStatus,
  } = props;
  const [isSessionMenuOpen, setIsSessionMenuOpen] = useState(false);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(new Set());
  const sessionMenuRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const providerModelIds = normalizeProviderModels(activeProvider?.models || []);
  const currentModel = selectedModel || providerModelIds[0] || '';
  const activeSession = conversationSessions.find((session) => session.id === activeConversationId) || null;

  function isSysMsg(msg: any): boolean {
    if (msg.role === 'system') return true;
    if (!msg.content) return false;
    return msg.content.includes('Agents:') || msg.content.includes('[plugins]') || msg.content.includes('Process exited');
  }

  function getMsgClass(msg: any): string {
    if (msg.role === 'user') return 'bg-pixel-blue text-pixel-white';
    if (isSysMsg(msg)) return 'bg-pixel-black/5 text-pixel-black';
    if (msg.isToolCall) return 'bg-pixel-yellow/50 text-pixel-black';
    return 'bg-pixel-white text-pixel-black';
  }

  function getLabel(msg: any): string {
    if (msg.role === 'user') return '你';
    if (isSysMsg(msg)) return '系统';
    return agent.name;
  }

  const orderedMessages = messages
    .map((message, index) => ({ message, index }))
    .sort((a, b) => {
      const aTime = new Date(a.message.timestamp).getTime() || 0;
      const bTime = new Date(b.message.timestamp).getTime() || 0;
      return aTime - bTime || a.index - b.index;
    })
    .filter(({ message }) => !hiddenMessageIds.has(message.id))
    .map(({ message }) => message);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!sessionMenuRef.current?.contains(event.target as Node)) {
        setIsSessionMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  useEffect(() => {
    setHiddenMessageIds(new Set());
  }, [activeConversationId]);

  function handleRenameKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSaveSessionTitle();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancelRenameSession();
    }
  }

  function handleSelectSession(conversationId: string) {
    setIsSessionMenuOpen(false);
    onSelectConversation(conversationId);
  }

  function handleDeleteSession(event: React.MouseEvent<HTMLButtonElement>, conversationId: string) {
    event.stopPropagation();
    setIsSessionMenuOpen(false);
    onDeleteConversation(conversationId);
  }

  async function handleImageInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await onAttachImages(files);
    event.target.value = '';
    composerInputRef.current?.focus();
  }

  function handleHideMessage(messageId: string) {
    setHiddenMessageIds((current) => {
      const next = new Set(current);
      next.add(messageId);
      return next;
    });
  }

  function renderMessage(msg: any) {
    const cls = getMsgClass(msg);
    const label = getLabel(msg);
    const userMessage = msg.role === 'user';
    const systemMessage = isSysMsg(msg);
    const actionPlacement = userMessage ? 'right-full mr-2 items-end' : 'left-full ml-2 items-start';

    return (
      <motion.div
        key={msg.id}
        initial={{ opacity: 0, x: userMessage ? 20 : -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.05 }}
        className={`group mb-4 ${userMessage ? 'text-right' : 'text-left'}`}
      >
        <div className={`mb-1 text-xs ${userMessage ? 'font-pixel text-pixel-blue' : systemMessage ? 'font-mono text-pixel-black/60' : 'font-pixel text-pixel-yellow'}`}>
          {label}
          {msg.isToolCall && <span className="ml-2 text-pixel-black/50">[工具: {msg.toolName}]</span>}
        </div>
        <div className="relative inline-block max-w-[85%]">
          <div
            className={`absolute top-8 flex flex-col gap-1 ${actionPlacement} opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100`}
          >
            {!systemMessage && (
              <MessageActionButton
                title="引用"
                onClick={() => {
                  onQuoteMessage({ role: msg.role, content: msg.content });
                  composerInputRef.current?.focus();
                }}
              >
                <QuoteIcon />
              </MessageActionButton>
            )}
            <MessageActionButton title="隐藏此消息" onClick={() => handleHideMessage(msg.id)}>
              <HideIcon />
            </MessageActionButton>
          </div>
          <div
            className={`px-4 py-3 leading-relaxed whitespace-pre-wrap break-words border-4 border-pixel-black ${systemMessage ? 'font-mono text-xs' : 'font-pixel text-sm'} ${cls}`}
            style={{ boxShadow: '4px 4px 0px 0px #101010' }}
          >
            <MessageRenderer content={msg.content} tone={userMessage ? 'inverse' : 'default'} />
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col bg-pixel-cream md:p-4">
      <div className="mb-3 hidden border-4 border-pixel-black bg-pixel-white p-3 md:block" style={{ boxShadow: '4px 4px 0px 0px #101010' }}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1" ref={sessionMenuRef}>
            <button
              type="button"
              onClick={() => setIsSessionMenuOpen((open) => !open)}
              disabled={sessionsLoading || conversationSessions.length === 0}
              className="flex h-10 w-full items-center gap-3 border-4 border-pixel-black bg-pixel-white px-3 text-left disabled:opacity-50"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-pixel text-xs text-pixel-black">
                  {activeSession?.title || '暂无对话'}
                </div>
                <div className="truncate font-mono text-[10px] text-pixel-black/50">
                  {sessionsLoading ? 'loading...' : activeSession ? `${activeSession.messageCount} messages` : 'waiting'}
                </div>
              </div>
              <span className="font-mono text-sm text-pixel-black/70">
                {isSessionMenuOpen ? '▲' : '▼'}
              </span>
            </button>

            <AnimatePresence>
              {isSessionMenuOpen && conversationSessions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-72 overflow-y-auto border-4 border-pixel-black bg-pixel-white p-1"
                  style={{ boxShadow: '4px 4px 0px 0px #101010' }}
                >
                  {conversationSessions.map((session, index) => {
                    const isActive = session.id === activeConversationId;
                    const isDeleting = deletingConversationId === session.id;

                    return (
                      <div
                        key={session.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => !isDeleting && handleSelectSession(session.id)}
                        onKeyDown={(event) => {
                          if ((event.key === 'Enter' || event.key === ' ') && !isDeleting) {
                            event.preventDefault();
                            handleSelectSession(session.id);
                          }
                        }}
                        className={`group flex items-center gap-3 px-3 py-2 ${
                          isActive ? 'bg-pixel-black text-pixel-white' : 'cursor-pointer text-pixel-black hover:bg-pixel-black/10'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-pixel text-xs">
                            {session.title || `Session ${conversationSessions.length - index}`}
                          </div>
                          <div className={`truncate font-mono text-[10px] ${isActive ? 'text-pixel-white/70' : 'text-pixel-black/50'}`}>
                            {session.messageCount} messages
                            {session.sessionId ? ` • ${session.sessionId}` : ''}
                          </div>
                        </div>
                        {isActive && (
                          <span className="font-pixel text-[10px] text-pixel-white/80">
                            当前
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(event) => handleDeleteSession(event, session.id)}
                          disabled={isDeleting}
                          className={`border-2 border-pixel-black px-2 py-1 font-pixel text-[10px] transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 ${
                            isActive
                              ? 'bg-pixel-white text-pixel-black opacity-0'
                              : 'bg-pixel-yellow text-pixel-black opacity-0'
                          } disabled:cursor-not-allowed disabled:opacity-100`}
                        >
                          {isDeleting ? '删除中' : '删除'}
                        </button>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="min-w-0 flex-1 font-mono text-[11px] text-pixel-black/70 truncate">
            sessionId: {currentSessionId || conversationSessions.find((session) => session.id === activeConversationId)?.sessionId || 'waiting'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onStartRenameSession}
              disabled={!activeConversationId || renamingSession}
              className="border-4 border-pixel-black bg-pixel-white px-3 py-2 font-pixel text-xs text-pixel-black disabled:opacity-50"
            >
              重命名
            </button>
            <button
              onClick={onNewSession}
              disabled={creatingSession}
              className="border-4 border-pixel-black bg-pixel-yellow px-3 py-2 font-pixel text-xs text-pixel-black disabled:opacity-50"
            >
              {creatingSession ? '创建中' : '新对话'}
            </button>
            <button
              onClick={onExportSession}
              disabled={!activeConversationId}
              className="border-4 border-pixel-black bg-pixel-blue px-3 py-2 font-pixel text-xs text-pixel-white disabled:opacity-50"
            >
              导出
            </button>
          </div>
        </div>
        {renamingSession && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={sessionTitleDraft}
              onChange={(event) => setSessionTitleDraft(event.target.value)}
              onKeyDown={handleRenameKeyDown}
              maxLength={80}
              autoFocus
              className="h-10 min-w-0 flex-1 border-4 border-pixel-black bg-pixel-white px-3 font-pixel text-xs text-pixel-black"
              placeholder="输入对话名称"
            />
            <button
              onClick={onSaveSessionTitle}
              disabled={savingSessionTitle || !sessionTitleDraft.trim()}
              className="border-4 border-pixel-black bg-pixel-blue px-3 py-2 font-pixel text-xs text-pixel-white disabled:opacity-50"
            >
              {savingSessionTitle ? '保存中' : '保存'}
            </button>
            <button
              onClick={onCancelRenameSession}
              disabled={savingSessionTitle}
              className="border-4 border-pixel-black bg-pixel-white px-3 py-2 font-pixel text-xs text-pixel-black disabled:opacity-50"
            >
              取消
            </button>
          </div>
        )}
        {(sessionError || currentConversationId) && (
          <div className="mt-2 font-pixel text-[10px] text-pixel-black/50">
            {sessionError || `conversation: ${currentConversationId || activeConversationId}`}
          </div>
        )}
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="rpg-dialog relative flex min-h-0 flex-1 flex-col max-md:!border-x-0 max-md:!shadow-none">
        <div className="absolute top-0 left-0 z-10 hidden h-6 w-6 border-b-4 border-r-4 border-pixel-black bg-pixel-white md:block" />
        <div className="absolute top-0 right-0 z-10 hidden h-6 w-6 border-b-4 border-l-4 border-pixel-black bg-pixel-white md:block" />
        <div className="absolute bottom-0 left-0 z-10 hidden h-6 w-6 border-r-4 border-t-4 border-pixel-black bg-pixel-white md:block" />
        <div className="absolute bottom-0 right-0 z-10 hidden h-6 w-6 border-l-4 border-t-4 border-pixel-black bg-pixel-white md:block" />

        <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-6">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="font-pixel text-lg text-pixel-black/60 mb-2">对话开始</div>
              <div className="font-pixel text-sm text-pixel-black/40">
                {isConnected ? (isSessionActive ? 'Agent 已连接，开始对话吧' : '正在启动 Agent...') : '正在连接...'}
              </div>
            </div>
          )}

          <AnimatePresence>
            {orderedMessages.map((msg) => renderMessage(msg))}
          </AnimatePresence>

          {agentState === 'thinking' && messages.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-left mb-4">
              <div className="inline-block bg-pixel-white text-pixel-black border-4 border-pixel-black px-4 py-2 font-pixel text-sm">
                <span className="animate-bounce">.</span>
                <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>.</span>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="border-t-2 border-pixel-black bg-pixel-white p-2 md:border-t-4 md:border-pixel-white md:bg-pixel-black/50 md:p-4">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageInputChange}
          />
          <div className="grid h-12 grid-cols-[36px_minmax(0,1fr)_56px] gap-2 md:grid-cols-[36px_156px_minmax(0,1fr)_64px]">
            <button
              type="button"
              title={uploadingImage ? '正在上传图片' : '上传图片'}
              aria-label={uploadingImage ? '正在上传图片' : '上传图片'}
              onClick={() => imageInputRef.current?.click()}
              disabled={!isConnected || !activeConversationId || uploadingImage}
              className="flex h-full w-full items-center justify-center border-4 border-pixel-black bg-pixel-white text-pixel-black transition-colors hover:bg-pixel-yellow disabled:opacity-50"
              style={{ boxShadow: '2px 2px 0px 0px #101010' }}
            >
              <PlusIcon className="h-4 w-4" />
            </button>
            <select
              value={currentModel}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={!isConnected || providerModelIds.length === 0 || savingModel}
              className="hidden h-full min-w-0 border-4 border-pixel-black bg-pixel-white px-2 font-pixel text-xs text-pixel-black disabled:opacity-50 md:block"
              title={activeProvider ? `当前供应商：${activeProvider.name}` : '暂无可用供应商'}
            >
              {providerModelIds.length === 0 ? (
                <option value="">暂无可用模型</option>
              ) : (
                providerModelIds.map((modelId) => (
                  <option key={modelId} value={modelId}>
                    {getModelDisplayName(modelId)}
                  </option>
                ))
              )}
            </select>
            <PixelInput
              ref={composerInputRef}
              value={inputValue}
              onChange={setInputValue}
              onKeyDown={handleKeyDown}
              placeholder="给 Agent 发消息..."
              className="h-full min-h-0 min-w-0 resize-none overflow-y-auto px-3 py-2 text-xs leading-5"
              disabled={!isConnected || !activeConversationId || uploadingImage}
              multiline
              compactMultiline
              rows={1}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputValue.trim() || !isConnected || !activeConversationId || uploadingImage}
              className="h-full w-full border-4 border-pixel-brown bg-pixel-red px-0 py-0 font-pixel text-xs text-pixel-white whitespace-nowrap transition-colors hover:bg-pixel-orange disabled:cursor-not-allowed disabled:opacity-50"
              style={{ boxShadow: !inputValue.trim() || !isConnected || !activeConversationId || uploadingImage ? '2px 2px 0px 0px #666' : '2px 2px 0px 0px #101010' }}
            >
              发送
            </button>
          </div>
          {(savingModel || composerStatus || canStopGenerating || !isConnected) && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-h-[18px] items-center gap-3">
                {savingModel && <p className="font-pixel text-[10px] text-pixel-black/50 md:text-pixel-white/50">正在切换模型...</p>}
                {!savingModel && composerStatus && (
                  <span className="font-pixel text-[10px] text-pixel-black/60 md:text-pixel-white/70">{composerStatus}</span>
                )}
                {!savingModel && !composerStatus && !isConnected && (
                  <span className="font-pixel text-[10px] text-pixel-black/45 md:text-pixel-white/45">正在连接 {agent.name}...</span>
                )}
              </div>
              {canStopGenerating && (
                <button
                  type="button"
                  onClick={onStopGenerating}
                  className="border-4 border-pixel-black bg-pixel-red px-2 py-1 font-pixel text-[10px] text-pixel-white"
                  style={{ boxShadow: '3px 3px 0px 0px #101010' }}
                >
                  终止
                </button>
              )}
            </div>
          )}
          <div className="mt-3 text-center">
            {error && <p className="font-pixel text-xs text-pixel-yellow">{error}</p>}
            {errorMessage && <p className="font-pixel text-xs text-pixel-yellow">{errorMessage}</p>}
            {modelError && <p className="font-pixel text-xs text-pixel-yellow">{modelError}</p>}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
// Monitor View Component
interface MonitorViewProps {
  agent: Agent;
  agentState: string;
  currentTask: string;
  tokenStats: TokenStats;
  toolCalls: ToolCall[];
  messages: any[];
}

function MonitorView({
  agent,
  agentState,
  currentTask,
  tokenStats,
  toolCalls,
  messages,
}: MonitorViewProps) {
  const messageCount = messages.length;
  const avgMessageLength = messages.length > 0
    ? Math.round(messages.reduce((acc, m) => acc + m.content.length, 0) / messages.length)
    : 0;

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      {/* Agent Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rpg-dialog p-6 border-4 border-pixel-black"
      >
        <h2 className="font-pixel text-lg mb-4 flex items-center gap-2">
          <span>🤖</span> Agent 状态
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <StatusItem label="当前状态" value={agentState} />
          <StatusItem label="平台" value={agent.platform || 'unknown'} />
          <StatusItem label="当前任务" value={currentTask || '无'} />
          <StatusItem label="工作空间" value={agent.workspacePath} truncate />
        </div>
      </motion.div>

      {/* Token Usage Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rpg-dialog p-6 border-4 border-pixel-black"
      >
        <h2 className="font-pixel text-lg mb-4 flex items-center gap-2">
          <span>💰</span> Token 消耗
        </h2>
        <div className="space-y-3">
          <TokenBar label="输入 Token" value={tokenStats.inputTokens} color="blue" />
          <TokenBar label="输出 Token" value={tokenStats.outputTokens} color="green" />
          <TokenBar label="总计" value={tokenStats.totalTokens} color="yellow" />
          {tokenStats.costEstimate && (
            <div className="pt-3 border-t-2 border-pixel-black/20">
              <div className="font-pixel text-sm text-pixel-black/70">
                预计费用: <span className="text-pixel-green font-bold">${tokenStats.costEstimate}</span>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Conversation Stats Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rpg-dialog p-6 border-4 border-pixel-black"
      >
        <h2 className="font-pixel text-lg mb-4 flex items-center gap-2">
          <span>📈</span> 对话统计
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <StatBox label="消息数" value={messageCount.toString()} />
          <StatBox label="平均长度" value={`${avgMessageLength} 字`} />
          <StatBox label="用户消息" value={messages.filter(m => m.role === 'user').length.toString()} />
        </div>
      </motion.div>

      {/* Tool Calls Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rpg-dialog p-6 border-4 border-pixel-black"
      >
        <h2 className="font-pixel text-lg mb-4 flex items-center gap-2">
          <span>🔧</span> 工具调用记录
        </h2>
        {toolCalls.length === 0 ? (
          <div className="font-pixel text-sm text-pixel-black/50 text-center py-4">
            暂无工具调用
          </div>
        ) : (
          <div className="space-y-2">
            {toolCalls.map((tool) => (
              <div
                key={tool.id}
                className="flex items-center justify-between p-3 bg-pixel-black/5 border-2 border-pixel-black/20"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${
                    tool.status === 'completed' ? 'bg-green-500' :
                    tool.status === 'failed' ? 'bg-red-500' :
                    'bg-yellow-500 animate-pulse'
                  }`} />
                  <span className="font-pixel text-sm">{tool.name}</span>
                </div>
                <span className="font-pixel text-xs text-pixel-black/50">
                  {tool.startTime.toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function StatusItem({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="font-pixel text-xs text-pixel-black/60">{label}</div>
      <div className={`font-pixel text-sm ${truncate ? 'truncate' : ''}`}>{value || '-'}</div>
    </div>
  );
}

function TokenBar({ label, value, color }: { label: string; value: number; color: 'blue' | 'green' | 'yellow' }) {
  const maxValue = 100000; // Assume max for percentage
  const percentage = Math.min((value / maxValue) * 100, 100);
  const colorClasses = {
    blue: 'bg-pixel-blue',
    green: 'bg-pixel-green',
    yellow: 'bg-pixel-yellow',
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between font-pixel text-xs">
        <span>{label}</span>
        <span>{value.toLocaleString()}</span>
      </div>
      <div className="h-3 bg-pixel-black/10 border-2 border-pixel-black">
        <div
          className={`h-full ${colorClasses[color]} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-4 bg-pixel-black/5 border-4 border-pixel-black">
      <div className="font-pixel text-xs text-pixel-black/60 mb-1">{label}</div>
      <div className="font-pixel text-2xl text-pixel-black">{value}</div>
    </div>
  );
}

// End of file
