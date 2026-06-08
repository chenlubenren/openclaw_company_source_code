'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';
import type {
  Architecture,
  ArchitectureAgent,
  ArchitectureEdge,
  ArchitectureNode,
  Project,
  WorkflowArtifact,
  WorkflowDsl,
  WorkflowExecution,
  WorkflowExecutionStatus,
  WorkflowNodeRunState,
} from '@/types';
import { PixelButton } from '@/components/ui/PixelButton';
import { PixelInput } from '@/components/ui/PixelInput';
import { ArchitectureInfo } from '@/components/architecture/ArchitectureInfo';
import { BackButton } from '@/components/ui/BackButton';
import { MessageRenderer } from '@/components/chat/MessageRenderer';
import { FeishuIntegrationCard } from '@/components/integration/FeishuIntegrationCard';
import { ProjectInfoMenu } from '@/components/projects/ProjectInfoMenu';
import { buildCanvasGraphFromWorkflowDsl, buildWorkflowDslFromCanvas } from '@/lib/workflowDsl';
import { fetchWorkflowExecution, startWorkflowExecution } from '@/lib/api';
import type { ArchTemplate } from '@/lib/archTemplates';
import type { Edge, Node } from '@xyflow/react';

type ChatRole = 'user' | 'system' | 'lobster' | 'error';
type ChatMessage = { role: ChatRole; content: string; agentName?: string };

const TERMINAL_EXECUTION_STATUSES: WorkflowExecutionStatus[] = ['succeeded', 'failed', 'cancelled'];

const NodeCanvas = dynamic(() => import('@/app/architectures/create/NodeCanvas'), { ssr: false });

