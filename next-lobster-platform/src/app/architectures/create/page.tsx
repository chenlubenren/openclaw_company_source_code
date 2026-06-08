'use client';

import { useState, useCallback, Suspense, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { PixelButton } from '@/components/ui/PixelButton';
import { BackButton } from '@/components/ui/BackButton';
import { useStore } from '@/store/useStore';
import { Architecture, ArchitectureAgent, ArchitectureNode, ArchitectureEdge, CreateMode } from '@/types';
import { WORKFLOW_MODE_TEMPLATES, decodeTemplate } from '@/lib/archTemplates';
import type { ArchTemplate } from '@/lib/archTemplates';
import { buildWorkflowDslFromCanvas } from '@/lib/workflowDsl';
import type { Node, Edge } from '@xyflow/react';
import type { GeneratedWorkflowPayload } from './ChatMode';

// Dynamically import heavy components to reduce initial bundle
const NodeCanvas = dynamic(() => import('./NodeCanvas'), { ssr: false });
const ChatMode = dynamic(() => import('./ChatMode'), { ssr: false });

function hasConcreteAgentLink(node: { data: Record<string, unknown> }): boolean {
  const data = node.data as { linkedLobster?: { id?: unknown } | null; linkedLobsterId?: unknown };
  const linkedId = typeof data.linkedLobster?.id === 'string'
    ? data.linkedLobster.id
    : typeof data.linkedLobsterId === 'string'
      ? data.linkedLobsterId
      : '';
  return Boolean(linkedId.trim()) && !/^(lobster|agent|arch)-/i.test(linkedId.trim());
}

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
  const { createArchitectureAPI, fetchAgents } = useStore();

  // Decode template from URL if present
  const encoded = searchParams.get('template');
  const template: ArchTemplate | null = encoded ? decodeTemplate(encoded) : null;

  const [mode, setMode] = useState<CreateMode>('canvas');
  const [generatedTemplate, setGeneratedTemplate] = useState<ArchTemplate | null>(null);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const [name, setName] = useState(template?.nameCn ?? '');
  const [description, setDescription] = useState(template?.descriptionCn ?? '');
  const [canvasAgents, setCanvasAgents] = useState<ArchitectureAgent[]>([]);
  const [canvasNodes, setCanvasNodes] = useState<Node[]>([]);
  const [canvasEdges, setCanvasEdges] = useState<Edge[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const activeTemplate = generatedTemplate ?? template;
  const referenceTemplates = useMemo(
    () => WORKFLOW_MODE_TEMPLATES.filter((item) => item.id !== 'mode-blank'),
    []
  );
  const collaborationPattern = activeTemplate?.pattern ?? (generatedTemplate ? 'natural-language' : 'custom');
  const workflowSource: NonNullable<ReturnType<typeof buildWorkflowDslFromCanvas>['dsl']['metadata']>['source'] =
    generatedTemplate?.pattern === 'natural-language'
      ? 'natural-language'
      : activeTemplate
        ? 'template'
        : 'canvas';

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const handleSelectWorkflowMode = useCallback((nextTemplate: ArchTemplate) => {
    setGeneratedTemplate(nextTemplate);
    setName(nextTemplate.nameCn);
    setDescription(nextTemplate.descriptionCn);
    setCreateError(null);
    setMode('canvas');
    setCanvasVersion((version) => version + 1);
  }, []);

  const handleAgentsFromCanvas = useCallback((agents: ArchitectureAgent[]) => {
    setCanvasAgents(agents);
  }, []);

  const handleCanvasGraphChange = useCallback((nodes: Node[], edges: Edge[]) => {
    setCanvasNodes(nodes);
    setCanvasEdges(edges);
  }, []);

  const handleWorkflowFromChat = useCallback((workflow: GeneratedWorkflowPayload) => {
    setCanvasAgents(workflow.agents);
    setCanvasNodes(workflow.nodes as Node[]);
    setCanvasEdges(workflow.edges as Edge[]);
    setName(workflow.name || '新团队');
    setDescription(workflow.description || '通过自然语言生成的团队');
    setGeneratedTemplate({
      id: `generated-${Date.now()}`,
      pattern: 'natural-language',
      name: workflow.name || 'Generated Workflow',
      nameCn: workflow.name || '生成团队',
      description: workflow.description || '',
      descriptionCn: workflow.description || '',
      agents: workflow.agents.map(({ status, ...agent }) => agent),
      nodes: workflow.nodes,
      edges: workflow.edges,
    });
    setCanvasVersion((version) => version + 1);
    setMode('canvas');
  }, []);

  const workflowBuild = useMemo(() => {
    if (canvasNodes.length === 0) return null;
    return buildWorkflowDslFromCanvas({
      name,
      description,
      nodes: canvasNodes,
      edges: canvasEdges,
      source: workflowSource,
      collaborationPattern,
    });
  }, [name, description, canvasNodes, canvasEdges, workflowSource, collaborationPattern]);

  const handleCreate = async () => {
    if (!name.trim()) return;

    const build = buildWorkflowDslFromCanvas({
      name,
      description,
      nodes: canvasNodes,
      edges: canvasEdges,
      source: workflowSource,
      collaborationPattern,
    });

    if (build.errors.length > 0) {
      setCreateError(build.errors[0].message);
      return;
    }

    setCreateError(null);

    const finalAgents: ArchitectureAgent[] = canvasAgents.length > 0
      ? canvasAgents.map((a) => ({
          ...a,
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
      workflowDsl: build.dsl,
      createdAt: new Date().toISOString(),
    };

    try {
      setIsCreating(true);
      await createArchitectureAPI(newArchitecture);
      router.push('/architectures/mine');
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : '创建团队失败');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="mx-auto -mt-2 max-w-[1600px] md:mt-0">
      <div className="mb-2 flex items-center gap-3 md:hidden">
        <div className="shrink-0 [&>div]:mb-0">
          <BackButton href="/" />
        </div>
        <h1 className="chinese-large text-2xl font-bold leading-none text-pixel-black">
          创建团队
        </h1>
      </div>

      <div className="hidden md:block">
        <BackButton href="/" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-0 md:mt-2"
      >
        {/* Header */}
        <div className="mb-3 hidden text-center md:block">
          <h1 className="chinese-large text-2xl text-pixel-black font-bold mb-1">
            创建团队
          </h1>
          <p className="font-pixel text-sm text-pixel-black/60">
            通过节点拖拽或自然语言描述来设计你的团队
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="mb-2 flex gap-2 justify-center md:mb-3">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setMode('canvas')}
            className={`
              flex-1 px-2 py-2 border-4 border-pixel-black font-pixel text-xs
              transition-all
              md:flex-none md:px-4 md:text-sm
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
              flex-1 px-2 py-2 border-4 border-pixel-black font-pixel text-xs
              transition-all
              md:flex-none md:px-4 md:text-sm
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
        <div className="bg-pixel-white border-4 border-pixel-black p-2 mb-3"
             style={{ boxShadow: '6px 6px 0px 0px #101010' }}>
          <div className="grid md:grid-cols-2 gap-2">
            <div>
              <label className="font-pixel text-sm text-pixel-black block mb-1">
                团队名称 <span className="text-pixel-red">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入团队名称..."
                className="w-full bg-pixel-white border-4 border-pixel-black font-pixel text-sm text-pixel-black px-3 py-1.5 focus:outline-none focus:border-pixel-blue"
                style={{ boxShadow: 'inset 2px 2px 0px 0px #101010' }}
              />
            </div>
            <div>
              <label className="font-pixel text-sm text-pixel-black block mb-1">
                团队描述
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="描述这个团队的工作方式..."
                className="w-full min-h-[36px] bg-pixel-white border-4 border-pixel-black font-pixel text-sm text-pixel-black px-3 py-1.5 resize-none focus:outline-none focus:border-pixel-blue"
                style={{ boxShadow: 'inset 2px 2px 0px 0px #101010' }}
              />
            </div>
          </div>

          {/* Agent count + lobster coverage indicator */}
          {canvasAgents.length > 0 && (() => {
            const agentNodes = canvasNodes.filter((n) => n.type === 'agentNode');
            const linkedCount = agentNodes.filter((n) => hasConcreteAgentLink(n as { data: Record<string, unknown> })).length;
            const allLinked = linkedCount === agentNodes.length && agentNodes.length > 0;
            return (
              <div className="mt-2 pt-2 border-t-4 border-pixel-black flex items-center justify-between flex-wrap gap-2">
                <p className="font-pixel text-xs text-pixel-black/60">
                  当前团队包含 {canvasAgents.length} 个成员
                  {canvasAgents.filter(a => a.isManager).length > 0 && (
                    <span className="text-pixel-blue ml-2">
                      （含 {canvasAgents.filter(a => a.isManager).length} 个管理员）
                    </span>
                  )}
                </p>
                <div className={`px-3 py-1 border-2 border-pixel-black font-pixel text-xs ${allLinked ? 'bg-pixel-green text-pixel-white' : 'bg-pixel-yellow text-pixel-black'}`}>
                  {allLinked ? `全部 ${linkedCount} 个节点已关联Agent` : `${linkedCount}/${agentNodes.length} 个节点已关联Agent`}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Mode Content */}
        <div className="mb-4 h-[470px] md:h-[490px]">
          {mode === 'canvas' ? (
            <NodeCanvas
              key={`${activeTemplate?.id ?? 'default'}-${canvasVersion}`}
              onAgentsChange={handleAgentsFromCanvas}
              onGraphChange={handleCanvasGraphChange}
              initialTemplate={activeTemplate}
              workflowTemplates={referenceTemplates}
              activeTemplateId={activeTemplate?.id}
              activeTemplateName={activeTemplate?.nameCn}
              onSelectTemplate={handleSelectWorkflowMode}
            />
          ) : (
            <ChatMode onWorkflowGenerated={handleWorkflowFromChat} />
          )}
        </div>

        {/* DSL Preview */}
        {workflowBuild && (
          <details
            className="bg-pixel-white border-4 border-pixel-black p-4 mb-6"
            style={{ boxShadow: '6px 6px 0px 0px #101010' }}
          >
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-pixel text-base text-pixel-black">Workflow DSL</h2>
                  <p className="font-pixel text-xs text-pixel-black/50 mt-1">
                    默认折叠显示，展开后查看校验提示与生成 JSON。
                  </p>
                </div>
                <div className={`px-3 py-1 border-2 border-pixel-black font-pixel text-xs ${
                  workflowBuild.errors.length === 0 ? 'bg-pixel-green text-pixel-white' : 'bg-pixel-red text-pixel-white'
                }`}>
                  {workflowBuild.errors.length === 0 ? '可执行' : `${workflowBuild.errors.length} 个错误`}
                </div>
              </div>
            </summary>
            <div className="mt-3">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="font-pixel text-base text-pixel-black">Workflow DSL</h2>
                <p className="font-pixel text-xs text-pixel-black/50 mt-1">
                  画布会先转成受控 DSL，后端运行时只消费 DSL，不直接执行自由文本。
                </p>
              </div>
              <div className={`px-3 py-1 border-2 border-pixel-black font-pixel text-xs ${
                workflowBuild.errors.length === 0 ? 'bg-pixel-green text-pixel-white' : 'bg-pixel-red text-pixel-white'
              }`}>
                {workflowBuild.errors.length === 0 ? '可执行' : `${workflowBuild.errors.length} 个错误`}
              </div>
            </div>

            {(workflowBuild.errors.length > 0 || workflowBuild.warnings.length > 0) && (
              <div className="grid md:grid-cols-2 gap-3 mb-3">
                {workflowBuild.errors.length > 0 && (
                  <div className="bg-pixel-red/10 border-3 border-pixel-red p-3 md:col-span-2">
                    <div className="font-pixel text-xs text-pixel-red mb-2">阻塞问题</div>
                    <ul className="space-y-1">
                      {workflowBuild.errors.slice(0, 5).map((item) => (
                        <li key={`${item.code}-${item.nodeId ?? item.edgeId ?? item.message}`} className="font-pixel text-xs text-pixel-black">
                          {item.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {workflowBuild.warnings.length > 0 && (
                  <div className="bg-pixel-yellow/20 border-3 border-pixel-yellow p-3 md:col-span-2">
                    <div className="font-pixel text-xs text-pixel-black mb-2">运行提示</div>
                    <ul className="space-y-1">
                      {workflowBuild.warnings.slice(0, 5).map((item) => (
                        <li key={`${item.code}-${item.message}`} className="font-pixel text-xs text-pixel-black">
                          {item.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <details>
              <summary className="cursor-pointer font-pixel text-sm text-pixel-blue">查看生成的 JSON</summary>
              <pre className="mt-3 max-h-72 overflow-auto bg-pixel-black text-pixel-white p-3 text-xs leading-relaxed">
                {JSON.stringify(workflowBuild.dsl, null, 2)}
              </pre>
            </details>
            </div>
          </details>
        )}

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
            disabled={isCreating || !name.trim() || canvasAgents.length === 0 || (workflowBuild?.errors.length ?? 0) > 0}
            variant="primary"
            size="lg"
            className="flex-1"
          >
            {isCreating ? '保存中...' : '创建团队'}
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
            {createError}
          </motion.div>
        )}

        {/* Helper text */}
        {canvasAgents.length === 0 && (
          <p className="text-center mt-4 font-pixel text-sm text-pixel-black/40">
            💡 请先通过画布或对话设计至少一个成员后再创建团队
          </p>
        )}
      </motion.div>
    </div>
  );
}
