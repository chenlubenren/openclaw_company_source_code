'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import Link from 'next/link';
import { ArchitectureInfo } from '@/components/architecture/ArchitectureInfo';
import { NodeFlowPreview } from '@/components/architecture/NodeFlowPreview';
import { PixelButton } from '@/components/ui/PixelButton';
import { PixelInput } from '@/components/ui/PixelInput';
import { fetchProjectFileContent, fetchProjectFiles, fetchWorkflowExecution, startWorkflowExecution } from '@/lib/api';
import { buildWorkflowDslFromCanvas } from '@/lib/workflowDsl';
import { useStore } from '@/store/useStore';
import type {
  Architecture,
  Lobster,
  Project,
  ProjectFileContent,
  ProjectFileNode,
  ProjectFileTree,
  WorkflowDsl,
  WorkflowExecution,
  WorkflowExecutionStatus,
} from '@/types';

const TERMINAL_STATUSES: WorkflowExecutionStatus[] = ['succeeded', 'failed', 'cancelled'];
const FILE_PANEL_DEFAULT_WIDTH = 320;
const FILE_PANEL_MIN_WIDTH = 220;
const FILE_PANEL_MAX_WIDTH = 520;

type ChatRole = 'user' | 'assistant' | 'system' | 'error';
type ProjectMode = 'agent' | 'team';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  agentName?: string;
}

interface ProjectSession {
  id: string;
  title: string;
  messages: ChatMessage[];
}

interface FilePreviewState {
  path: string;
  loading: boolean;
  file?: ProjectFileContent;
  error?: string;
}

