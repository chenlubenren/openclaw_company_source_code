'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import Link from 'next/link';
import { ArchitectureInfo } from '@/components/architecture/ArchitectureInfo';
import { NodeFlowPreview } from '@/components/architecture/NodeFlowPreview';
import { AgentConfigModal } from '@/components/agent/AgentConfigModal';
import { PixelButton } from '@/components/ui/PixelButton';
import { PixelInput } from '@/components/ui/PixelInput';
import { deleteProjectFile, fetchProjectDeliverables, fetchProjectExecutions, fetchProjectFileContent, fetchProjectFiles, fetchWorkflowExecution, renameProjectFile, reviewProjectDeliverable, startWorkflowExecution } from '@/lib/api';
import { API_BASE } from '@/lib/runtime';
import { useOpenClawDesktopBridge } from '@/lib/desktop';
import { buildWorkflowDslFromCanvas } from '@/lib/workflowDsl';
import { hasConfiguredProvider } from '@/lib/agentProvider';
import { useStore } from '@/store/useStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useWorkflowEvents } from '@/hooks/useWorkflowEvents';
import { WorkflowTaskBoard } from '@/components/projects/WorkflowTaskBoard';
import type {
  Architecture,
  Deliverable,
  Lobster,
  Project,
  ProjectFileContent,
  ProjectFileNode,
  ProjectFileTree,
  WorkflowDsl,
  WorkflowEventDelta,
  WorkflowExecution,
  WorkflowExecutionEvent,
  WorkflowExecutionStatus,
  WorkflowNodeStateSummary,
} from '@/types';

