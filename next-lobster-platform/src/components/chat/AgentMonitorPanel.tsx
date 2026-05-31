'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface ToolCall {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  duration?: number;
}

interface AgentMonitorPanelProps {
  agentState: 'idle' | 'thinking' | 'executing' | 'responding';
  currentTask: string;
  toolCalls: ToolCall[];
  onToolCall?: (toolId: string, action: 'approve' | 'deny') => void;
}

export function AgentMonitorPanel({
  agentState,
  currentTask,
  toolCalls,
  onToolCall,
}: AgentMonitorPanelProps) {
  const [uptime, setUptime] = useState(0);
  const [memoryUsage, setMemoryUsage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setUptime((prev) => prev + 1);
      setMemoryUsage(Math.random() * 50 + 30); // Simulated
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-4 space-y-4">
      {/* Agent State */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rpg-dialog p-4 border-4 border-pixel-black"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-pixel text-sm flex items-center gap-2">
            <span>🤖</span> 实时状态
          </h3>
          <StatusBadge state={agentState} />
        </div>
        
        <div className="space-y-2 font-pixel text-xs">
          <div className="flex justify-between">
            <span className="text-pixel-black/60">运行时长</span>
            <span>{formatUptime(uptime)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-pixel-black/60">当前任务</span>
            <span className="max-w-[150px] truncate">{currentTask || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-pixel-black/60">内存占用</span>
            <span>{memoryUsage.toFixed(1)} MB</span>
          </div>
        </div>
      </motion.div>

      {/* Tool Calls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rpg-dialog p-4 border-4 border-pixel-black"
      >
        <h3 className="font-pixel text-sm mb-3 flex items-center gap-2">
          <span>🔧</span> 工具调用
        </h3>
        
        {toolCalls.length === 0 ? (
          <div className="text-center py-4 font-pixel text-xs text-pixel-black/50">
            暂无工具调用
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {toolCalls.map((tool) => (
              <ToolCallItem
                key={tool.id}
                tool={tool}
                onApprove={onToolCall ? () => onToolCall(tool.id, 'approve') : undefined}
                onDeny={onToolCall ? () => onToolCall(tool.id, 'deny') : undefined}
              />
            ))}
          </div>
        )}
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rpg-dialog p-4 border-4 border-pixel-black"
      >
        <h3 className="font-pixel text-sm mb-3 flex items-center gap-2">
          <span>⚡</span> 快速操作
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <ActionButton icon="📋" label="清空对话" onClick={() => {}} />
          <ActionButton icon="💾" label="保存快照" onClick={() => {}} />
          <ActionButton icon="📊" label="导出日志" onClick={() => {}} />
          <ActionButton icon="🔄" label="重启 Agent" onClick={() => {}} />
        </div>
      </motion.div>
    </div>
  );
}

function StatusBadge({ state }: { state: string }) {
  const config = {
    idle: { color: 'bg-pixel-green', text: '空闲' },
    thinking: { color: 'bg-pixel-blue animate-pulse', text: '思考中' },
    executing: { color: 'bg-pixel-yellow animate-pulse', text: '执行中' },
    responding: { color: 'bg-pixel-green', text: '响应中' },
  };
  
  const { color, text } = config[state as keyof typeof config] || config.idle;
  
  return (
    <span className={`px-2 py-0.5 border-2 border-pixel-black font-pixel text-xs ${color}`}>
      {text}
    </span>
  );
}

function ToolCallItem({
  tool,
  onApprove,
  onDeny,
}: {
  tool: ToolCall;
  onApprove?: () => void;
  onDeny?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="p-2 bg-pixel-black/5 border-2 border-pixel-black/20"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-pixel text-xs">{tool.name}</span>
        <span className={`w-2 h-2 rounded-full ${
          tool.status === 'completed' ? 'bg-pixel-green' :
          tool.status === 'failed' ? 'bg-red-500' :
          tool.status === 'pending' ? 'bg-pixel-yellow' :
          'bg-pixel-blue animate-pulse'
        }`} />
      </div>
      
      {tool.status === 'pending' && (onApprove || onDeny) && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={onApprove}
            className="flex-1 px-2 py-1 bg-pixel-green text-pixel-white border-2 border-pixel-black font-pixel text-xs"
          >
            允许
          </button>
          <button
            onClick={onDeny}
            className="flex-1 px-2 py-1 bg-red-500 text-pixel-white border-2 border-pixel-black font-pixel text-xs"
          >
            拒绝
          </button>
        </div>
      )}
      
      {tool.duration && (
        <div className="font-pixel text-xs text-pixel-black/50 mt-1">
          耗时: {tool.duration}ms
        </div>
      )}
    </motion.div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 bg-pixel-white border-4 border-pixel-black font-pixel text-xs hover:bg-pixel-black/10 transition-colors"
    >
      <span className="block text-lg mb-1">{icon}</span>
      {label}
    </button>
  );
}