export function ProjectWorkspace({
  project,
  architectures,
}: {
  project: Project;
  architectures: Architecture[];
}) {
  const { updateProjectAPI, fetchProjects, lobsters, fetchAgents } = useStore();
  const boundAgentIds = useMemo(() => project.agentIds || [], [project.agentIds]);
  const boundTeams = useMemo(
    () => architectures.filter((team) => project.teamIds.includes(team.id)),
    [architectures, project.teamIds]
  );
  const boundAgents = useMemo(
    () => lobsters.filter((agent) => boundAgentIds.includes(agent.id)),
    [boundAgentIds, lobsters]
  );
  const [activeTeamId, setActiveTeamId] = useState('');
  const [activeAgentId, setActiveAgentId] = useState('');
  const [activeMode, setActiveMode] = useState<ProjectMode>('team');
  const activeTeam = boundTeams.find((team) => team.id === activeTeamId) || boundTeams[0] || null;
  const activeAgent = boundAgents.find((agent) => agent.id === activeAgentId) || boundAgents[0] || null;
  const activeDsl = useMemo(() => (activeTeam ? resolveArchitectureDsl(activeTeam) : null), [activeTeam]);
  const [fileCollapsed, setFileCollapsed] = useState(true);
  const [filePanelWidth, setFilePanelWidth] = useState(FILE_PANEL_DEFAULT_WIDTH);
  const [preview, setPreview] = useState<FilePreviewState | null>(null);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamBindingOpen, setTeamBindingOpen] = useState(false);
  const [bindingTeamIds, setBindingTeamIds] = useState<string[]>(project.teamIds);
  const [bindingAgentIds, setBindingAgentIds] = useState<string[]>(boundAgentIds);
  const [bindingSaving, setBindingSaving] = useState(false);
  const [bindingMessage, setBindingMessage] = useState('');
  const [sessionsByTeamId, setSessionsByTeamId] = useState<Record<string, ProjectSession[]>>({});
  const [activeSessionIdByTeamId, setActiveSessionIdByTeamId] = useState<Record<string, string>>({});
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [latestExecution, setLatestExecution] = useState<WorkflowExecution | null>(null);
  const activeTarget = activeMode === 'agent' ? activeAgent : activeTeam;
  const activeTargetKey = `${activeMode}:${activeTarget?.id || 'unbound'}`;
  const activeTargetSessions = sessionsByTeamId[activeTargetKey] || [];
  const activeSessionId = activeSessionIdByTeamId[activeTargetKey] || '';
  const activeSession = activeTargetSessions.find((session) => session.id === activeSessionId) || activeTargetSessions[0] || null;

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    setActiveMode((current) => {
      if (current === 'agent' && boundAgents.length > 0) return current;
      if (current === 'team' && boundTeams.length > 0) return current;
      return boundAgents.length > 0 ? 'agent' : 'team';
    });
  }, [boundAgents.length, boundTeams.length]);

  useEffect(() => {
    setActiveTeamId((current) => {
      if (boundTeams.some((team) => team.id === current)) return current;
      return boundTeams[0]?.id || '';
    });
  }, [boundTeams]);

  useEffect(() => {
    setActiveAgentId((current) => {
      if (boundAgents.some((agent) => agent.id === current)) return current;
      return boundAgents[0]?.id || '';
    });
  }, [boundAgents]);

  useEffect(() => {
    setSessionsByTeamId({});
    setActiveSessionIdByTeamId({});
    setFileCollapsed(true);
    setPreview(null);
    setLatestExecution(null);
    setChatDraft('');
  }, [project.id]);

  useEffect(() => {
    setBindingTeamIds(project.teamIds);
    setBindingAgentIds(boundAgentIds);
    setBindingMessage('');
  }, [boundAgentIds, project.id, project.teamIds]);

  useEffect(() => {
    if (activeSession) return;
    const session = makeSession(project, activeTarget?.name, activeMode);
    setSessionsByTeamId((current) => ({
      ...current,
      [activeTargetKey]: [session],
    }));
    setActiveSessionIdByTeamId((current) => ({
      ...current,
      [activeTargetKey]: session.id,
    }));
  }, [activeMode, activeSession, activeTarget?.name, activeTargetKey, project]);

  const appendMessage = useCallback((teamKey: string, sessionId: string, message: ChatMessage) => {
    setSessionsByTeamId((current) => ({
      ...current,
      [teamKey]: (current[teamKey] || []).map((session) =>
        session.id === sessionId ? { ...session, messages: [...session.messages, message] } : session
      ),
    }));
  }, []);

  const openFilePreview = useCallback(async (relativePath: string) => {
    setPreview({ path: relativePath, loading: true });
    try {
      const file = await fetchProjectFileContent(project.id, relativePath);
      setPreview({ path: relativePath, loading: false, file });
    } catch (error) {
      setPreview({
        path: relativePath,
        loading: false,
        error: error instanceof Error ? error.message : '读取文件失败',
      });
    }
  }, [project.id]);

  const createSession = () => {
    const next = makeSession(project, activeTarget?.name, activeMode, `会话 ${activeTargetSessions.length + 1}`);
    setSessionsByTeamId((current) => ({
      ...current,
      [activeTargetKey]: [next, ...(current[activeTargetKey] || [])],
    }));
    setActiveSessionIdByTeamId((current) => ({ ...current, [activeTargetKey]: next.id }));
  };

  const deleteSession = (sessionId: string) => {
    setSessionsByTeamId((current) => {
      const next = (current[activeTargetKey] || []).filter((session) => session.id !== sessionId);
      if (next.length === 0) {
        const fallback = makeSession(project, activeTarget?.name, activeMode);
        setActiveSessionIdByTeamId((ids) => ({ ...ids, [activeTargetKey]: fallback.id }));
        return { ...current, [activeTargetKey]: [fallback] };
      }
      if (sessionId === activeSession?.id) {
        setActiveSessionIdByTeamId((ids) => ({ ...ids, [activeTargetKey]: next[0].id }));
      }
      return { ...current, [activeTargetKey]: next };
    });
  };

  const openTeamBinding = () => {
    setBindingTeamIds(project.teamIds);
    setBindingAgentIds(boundAgentIds);
    setBindingMessage('');
    setTeamBindingOpen(true);
  };

  const toggleBindingTeam = (teamId: string) => {
    setBindingTeamIds((current) =>
      current.includes(teamId)
        ? current.filter((id) => id !== teamId)
        : [...current, teamId]
    );
  };

  const toggleBindingAgent = (agentId: string) => {
    setBindingAgentIds((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId]
    );
  };

  const saveTeamBinding = async () => {
    setBindingSaving(true);
    setBindingMessage('');
    try {
      await updateProjectAPI(project.id, { agentIds: bindingAgentIds, teamIds: bindingTeamIds });
      await fetchProjects();
      setTeamBindingOpen(false);
    } catch (error) {
      setBindingMessage(error instanceof Error ? error.message : '绑定失败');
    } finally {
      setBindingSaving(false);
    }
  };

  const submitChat = async () => {
    const task = chatDraft.trim();
    if (!task || isSubmitting || !activeSession) return;
    const sessionId = activeSession.id;
    setChatDraft('');
    appendMessage(activeTargetKey, sessionId, makeMessage('user', task));

    if (activeMode === 'agent') {
      appendMessage(
        activeTargetKey,
        sessionId,
        makeMessage('system', '单 Agent 模式已绑定到当前项目。请点击上方“打开 Agent”进入单 Agent 对话。', activeAgent?.name)
      );
      return;
    }

    if (!activeTeam || !activeDsl) {
      appendMessage(activeTargetKey, sessionId, makeMessage('error', '当前项目还没有绑定可执行的团队。请先在协作模式里绑定团队。'));
      return;
    }

    setIsSubmitting(true);
    try {
      const guardedTask = [
        task,
        '',
        '安全边界：只允许读取和修改当前项目工作区内的文件；不要访问父目录、绝对路径、系统目录，也不要执行删除、格式化、权限修改等高危操作。',
      ].join('\n');
      const started = await startWorkflowExecution({
        workflowDsl: activeDsl,
        task: guardedTask,
        architectureId: activeTeam.id,
        projectId: project.id,
      });
      setLatestExecution(started);
      appendMessage(activeTargetKey, sessionId, makeMessage('system', `已提交给「${activeTeam.name}」，执行编号：${started.id}`));

      let current = started;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        if (TERMINAL_STATUSES.includes(current.status)) break;
        await sleep(1500);
        current = await fetchWorkflowExecution(started.id);
        setLatestExecution(current);
      }
      appendMessage(activeTargetKey, sessionId, makeMessage(current.status === 'failed' ? 'error' : 'assistant', buildExecutionReply(current), activeTeam.name));
    } catch (error) {
      appendMessage(activeTargetKey, sessionId, makeMessage('error', error instanceof Error ? error.message : '执行任务失败'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChatKeyDown = (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitChat();
    }
  };

  return (
    <section className="mt-6 border-4 border-pixel-black bg-pixel-white" style={{ boxShadow: '6px 6px 0 #101010' }}>
      <div className="border-b-4 border-pixel-black p-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] xl:items-start">
          <div className="min-w-0">
            <p className="font-pixel text-[1.75rem] font-bold leading-none text-pixel-black md:text-2xl">{project.name}</p>
            <p className="mt-2 max-w-5xl font-pixel text-[1.05rem] leading-snug text-pixel-black/65 md:text-sm">{getProjectIntro(project)}</p>
          </div>
          <TeamManagementCard
            teams={boundTeams}
            agents={boundAgents}
            activeMode={activeMode}
            activeTeamId={activeTeam?.id || ''}
            activeAgentId={activeAgent?.id || ''}
            onModeChange={setActiveMode}
            onTeamChange={setActiveTeamId}
            onAgentChange={setActiveAgentId}
            onBindTargets={openTeamBinding}
            onViewComposition={() => setTeamModalOpen(true)}
          />
        </div>
      </div>

      <div className="flex flex-col bg-pixel-white lg:flex-row">
        <ProjectFilePanel
          project={project}
          collapsed={fileCollapsed}
          width={filePanelWidth}
          onCollapsedChange={setFileCollapsed}
          onWidthChange={setFilePanelWidth}
          onOpenFile={(relativePath) => void openFilePreview(relativePath)}
        />

        <div className="min-w-0 flex-1 border-t-4 border-pixel-black bg-pixel-white lg:border-l-4 lg:border-t-0">
          <div className="grid min-h-[620px] grid-rows-[auto_1fr_auto]">
            <div className="grid gap-3 border-b-4 border-pixel-black p-3 xl:grid-cols-[260px_1fr]">
              <div className="border-2 border-pixel-black bg-pixel-white">
                <div className="flex items-center justify-between border-b-2 border-pixel-black px-3 py-2">
                  <p className="font-pixel text-sm font-bold text-pixel-black">会话</p>
                  <button type="button" onClick={createSession} className="h-7 w-7 border-2 border-pixel-black bg-pixel-green font-pixel text-base leading-none text-pixel-white hover:bg-pixel-blue" aria-label="新建会话">+</button>
                </div>
                <div className="max-h-[150px] overflow-y-auto p-2 xl:max-h-[210px]">
                  {activeTargetSessions.map((session) => {
                    const active = session.id === activeSession?.id;
                    return (
                      <div
                        key={session.id}
                        onMouseEnter={() => setHoveredSessionId(session.id)}
                        onMouseLeave={() => setHoveredSessionId((current) => current === session.id ? null : current)}
                        onFocus={() => setHoveredSessionId(session.id)}
                        onBlur={() => setHoveredSessionId((current) => current === session.id ? null : current)}
                        className={`mb-2 flex w-full items-center gap-2 border-2 border-pixel-black ${active ? 'bg-pixel-yellow text-pixel-black' : 'bg-pixel-white text-pixel-black hover:bg-pixel-yellow/50'}`}
                      >
                        <button type="button" onClick={() => setActiveSessionIdByTeamId((current) => ({ ...current, [activeTargetKey]: session.id }))} className="min-w-0 flex-1 px-2 py-1.5 text-left font-pixel text-xs">
                          <span className="block truncate">{session.title}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSession(session.id)}
                          className={`mr-1 h-6 w-6 shrink-0 border-2 border-pixel-black bg-pixel-red text-center font-pixel text-xs leading-none text-pixel-white transition-opacity focus:opacity-100 ${hoveredSessionId === session.id ? 'opacity-100' : 'opacity-0'}`}
                          aria-label={`删除${session.title}`}
                        >
                          x
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <PlanProgressPanel execution={latestExecution} />
            </div>

            <div className="overflow-y-auto p-3">
              <div className="flex w-full flex-col gap-3">
                {activeMode === 'agent' && activeAgent && (
                  <div className="border-4 border-pixel-black bg-pixel-yellow p-3 font-pixel text-sm text-pixel-black">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-bold">单 Agent 模式：{activeAgent.name}</p>
                        <p className="mt-1 text-xs text-pixel-black/65">当前项目已绑定该 Agent，可从这里进入单 Agent 对话。</p>
                      </div>
                      <Link
                        href={`/agent/${activeAgent.id}?project=${encodeURIComponent(project.id)}`}
                        className="inline-flex min-h-[36px] items-center justify-center border-3 border-pixel-black bg-pixel-blue px-3 text-xs text-pixel-white"
                        style={{ boxShadow: '3px 3px 0 #101010' }}
                      >
                        打开 Agent
                      </Link>
                    </div>
                  </div>
                )}
                {activeSession?.messages.map((message) => <MessageBubble key={message.id} message={message} />)}
                {latestExecution && <PlanProgressPanel execution={latestExecution} expanded />}
              </div>
            </div>

            <div className="border-t-4 border-pixel-black bg-pixel-white p-3">
              <div className="grid w-full gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                <PixelInput
                  value={chatDraft}
                  onChange={setChatDraft}
                  onKeyDown={handleChatKeyDown}
                  multiline
                  rows={3}
                  compactMultiline
                  disabled={isSubmitting || activeMode === 'agent'}
                  placeholder={
                    activeMode === 'agent'
                      ? activeAgent
                        ? `单 Agent 模式：请打开「${activeAgent.name}」对话`
                        : '先绑定单个 Agent'
                      : activeTeam
                        ? `向「${activeTeam.name}」提交当前项目任务`
                        : '先绑定团队后再提交任务'
                  }
                  className="min-h-[92px] text-[1.05rem] md:text-sm"
                />
                <PixelButton onClick={() => void submitChat()} disabled={isSubmitting || activeMode === 'agent' || !chatDraft.trim()} className="min-h-[54px] md:min-h-[92px]">
                  {isSubmitting ? '执行中' : '发送'}
                </PixelButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      {preview && <FilePreviewModal preview={preview} onClose={() => setPreview(null)} />}
      {teamBindingOpen && (
        <TeamBindingModal
          teams={architectures}
          agents={lobsters}
          selectedTeamIds={bindingTeamIds}
          selectedAgentIds={bindingAgentIds}
          saving={bindingSaving}
          message={bindingMessage}
          onToggleTeam={toggleBindingTeam}
          onToggleAgent={toggleBindingAgent}
          onSave={() => void saveTeamBinding()}
          onClose={() => setTeamBindingOpen(false)}
        />
      )}
      {teamModalOpen && (
        <TeamCompositionModal
          teams={boundTeams}
          selectedTeamId={activeTeam?.id || ''}
          latestExecution={latestExecution}
          onTeamSelect={setActiveTeamId}
          onClose={() => setTeamModalOpen(false)}
        />
      )}
    </section>
  );
}

function ProjectFilePanel({
  project,
  collapsed,
  width,
  onCollapsedChange,
  onWidthChange,
  onOpenFile,
}: {
  project: Project;
  collapsed: boolean;
  width: number;
  onCollapsedChange: (collapsed: boolean) => void;
  onWidthChange: (width: number) => void;
  onOpenFile: (relativePath: string) => void;
}) {
  const [tree, setTree] = useState<ProjectFileTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(['']));
  const [touchLike, setTouchLike] = useState(false);
  const loadingProjectId = useRef('');

  useEffect(() => {
    setTree(null);
    setError('');
    setExpandedPaths(new Set(['']));
    loadingProjectId.current = '';
  }, [project.id]);

  useEffect(() => {
    const media = window.matchMedia('(hover: none), (pointer: coarse)');
    const update = () => setTouchLike(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (collapsed || loading || loadingProjectId.current === project.id) return;
    loadingProjectId.current = project.id;
    setLoading(true);
    setError('');
    fetchProjectFiles(project.id)
      .then((nextTree) => setTree(nextTree))
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : '读取文件树失败'))
      .finally(() => setLoading(false));
  }, [collapsed, loading, project.id]);

  const togglePath = (relativePath: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (collapsed) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const onMove = (moveEvent: PointerEvent) => onWidthChange(clamp(startWidth + moveEvent.clientX - startX, FILE_PANEL_MIN_WIDTH, FILE_PANEL_MAX_WIDTH));
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (collapsed) {
    return (
      <aside className="shrink-0 border-b-4 border-pixel-black bg-pixel-white lg:border-b-0" style={{ width: 64, maxWidth: '100%' }}>
        <button type="button" onClick={() => onCollapsedChange(false)} className="flex h-full min-h-[74px] w-full flex-col items-center justify-center gap-1 bg-pixel-white p-2 font-pixel text-xs text-pixel-black hover:bg-pixel-yellow" aria-label="展开文件浏览">
          <span className="text-lg leading-none">→</span>
          <span className="leading-none">文件</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="relative shrink-0 border-b-4 border-pixel-black bg-pixel-white lg:border-b-0" style={{ width, maxWidth: '100%' }}>
      <div className="flex items-center justify-between border-b-4 border-pixel-black px-3 py-2">
        <div className="min-w-0">
          <p className="font-pixel text-sm font-bold leading-none text-pixel-black">文件浏览</p>
          <p className="mt-1 truncate font-pixel text-[11px] leading-none text-pixel-black/55">{project.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => onCollapsedChange(true)} aria-label="收起文件浏览" className="h-8 w-8 border-2 border-pixel-black bg-pixel-yellow font-pixel text-base leading-none text-pixel-black hover:bg-pixel-orange">←</button>
        </div>
      </div>

      <div className="h-[390px] overflow-auto bg-pixel-white py-1 font-mono text-[11px] text-pixel-black md:h-[560px]">
        {loading && <p className="px-3 py-2 font-pixel text-xs text-pixel-black/55">读取文件中...</p>}
        {error && <p className="px-3 py-2 font-pixel text-xs text-pixel-red">{error}</p>}
        {!loading && !error && tree?.root.children?.length === 0 && <p className="px-3 py-2 font-pixel text-xs text-pixel-black/55">当前工作区还没有文件。</p>}
        {!loading && !error && tree?.root.children?.map((node) => (
          <FileTreeNode key={node.relativePath} node={node} depth={0} expandedPaths={expandedPaths} touchLike={touchLike} onToggle={togglePath} onOpenFile={onOpenFile} />
        ))}
        {tree?.truncated && <p className="px-3 py-2 font-pixel text-xs text-pixel-yellow">文件较多，列表已截断。</p>}
      </div>

      <div role="separator" aria-label="调整文件浏览宽度" onPointerDown={startResize} className="absolute right-[-6px] top-0 hidden h-full w-3 cursor-col-resize bg-transparent lg:block" />
    </aside>
  );
}

function FileTreeNode({
  node,
  depth,
  expandedPaths,
  touchLike,
  onToggle,
  onOpenFile,
}: {
  node: ProjectFileNode;
  depth: number;
  expandedPaths: Set<string>;
  touchLike: boolean;
  onToggle: (relativePath: string) => void;
  onOpenFile: (relativePath: string) => void;
}) {
  const expanded = expandedPaths.has(node.relativePath);
  const hasChildren = Boolean(node.children?.length);
  const paddingLeft = 8 + depth * 14;
  const handleClick = () => {
    if (node.isDirectory) onToggle(node.relativePath);
    else if (touchLike) onOpenFile(node.relativePath);
  };
  return (
    <div>
      <button type="button" onClick={handleClick} onDoubleClick={() => !node.isDirectory && onOpenFile(node.relativePath)} title={node.relativePath} className="flex h-6 w-full items-center gap-1 overflow-hidden whitespace-nowrap pr-2 text-left hover:bg-pixel-yellow/30" style={{ paddingLeft }}>
        <span className="w-3 shrink-0 text-center text-[10px] text-pixel-black/45">{node.isDirectory ? (expanded ? '-' : '+') : ''}</span>
        <span className={`w-8 shrink-0 text-[10px] ${node.isDirectory ? 'text-pixel-orange' : 'text-pixel-blue'}`}>{node.isDirectory ? 'DIR' : fileExtLabel(node.name)}</span>
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </button>
      {node.isDirectory && expanded && hasChildren && node.children?.map((child) => (
        <FileTreeNode key={child.relativePath} node={child} depth={depth + 1} expandedPaths={expandedPaths} touchLike={touchLike} onToggle={onToggle} onOpenFile={onOpenFile} />
      ))}
    </div>
  );
}

function TeamManagementCard({
  teams,
  agents,
  activeMode,
  activeTeamId,
  activeAgentId,
  onModeChange,
  onTeamChange,
  onAgentChange,
  onBindTargets,
  onViewComposition,
}: {
  teams: Architecture[];
  agents: Lobster[];
  activeMode: ProjectMode;
  activeTeamId: string;
  activeAgentId: string;
  onModeChange: (mode: ProjectMode) => void;
  onTeamChange: (teamId: string) => void;
  onAgentChange: (agentId: string) => void;
  onBindTargets: () => void;
  onViewComposition: () => void;
}) {
  const modeOptions: Array<{ mode: ProjectMode; label: string; count: number }> = [
    { mode: 'agent', label: '单 Agent', count: agents.length },
    { mode: 'team', label: '多 Agent', count: teams.length },
  ];
  const selectedAgent = agents.find((agent) => agent.id === activeAgentId) || agents[0] || null;

  return (
    <div className="border-2 border-pixel-black bg-pixel-white p-3" style={{ boxShadow: '4px 4px 0 #101010' }}>
      <div className="mb-2 grid grid-cols-2 gap-2">
        {modeOptions.map((option) => {
          const active = activeMode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => onModeChange(option.mode)}
              className={`min-h-[34px] border-2 border-pixel-black px-2 font-pixel text-xs ${
                active ? 'bg-pixel-yellow text-pixel-black' : 'bg-pixel-white text-pixel-black hover:bg-pixel-yellow/50'
              }`}
            >
              {option.label} · {option.count}
            </button>
          );
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        {activeMode === 'agent' ? (
          <select
            value={activeAgentId}
            onChange={(event) => onAgentChange(event.target.value)}
            disabled={agents.length === 0}
            className="min-h-[36px] min-w-0 border-2 border-pixel-black bg-pixel-white px-2 py-1 font-pixel text-sm text-pixel-black disabled:text-pixel-black/45"
          >
            {agents.length === 0 ? (
              <option value="">未绑定 Agent</option>
            ) : (
              agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))
            )}
          </select>
        ) : (
          <select
            value={activeTeamId}
            onChange={(event) => onTeamChange(event.target.value)}
            disabled={teams.length === 0}
            className="min-h-[36px] min-w-0 border-2 border-pixel-black bg-pixel-white px-2 py-1 font-pixel text-sm text-pixel-black disabled:text-pixel-black/45"
          >
            {teams.length === 0 ? (
              <option value="">未绑定团队</option>
            ) : (
              teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))
            )}
          </select>
        )}
        <button
          type="button"
          onClick={onBindTargets}
          className="border-2 border-pixel-black bg-pixel-yellow px-3 py-2 font-pixel text-xs text-pixel-black hover:bg-pixel-orange"
        >
          管理绑定
        </button>
        {activeMode === 'agent' ? (
          <Link
            href={selectedAgent ? `/agent/${selectedAgent.id}` : '#'}
            className={`inline-flex items-center justify-center border-2 border-pixel-black px-3 py-2 font-pixel text-xs ${
              selectedAgent ? 'bg-pixel-blue text-pixel-white hover:bg-pixel-gray' : 'pointer-events-none bg-pixel-gray/60 text-pixel-white'
            }`}
          >
            打开 Agent
          </Link>
        ) : (
          <button
            type="button"
            onClick={onViewComposition}
            disabled={teams.length === 0}
            className="border-2 border-pixel-black bg-pixel-blue px-3 py-2 font-pixel text-xs text-pixel-white hover:bg-pixel-gray disabled:bg-pixel-gray/60"
          >
            查看团队组成
          </button>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const className = isUser
    ? 'ml-auto border-pixel-black bg-pixel-blue text-pixel-white'
    : message.role === 'error'
      ? 'mr-auto border-pixel-red bg-pixel-white text-pixel-red'
      : message.role === 'system'
        ? 'mx-auto border-pixel-black bg-pixel-yellow text-pixel-black'
        : 'mr-auto border-pixel-black bg-pixel-white text-pixel-black';
  return (
    <div className={`max-w-[86%] border-4 p-3 font-pixel text-[1.05rem] leading-snug md:text-sm ${className}`}>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs opacity-70">
        <span>{isUser ? '我' : message.agentName || (message.role === 'system' ? '系统' : 'Agent')}</span>
        <span>{formatTime(message.timestamp)}</span>
      </div>
      <p className="whitespace-pre-wrap break-words">{message.content}</p>
    </div>
  );
}

function PlanProgressPanel({ execution, expanded = false }: { execution: WorkflowExecution | null; expanded?: boolean }) {
  const progress = getExecutionProgress(execution);
  return (
    <div className="border-2 border-pixel-black bg-pixel-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-pixel text-sm font-bold text-pixel-black">Plan 进度</p>
        <span className={`border-2 border-pixel-black px-2 py-1 font-pixel text-xs ${executionStatusClass(execution?.status || 'queued')}`}>
          {execution ? executionStatusLabel(execution.status) : '待命'}
        </span>
      </div>
      <div className="h-4 overflow-hidden border-2 border-pixel-black bg-pixel-white">
        <div
          className="h-full bg-pixel-green transition-all"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-pixel text-xs text-pixel-black/65">
        <span>{progress.total > 0 ? `${progress.completed}/${progress.total} 已完成` : '等待任务'}</span>
        <span>{progress.percent}%</span>
      </div>
      {expanded && execution?.error && (
        <p className="mt-2 font-pixel text-xs text-pixel-red">{execution.error}</p>
      )}
    </div>
  );
}

function FilePreviewModal({ preview, onClose }: { preview: FilePreviewState; onClose: () => void }) {
  const file = preview.file;
  return (
    <ModalFrame title={file?.name || preview.path} onClose={onClose} maxWidthClass="max-w-6xl">
      <div className="mb-3 flex flex-wrap items-center gap-2 font-pixel text-xs text-pixel-black/60">
        <span className="border-2 border-pixel-black bg-pixel-white px-2 py-1">{preview.path}</span>
        {file && <span>{formatFileSize(file.size)}</span>}
        {file?.truncated && <span className="text-pixel-red">预览已截断</span>}
      </div>
      <div className="max-h-[70vh] overflow-auto border-4 border-pixel-black bg-[#101418] p-3">
        {preview.loading && <p className="font-pixel text-sm text-pixel-white/70">读取文件中...</p>}
        {preview.error && <p className="font-pixel text-sm text-pixel-red">{preview.error}</p>}
        {file?.binary && <p className="font-pixel text-sm text-pixel-white/70">这是二进制文件，暂不直接预览内容。</p>}
        {file && !file.binary && <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-[#d5dde5]">{file.content || '空文件'}</pre>}
      </div>
    </ModalFrame>
  );
}

function TeamBindingModal({
  teams,
  agents,
  selectedTeamIds,
  selectedAgentIds,
  saving,
  message,
  onToggleTeam,
  onToggleAgent,
  onSave,
  onClose,
}: {
  teams: Architecture[];
  agents: Lobster[];
  selectedTeamIds: string[];
  selectedAgentIds: string[];
  saving: boolean;
  message: string;
  onToggleTeam: (teamId: string) => void;
  onToggleAgent: (agentId: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <ModalFrame title="绑定 Agent / 团队" onClose={onClose} maxWidthClass="max-w-3xl">
      <div className="grid gap-3">
        <BindingTargetSection
          title="单 Agent 模式"
          emptyText="还没有可绑定的单个 Agent。"
          items={agents}
          selectedIds={selectedAgentIds}
          selectedClassName="bg-pixel-blue text-pixel-white"
          onToggle={onToggleAgent}
        />
        <BindingTargetSection
          title="多 Agent 协作模式"
          emptyText="还没有可绑定的团队。"
          items={teams}
          selectedIds={selectedTeamIds}
          selectedClassName="bg-pixel-green text-pixel-white"
          onToggle={onToggleTeam}
        />
        <div className="flex flex-col items-stretch justify-between gap-3 border-t-4 border-pixel-black pt-3 md:flex-row md:items-center">
          <p className="min-h-[24px] font-pixel text-sm text-pixel-black/60">{message}</p>
          <PixelButton onClick={onSave} disabled={saving} className="min-h-[48px] md:min-h-0">
            {saving ? '保存中...' : '保存绑定'}
          </PixelButton>
        </div>
      </div>
    </ModalFrame>
  );
}

function BindingTargetSection({
  title,
  emptyText,
  items,
  selectedIds,
  selectedClassName,
  onToggle,
}: {
  title: string;
  emptyText: string;
  items: Array<{ id: string; name: string; description?: string }>;
  selectedIds: string[];
  selectedClassName: string;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-pixel text-sm font-bold text-pixel-black">{title}</p>
        <span className="border-2 border-pixel-black bg-pixel-white px-2 py-0.5 font-pixel text-[10px] text-pixel-black">
          {selectedIds.length}
        </span>
      </div>
      {items.length > 0 ? (
        <div className="grid gap-2">
          {items.map((item) => {
            const checked = selectedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item.id)}
                className={`border-2 border-pixel-black p-3 text-left font-pixel text-sm ${
                  checked ? selectedClassName : 'bg-pixel-white text-pixel-black hover:bg-pixel-yellow/50'
                }`}
              >
                <span className="block truncate">{checked ? '[x]' : '[ ]'} {item.name}</span>
                {item.description && (
                  <span className={`mt-1 block truncate text-xs ${checked ? 'text-pixel-white/75' : 'text-pixel-black/55'}`}>
                    {item.description}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="border-4 border-dashed border-pixel-black p-4 text-center font-pixel text-sm text-pixel-black/60">
          {emptyText}
        </div>
      )}
    </div>
  );
}

function TeamCompositionModal({
  teams,
  selectedTeamId,
  latestExecution,
  onTeamSelect,
  onClose,
}: {
  teams: Architecture[];
  selectedTeamId: string;
  latestExecution: WorkflowExecution | null;
  onTeamSelect: (teamId: string) => void;
  onClose: () => void;
}) {
  const [localTeamId, setLocalTeamId] = useState(selectedTeamId || teams[0]?.id || '');
  useEffect(() => {
    if (teams.some((team) => team.id === localTeamId)) return;
    setLocalTeamId(selectedTeamId || teams[0]?.id || '');
  }, [localTeamId, selectedTeamId, teams]);
  const team = teams.find((item) => item.id === localTeamId) || teams[0] || null;
  const chooseTeam = (teamId: string) => {
    setLocalTeamId(teamId);
    onTeamSelect(teamId);
  };
  return (
    <ModalFrame title="团队组成" onClose={onClose} maxWidthClass="max-w-6xl">
      {teams.length === 0 || !team ? (
        <div className="border-4 border-dashed border-pixel-black p-6 text-center font-pixel text-sm text-pixel-black/60">当前项目还没有绑定团队或单个 Agent。</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {teams.map((item) => (
                <button key={item.id} type="button" onClick={() => chooseTeam(item.id)} className={`border-2 border-pixel-black px-3 py-2 font-pixel text-xs ${item.id === team.id ? 'bg-pixel-yellow text-pixel-black' : 'bg-pixel-white text-pixel-black hover:bg-pixel-yellow/50'}`}>{item.name}</button>
              ))}
            </div>
            <ArchitectureInfo architecture={team} />
          </div>
          <div className="min-h-[420px] border-4 border-pixel-black bg-pixel-white">
            <NodeFlowPreview architecture={team} execution={latestExecution?.architectureId === team.id ? latestExecution : null} />
          </div>
        </div>
      )}
    </ModalFrame>
  );
}

function ModalFrame({ title, children, onClose, maxWidthClass }: { title: string; children: ReactNode; onClose: () => void; maxWidthClass: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-pixel-black/70 p-3" role="dialog" aria-modal="true">
      <div className={`max-h-[92vh] w-full overflow-auto border-4 border-pixel-black bg-pixel-white ${maxWidthClass}`} style={{ boxShadow: '8px 8px 0 #101010' }}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b-4 border-pixel-black bg-pixel-white p-3">
          <p className="min-w-0 truncate font-pixel text-xl font-bold text-pixel-black">{title}</p>
          <button type="button" onClick={onClose} className="h-10 w-10 shrink-0 border-2 border-pixel-black bg-pixel-red font-pixel text-xl leading-none text-pixel-white hover:bg-pixel-gray" aria-label="关闭">x</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function makeSession(project: Project, targetName?: string, mode: ProjectMode = 'team', title = '默认会话'): ProjectSession {
  const intro = targetName
    ? mode === 'agent'
      ? `已接入单 Agent「${targetName}」。请从上方入口打开该 Agent 的单独对话。`
      : `已接入团队「${targetName}」。你可以直接要求它读取当前项目文件、分析代码或执行当前工作区内的任务。`
    : '当前项目还没有绑定团队或单个 Agent。对话窗口会保留；绑定后即可从这里提交项目任务。';
  return {
    id: `project-session-${project.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title,
    messages: [makeMessage('assistant', intro, targetName)],
  };
}

function makeMessage(role: ChatRole, content: string, agentName?: string): ChatMessage {
  return {
    id: `project-message-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    agentName,
    timestamp: new Date().toISOString(),
  };
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

function buildExecutionReply(execution: WorkflowExecution): string {
  if (execution.status === 'failed') return execution.error || '执行失败，但服务端没有返回具体错误。';
  if (execution.status === 'cancelled') return '执行已取消。';
  const finalOutput = execution.finalOutput?.trim();
  const lastNodeOutput = Object.values(execution.nodeStates)
    .map((state) => state.output?.trim())
    .filter((output): output is string => Boolean(output))
    .at(-1);
  const artifacts = execution.artifacts.length > 0
    ? `\n\n产物：\n${execution.artifacts.slice(-6).map((artifact) => `- ${artifact.relativePath || artifact.path}`).join('\n')}`
    : '';
  return `${shortText(finalOutput || lastNodeOutput || '执行完成，但没有返回文本结果。', 1800)}${artifacts}`;
}

function getProjectIntro(project: Project): string {
  return project.description?.trim() || project.notes?.trim() || '这个项目还没有简介。';
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

function getExecutionProgress(execution: WorkflowExecution | null): { completed: number; total: number; percent: number } {
  if (!execution) return { completed: 0, total: 0, percent: 0 };
  const states = Object.values(execution.nodeStates);
  const total = states.length;
  if (total === 0) {
    return {
      completed: execution.status === 'succeeded' ? 1 : 0,
      total: 1,
      percent: execution.status === 'succeeded' ? 100 : 0,
    };
  }
  const completed = states.filter((state) => state.status === 'succeeded' || state.status === 'skipped').length;
  const percent = Math.round((completed / total) * 100);
  return { completed, total, percent };
}

function fileExtLabel(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()?.slice(0, 3).toUpperCase() : '';
  return ext || 'FILE';
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shortText(value: string, maxLength: number): string {
  const normalized = value.trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}