const TERMINAL_STATUSES: WorkflowExecutionStatus[] = ['succeeded', 'failed', 'cancelled'];
const FILE_PANEL_DEFAULT_WIDTH = 320;
const FILE_PANEL_MIN_WIDTH = 220;
const FILE_PANEL_MAX_WIDTH = 520;
const WORKFLOW_POLL_INTERVAL_MS = 1500;
const WORKFLOW_POLL_FALLBACK_INTERVAL_MS = 5000;
const WORKFLOW_MAX_CONSECUTIVE_POLL_ERRORS = 8;
const WORKFLOW_MIN_POLL_MS = 5 * 60 * 1000;
const WORKFLOW_MAX_POLL_MS = 60 * 60 * 1000;

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
  const desktopBridge = useOpenClawDesktopBridge();
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
  const [configAgent, setConfigAgent] = useState<Lobster | null>(null);
  const [sessionsByTeamId, setSessionsByTeamId] = useState<Record<string, ProjectSession[]>>({});
  const [activeSessionIdByTeamId, setActiveSessionIdByTeamId] = useState<Record<string, string>>({});
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [latestExecution, setLatestExecution] = useState<WorkflowExecution | null>(null);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [reviewingDeliverableId, setReviewingDeliverableId] = useState<string | null>(null);
  const token = useAuthStore((state) => state.token);
  /** Event ids already rendered into chat, to avoid duplicates between WS / history replay. */
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  /** executionId -> chat session that launched it (so WS reports land in the right session). */
  const executionSessionRef = useRef<Record<string, { teamKey: string; sessionId: string }>>({});
  /** Execution currently tracked by the submitChat polling loop (final reply owner). */
  const activePollingExecutionRef = useRef<string | null>(null);
  const wsConnectedRef = useRef(false);
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
  }, [desktopBridge, project.id]);

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

  useEffect(() => {
    if (!project.id) return;
    let cancelled = false;
    fetchProjectExecutions(project.id).then((executions) => {
      if (cancelled || executions.length === 0) return;
      const latest = executions[0];
      const latestExecution = latest as unknown as WorkflowExecution;
      setLatestExecution(latestExecution);

      const teamKey = latest.architectureId
        ? `team:${latest.architectureId}`
        : `agent:${latest.projectId || 'unbound'}`;

      const historyMessages: ChatMessage[] = [];
      historyMessages.push({
        id: `hist-task-${latest.id}`,
        role: 'user',
        content: latest.task,
        timestamp: latest.createdAt,
      });

      const nodeEvents = (latest.events || []).filter(
        (e: any) => e.type === 'node_completed' || e.type === 'node_failed'
      );
      for (const evt of nodeEvents) {
        seenEventIdsRef.current.add(evt.id);
        const nodeState = evt.nodeId ? latest.nodeStates?.[evt.nodeId] : undefined;
        if (nodeState && nodeState.type !== 'agent') continue;
        const output = typeof evt.details?.output === 'string' ? evt.details.output : nodeState?.output;
        const dryRunCompleted = evt.type === 'node_completed' && isDryRunOutputText(output);
        historyMessages.push({
          id: evt.id,
          role: evt.type === 'node_failed' || dryRunCompleted ? 'error' : 'assistant',
          content: nodeState
            ? buildNodeReportContent(evt, nodeState)
            : evt.message,
          timestamp: evt.timestamp,
          agentName: (evt as any).agentName || nodeState?.label,
        });
      }

      if (latest.finalOutput) {
        historyMessages.push({
          id: `hist-final-${latest.id}`,
          role: latestExecution.status === 'failed' ||
            executionHasLlmFailureOutput(latestExecution) ||
            executionHasDryRunOutput(latestExecution)
            ? 'error'
            : 'assistant',
          content: buildExecutionReply(latestExecution),
          timestamp: latest.completedAt || latest.updatedAt || latest.createdAt,
          agentName: latest.workflowName,
        });
      } else if (latest.error) {
        historyMessages.push({
          id: `hist-err-${latest.id}`,
          role: 'error',
          content: latest.error,
          timestamp: latest.completedAt || latest.updatedAt || latest.createdAt,
        });
      }

      if (historyMessages.length > 0) {
        setSessionsByTeamId((current) => {
          const sessions = current[teamKey] || [];
          const session = sessions[0];
          if (!session) return current;
          return {
            ...current,
            [teamKey]: sessions.map((s) =>
              s.id === session.id
                ? { ...s, messages: [...s.messages, ...historyMessages] }
                : s
            ),
          };
        });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [project.id]);

  const appendMessage = useCallback((teamKey: string, sessionId: string, message: ChatMessage) => {
    setSessionsByTeamId((current) => ({
      ...current,
      [teamKey]: (current[teamKey] || []).map((session) =>
        session.id === sessionId ? { ...session, messages: [...session.messages, message] } : session
      ),
    }));
  }, []);

  /** Append a workflow report message to the session that launched the execution (or the newest one). */
  const appendWorkflowReport = useCallback((teamKey: string, executionId: string, message: ChatMessage) => {
    setSessionsByTeamId((current) => {
      const sessions = current[teamKey] || [];
      if (sessions.length === 0) return current;
      const mapping = executionSessionRef.current[executionId];
      const targetId = mapping && sessions.some((session) => session.id === mapping.sessionId)
        ? mapping.sessionId
        : sessions[0].id;
      return {
        ...current,
        [teamKey]: sessions.map((session) =>
          session.id === targetId ? { ...session, messages: [...session.messages, message] } : session
        ),
      };
    });
  }, []);

  const handleWorkflowDelta = useCallback((delta: WorkflowEventDelta) => {
    // Merge the lightweight delta into the tracked execution
    setLatestExecution((current) => {
      if (current && current.id === delta.executionId) {
        const nodeStates = { ...current.nodeStates };
        for (const summary of delta.nodeStates) {
          nodeStates[summary.nodeId] = { ...nodeStates[summary.nodeId], ...summary };
        }
        return {
          ...current,
          status: delta.status,
          currentNodeIds: delta.currentNodeIds,
          nodeStates,
          finalOutput: delta.finalOutput ?? current.finalOutput,
          error: delta.error ?? current.error,
        };
      }
      // Unknown execution (e.g. started before page load): fetch the full snapshot once
      void fetchWorkflowExecution(delta.executionId)
        .then((full) => setLatestExecution(full))
        .catch(() => {});
      return current;
    });

    const evt = delta.event;
    if (seenEventIdsRef.current.has(evt.id)) return;

    if (evt.type === 'deliverable_created') {
      seenEventIdsRef.current.add(evt.id);
      const created = evt.details?.deliverable as Deliverable | undefined;
      if (created) {
        setDeliverables((current) => [
          created,
          ...current.map((item) =>
            item.filePath === created.filePath && item.status === 'pending'
              ? { ...item, status: 'superseded' as const }
              : item
          ),
        ]);
      }
      return;
    }

    const teamKey = delta.architectureId
      ? `team:${delta.architectureId}`
      : `agent:${delta.projectId || 'unbound'}`;

    if (evt.type === 'node_completed' || evt.type === 'node_failed') {
      const nodeState = delta.nodeStates.find((state) => state.nodeId === evt.nodeId);
      if (nodeState && nodeState.type === 'agent') {
        const output = typeof evt.details?.output === 'string' ? evt.details.output : '';
        const dryRunCompleted = evt.type === 'node_completed' && isDryRunOutputText(output);
        seenEventIdsRef.current.add(evt.id);
        appendWorkflowReport(teamKey, delta.executionId, {
          id: evt.id,
          role: evt.type === 'node_failed' || dryRunCompleted ? 'error' : 'assistant',
          content: buildNodeReportContent(evt, nodeState),
          timestamp: evt.timestamp,
          agentName: evt.agentName || nodeState.label,
        });
      }
      return;
    }

    // Final execution summary — only when no submitChat polling loop owns this execution
    if (
      (evt.type === 'execution_completed' || evt.type === 'execution_failed' || evt.type === 'execution_cancelled') &&
      activePollingExecutionRef.current !== delta.executionId
    ) {
      seenEventIdsRef.current.add(evt.id);
      const dryRunCompleted = evt.type === 'execution_completed' && isDryRunOutputText(delta.finalOutput);
      const content = dryRunCompleted
        ? buildDryRunFailureMessage(delta.finalOutput)
        : evt.type === 'execution_completed'
        ? shortText(delta.finalOutput || '团队任务执行完成。', 1800)
        : evt.type === 'execution_cancelled'
          ? '执行已取消。'
          : delta.error || '执行失败。';
      appendWorkflowReport(teamKey, delta.executionId, {
        id: evt.id,
        role: evt.type === 'execution_failed' || dryRunCompleted ? 'error' : 'assistant',
        content,
        timestamp: evt.timestamp,
        agentName: delta.workflowName,
      });
    }
  }, [appendWorkflowReport]);

  const { isConnected: workflowWsConnected } = useWorkflowEvents({
    token,
    projectId: project.id,
    onEvent: handleWorkflowDelta,
  });

  useEffect(() => {
    wsConnectedRef.current = workflowWsConnected;
  }, [workflowWsConnected]);

  useEffect(() => {
    if (!project.id) return;
    let cancelled = false;
    fetchProjectDeliverables(project.id)
      .then((items) => {
        if (!cancelled) setDeliverables(items);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [project.id]);

  const reviewDeliverable = useCallback(async (deliverableId: string, status: 'accepted' | 'revision') => {
    setReviewingDeliverableId(deliverableId);
    try {
      const updated = await reviewProjectDeliverable(project.id, deliverableId, status);
      setDeliverables((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      // keep current state; user can retry
    } finally {
      setReviewingDeliverableId(null);
    }
  }, [project.id]);

  const openFilePreview = useCallback(async (relativePath: string) => {
    setPreview({ path: relativePath, loading: true });
    try {
      const file = desktopBridge?.readLocalProjectFile
        ? await desktopBridge.readLocalProjectFile(project.id, relativePath)
        : await fetchProjectFileContent(project.id, relativePath);
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
      executionSessionRef.current[started.id] = { teamKey: activeTargetKey, sessionId };
      activePollingExecutionRef.current = started.id;
      appendMessage(activeTargetKey, sessionId, makeMessage('system', `已提交给「${activeTeam.name}」，执行编号：${started.id}`));

      let current = started;
      let consecutivePollErrors = 0;
      const maxPollAttempts = getWorkflowPollAttemptLimit(activeDsl);
      for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
        if (TERMINAL_STATUSES.includes(current.status)) break;
        // WS connected: events stream in real time, polling is just a safety net
        await sleep(wsConnectedRef.current ? WORKFLOW_POLL_FALLBACK_INTERVAL_MS : WORKFLOW_POLL_INTERVAL_MS);
        try {
          current = await fetchWorkflowExecution(started.id);
          consecutivePollErrors = 0;
          if (!wsConnectedRef.current) {
            setLatestExecution(current);
          }
        } catch (pollError) {
          consecutivePollErrors += 1;
          if (consecutivePollErrors >= WORKFLOW_MAX_CONSECUTIVE_POLL_ERRORS) {
            const message = pollError instanceof Error ? pollError.message : String(pollError);
            throw new Error(`团队任务仍在后台运行，但连续多次无法获取进度：${message}`);
          }
          await sleep(getWorkflowPollRetryDelay(consecutivePollErrors));
        }
      }
      const replyRole: ChatRole = current.status === 'failed' || executionHasLlmFailureOutput(current) || executionHasDryRunOutput(current)
        ? 'error'
        : TERMINAL_STATUSES.includes(current.status)
          ? 'assistant'
          : 'system';
      appendMessage(activeTargetKey, sessionId, makeMessage(replyRole, buildExecutionReply(current), activeTeam.name));
    } catch (error) {
      appendMessage(activeTargetKey, sessionId, makeMessage('error', error instanceof Error ? error.message : '执行任务失败'));
    } finally {
      activePollingExecutionRef.current = null;
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
    <section className="mt-4 min-w-0 overflow-hidden border-4 border-pixel-black bg-pixel-white" style={{ boxShadow: '6px 6px 0 #101010' }}>
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
            onConfigureAgent={(agent) => setConfigAgent(agent)}
          />
        </div>
      </div>

      <div className="flex min-h-[640px] flex-col bg-pixel-white lg:h-[calc(100dvh-252px)] lg:min-h-[560px] lg:max-h-[calc(100dvh-150px)] lg:min-w-0 lg:flex-row lg:overflow-hidden">
        <ProjectFilePanel
          project={project}
          token={token}
          collapsed={fileCollapsed}
          width={filePanelWidth}
          onCollapsedChange={setFileCollapsed}
          onWidthChange={setFilePanelWidth}
          onOpenFile={(relativePath) => void openFilePreview(relativePath)}
          onFileDeleted={(relativePath) => {
            setPreview((current) => current?.path === relativePath ? null : current);
          }}
          onFileRenamed={(fromPath, toPath) => {
            setPreview((current) => current?.path === fromPath ? null : current);
            if (preview?.path === fromPath) void openFilePreview(toPath);
          }}
        />

        <div className="min-h-0 min-w-0 flex-1 border-t-4 border-pixel-black bg-pixel-white lg:border-l-4 lg:border-t-0">
          <div className="grid min-h-[620px] grid-rows-[auto_1fr_auto] lg:h-full lg:min-h-0">
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

            <div className="min-h-0 overflow-y-auto p-3">
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

        <WorkflowTaskBoard
          execution={latestExecution}
          agents={lobsters}
          deliverables={deliverables}
          onOpenFile={(relativePath) => void openFilePreview(relativePath)}
          onReviewDeliverable={(deliverableId, status) => void reviewDeliverable(deliverableId, status)}
          reviewingDeliverableId={reviewingDeliverableId}
        />
      </div>

      {preview && <FilePreviewModal preview={preview} projectId={project.id} onClose={() => setPreview(null)} />}
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
      {configAgent && (
        <AgentConfigModal
          agent={configAgent}
          onClose={() => setConfigAgent(null)}
          onSave={() => {
            setConfigAgent(null);
            void fetchAgents();
          }}
        />
      )}
    </section>
  );
}

function ProjectFilePanel({
  project,
  token,
  collapsed,
  width,
  onCollapsedChange,
  onWidthChange,
  onOpenFile,
  onFileDeleted,
  onFileRenamed,
}: {
  project: Project;
  token: string | null;
  collapsed: boolean;
  width: number;
  onCollapsedChange: (collapsed: boolean) => void;
  onWidthChange: (width: number) => void;
  onOpenFile: (relativePath: string) => void;
  onFileDeleted: (relativePath: string) => void;
  onFileRenamed: (fromPath: string, toPath: string) => void;
}) {
  const desktopBridge = useOpenClawDesktopBridge();
  const [tree, setTree] = useState<ProjectFileTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloadingArchive, setDownloadingArchive] = useState(false);
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

  const loadTree = useCallback(async () => {
    if (loading) return;
    loadingProjectId.current = project.id;
    setLoading(true);
    setError('');
    try {
      const nextTree = desktopBridge?.readLocalProjectTree
        ? await desktopBridge.readLocalProjectTree(project.id)
        : await fetchProjectFiles(project.id);
      setTree(nextTree);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '读取文件树失败');
    } finally {
      setLoading(false);
    }
  }, [desktopBridge, loading, project.id]);

  useEffect(() => {
    if (collapsed || loading || loadingProjectId.current === project.id) return;
    void loadTree();
  }, [collapsed, loadTree, loading, project.id]);

  const refreshTree = useCallback(async () => {
    loadingProjectId.current = '';
    await loadTree();
  }, [loadTree]);

  const handleRenameFile = useCallback(async (node: ProjectFileNode) => {
    const nextName = window.prompt('输入新的文件名', node.name)?.trim();
    if (!nextName || nextName === node.name) return;
    try {
      const renamed = await renameProjectFile(project.id, node.relativePath, nextName);
      await refreshTree();
      onFileRenamed(node.relativePath, renamed.relativePath);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : '重命名文件失败');
    }
  }, [onFileRenamed, project.id, refreshTree]);

  const handleDeleteFile = useCallback(async (node: ProjectFileNode) => {
    if (!window.confirm(`删除 ${node.name}？`)) return;
    try {
      await deleteProjectFile(project.id, node.relativePath);
      await refreshTree();
      onFileDeleted(node.relativePath);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除文件失败');
    }
  }, [onFileDeleted, project.id, refreshTree]);

  const handleDownloadArchive = useCallback(async () => {
    if (downloadingArchive) return;
    setDownloadingArchive(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/projects/${project.id}/files/archive`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || '项目文件打包下载失败');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
      const quotedName = disposition.match(/filename="([^"]+)"/)?.[1];
      const filename = encodedName
        ? decodeURIComponent(encodedName)
        : quotedName
          ? decodeURIComponent(quotedName)
          : `${project.name || 'project'}-${project.id.slice(0, 8)}.zip`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : '项目文件打包下载失败');
    } finally {
      setDownloadingArchive(false);
    }
  }, [downloadingArchive, project.id, project.name, token]);

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
      <aside className="shrink-0 border-b-4 border-pixel-black bg-pixel-white lg:h-full lg:border-b-0" style={{ width: 64, maxWidth: '100%' }}>
        <button type="button" onClick={() => onCollapsedChange(false)} className="flex h-full min-h-[74px] w-full flex-col items-center justify-center gap-1 bg-pixel-white p-2 font-pixel text-xs text-pixel-black hover:bg-pixel-yellow" aria-label="展开文件浏览">
          <span className="text-lg leading-none">→</span>
          <span className="leading-none">文件</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="relative shrink-0 border-b-4 border-pixel-black bg-pixel-white lg:h-full lg:min-h-0 lg:border-b-0" style={{ width, maxWidth: '100%' }}>
      <div className="flex items-center justify-between border-b-4 border-pixel-black px-3 py-2">
        <div className="min-w-0">
          <p className="font-pixel text-sm font-bold leading-none text-pixel-black">文件浏览</p>
          <p className="mt-1 truncate font-pixel text-[11px] leading-none text-pixel-black/55">{project.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => onCollapsedChange(true)} aria-label="收起文件浏览" className="h-8 w-8 border-2 border-pixel-black bg-pixel-yellow font-pixel text-base leading-none text-pixel-black hover:bg-pixel-orange">←</button>
        </div>
      </div>

      <div className="border-b-4 border-pixel-black bg-pixel-white px-3 py-2">
        <button
          type="button"
          onClick={() => void handleDownloadArchive()}
          disabled={downloadingArchive}
          className="w-full border-2 border-pixel-black bg-pixel-blue px-3 py-2 font-pixel text-xs font-bold text-pixel-white hover:bg-pixel-green hover:text-pixel-black disabled:cursor-wait disabled:opacity-60"
          style={{ boxShadow: '2px 2px 0 #101010' }}
        >
          {downloadingArchive ? '打包中...' : '项目文件打包下载'}
        </button>
      </div>

      <div className="h-[390px] overflow-auto bg-pixel-white py-1 font-mono text-[11px] text-pixel-black md:h-[560px] lg:h-[calc(100%-108px)] lg:min-h-0">
        {loading && <p className="px-3 py-2 font-pixel text-xs text-pixel-black/55">读取文件中...</p>}
        {error && <p className="px-3 py-2 font-pixel text-xs text-pixel-red">{error}</p>}
        {!loading && !error && tree?.root.children?.length === 0 && <p className="px-3 py-2 font-pixel text-xs text-pixel-black/55">当前工作区还没有文件。</p>}
        {!loading && !error && tree?.root.children?.map((node) => (
          <FileTreeNode
            key={node.relativePath}
            node={node}
            depth={0}
            expandedPaths={expandedPaths}
            touchLike={touchLike}
            onToggle={togglePath}
            onOpenFile={onOpenFile}
            onRenameFile={handleRenameFile}
            onDeleteFile={handleDeleteFile}
          />
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
  onRenameFile,
  onDeleteFile,
}: {
  node: ProjectFileNode;
  depth: number;
  expandedPaths: Set<string>;
  touchLike: boolean;
  onToggle: (relativePath: string) => void;
  onOpenFile: (relativePath: string) => void;
  onRenameFile: (node: ProjectFileNode) => void;
  onDeleteFile: (node: ProjectFileNode) => void;
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
      <div className="group flex h-7 w-full items-center overflow-hidden whitespace-nowrap pr-1 hover:bg-pixel-yellow/30" style={{ paddingLeft }}>
        <button type="button" onClick={handleClick} onDoubleClick={() => !node.isDirectory && onOpenFile(node.relativePath)} title={getNodeTooltip(node)} className="flex min-w-0 flex-1 items-center gap-1 text-left">
          <span className="w-3 shrink-0 text-center text-[10px] text-pixel-black/45">{node.isDirectory ? (expanded ? '-' : '+') : ''}</span>
          <span className={`w-8 shrink-0 text-[10px] ${node.isDirectory ? 'text-pixel-orange' : node.name.endsWith('.pdf') ? 'text-pixel-red font-bold' : 'text-pixel-blue'}`}>{node.isDirectory ? 'DIR' : fileExtLabel(node.name)}</span>
          <span className={`min-w-0 flex-1 truncate ${node.name.endsWith('.pdf') ? 'font-bold text-pixel-red' : ''}`}>{FILE_DESCRIPTIONS[node.name] || (node.isDirectory && DIR_DESCRIPTIONS[node.name] ? `${node.name} ${DIR_DESCRIPTIONS[node.name]}` : node.name)}</span>
        </button>
        {!node.isDirectory && (
          <span className="ml-1 hidden shrink-0 items-center gap-1 group-hover:flex group-focus-within:flex">
            <button type="button" onClick={() => onRenameFile(node)} className="h-5 w-5 border-2 border-pixel-black bg-pixel-white font-pixel text-[10px] leading-none text-pixel-black hover:bg-pixel-yellow" title="重命名" aria-label={`重命名 ${node.name}`}>R</button>
            <button type="button" onClick={() => onDeleteFile(node)} className="h-5 w-5 border-2 border-pixel-black bg-pixel-red font-pixel text-[10px] leading-none text-pixel-white hover:bg-pixel-gray" title="删除" aria-label={`删除 ${node.name}`}>x</button>
          </span>
        )}
      </div>
      {node.isDirectory && expanded && hasChildren && node.children?.map((child) => (
        <FileTreeNode
          key={child.relativePath}
          node={child}
          depth={depth + 1}
          expandedPaths={expandedPaths}
          touchLike={touchLike}
          onToggle={onToggle}
          onOpenFile={onOpenFile}
          onRenameFile={onRenameFile}
          onDeleteFile={onDeleteFile}
        />
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
  onConfigureAgent,
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
  onConfigureAgent: (agent: Lobster) => void;
}) {
  const [agentMenuOpenId, setAgentMenuOpenId] = useState<string | null>(null);
  const modeOptions: Array<{ mode: ProjectMode; label: string; count: number }> = [
    { mode: 'agent', label: '单 Agent', count: agents.length },
    { mode: 'team', label: '多 Agent', count: teams.length },
  ];
  const selectedAgent = agents.find((agent) => agent.id === activeAgentId) || agents[0] || null;

  useEffect(() => {
    if (!agentMenuOpenId) return;
    const closeMenu = () => setAgentMenuOpenId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [agentMenuOpenId]);

  useEffect(() => {
    if (agentMenuOpenId && !agents.some((agent) => agent.id === agentMenuOpenId)) {
      setAgentMenuOpenId(null);
    }
  }, [agentMenuOpenId, agents]);

  const openAgentConfig = (agent: Lobster) => {
    setAgentMenuOpenId(null);
    onConfigureAgent(agent);
  };

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
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
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
          <>
            <button
              type="button"
              onClick={() => selectedAgent && onConfigureAgent(selectedAgent)}
              disabled={!selectedAgent}
              className="border-2 border-pixel-black bg-pixel-white px-3 py-2 font-pixel text-xs text-pixel-black hover:bg-pixel-yellow disabled:bg-pixel-gray/60 disabled:text-pixel-white"
            >
              配置
            </button>
            <Link
              href={selectedAgent ? `/agent/${selectedAgent.id}` : '#'}
              className={`inline-flex items-center justify-center border-2 border-pixel-black px-3 py-2 font-pixel text-xs ${
                selectedAgent ? 'bg-pixel-blue text-pixel-white hover:bg-pixel-gray' : 'pointer-events-none bg-pixel-gray/60 text-pixel-white'
              }`}
            >
              打开 Agent
            </Link>
          </>
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
      {activeMode === 'agent' && (
        <div className="mt-3 border-2 border-pixel-black bg-pixel-white">
          <div className="border-b-2 border-pixel-black bg-pixel-yellow px-2 py-1 font-pixel text-xs font-bold text-pixel-black">
            项目 Agent
          </div>
          <div className="max-h-48 overflow-y-auto p-2">
            {agents.length === 0 ? (
              <p className="px-2 py-3 font-pixel text-xs text-pixel-black/55">未绑定 Agent</p>
            ) : (
              agents.map((agent) => {
                const active = agent.id === selectedAgent?.id;
                const configured = hasConfiguredProvider(agent);
                const menuOpen = agentMenuOpenId === agent.id;
                return (
                  <div
                    key={agent.id}
                    className={`group/agent-row relative mb-2 flex min-h-[46px] items-center gap-2 border-2 border-pixel-black ${active ? 'bg-pixel-yellow' : 'bg-pixel-white hover:bg-pixel-yellow/40'}`}
                  >
                    <button
                      type="button"
                      onClick={() => onAgentChange(agent.id)}
                      className="min-w-0 flex-1 px-2 py-2 text-left font-pixel text-xs text-pixel-black"
                    >
                      <span className="block truncate font-bold">{agent.name}</span>
                      <span className={`mt-1 block truncate text-[10px] ${configured ? 'text-pixel-green' : 'text-pixel-black/45'}`}>
                        {configured ? '已配置供应商' : '未配置供应商'}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`配置 ${agent.name}`}
                      className={`mr-1 h-8 w-8 shrink-0 border-2 border-pixel-black bg-pixel-white font-pixel text-lg leading-none text-pixel-black transition-opacity hover:bg-pixel-yellow focus:opacity-100 ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover/agent-row:opacity-100 group-focus-within/agent-row:opacity-100'}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setAgentMenuOpenId((current) => current === agent.id ? null : agent.id);
                      }}
                    >
                      ...
                    </button>
                    {menuOpen && (
                      <div
                        className="absolute right-1 top-10 z-40 w-44 border-2 border-pixel-black bg-pixel-white py-1"
                        style={{ boxShadow: '3px 3px 0 #101010' }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left font-pixel text-xs text-pixel-black hover:bg-pixel-yellow"
                          onClick={() => openAgentConfig(agent)}
                        >
                          配置 Agent
                        </button>
                        <Link
                          href={`/agent/${agent.id}`}
                          className="block w-full px-3 py-2 text-left font-pixel text-xs text-pixel-black hover:bg-pixel-yellow"
                          onClick={() => setAgentMenuOpenId(null)}
                        >
                          打开 Agent
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
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

function FilePreviewModal({ preview, projectId, onClose }: { preview: FilePreviewState; projectId: string; onClose: () => void }) {
  const file = preview.file;

  const handleDownload = async () => {
    let token = '';
    try {
      const raw = localStorage.getItem('lobster-auth');
      if (raw) {
        const parsed = JSON.parse(raw);
        token = parsed?.state?.token || '';
      }
    } catch { /* ignore */ }
    const response = await fetch(`${API_BASE}/api/projects/${projectId}/files/download?path=${encodeURIComponent(preview.path)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = file?.name || preview.path.split('/').pop() || 'download';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <ModalFrame title={file?.name || preview.path} onClose={onClose} maxWidthClass="max-w-6xl">
      <div className="mb-3 flex flex-wrap items-center gap-2 font-pixel text-xs text-pixel-black/60">
        <span className="border-2 border-pixel-black bg-pixel-white px-2 py-1">{preview.path}</span>
        {file && <span>{formatFileSize(file.size)}</span>}
        {file?.truncated && <span className="text-pixel-red">预览已截断</span>}
        <button
          type="button"
          onClick={handleDownload}
          className="border-2 border-pixel-black bg-pixel-blue px-3 py-1 font-pixel text-xs text-pixel-white hover:brightness-95"
          style={{ boxShadow: '2px 2px 0px 0px #101010' }}
        >
          下载文件
        </button>
      </div>
      <div className="max-h-[70vh] overflow-auto border-4 border-pixel-black bg-[#101418] p-3">
        {preview.loading && <p className="font-pixel text-sm text-pixel-white/70">读取文件中...</p>}
        {preview.error && <p className="font-pixel text-sm text-pixel-red">{preview.error}</p>}
        {file?.binary && (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="font-pixel text-sm text-pixel-white/70">这是二进制文件，暂不直接预览内容。</p>
            <button
              type="button"
              onClick={handleDownload}
              className="border-4 border-pixel-black bg-pixel-green px-6 py-3 font-pixel text-base text-pixel-white hover:brightness-95"
              style={{ boxShadow: '4px 4px 0px 0px #101010' }}
            >
              下载 {file.name || preview.path.split('/').pop()}
            </button>
          </div>
        )}
        {file && !file.binary && <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-[#d5dde5]">{file.content || '空文件'}</pre>}
      </div>
    </ModalFrame>
  );
}

type BindingTargetItem = {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
};

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
      <div className="flex max-h-[calc(92vh-92px)] flex-col">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <BindingTargetSection
            title="单 Agent 模式"
            emptyText="还没有可绑定的单个 Agent。"
            items={agents}
            selectedIds={selectedAgentIds}
            selectedClassName="bg-pixel-blue text-pixel-white"
            onToggle={onToggleAgent}
            defaultCollapsed
            showAvatars
          />
          <BindingTargetSection
            title="多 Agent 协作模式"
            emptyText="还没有可绑定的团队。"
            items={teams}
            selectedIds={selectedTeamIds}
            selectedClassName="bg-pixel-green text-pixel-white"
            onToggle={onToggleTeam}
          />
        </div>
        <div className="sticky bottom-0 z-20 mt-3 flex flex-col items-stretch justify-between gap-3 border-t-4 border-pixel-black bg-pixel-white pt-3 md:flex-row md:items-center">
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
  defaultCollapsed = false,
  showAvatars = false,
}: {
  title: string;
  emptyText: string;
  items: BindingTargetItem[];
  selectedIds: string[];
  selectedClassName: string;
  onToggle: (id: string) => void;
  defaultCollapsed?: boolean;
  showAvatars?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="border-2 border-pixel-black bg-pixel-white">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="flex w-full items-center justify-between gap-2 border-b-2 border-pixel-black bg-pixel-black/5 px-3 py-2 text-left"
        aria-expanded={!collapsed}
      >
        <p className="font-pixel text-sm font-bold text-pixel-black">{collapsed ? '＋' : '－'} {title}</p>
        <span className="border-2 border-pixel-black bg-pixel-white px-2 py-0.5 font-pixel text-[10px] text-pixel-black">
          已选 {selectedIds.length}
        </span>
      </button>

      {!collapsed && (
        <div className="p-3">
          {items.length > 0 ? (
            <div className="grid gap-2">
              {items.map((item) => {
                const checked = selectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onToggle(item.id)}
                    className={`w-full border-2 border-pixel-black p-3 text-left font-pixel text-sm ${
                      checked ? selectedClassName : 'bg-pixel-white text-pixel-black hover:bg-pixel-yellow/50'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {showAvatars && (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-pixel-black bg-pixel-white">
                          <img
                            src={item.avatar || '/claw_profile/03.png'}
                            alt=""
                            className="h-9 w-9 object-contain"
                            style={{ imageRendering: 'pixelated' }}
                          />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{checked ? '[x]' : '[ ]'} {item.name}</span>
                        {item.description && (
                          <span className={`mt-1 block line-clamp-2 text-xs leading-snug ${checked ? 'text-pixel-white/75' : 'text-pixel-black/55'}`}>
                            {item.description}
                          </span>
                        )}
                      </span>
                    </span>
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-pixel-black/70 p-3" role="dialog" aria-modal="true">
      <div className={`max-h-[92vh] w-full overflow-auto border-4 border-pixel-black bg-pixel-white ${maxWidthClass}`} style={{ boxShadow: '8px 8px 0 #101010' }}>
        <div className="sticky top-0 z-[90] flex items-center justify-between gap-3 border-b-4 border-pixel-black bg-pixel-white p-3">
          <p className="min-w-0 truncate font-pixel text-xl font-bold text-pixel-black">{title}</p>
          <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }} className="relative z-[100] h-10 w-10 shrink-0 border-2 border-pixel-black bg-pixel-red font-pixel text-xl leading-none text-pixel-white hover:bg-pixel-gray" aria-label="关闭">x</button>
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
  if (executionHasLlmFailureOutput(execution)) {
    return execution.error || 'LLM 请求失败：当前绑定的供应商/模型没有返回可用结果，请检查供应商状态、模型和 API 地址后重试。';
  }
  if (executionHasDryRunOutput(execution)) {
    return buildDryRunFailureMessage(
      execution.finalOutput ||
        Object.values(execution.nodeStates)
          .map((state) => state.output || '')
          .filter(Boolean)
          .join('\n')
    );
  }
  if (execution.status === 'queued' || execution.status === 'running') {
    return '团队任务仍在执行中。请保持页面打开，或稍后刷新项目查看最新进度。';
  }
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

function isLlmFailureText(value?: string | null): boolean {
  return /^LLM request failed\.?$/i.test((value || '').replace(/\s+/g, ' ').trim());
}

function executionHasLlmFailureOutput(execution: WorkflowExecution): boolean {
  if (isLlmFailureText(execution.finalOutput)) return true;
  return Object.values(execution.nodeStates).some((state) => isLlmFailureText(state.output));
}

function isDryRunOutputText(value?: string | null): boolean {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  return /\bdry-run completed\b/i.test(normalized) ||
    /\bCLI unavailable fallback handoff\b/i.test(normalized) ||
    /ProviderAuthError:\s*No API key found/i.test(normalized) ||
    /No API key found for provider/i.test(normalized) ||
    /未能真正执行/.test(normalized);
}

function executionHasDryRunOutput(execution: WorkflowExecution): boolean {
  if (isDryRunOutputText(execution.finalOutput)) return true;
  return Object.values(execution.nodeStates).some((state) => isDryRunOutputText(state.output));
}

function buildDryRunFailureMessage(output?: string | null): string {
  const preview = output?.trim()
    ? `\n\n返回片段：\n${shortText(output.trim(), 900)}`
    : '';
  return [
    '本次团队执行只返回了 dry-run/降级模拟结果，未真实调用 Agent，也没有生成有效交付物。',
    '请检查后端是否已部署最新修复，并确认团队内每个 Agent 都绑定了可用供应商/API Key 后重试。',
  ].join('\n') + preview;
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

const DIR_DESCRIPTIONS: Record<string, string> = {
  '01-literature': '文献资料',
  '02-experiment': '实验数据',
  '03-paper': '论文产出',
  'sections': '章节',
  'figures': '图表',
  'results': '结果',
};

const FILE_DESCRIPTIONS: Record<string, string> = {
  'main.tex': '论文主文件 (LaTeX)',
  'main.pdf': '论文 PDF',
  'references.bib': '参考文献库',
  'PAPER_SUMMARY.md': '论文摘要',
  'EXPERIMENT_REPORT.md': '实验报告',
  'RESEARCH_DIRECTION.md': '研究方向',
  'PIPELINE_STATE.json': '流水线状态',
  'LITERATURE_SEARCH_STRATEGY.md': '检索策略',
  'LITERATURE_DATABASE.csv': '文献数据库',
};

function fileExtLabel(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()?.slice(0, 3).toUpperCase() : '';
  return ext || 'FILE';
}

function getNodeTooltip(node: ProjectFileNode): string {
  if (node.isDirectory && DIR_DESCRIPTIONS[node.name]) {
    return `${DIR_DESCRIPTIONS[node.name]} - ${node.relativePath}`;
  }
  if (!node.isDirectory && FILE_DESCRIPTIONS[node.name]) {
    return FILE_DESCRIPTIONS[node.name];
  }
  return node.relativePath;
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

function getWorkflowPollAttemptLimit(dsl: WorkflowDsl): number {
  const agentNodeCount = Math.max(1, dsl.nodes.filter((node) => node.type === 'agent').length);
  const rawTimeoutSec = dsl.execution?.timeoutSec ?? 1800;
  const timeoutSec = Number.isFinite(rawTimeoutSec) ? rawTimeoutSec : 1800;
  const timeoutMs = Math.max(1, timeoutSec) * agentNodeCount * 1000;
  const maxMs = Math.min(WORKFLOW_MAX_POLL_MS, Math.max(WORKFLOW_MIN_POLL_MS, timeoutMs + 60_000));
  return Math.ceil(maxMs / WORKFLOW_POLL_INTERVAL_MS);
}

function getWorkflowPollRetryDelay(errorCount: number): number {
  return WORKFLOW_POLL_INTERVAL_MS + Math.min(errorCount, 6) * 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shortText(value: string, maxLength: number): string {
  const normalized = value.trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function formatDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt || !completedAt) return '';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec} 秒`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `${min} 分 ${sec} 秒` : `${min} 分钟`;
  const hr = Math.floor(min / 60);
  return `${hr} 小时 ${min % 60} 分`;
}

const SCAFFOLD_ARTIFACT_FILES = new Set([
  'AGENTS.md',
  'BOOTSTRAP.md',
  'HEARTBEAT.md',
  'IDENTITY.md',
  'SOUL.md',
  'TOOLS.md',
  'USER.md',
]);

function isNoiseArtifactPath(relativePath: string): boolean {
  if (!relativePath) return true;
  const normalized = relativePath.replace(/^\.\//, '').replace(/\\/g, '/');
  if (normalized.startsWith('handoff/')) return true;
  const base = normalized.split('/').pop() || normalized;
  return SCAFFOLD_ARTIFACT_FILES.has(base);
}

function buildNodeReportContent(
  evt: WorkflowExecutionEvent,
  state: Pick<WorkflowNodeStateSummary, 'error' | 'startedAt' | 'completedAt'>
): string {
  if (evt.type === 'node_failed') {
    return `任务失败：${state.error || evt.message}`;
  }
  const degraded = evt.details?.degraded === true;
  if (degraded) {
    const reason =
      (typeof evt.details?.degradedReason === 'string' && evt.details.degradedReason) ||
      '该 Agent 的 CLI 不可用';
    return [
      `未真正执行（已降级）`,
      `原因：${reason}`,
      `请在「管理团队 → 配置团队 API Key」为该 Agent 绑定可用的 LLM 后重试。`,
    ].join('\n');
  }
  const duration = formatDuration(state.startedAt, state.completedAt);
  const header = duration ? `已完成任务（耗时 ${duration}）` : '已完成任务';
  const rawOutput = typeof evt.details?.output === 'string' ? evt.details.output : '';
  if (isDryRunOutputText(rawOutput)) {
    return [
      '未真正执行：该节点返回了 dry-run/降级模拟结果。',
      '请检查后端版本和 Agent 供应商/API Key 配置后重试。',
      '',
      shortText(rawOutput, 900),
    ].join('\n');
  }
  const output = rawOutput ? shortText(rawOutput, 600) : '';
  const rawArtifacts = evt.details?.artifacts;
  const artifacts = Array.isArray(rawArtifacts)
    ? (rawArtifacts as Array<{ relativePath?: string; path?: string }>)
        .filter((artifact) => !isNoiseArtifactPath(artifact.relativePath || artifact.path || ''))
        .slice(0, 6)
    : [];
  const artifactLines = artifacts.length > 0
    ? `\n\n产物：\n${artifacts.map((artifact) => `- ${artifact.relativePath || artifact.path || ''}`).join('\n')}`
    : '';
  return [header, output].filter(Boolean).join('\n\n') + artifactLines;
}
