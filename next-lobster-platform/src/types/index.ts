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
  caveId?: string | null;
  updatedAt?: string;
  sourceMarketAgentId?: string | null;
  canEditProfile?: boolean;
  platform?: string;
  providerId?: string | null;
  config?: AgentConfig;
  ownerUsername?: string;
  uploaderUsername?: string;
  isPublishedToMarket?: boolean;
  marketAgentId?: string | null;
  // OpenClaw configuration
  openclawPath?: string;
  openclawPort?: number;
  isConnected?: boolean;
  sessionKey?: string;
}

export interface AgentConfig {
  platform?: string | null;
  providerId?: string | null;
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
  workflowDsl?: WorkflowDsl;
  createdAt: string;
  updatedAt?: string;
}

export interface Project {
  id: string;
  userId?: string;
  name: string;
  description: string;
  notes: string;
  icon: string;
  workspacePath: string;
  teamIds: string[];
  agentIds: string[];
  ganttEnabled: boolean;
  ganttPlan: ProjectGanttItem[];
  gitRemote: string;
  gitBranch: string;
  gitCommit: string;
  status: 'active' | 'archived' | string;
  lastOpenedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectGanttItem {
  id?: string;
  title: string;
  start: string;
  end: string;
  ownerTeamId?: string;
  status?: 'todo' | 'active' | 'done' | string;
}

export interface ProjectInput {
  name: string;
  description?: string;
  notes?: string;
  icon?: string;
  teamIds?: string[];
  agentIds?: string[];
  ganttEnabled?: boolean;
  ganttPlan?: ProjectGanttItem[];
  gitRemote?: string;
  gitBranch?: string;
  gitCommit?: string;
}

export interface ProjectFileNode {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  children?: ProjectFileNode[];
}

export interface ProjectFileTree {
  projectId: string;
  root: ProjectFileNode;
  truncated: boolean;
  totalEntries: number;
}

export interface ProjectFileContent {
  name: string;
  path: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
  content: string;
  truncated: boolean;
  binary: boolean;
}

export interface RuntimePlatformHealth {
  platform: 'claude-code' | 'codex' | 'opencode' | 'hermes' | 'openclaw';
  label: string;
  providerType: 'claude' | 'codex' | 'opencode' | 'hermes' | 'openclaw';
  cli: {
    available: boolean;
    version: string;
    command: string;
    args: string[];
    displayCommand: string;
    usesWsl: boolean;
    errorName?: string;
    errorCode?: string;
    errorMessage?: string;
    status?: number | null;
    signal?: string | null;
    stderr?: string;
    stdout?: string;
  };
  provider: {
    configuredCount: number;
    envConfigured: boolean;
    envVarNames: string[];
  };
  ready: boolean;
  issues: string[];
  installHint: string;
}

export interface RuntimeHealth {
  checkedAt: string;
  platforms: RuntimePlatformHealth[];
  summary: {
    total: number;
    ready: number;
    missingCli: number;
    missingProvider: number;
  };
}

export interface ArchitectureAgent {
  id: string;
  nodeId?: string;
  name: string;
  role: string;
  kind?: WorkflowAgentKind;
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

export type WorkflowNodeType = 'start' | 'agent' | 'condition' | 'end';
export type WorkflowEdgeBranch = 'yes' | 'no';
export type WorkflowAgentKind =
  | 'worker'
  | 'router'
  | 'aggregator'
  | 'judge'
  | 'orchestrator'
  | 'evaluator'
  | 'optimizer';

export interface WorkflowNodePosition {
  x: number;
  y: number;
}

export interface WorkflowBaseNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  position?: WorkflowNodePosition;
}

export interface WorkflowStartNode extends WorkflowBaseNode {
  type: 'start';
  outputKey: string;
}

export interface WorkflowAgentNode extends WorkflowBaseNode {
  type: 'agent';
  agentInstanceId?: string;
  role: string;
  kind?: WorkflowAgentKind;
  inputTemplate: string;
  outputKey: string;
  isManager?: boolean;
}

export interface WorkflowConditionNode extends WorkflowBaseNode {
  type: 'condition';
  expression: string;
}

export interface WorkflowEndNode extends WorkflowBaseNode {
  type: 'end';
  resultKey?: string;
}

export type WorkflowDslNode =
  | WorkflowStartNode
  | WorkflowAgentNode
  | WorkflowConditionNode
  | WorkflowEndNode;

export interface WorkflowDslEdge {
  id: string;
  from: string;
  to: string;
  branch?: WorkflowEdgeBranch;
  label?: string;
}

export interface WorkflowExecutionConfig {
  mode: 'dag' | 'state-machine';
  maxConcurrency: number;
  timeoutSec: number;
  maxIterations?: number;
}

export interface WorkflowValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface WorkflowDsl {
  schemaVersion: '1.0';
  name: string;
  description: string;
  entryNodeId: string;
  nodes: WorkflowDslNode[];
  edges: WorkflowDslEdge[];
  execution: WorkflowExecutionConfig;
  metadata?: {
    source?: 'canvas' | 'natural-language' | 'template' | 'fallback';
    generatedBy?: string;
    collaborationPattern?: string;
    warnings?: WorkflowValidationIssue[];
  };
}

export type WorkflowExecutionStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type WorkflowNodeExecutionStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped';

export interface WorkflowNodeRunState {
  nodeId: string;
  type: WorkflowNodeType;
  label: string;
  status: WorkflowNodeExecutionStatus;
  agentInstanceId?: string;
  agentName?: string;
  role?: string;
  kind?: WorkflowAgentKind;
  task?: string;
  runnerPrompt?: string;
  input?: string;
  output?: string;
  outputFilePath?: string;
  artifacts?: WorkflowArtifact[];
  error?: string;
  startedAt?: string;
  completedAt?: string;
  runCount: number;
}

export interface WorkflowArtifact {
  id: string;
  nodeId: string;
  nodeLabel: string;
  label: string;
  kind: 'node-output' | 'workspace-file';
  path: string;
  relativePath: string;
  size: number;
  createdAt: string;
}

export interface WorkflowExecutionEvent {
  id: string;
  timestamp: string;
  type: string;
  nodeId?: string;
  agentName?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface WorkflowExecution {
  id: string;
  userId: string;
  architectureId?: string;
  projectId?: string;
  projectName?: string;
  projectWorkspacePath?: string;
  sharedWorkspacePath: string;
  runWorkspacePath: string;
  artifactsPath: string;
  workflowName: string;
  task: string;
  status: WorkflowExecutionStatus;
  dryRun: boolean;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  workflowDsl: WorkflowDsl;
  nodeStates: Record<string, WorkflowNodeRunState>;
  events: WorkflowExecutionEvent[];
  artifacts: WorkflowArtifact[];
  currentNodeIds: string[];
  finalOutput?: string;
  error?: string;
}

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

export type WhiteboardColumn = 'ideas' | 'questions' | 'actions' | 'risks';

export interface WhiteboardNote {
  id: string;
  sessionId: string;
  column: WhiteboardColumn;
  text: string;
  authorName: string;
  createdAt: string;
  updatedAt?: string;
  x: number;
  y: number;
}

export interface WhiteboardConnection {
  id: string;
  sessionId: string;
  fromNoteId: string;
  toNoteId: string;
  createdAt: string;
}
