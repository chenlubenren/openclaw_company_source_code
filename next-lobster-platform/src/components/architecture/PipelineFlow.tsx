'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Architecture, ArchitectureAgent, Lobster } from '@/types';
import { useStore } from '@/store/useStore';

interface PipelineFlowProps {
  architecture: Architecture;
}

export function PipelineFlow({ architecture }: PipelineFlowProps) {
  const { activeAgentId, currentTask, lobsters, updateAgentLink } = useStore();
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [showLobsterPicker, setShowLobsterPicker] = useState(false);
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);

  const handleLinkLobster = (agentId: string, lobsterId: string) => {
    updateAgentLink(architecture.id, agentId, lobsterId);
    setShowLobsterPicker(false);
    setPendingAgentId(null);
    setEditingAgentId(null);
  };

  const openLobsterPicker = (agentId: string) => {
    setPendingAgentId(agentId);
    setShowLobsterPicker(true);
    setEditingAgentId(agentId);
  };

  const getLinkedLobster = (agent: ArchitectureAgent): Lobster | undefined => {
    if (agent.linkedLobsterId) {
      return lobsters.find((l: Lobster) => l.id === agent.linkedLobsterId);
    }
    return undefined;
  };

  return (
    <div className="relative">
      {/* Current Task Indicator */}
      {currentTask && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -top-6 left-1/2 -translate-x-1/2 bg-pixel-black text-pixel-white px-4 py-2 border-2 border-pixel-black font-pixel text-sm z-10"
          style={{ boxShadow: '2px 2px 0px 0px #101010' }}
        >
          任务: {currentTask}
        </motion.div>
      )}

      {/* Main Pipeline Container */}
      <div 
        className="relative bg-pixel-white p-6 rounded-lg border-4 border-pixel-black min-h-[180px]"
        style={{ boxShadow: '6px 6px 0px 0px #101010' }}
      >
        {/* Pipeline with Arrows */}
        <div className="relative flex items-center justify-between gap-2">
          {architecture.agents.map((agent, index) => {
            const linkedLobster = getLinkedLobster(agent);
            const isActive = activeAgentId === agent.id;

            return (
              <div key={agent.id} className="flex items-center">
                {/* Agent Node - Compact Style */}
                <div className="relative flex flex-col items-center">
                  {/* Agent Card - Simplified without sprite */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className={`
                      relative p-3 border-4 border-pixel-black min-w-[120px]
                      ${isActive ? 'bg-pixel-green' : linkedLobster ? 'bg-pixel-blue' : 'bg-pixel-gray'}
                      cursor-pointer hover:scale-105 transition-transform
                    `}
                    style={{ 
                      boxShadow: isActive ? '4px 4px 0px 0px #101010' : '2px 2px 0px 0px #666'
                    }}
                    onClick={() => openLobsterPicker(agent.id)}
                  >
                    {/* Manager Badge */}
                    {agent.isManager && (
                      <div className="absolute -top-2 -right-2 bg-pixel-red text-pixel-white px-2 py-0.5 border-2 border-pixel-black font-pixel text-xs">
                        管理员
                      </div>
                    )}

                    {/* Agent Icon - Simple pixel character */}
                    <div className="flex justify-center mb-2">
                      <div className="relative">
                        {/* Head */}
                        <div className={`w-8 h-8 mx-auto ${agent.isManager ? 'bg-pixel-red' : 'bg-pixel-yellow'} border-2 border-pixel-black`}>
                          <div className="absolute top-1 left-1/2 -translate-x-1/2 flex gap-1">
                            <div className="w-1 h-1 bg-pixel-black rounded-full" />
                            <div className="w-1 h-1 bg-pixel-black rounded-full" />
                          </div>
                        </div>
                        {/* Body */}
                        <div className={`w-10 h-6 mx-auto -mt-1 ${agent.isManager ? 'bg-pixel-blue' : 'bg-pixel-green'} border-2 border-pixel-black`}>
                          {agent.isManager && <div className="w-2 h-3 mx-auto bg-pixel-red" />}
                        </div>
                      </div>
                    </div>

                    {/* Agent Info */}
                    <div className="text-center">
                      <div className="font-pixel text-sm text-pixel-white font-bold truncate max-w-[100px]">
                        {agent.name}
                      </div>
                      <div className="font-pixel text-xs text-pixel-white/70 truncate max-w-[100px]">
                        {agent.role}
                      </div>
                    </div>

                    {/* Linked Lobster */}
                    {linkedLobster && (
                      <div className="mt-1 pt-1 border-t border-pixel-white/30">
                        <div className="font-pixel text-xs text-pixel-white/80">
                          {linkedLobster.isConnected ? '🟢' : '⚪'} {linkedLobster.name}
                        </div>
                      </div>
                    )}
                  </motion.div>

                  {/* Status Badge */}
                  <div className={`
                    mt-3 px-2 py-0.5 border-2 border-pixel-black font-pixel text-xs
                    ${agent.status === 'executing' ? 'bg-pixel-yellow animate-pulse' : 
                      agent.status === 'active' ? 'bg-pixel-green' : 'bg-pixel-gray'}
                    text-pixel-white
                  `}>
                    {agent.status === 'standby' ? '待命' : 
                     agent.status === 'active' ? '激活' : '执行中'}
                  </div>

                  {/* Edit Hint */}
                  <div className="mt-1 opacity-0 hover:opacity-100 transition-opacity">
                    <span className="font-pixel text-xs text-pixel-black/50">点击更换Agent</span>
                  </div>
                </div>

                {/* Arrow between agents */}
                {index < architecture.agents.length - 1 && (
                  <div className="flex items-center px-1">
                    <svg width="40" height="20" className="overflow-visible">
                      <motion.line
                        x1="0"
                        y1="10"
                        x2="30"
                        y2="10"
                        stroke="#101010"
                        strokeWidth="3"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.5, delay: index * 0.2 }}
                      />
                      <motion.polygon
                        points="25,5 35,10 25,15"
                        fill="#101010"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: index * 0.2 + 0.4 }}
                      />
                      {isActive && (
                        <motion.circle
                          r="3"
                          fill="#3A5BA0"
                          initial={{ cx: 0 }}
                          animate={{ cx: [0, 32] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          style={{ cy: 10 }}
                        />
                      )}
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 pt-3 border-t-2 border-pixel-black/20 flex justify-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-pixel-gray border-2 border-pixel-black" />
            <span className="font-pixel text-sm text-pixel-black">未连接</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-pixel-blue border-2 border-pixel-black" />
            <span className="font-pixel text-sm text-pixel-black">已连接</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-pixel-green border-2 border-pixel-black" />
            <span className="font-pixel text-sm text-pixel-black">执行中</span>
          </div>
        </div>
      </div>

      {/* Lobster Picker Modal */}
      <AnimatePresence>
        {showLobsterPicker && pendingAgentId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-pixel-black/70"
            onClick={() => {
              setShowLobsterPicker(false);
              setPendingAgentId(null);
              setEditingAgentId(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-pixel-white border-4 border-pixel-black p-6 max-w-lg w-full mx-4"
              style={{ boxShadow: '8px 8px 0px 0px #101010' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-pixel text-xl text-pixel-black mb-4 text-center">
                选择Agent
              </h3>
              
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {lobsters.map((lobster: Lobster) => (
                  <motion.button
                    key={lobster.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleLinkLobster(pendingAgentId, lobster.id)}
                    className={`
                      w-full p-3 border-4 border-pixel-black text-left
                      ${lobster.isConnected ? 'bg-pixel-blue' : 'bg-pixel-gray'}
                      hover:shadow-lg transition-all
                    `}
                    style={{ boxShadow: '4px 4px 0px 0px #101010' }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-pixel text-base text-pixel-white font-bold">
                          {lobster.name}
                        </div>
                        <div className="font-pixel text-sm text-pixel-white/70">
                          {lobster.role}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-pixel text-sm ${lobster.isConnected ? 'text-pixel-green' : 'text-pixel-white/50'}`}>
                          {lobster.isConnected ? '🟢 已连接' : '⚪ 未连接'}
                        </div>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>

              <button
                onClick={() => {
                  setShowLobsterPicker(false);
                  setPendingAgentId(null);
                  setEditingAgentId(null);
                }}
                className="w-full mt-4 p-3 bg-pixel-black text-pixel-white border-4 border-pixel-black font-pixel text-base hover:bg-pixel-gray transition-colors"
              >
                取消
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