export default function ArchitectureDetailPage() {
  const params = useParams();
  const router = useRouter();
  const archId = params.id as string;
  const {
    architectures,
    lobsters,
    projects,
    fetchArchitectures,
    fetchAgents,
    fetchProjects,
    updateArchitectureAPI,
    updateAgentStatus,
    setActiveAgent,
    setCurrentTask,
  } = useStore();

  const architecture = architectures.find((item: Architecture) => item.id === archId);
  const runnableDsl = useMemo(() => {
    if (!architecture) return null;
    return resolveArchitectureDsl(architecture);
  }, [architecture]);
  const editableTemplate = useMemo<ArchTemplate | null>(() => {
    if (!architecture) return null;
    const graph = architecture.nodes?.length
      ? { nodes: architecture.nodes, edges: architecture.edges ?? [] }
      : architecture.workflowDsl
        ? buildCanvasGraphFromWorkflowDsl(architecture.workflowDsl, lobsters)
        : { nodes: [], edges: [] };

    return {
      id: architecture.id,
      pattern: 'custom',
      name: architecture.name,
      nameCn: architecture.name,
      description: architecture.description,
      descriptionCn: architecture.description,
      agents: architecture.agents.map(({ status, ...agent }) => agent),
      nodes: graph.nodes,
      edges: graph.edges,
    };
  }, [architecture, lobsters]);
  const projectOptions = useMemo(() => {
    if (!architecture) return [];
    return projects.filter((project) => project.teamIds.includes(architecture.id));
  }, [architecture, projects]);

  const [inputValue, setInputValue] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasLoadedArchitectures, setHasLoadedArchitectures] = useState(false);
  const [graphCollapsed, setGraphCollapsed] = useState(false);
  const [progressCollapsed, setProgressCollapsed] = useState(false);
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [canvasAgents, setCanvasAgents] = useState<ArchitectureAgent[]>([]);
  const [canvasNodes, setCanvasNodes] = useState<Node[]>([]);
  const [canvasEdges, setCanvasEdges] = useState<Edge[]>([]);
  const [isSavingCanvas, setIsSavingCanvas] = useState(false);
  const [canvasSaveStatus, setCanvasSaveStatus] = useState('');
  const [canvasSaveError, setCanvasSaveError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const archRef = useRef(architecture);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedExecutionIdsRef = useRef<Set<string>>(new Set());
  const selectedProject = projectOptions.find((project) => project.id === selectedProjectId) ?? null;

  useEffect(() => {
    archRef.current = architecture;
  }, [architecture]);

  useEffect(() => {
    let active = true;
    setHasLoadedArchitectures(false);
    void fetchArchitectures().finally(() => {
      if (active) setHasLoadedArchitectures(true);
    });
    return () => {
      active = false;
    };
  }, [fetchArchitectures]);

  useEffect(() => {
    void fetchProjects();
    void fetchAgents();
  }, [fetchAgents, fetchProjects]);

  useEffect(() => {
    if (projectOptions.length === 0) {
      if (selectedProjectId) setSelectedProjectId('');
      return;
    }
    if (!selectedProjectId || !projectOptions.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projectOptions[0].id);
    }
  }, [projectOptions, selectedProjectId]);

  useEffect(() => {
    if (architecture && !isInitialized) {
      setChatMessages([
        {
          role: 'system',
          content: `欢迎来到 ${architecture.name}。输入任务后，后端会读取当前 Workflow DSL，按节点连接组织多个 Agent 协同工作。`,
        },
      ]);
      architecture.agents.forEach((agent: ArchitectureAgent) => {
        updateAgentStatus(archId, agent.id, 'standby');
      });
      setIsInitialized(true);
    }
  }, [architecture, archId, isInitialized, updateAgentStatus]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  const syncExecutionToUi = useCallback((nextExecution: WorkflowExecution) => {
    setExecution(nextExecution);

    const currentArch = archRef.current;
    const states = Object.values(nextExecution.nodeStates);
    const runningStates = states.filter((state) => state.status === 'running');
    const activeState = runningStates[0] ?? states.find((state) => state.status === 'ready');

    if (currentArch) {
      currentArch.agents.forEach((agent) => {
        const state = nextExecution.nodeStates[agent.nodeId || agent.id];
        if (!state) return;
        const nextStatus =
          state.status === 'running'
            ? 'executing'
            : state.status === 'ready'
              ? 'active'
              : 'standby';
        updateAgentStatus(currentArch.id, agent.id, nextStatus);
      });
    }

    setActiveAgent(activeState?.nodeId ?? null);
    setCurrentTask(runningStates.map((state) => `${state.label}: ${state.task || '处理中'}`).join('\n') || null);

    if (
      TERMINAL_EXECUTION_STATUSES.includes(nextExecution.status) &&
      !completedExecutionIdsRef.current.has(nextExecution.id)
    ) {
      completedExecutionIdsRef.current.add(nextExecution.id);
      setIsProcessing(false);
      setActiveAgent(null);
      setCurrentTask(null);

      setChatMessages((prev) => [
        ...prev,
        nextExecution.status === 'succeeded'
          ? {
              role: 'lobster',
              agentName: 'Workflow Executor',
              content: nextExecution.finalOutput || 'Workflow 执行完成，但没有返回最终输出。',
            }
          : {
              role: 'error',
              agentName: 'Workflow Executor',
              content: nextExecution.error || `Workflow 已结束：${nextExecution.status}`,
            },
      ]);
    }
  }, [setActiveAgent, setCurrentTask, updateAgentStatus]);

  const pollExecution = useCallback((executionId: string) => {
    const tick = async () => {
      try {
        const latest = await fetchWorkflowExecution(executionId);
        syncExecutionToUi(latest);
        if (!TERMINAL_EXECUTION_STATUSES.includes(latest.status)) {
          pollTimerRef.current = setTimeout(tick, 1200);
        }
      } catch (error) {
        setIsProcessing(false);
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'error',
            agentName: 'Workflow Executor',
            content: error instanceof Error ? error.message : '获取执行进度失败',
          },
        ]);
      }
    };

    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
    }
    void tick();
  }, [syncExecutionToUi]);

  const executeTaskWithWorkflow = async (task: string) => {
    const currentArch = archRef.current;
    if (!currentArch) return;

    const workflowDsl = currentArch.workflowDsl ?? runnableDsl;
    if (!workflowDsl) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'user', content: task },
        {
          role: 'error',
          agentName: 'Workflow Executor',
          content: '当前团队没有可执行的 Workflow DSL。请先在创建页用画布或自然语言生成团队。',
        },
      ]);
      return;
    }

    setIsProcessing(true);
    setProgressCollapsed(false);
    setCurrentTask(task);
    setChatMessages((prev) => [
      ...prev,
      { role: 'user', content: task },
      {
        role: 'system',
        agentName: 'Workflow Executor',
        content: '任务已提交到后端执行器。执行器会按 DSL 的 DAG/状态机规则调度 Agent，并持续回传节点进度。',
      },
    ]);
    setInputValue('');

    try {
      const started = await startWorkflowExecution({
        architectureId: currentArch.id,
        projectId: selectedProjectId || undefined,
        workflowDsl,
        task,
      });
      syncExecutionToUi(started);
      pollExecution(started.id);
    } catch (error) {
      setIsProcessing(false);
      setActiveAgent(null);
      setCurrentTask(null);
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'error',
          agentName: 'Workflow Executor',
          content: error instanceof Error ? error.message : '启动 Workflow 执行失败',
        },
      ]);
    }
  };

  const handleSend = () => {
    if (!inputValue.trim() || isProcessing) return;
    void executeTaskWithWorkflow(inputValue.trim());
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleAgentsFromCanvas = useCallback((agents: ArchitectureAgent[]) => {
    setCanvasAgents(agents);
    setCanvasSaveStatus('');
    setCanvasSaveError('');
  }, []);

  const handleCanvasGraphChange = useCallback((nodes: Node[], edges: Edge[]) => {
    setCanvasNodes(nodes);
    setCanvasEdges(edges);
    setCanvasSaveStatus('');
    setCanvasSaveError('');
  }, []);

  const handleSaveCanvas = useCallback(async () => {
    if (!architecture || canvasNodes.length === 0) return;

    const build = buildWorkflowDslFromCanvas({
      name: architecture.name,
      description: architecture.description,
      nodes: canvasNodes,
      edges: canvasEdges,
      source: 'canvas',
    });

    if (build.errors.length > 0) {
      setCanvasSaveStatus('');
      setCanvasSaveError(build.errors[0].message);
      return;
    }

    setIsSavingCanvas(true);
    setCanvasSaveStatus('');
    setCanvasSaveError('');

    try {
      await updateArchitectureAPI(architecture.id, {
        ...architecture,
        agents: canvasAgents.map((agent) => ({ ...agent, status: 'standby' as const })),
        nodes: toArchitectureNodes(canvasNodes),
        edges: toArchitectureEdges(canvasEdges),
        workflowDsl: build.dsl,
      });
      setCanvasSaveStatus('架构已保存');
    } catch (error) {
      setCanvasSaveError(error instanceof Error ? error.message : '保存团队架构失败');
    } finally {
      setIsSavingCanvas(false);
    }
  }, [architecture, canvasAgents, canvasEdges, canvasNodes, updateArchitectureAPI]);

  if (!architecture) {
    if (!hasLoadedArchitectures) {
      return (
        <div className="text-center py-16">
          <h2 className="chinese-large text-pixel-black text-2xl">正在加载团队...</h2>
        </div>
      );
    }

    return (
      <div className="text-center py-16">
        <h2 className="chinese-large text-pixel-black text-2xl">团队未找到</h2>
        <PixelButton onClick={() => router.push('/architectures/mine')} className="mt-6 text-lg">
          返回团队列表
        </PixelButton>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-6 mt-6"
      >
        <BackButton
          onClick={() => {
            if (typeof window !== 'undefined' && window.history.length > 1) {
              router.back();
              return;
            }
            router.push('/?mobileTab=teams');
          }}
        />
        <h1 className="chinese-large text-2xl text-pixel-black flex-1">
          {architecture.name}
        </h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch"
      >
        <ArchitectureInfo architecture={architecture} />
        <FeishuIntegrationCard
          scope="team"
          subjectId={architecture.id}
          subjectName={architecture.name}
          compact
        />
      </motion.div>

      <ProjectRunPanel
        projects={projectOptions}
        selectedProjectId={selectedProjectId}
        selectedProject={selectedProject}
        disabled={isProcessing}
        onChange={setSelectedProjectId}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-6"
      >
        <button
          onClick={() => setGraphCollapsed(!graphCollapsed)}
          className="w-full flex items-center justify-between px-2 py-1 mb-2 cursor-pointer"
        >
          <h2 className="chinese-large text-xl text-pixel-black">团队节点图</h2>
          <div className="flex items-center gap-3">
            <span className="font-pixel text-base text-pixel-black/60">
              {graphCollapsed ? '点击展开' : '点击收起'}
            </span>
            <motion.div
              animate={{ rotate: graphCollapsed ? 0 : 180 }}
              transition={{ duration: 0.2 }}
              className="text-pixel-black text-2xl leading-none"
            >
              ▲
            </motion.div>
          </div>
        </button>

        <AnimatePresence initial={false}>
          {!graphCollapsed && (
            <motion.div
              key="graph"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="space-y-3">
                <div
                  className="bg-pixel-white border-4 border-pixel-black p-3"
                  style={{ boxShadow: '6px 6px 0px 0px #101010' }}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-pixel text-sm text-pixel-black">编辑团队架构</div>
                      <p className="mt-1 font-pixel text-xs text-pixel-black/60">
                        修改节点、连线或关联 Agent 后，保存会同步更新 Workflow DSL。
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {canvasSaveStatus && (
                        <span className="font-pixel text-xs text-pixel-green">{canvasSaveStatus}</span>
                      )}
                      {canvasSaveError && (
                        <span className="font-pixel text-xs text-pixel-red">{canvasSaveError}</span>
                      )}
                      <PixelButton
                        onClick={() => void handleSaveCanvas()}
                        disabled={isSavingCanvas || canvasNodes.length === 0}
                        variant="primary"
                        className="text-sm"
                      >
                        {isSavingCanvas ? '保存中...' : '保存架构'}
                      </PixelButton>
                    </div>
                  </div>
                </div>
                <div className="h-[560px]">
                  {editableTemplate && (
                    <NodeCanvas
                      key={architecture.id}
                      initialTemplate={editableTemplate}
                      initialViewportMode="fit"
                      onAgentsChange={handleAgentsFromCanvas}
                      onGraphChange={handleCanvasGraphChange}
                    />
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {graphCollapsed && (
          <div
            className="h-12 bg-pixel-gray/20 border-4 border-pixel-black flex items-center justify-center font-pixel text-pixel-black/40 text-sm"
            style={{ boxShadow: '4px 4px 0px 0px #101010' }}
          >
            {architecture.name} - {architecture.agents.length} 名成员 - {architecture.edges?.length ?? 0} 条连接
          </div>
        )}
      </motion.div>

      {execution && (
        <WorkflowProgressPanel
          execution={execution}
          collapsed={progressCollapsed}
          onToggle={() => setProgressCollapsed((value) => !value)}
        />
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-6 border-4 border-pixel-black bg-pixel-white p-4"
        style={{ boxShadow: '6px 6px 0px 0px #101010' }}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-pixel text-base text-pixel-black">测试团队</div>
            <p className="mt-1 font-pixel text-xs text-pixel-black/60">
              打开测试对话框，输入任务后按当前保存的 Workflow DSL 执行。
            </p>
          </div>
          <PixelButton
            onClick={() => setIsTestDialogOpen(true)}
            disabled={isProcessing}
            variant="primary"
            className="text-base"
          >
            {isProcessing ? '测试中...' : '测试团队'}
          </PixelButton>
        </div>
      </motion.div>

      <AnimatePresence>
        {isTestDialogOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-pixel-black/70 p-4"
            onClick={() => setIsTestDialogOpen(false)}
          >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ delay: 0.3 }}
        className="w-full max-w-4xl max-h-[90vh] overflow-hidden bg-pixel-white border-4 border-pixel-black"
        style={{ boxShadow: '8px 8px 0px 0px #101010' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bg-pixel-blue text-pixel-white font-pixel text-xl p-4 border-b-4 border-pixel-black flex items-center gap-2">
          <span className="animate-pulse">{'>'}</span>
          <span>测试团队</span>
          <div className="ml-auto" />
          {isProcessing && (
            <span className="bg-pixel-yellow text-pixel-black px-3 py-1 text-sm animate-pulse">
              执行中...
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsTestDialogOpen(false)}
            className="border-2 border-pixel-black bg-pixel-white px-2 py-0.5 font-pixel text-sm text-pixel-black"
          >
            X
          </button>
        </div>

        <div className="p-6 min-h-[350px] max-h-[450px] overflow-y-auto bg-pixel-white">
          <AnimatePresence>
            {chatMessages.map((msg, index) => (
              <motion.div
                key={`${msg.role}-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
              >
                <div
                  className={`
                    inline-block max-w-[85%] px-5 py-3 font-pixel text-base text-left
                    ${msg.role === 'user'
                      ? 'bg-pixel-blue text-pixel-white border-4 border-pixel-black'
                      : msg.role === 'lobster'
                        ? 'bg-pixel-green text-pixel-white border-4 border-pixel-black'
                        : msg.role === 'error'
                          ? 'bg-pixel-red text-pixel-white border-4 border-pixel-black'
                          : 'bg-pixel-gray/50 text-pixel-black border-4 border-pixel-black'
                    }
                  `}
                  style={{ boxShadow: '3px 3px 0px 0px #101010' }}
                >
                  {msg.agentName && (
                    <div className="font-pixel text-sm opacity-70 mb-1 border-b border-pixel-white/20 pb-1">
                      {msg.agentName}
                    </div>
                  )}
                  <MessageRenderer
                    content={msg.content}
                    tone={msg.role === 'system' ? 'default' : 'inverse'}
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t-4 border-pixel-black p-4 bg-pixel-gray/20">
          <div className="flex gap-3">
            <PixelInput
              value={inputValue}
              onChange={setInputValue}
              onKeyDown={handleKeyDown}
              placeholder="输入任务指令..."
              className="flex-1"
              disabled={isProcessing}
            />
            <PixelButton
              onClick={handleSend}
              disabled={!inputValue.trim() || isProcessing}
              variant="primary"
              className="text-base px-6"
            >
              {isProcessing ? '执行中...' : '发送'}
            </PixelButton>
          </div>
          <p className="font-pixel text-sm text-pixel-black/50 mt-3 text-center">
            任务会提交到后端 Workflow Executor，由 DSL 决定 Agent 顺序、并行、条件分支和进度追踪。
          </p>
        </div>
      </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProjectRunPanel({
  projects,
  selectedProjectId,
  selectedProject,
  disabled,
  onChange,
}: {
  projects: Project[];
  selectedProjectId: string;
  selectedProject: Project | null;
  disabled: boolean;
  onChange: (projectId: string) => void;
}) {
  return (
    <div
      className="mb-6 border-4 border-pixel-black bg-pixel-white p-4"
      style={{ boxShadow: '6px 6px 0px 0px #101010' }}
    >
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="font-pixel text-sm text-pixel-black">已接入项目</div>
          <p className="mt-1 truncate font-pixel text-xs text-pixel-black/60">
            {selectedProject
              ? `测试将使用：${selectedProject.name}`
              : '当前团队还没有被任何项目接入，测试时会使用临时共享工作区。'}
          </p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Link
            href="/projects"
            className="inline-flex min-h-[40px] items-center justify-center border-3 border-pixel-black bg-pixel-yellow px-3 font-pixel text-sm text-pixel-black"
            style={{ boxShadow: '3px 3px 0px 0px #101010' }}
          >
            管理项目
          </Link>
        </div>
      </div>

      {projects.length > 0 ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const selected = selectedProjectId === project.id;
            return (
              <div
                key={project.id}
                className={`border-3 border-pixel-black p-2 ${selected ? 'bg-pixel-blue/10' : 'bg-pixel-gray/10'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-pixel text-sm text-pixel-black">{project.name}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {selected && (
                      <span className="inline-flex h-7 items-center border-2 border-pixel-black bg-pixel-green px-2 font-pixel text-[10px] leading-none text-pixel-white">
                        测试使用中
                      </span>
                    )}
                    <ProjectInfoMenu project={project} />
                  </div>
                </div>
                {project.description && (
                  <p className="mt-2 line-clamp-2 font-pixel text-xs text-pixel-black/60">
                    {project.description}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/projects/${project.id}`}
                    className="inline-flex min-h-[34px] items-center justify-center border-3 border-pixel-black bg-pixel-blue px-3 font-pixel text-xs text-pixel-white"
                    style={{ boxShadow: '3px 3px 0px 0px #101010' }}
                  >
                    打开项目
                  </Link>
                  {!selected && (
                    <button
                      type="button"
                      onClick={() => onChange(project.id)}
                      disabled={disabled}
                      className="min-h-[34px] border-3 border-pixel-black bg-pixel-white px-3 font-pixel text-xs text-pixel-black disabled:opacity-50"
                    >
                      用于测试
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border-3 border-pixel-black bg-pixel-gray/10 p-3 font-pixel text-xs text-pixel-black/60">
          还没有项目调用当前团队。到项目页为项目接入该团队后，这里会出现对应项目卡片。
        </div>
      )}
    </div>
  );
}

function WorkflowProgressPanel({
  execution,
  collapsed,
  onToggle,
}: {
  execution: WorkflowExecution;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const nodeStates = Object.values(execution.nodeStates);
  const running = nodeStates.filter((state) => state.status === 'running');
  const completedCount = nodeStates.filter((state) =>
    state.status === 'succeeded' || state.status === 'skipped'
  ).length;
  const recentEvents = execution.events.slice(-8).reverse();
  const artifacts = execution.artifacts || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-pixel-white border-4 border-pixel-black p-5 mb-6"
      style={{ boxShadow: '6px 6px 0px 0px #101010' }}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-3 text-left ${collapsed ? '' : 'mb-4'}`}
      >
        <div>
          <h2 className="font-pixel text-lg text-pixel-black">任务进展追踪</h2>
          <p className="font-pixel text-xs text-pixel-black/50 mt-1">
            {completedCount}/{nodeStates.length} 节点完成 · 执行 ID: {execution.id}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 border-2 border-pixel-black font-pixel text-xs ${executionStatusClass(execution.status)}`}>
            {executionStatusLabel(execution.status)}
          </div>
          <motion.span
            animate={{ rotate: collapsed ? 0 : 180 }}
            transition={{ duration: 0.2 }}
            className="font-pixel text-2xl leading-none text-pixel-black"
          >
            ▼
          </motion.span>
        </div>
      </button>

      {collapsed && (
        <div className="mt-3 bg-pixel-gray/20 border-3 border-pixel-black p-3 font-pixel text-sm text-pixel-black">
          {running.length > 0
            ? running.map((state) => `${state.agentName || state.label}: ${shortText(state.task || '处理中', 96)}`).join('\n')
            : `当前状态：${executionStatusLabel(execution.status)}`}
        </div>
      )}

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="progress-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mb-4 bg-pixel-gray/20 border-3 border-pixel-black p-3">
              <div className="font-pixel text-xs text-pixel-black/60 mb-1">当前正在工作</div>
              <div className="font-pixel text-sm text-pixel-black whitespace-pre-wrap">
                {running.length > 0
                  ? running.map((state) => `${state.agentName || state.label}: ${shortText(state.task || '处理中', 120)}`).join('\n')
                  : '暂无运行中的节点'}
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <div className="border-3 border-pixel-black bg-pixel-white p-3">
                <div className="font-pixel text-xs text-pixel-black/50">项目/共享工作区</div>
                <div className="mt-1 font-pixel text-sm text-pixel-black">
                  {execution.projectName || '临时团队运行'}
                </div>
                <div className="mt-2 break-all font-pixel text-xs text-pixel-black/60">
                  {execution.sharedWorkspacePath}
                </div>
              </div>
              <div className="border-3 border-pixel-black bg-pixel-white p-3">
                <div className="font-pixel text-xs text-pixel-black/50">产物目录</div>
                <div className="mt-1 break-all font-pixel text-xs text-pixel-black/70">
                  {execution.artifactsPath}
                </div>
                <div className="mt-2 font-pixel text-xs text-pixel-black/50">
                  已记录 {artifacts.length} 个节点输出/工作区文件
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3 mb-4">
              {nodeStates.map((state) => (
                <NodeProgressItem key={state.nodeId} state={state} />
              ))}
            </div>

            {artifacts.length > 0 && (
              <details className="mb-4">
                <summary className="cursor-pointer font-pixel text-sm text-pixel-blue">查看交接文件</summary>
                <ArtifactList artifacts={artifacts} />
              </details>
            )}

            <details>
              <summary className="cursor-pointer font-pixel text-sm text-pixel-blue">查看最近事件</summary>
              <div className="mt-3 space-y-2">
                {recentEvents.map((event) => (
                  <div key={event.id} className="border-2 border-pixel-black bg-pixel-gray/20 p-2">
                    <div className="font-pixel text-xs text-pixel-black/50">
                      {new Date(event.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <div className="font-pixel text-xs text-pixel-black mt-1">{event.message}</div>
                  </div>
                ))}
              </div>
            </details>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function NodeProgressItem({ state }: { state: WorkflowNodeRunState }) {
  const artifacts = state.artifacts || [];
  return (
    <div className="border-3 border-pixel-black bg-pixel-gray/10 p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-pixel text-sm text-pixel-black">{state.agentName || state.label}</div>
          <div className="font-pixel text-xs text-pixel-black/50 mt-1">
            {state.type}{state.kind ? ` / ${state.kind}` : ''}{state.role ? ` / ${state.role}` : ''} / run {state.runCount}
          </div>
        </div>
        <span className={`px-2 py-1 border-2 border-pixel-black font-pixel text-[10px] ${nodeStatusClass(state.status)}`}>
          {nodeStatusLabel(state.status)}
        </span>
      </div>
      {state.task && (
        <div className="font-pixel text-xs text-pixel-black/70 whitespace-pre-wrap">
          {shortText(state.task, 180)}
        </div>
      )}
      {state.error && (
        <div className="font-pixel text-xs text-pixel-red mt-2 whitespace-pre-wrap">
          {state.error}
        </div>
      )}
      {state.output && state.status !== 'running' && (
        <div className="font-pixel text-xs text-pixel-black/60 mt-2 whitespace-pre-wrap">
          {shortText(state.output, 180)}
        </div>
      )}
      {artifacts.length > 0 && (
        <div className="mt-2 border-t-2 border-pixel-black/20 pt-2">
          <div className="font-pixel text-[10px] text-pixel-black/50">产物 {artifacts.length}</div>
          <div className="mt-1 space-y-1">
            {artifacts.slice(0, 3).map((artifact) => (
              <div key={artifact.id} className="truncate font-pixel text-[10px] text-pixel-black/60">
                {artifact.kind === 'workspace-file' ? '文件' : '输出'} · {artifact.relativePath}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ArtifactList({ artifacts }: { artifacts: WorkflowArtifact[] }) {
  return (
    <div className="mt-3 grid gap-2 md:grid-cols-2">
      {artifacts.slice(-12).reverse().map((artifact) => (
        <div key={artifact.id} className="border-2 border-pixel-black bg-pixel-gray/10 p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate font-pixel text-xs text-pixel-black">{artifact.label}</div>
            <span className="shrink-0 border-2 border-pixel-black bg-pixel-white px-1.5 py-0.5 font-pixel text-[10px] text-pixel-black">
              {artifact.kind === 'workspace-file' ? 'FILE' : 'OUT'}
            </span>
          </div>
          <div className="mt-1 break-all font-pixel text-[10px] text-pixel-black/60">
            {artifact.path}
          </div>
        </div>
      ))}
    </div>
  );
}

function toArchitectureNodes(nodes: Node[]): ArchitectureNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type ?? 'agentNode',
    position: node.position,
    data: node.data as Record<string, unknown>,
  }));
}

function toArchitectureEdges(edges: Edge[]): ArchitectureEdge[] {
  return edges.map((edge) => {
    const data = edge.data as { label?: string; sourceHandle?: string } | undefined;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: typeof edge.label === 'string' ? edge.label : data?.label,
      sourceHandle: edge.sourceHandle ?? data?.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    };
  });
}

function resolveArchitectureDsl(architecture: Architecture): WorkflowDsl | null {
  if (architecture.workflowDsl) return architecture.workflowDsl;
  if (!architecture.nodes || architecture.nodes.length === 0) return null;
  return buildWorkflowDslFromCanvas({
    name: architecture.name,
    description: architecture.description,
    nodes: architecture.nodes,
    edges: architecture.edges ?? [],
    source: 'canvas',
  }).dsl;
}

function executionStatusLabel(status: WorkflowExecutionStatus): string {
  const labels: Record<WorkflowExecutionStatus, string> = {
    queued: '排队中',
    running: '执行中',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
  };
  return labels[status];
}

function executionStatusClass(status: WorkflowExecutionStatus): string {
  if (status === 'succeeded') return 'bg-pixel-green text-pixel-white';
  if (status === 'failed' || status === 'cancelled') return 'bg-pixel-red text-pixel-white';
  return 'bg-pixel-yellow text-pixel-black';
}

function nodeStatusLabel(status: WorkflowNodeRunState['status']): string {
  const labels: Record<WorkflowNodeRunState['status'], string> = {
    pending: '等待',
    ready: '就绪',
    running: '工作中',
    succeeded: '完成',
    failed: '失败',
    skipped: '跳过',
  };
  return labels[status];
}

function nodeStatusClass(status: WorkflowNodeRunState['status']): string {
  if (status === 'running') return 'bg-pixel-blue text-pixel-white';
  if (status === 'ready') return 'bg-pixel-yellow text-pixel-black';
  if (status === 'succeeded') return 'bg-pixel-green text-pixel-white';
  if (status === 'failed') return 'bg-pixel-red text-pixel-white';
  return 'bg-pixel-white text-pixel-black';
}

function shortText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}
