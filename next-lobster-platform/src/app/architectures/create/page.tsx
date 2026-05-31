'use client';

import { useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { PixelButton } from '@/components/ui/PixelButton';
import { BackButton } from '@/components/ui/BackButton';
import { useStore } from '@/store/useStore';
import { Architecture, ArchitectureAgent, ArchitectureNode, ArchitectureEdge, CreateMode } from '@/types';
import { decodeTemplate } from '@/lib/archTemplates';
import type { ArchTemplate } from '@/lib/archTemplates';
import type { Node, Edge } from '@xyflow/react';

// Dynamically import heavy components to reduce initial bundle
const NodeCanvas = dynamic(() => import('./NodeCanvas'), { ssr: false });
const ChatMode = dynamic(() => import('./ChatMode'), { ssr: false });

export default function CreateArchitecturePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-pixel text-pixel-black/50">加载中...</div>}>
      <CreateArchitecturePageInner />
    </Suspense>
  );
}

function CreateArchitecturePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addArchitecture } = useStore();

  // Decode template from URL if present
  const encoded = searchParams.get('template');
  const template: ArchTemplate | null = encoded ? decodeTemplate(encoded) : null;

  const [mode, setMode] = useState<CreateMode>('canvas');
  const [name, setName] = useState(template?.nameCn ?? '');
  const [description, setDescription] = useState(template?.descriptionCn ?? '');
  const [canvasAgents, setCanvasAgents] = useState<ArchitectureAgent[]>([]);
  const [canvasNodes, setCanvasNodes] = useState<Node[]>([]);
  const [canvasEdges, setCanvasEdges] = useState<Edge[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleAgentsFromCanvas = useCallback((agents: ArchitectureAgent[]) => {
    setCanvasAgents(agents);
  }, []);

  const handleCanvasGraphChange = useCallback((nodes: Node[], edges: Edge[]) => {
    setCanvasNodes(nodes);
    setCanvasEdges(edges);
  }, []);

  const handleAgentsFromChat = useCallback((agents: ArchitectureAgent[], chatName: string, chatDesc: string) => {
    setCanvasAgents(agents);
    if (chatName && !name) setName(chatName);
    if (chatDesc && !description) setDescription(chatDesc);
    // Switch to canvas to show the generated architecture
    setMode('canvas');
  }, [name, description]);

  const handleCreate = () => {
    if (!name.trim()) return;

    // Validation: every agent node must have a linked lobster
    const agentNodes = canvasNodes.filter((n) => n.type === 'agentNode');
    const missingLobster = agentNodes.filter((n) => !(n.data as { linkedLobster?: unknown }).linkedLobster);
    if (missingLobster.length > 0) {
      setCreateError(`⚠️ 节点没有选择Agent`);
      return;
    }

    setCreateError(null);

    const finalAgents: ArchitectureAgent[] = canvasAgents.length > 0
      ? canvasAgents.map((a, i) => ({
          ...a,
          id: `agent-${Date.now()}-${i}`,
          status: 'standby' as const,
        }))
      : [
          {
            id: `agent-${Date.now()}-0`,
            name: '默认成员',
            role: '成员',
            status: 'standby' as const,
            isManager: true,
            inputs: ['输入'],
            outputs: ['输出'],
          },
        ];

    // Convert canvas nodes to ArchitectureNode format
    const archNodes: ArchitectureNode[] = canvasNodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'agentNode',
      position: n.position,
      data: n.data as Record<string, unknown>,
    }));

    // Convert canvas edges to ArchitectureEdge format (strip ReactFlow-specific fields)
    const archEdges: ArchitectureEdge[] = canvasEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: (e.data as { label?: string } | undefined)?.label,
      sourceHandle: e.sourceHandle ?? (e.data as { sourceHandle?: string } | undefined)?.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
    }));

    const newArchitecture: Architecture = {
      id: `arch-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      agents: finalAgents,
      nodes: archNodes,
      edges: archEdges,
      createdAt: new Date().toISOString(),
    };

    addArchitecture(newArchitecture);
    router.push('/architectures/mine');
  };

  return (
    <div className="max-w-[1600px] mx-auto">
      <BackButton href="/" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="chinese-large text-3xl text-pixel-black font-bold mb-2">
            创建团队架构
          </h1>
          <p className="font-pixel text-sm text-pixel-black/60">
            通过节点拖拽或自然语言描述来设计你的团队
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="flex gap-2 mb-6 justify-center">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setMode('canvas')}
            className={`
              px-6 py-3 border-4 border-pixel-black font-pixel text-base
              transition-all
              ${mode === 'canvas'
                ? 'bg-pixel-blue text-pixel-white'
                : 'bg-pixel-white text-pixel-black hover:bg-pixel-gray'
              }
            `}
            style={mode === 'canvas' ? {} : { boxShadow: '4px 4px 0px 0px #101010' }}
          >
            🎨 节点式画布
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setMode('chat')}
            className={`
              px-6 py-3 border-4 border-pixel-black font-pixel text-base
              transition-all
              ${mode === 'chat'
                ? 'bg-pixel-blue text-pixel-white'
                : 'bg-pixel-white text-pixel-black hover:bg-pixel-gray'
              }
            `}
            style={mode === 'chat' ? {} : { boxShadow: '4px 4px 0px 0px #101010' }}
          >
            💬 自然语言对话
          </motion.button>
        </div>

        {/* Basic Info */}
        <div className="bg-pixel-white border-4 border-pixel-black p-6 mb-6"
             style={{ boxShadow: '6px 6px 0px 0px #101010' }}>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="font-pixel text-base text-pixel-black block mb-2">
                架构名称 <span className="text-pixel-red">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入架构名称..."
                className="w-full bg-pixel-white border-4 border-pixel-black font-pixel text-base text-pixel-black px-4 py-3 focus:outline-none focus:border-pixel-blue"
                style={{ boxShadow: 'inset 2px 2px 0px 0px #101010' }}
              />
            </div>
            <div>
              <label className="font-pixel text-base text-pixel-black block mb-2">
                架构描述
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="描述这个架构的功能..."
                className="w-full min-h-[58px] bg-pixel-white border-4 border-pixel-black font-pixel text-base text-pixel-black px-4 py-3 resize-none focus:outline-none focus:border-pixel-blue"
                style={{ boxShadow: 'inset 2px 2px 0px 0px #101010' }}
              />
            </div>
          </div>

          {/* Agent count + lobster coverage indicator */}
          {canvasAgents.length > 0 && (() => {
            const agentNodes = canvasNodes.filter((n) => n.type === 'agentNode');
            const linkedCount = agentNodes.filter((n) => (n.data as { linkedLobster?: unknown }).linkedLobster).length;
            const allLinked = linkedCount === agentNodes.length && agentNodes.length > 0;
            return (
              <div className="mt-4 pt-4 border-t-4 border-pixel-black flex items-center justify-between flex-wrap gap-2">
                <p className="font-pixel text-sm text-pixel-black/60">
                  📊 当前架构包含 {canvasAgents.length} 个成员
                  {canvasAgents.filter(a => a.isManager).length > 0 && (
                    <span className="text-pixel-blue ml-2">
                      （含 {canvasAgents.filter(a => a.isManager).length} 个管理员）
                    </span>
                  )}
                </p>
                <div className={`px-3 py-1 border-2 border-pixel-black font-pixel text-xs ${allLinked ? 'bg-pixel-green text-pixel-white' : 'bg-pixel-yellow text-pixel-black'}`}>
                  {allLinked ? `✅ 全部 ${linkedCount} 个节点已关联Agent` : `⚠️ ${linkedCount}/${agentNodes.length} 个节点已关联Agent`}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Mode Content */}
        <div className="mb-6" style={{ height: 'calc(100vh - 520px)', minHeight: '420px' }}>
          {mode === 'canvas' ? (
            <NodeCanvas onAgentsChange={handleAgentsFromCanvas} onGraphChange={handleCanvasGraphChange} initialTemplate={template} />
          ) : (
            <ChatMode onAgentsGenerated={handleAgentsFromChat} />
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <PixelButton
            onClick={() => router.push('/architectures/mine')}
            variant="secondary"
            size="lg"
            className="flex-1"
          >
            取消
          </PixelButton>
          <PixelButton
            onClick={handleCreate}
            disabled={!name.trim() || canvasAgents.length === 0}
            variant="primary"
            size="lg"
            className="flex-1"
          >
            创建架构
          </PixelButton>
        </div>

        {/* Error message */}
        {createError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 bg-pixel-red text-pixel-white border-4 border-pixel-black px-4 py-3 font-pixel text-sm"
            style={{ boxShadow: '4px 4px 0px 0px #101010' }}
          >
            ⚠️ {createError}
          </motion.div>
        )}

        {/* Helper text */}
        {canvasAgents.length === 0 && (
          <p className="text-center mt-4 font-pixel text-sm text-pixel-black/40">
            💡 请先通过画布或对话设计至少一个成员后再创建架构
          </p>
        )}
      </motion.div>
    </div>
  );
}
