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
}

interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costEstimate?: string;
}

interface ToolCall {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  result?: string;
}

type TabType = 'chat' | 'monitor' | 'capabilities';

const API_BASE = 'http://localhost:3002';

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
  const [systemMessagesCollapsed, setSystemMessagesCollapsed] = useState(true);
  
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
    sendMessage,
    startSession,
    stopSession,
    clearMessages,
    connect,
  } = useAgentChat({
    agentId,
    token: token || '',
    autoConnect: true,
    autoStartSession: true,
  });

  // Connect to WebSocket
  useEffect(() => {
    if (token && agentId) {
      connect();
    }
  }, [token, agentId, connect]);

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
      } catch (e) {
        console.error('Failed to fetch agent:', e);
        setErrorMessage('无法加载 Agent 信息');
      } finally {
        setIsLoading(false);
      }
    }

    fetchAgent();
  }, [agentId, token, router]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-start session when connected
  useEffect(() => {
    if (isConnected && !isSessionActive && agent) {
      startSession();
    }
  }, [isConnected, isSessionActive, agent, startSession]);

  // Update agent state based on messages
  useEffect(() => {
    if (messages.length === 0) {
      setAgentState('idle');
      setCurrentTask('');
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user') {
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
  }, [messages]);

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
    sendMessage(message);
  }, [inputValue, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    <div className="min-h-screen bg-pixel-cream flex flex-col">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-pixel-cream border-b-4 border-pixel-black"
      >
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BackButton href="/my-den" />
              
              {/* Agent Avatar */}
              <div className="relative">
                {agent.avatar ? (
                  <img
                    src={agent.avatar}
                    alt={agent.name}
                    className="w-12 h-12 pixelated border-4 border-pixel-black"
                  />
                ) : (
                  <div className="w-12 h-12 bg-pixel-yellow border-4 border-pixel-black flex items-center justify-center font-pixel text-2xl">
                    🦞
                  </div>
                )}
                <div
                  className={`absolute -bottom-1 -right-1 w-4 h-4 border-2 border-pixel-black rounded-full ${getStatusColor()}`}
                  title={getStatusText()}
                />
              </div>
              
              <div>
                <h1 className="font-pixel text-xl text-pixel-black">{agent.name}</h1>
                <div className="flex items-center gap-2">
                  <span className="font-pixel text-xs text-pixel-black/60">
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
            <div className="flex items-center gap-4">
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
          </div>

          {/* Current Task Progress */}
          {agentState !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-3 px-4 py-2 bg-pixel-black/10 border-2 border-pixel-black"
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
        <div className="flex border-t-2 border-pixel-black">
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
      <div className="flex-1 flex overflow-hidden">
        {/* Chat / Monitor / Settings Content */}
        <div className="flex-1 overflow-y-auto">
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
              systemMessagesCollapsed={systemMessagesCollapsed}
              setSystemMessagesCollapsed={setSystemMessagesCollapsed}
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

        {/* Settings Side Panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="w-96 border-l-4 border-pixel-black bg-pixel-cream overflow-y-auto"
            >
              <AgentSettingsPanel
                agent={agent}
                token={token || ''}
                onClose={() => setShowSettings(false)}
              />
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
  setInputValue: (v: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleSend: () => void;
  isConnected: boolean;
  isSessionActive: boolean;
  error?: string;
  errorMessage: string;
  systemMessagesCollapsed: boolean;
  setSystemMessagesCollapsed: (v: boolean) => void;
}

function ChatView(props: ChatViewProps) {
  const { messages, agent, agentState, messagesEndRef, inputValue, setInputValue, handleKeyDown, handleSend, isConnected, isSessionActive, error, errorMessage, systemMessagesCollapsed, setSystemMessagesCollapsed } = props;

  function getMsgClass(msg: any): string {
    if (msg.role === 'user') return 'bg-pixel-blue text-pixel-white';
    if (msg.isToolCall) return 'bg-pixel-yellow/50 text-pixel-black';
    return 'bg-pixel-white text-pixel-black';
  }

  function getLabel(msg: any): string {
    if (msg.role === 'user') return '你';
    if (msg.role === 'system') return '系统';
    if (msg.content && (msg.content.includes('Agents:') || msg.content.includes('[plugins]'))) return '系统';
    return agent.name;
  }

  function isSysMsg(msg: any): boolean {
    if (msg.role === 'system') return true;
    if (!msg.content) return false;
    return msg.content.includes('Agents:') || msg.content.includes('[plugins]') || msg.content.includes('Process exited');
  }

  const userMsgs = messages.filter(m => m.role === 'user');
  const agentMsgs = messages.filter(m => m.role === 'assistant' && !isSysMsg(m));
  const sysMsgs = messages.filter(m => isSysMsg(m));

  function renderMessage(msg: any) {
    const cls = getMsgClass(msg);
    const label = getLabel(msg);
    return (
      <motion.div key={msg.id} initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }} className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
        <div className={`font-pixel text-xs mb-1 ${msg.role === 'user' ? 'text-pixel-blue' : 'text-pixel-yellow'}`}>
          {label}
          {msg.isToolCall && <span className="ml-2 text-pixel-black/50">[工具: {msg.toolName}]</span>}
        </div>
        <div className={`inline-block max-w-[85%] px-4 py-3 font-pixel text-sm leading-relaxed whitespace-pre-wrap break-words border-4 border-pixel-black ${cls}`} style={{ boxShadow: '4px 4px 0px 0px #101010' }}>
          {msg.role === 'user' ? msg.content : <MessageRenderer content={msg.content} />}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="rpg-dialog relative">
        <div className="absolute top-0 left-0 w-6 h-6 bg-pixel-white border-r-4 border-b-4 border-pixel-black z-10" />
        <div className="absolute top-0 right-0 w-6 h-6 bg-pixel-white border-l-4 border-b-4 border-pixel-black z-10" />
        <div className="absolute bottom-0 left-0 w-6 h-6 bg-pixel-white border-r-4 border-t-4 border-pixel-black z-10" />
        <div className="absolute bottom-0 right-0 w-6 h-6 bg-pixel-white border-l-4 border-t-4 border-pixel-black z-10" />

        <div className="p-6 min-h-[400px] max-h-[60vh] overflow-y-auto">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="font-pixel text-lg text-pixel-black/60 mb-2">对话开始</div>
              <div className="font-pixel text-sm text-pixel-black/40">
                {isConnected ? (isSessionActive ? 'Agent 已启动，开始对话吧' : '正在启动 Agent...') : '正在连接...'}
              </div>
            </div>
          )}

          <AnimatePresence>
            {userMsgs.map((msg, idx) => renderMessage(msg))}
            {agentMsgs.map((msg) => renderMessage(msg))}
          </AnimatePresence>

          {sysMsgs.length > 0 && (
            <div className="mb-4 text-left">
              <button
                onClick={() => setSystemMessagesCollapsed(!systemMessagesCollapsed)}
                className="flex items-center gap-2 mb-2 hover:bg-pixel-black/10 px-2 py-1 -ml-2 transition-colors"
              >
                <span className="font-mono text-sm text-pixel-black/60">
                  {systemMessagesCollapsed ? '▶' : '▼'}
                </span>
                <span className="font-pixel text-sm text-pixel-black/60">
                  {systemMessagesCollapsed ? `系统消息 (${sysMsgs.length})` : `系统消息 (${sysMsgs.length})`}
                </span>
              </button>
              {!systemMessagesCollapsed && (
                <div className="space-y-3 pl-2 border-l-4 border-pixel-black/20">
                  {sysMsgs.map((msg) => (
                    <div key={msg.id} className="inline-block max-w-[85%] bg-pixel-black/5 border-4 border-pixel-black px-4 py-3 font-mono text-xs" style={{ boxShadow: '4px 4px 0px 0px #101010' }}>
                      <MessageRenderer content={msg.content} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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

        <div className="border-t-4 border-pixel-white p-4 bg-pixel-black/90">
          <div className="flex gap-3">
            <PixelInput value={inputValue} onChange={setInputValue} onKeyDown={handleKeyDown} placeholder="向 Agent 提问..." className="flex-1" disabled={!isConnected} />
            <PixelButton onClick={handleSend} disabled={!inputValue.trim() || !isConnected} variant="primary">发送</PixelButton>
          </div>
          <div className="mt-3 text-center">
            {error && <p className="font-pixel text-xs text-pixel-yellow">{error}</p>}
            {errorMessage && <p className="font-pixel text-xs text-pixel-yellow">{errorMessage}</p>}
            <p className="font-pixel text-xs text-pixel-white/40 mt-1">{isConnected ? `已连接到 ${agent.name}` : `正在连接到 ${agent.name}...`}</p>
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
