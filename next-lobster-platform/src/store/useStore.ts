import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Lobster,
  Cave,
  Architecture,
  ArchitectureAgent,
  Project,
  ProjectInput,
  OpenClawConfig,
  Session,
  SessionMessage,
  WhiteboardColumn,
  WhiteboardConnection,
  WhiteboardNote,
} from '@/types';
import * as api from '@/lib/api';
import { getOpenClawDesktop, type DesktopLocalAgent } from '@/lib/desktop';
import { useAuthStore } from './useAuthStore';

interface LobsterStore {
  lobsters: Lobster[];
  caves: Cave[];
  architectures: Architecture[];
  projects: Project[];
  messages: any[];
  sessions: Session[];
  sessionMessages: SessionMessage[];
  whiteboards: Record<string, WhiteboardNote[]>;
  whiteboardConnections: Record<string, WhiteboardConnection[]>;
  addSessionMessage: (message: SessionMessage) => void;
  createSession: (name: string, memberIds: string[]) => string;
  renameSession: (sessionId: string, name: string) => void;
  deleteSession: (sessionId: string) => void;
  addMemberToSession: (sessionId: string, lobsterId: string) => void;
  removeMemberFromSession: (sessionId: string, lobsterId: string) => void;
  addWhiteboardNote: (note: WhiteboardNote) => void;
  clearWhiteboard: (sessionId: string) => void;
  updateWhiteboardNote: (sessionId: string, noteId: string, updates: { text?: string; column?: WhiteboardColumn }) => void;
  moveWhiteboardNote: (sessionId: string, noteId: string, x: number, y: number) => void;
  deleteWhiteboardNote: (sessionId: string, noteId: string) => void;
  addWhiteboardConnection: (connection: WhiteboardConnection) => void;
  deleteWhiteboardConnection: (sessionId: string, connectionId: string) => void;
  activeLobsterId: string | null;
  activeArchitectureId: string | null;
  currentTask: string | null;
  activeAgentId: string | null;
  openclawConfigs: OpenClawConfig[];
  coins: number;
  isLoading: boolean;
  isInitialized: boolean;

  spendCoins: (amount: number) => void;

  // Data fetching
  fetchCaves: () => Promise<void>;
  fetchAgents: (caveId?: string) => Promise<void>;
  fetchProjects: () => Promise<void>;
  fetchArchitectures: () => Promise<void>;

  // Cave actions
  addCave: (cave: Cave) => void;
  removeCave: (id: string) => void;
  updateCave: (id: string, updates: Partial<Cave>) => void;
  createCaveAPI: (name: string, color: string) => Promise<Cave>;
  deleteCaveAPI: (id: string) => Promise<void>;

  // Lobster actions
  setLobsters: (lobsters: Lobster[]) => void;
  addLobster: (lobster: Lobster) => void;
  updateLobsterStatus: (id: string, status: Lobster['status']) => void;
  setActiveLobster: (id: string | null) => void;
  addConversation: (lobsterId: string, conversation: { role: 'user' | 'lobster'; content: string }) => void;
  moveLobsterToCave: (lobsterId: string, caveId: string | null) => void;
  moveAgentToCaveAPI: (agentId: string, caveId: string | null) => Promise<void>;
  createAgentAPI: (name: string, description?: string) => Promise<any>;
  deleteAgentAPI: (id: string) => Promise<void>;

  // Architecture actions
  updateAgentStatus: (archId: string, agentId: string, status: ArchitectureAgent['status']) => void;
  addArchitecture: (architecture: Architecture) => void;
  createArchitectureAPI: (architecture: Architecture) => Promise<Architecture>;
  updateArchitectureAPI: (archId: string, updates: Partial<Architecture>) => Promise<Architecture>;
  updateAgentLink: (archId: string, agentId: string, lobsterId: string | null) => void;
  setActiveAgent: (id: string | null) => void;
  setCurrentTask: (task: string | null) => void;

  // Project actions
  createProjectAPI: (data: ProjectInput) => Promise<Project>;
  updateProjectAPI: (projectId: string, data: Partial<ProjectInput>) => Promise<Project>;
  openProjectAPI: (projectId: string) => Promise<Project>;
  deleteProjectAPI: (projectId: string) => Promise<void>;

  // OpenClaw actions
  setOpenclawConfigs: (configs: OpenClawConfig[]) => void;
  updateOpenclawConfig: (workspacePath: string, config: Partial<OpenClawConfig>) => void;

  // Initialize
  initialize: () => Promise<void>;
}

// Helper to convert API agent to Lobster type
function agentToLobster(agent: any): Lobster {
  let tags: string[] = [];
  try {
    if (typeof agent.tags === 'string') {
      tags = JSON.parse(agent.tags);
    } else if (Array.isArray(agent.tags)) {
      tags = agent.tags;
    }
  } catch {}

  return {
    id: agent.id,
    name: agent.name,
    description: agent.description || '',
    avatar: agent.avatar || '',
    role: agent.description || 'AI Agent',
    status: agent.status || 'idle',
    conversations: [],
    tags,
    caveId: agent.caveId || undefined,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    sourceMarketAgentId: agent.sourceMarketAgentId || null,
    canEditProfile: agent.canEditProfile !== false,
    platform: agent.platform || agent.config?.platform || undefined,
    providerId: agent.providerId || agent.config?.providerId || null,
    config: agent.config,
    ownerUsername:
      agent.ownerUsername ||
      agent.uploaderUsername ||
      agent.username ||
      agent.owner?.username ||
      '当前用户',
    uploaderUsername: agent.uploaderUsername || agent.ownerUsername,
    isPublishedToMarket: Boolean(agent.isPublishedToMarket || agent.marketAgentId),
    marketAgentId: agent.marketAgentId || null,
  };
}

function desktopAgentToLobster(agent: DesktopLocalAgent): Lobster {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description || agent.reason || '',
    avatar: agent.avatar || '',
    role: agent.description || agent.reason || 'Local Agent',
    status: 'idle',
    conversations: [],
    tags: [
      'local',
      agent.imported ? 'imported' : 'detected',
      agent.platform ? `platform:${agent.platform}` : 'platform:unknown',
    ],
    caveId: undefined,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    canEditProfile: false,
    platform: agent.platform,
    ownerUsername: 'Local Desktop',
    uploaderUsername: 'Local Desktop',
    isPublishedToMarket: false,
    marketAgentId: null,
    openclawPath: agent.workspacePath,
  };
}

// Helper to convert API cave to Cave type
function agentCaveToCave(cave: any): Cave {
  return {
    id: cave.id,
    name: cave.name,
    color: cave.color,
    description: cave.description || '',
    createdAt: cave.createdAt,
    updatedAt: cave.updatedAt,
  };
}

export const useStore = create<LobsterStore>()(
  persist(
    (set, get) => ({
  lobsters: [],
  caves: [],
  architectures: [],
  projects: [],
  messages: [],
  activeLobsterId: null,
  activeArchitectureId: null,
  currentTask: null,
  activeAgentId: null,
  coins: 2500,
  isLoading: false,
  isInitialized: false,
  sessions: [],
  sessionMessages: [],
  whiteboards: {},
  whiteboardConnections: {},
  addSessionMessage: (message) => set((state) => ({
    sessionMessages: [...state.sessionMessages, message].slice(-500),
    sessions: state.sessions.map((session) =>
      session.id === message.sessionId
        ? { ...session, updatedAt: message.timestamp }
        : session
    ),
  })),
  createSession: (name, memberIds) => {
    const now = new Date().toISOString();
    const session: Session = {
      id: `session-${Date.now()}`,
      name,
      memberIds,
      createdAt: now,
      updatedAt: now,
    };

    set((state) => ({
      sessions: [session, ...state.sessions],
    }));

    return session.id;
  },
  renameSession: (sessionId, name) => set((state) => ({
    sessions: state.sessions.map((session) =>
      session.id === sessionId
        ? { ...session, name, updatedAt: new Date().toISOString() }
        : session
    ),
  })),
  deleteSession: (sessionId) => set((state) => ({
    sessions: state.sessions.filter((session) => session.id !== sessionId),
    sessionMessages: state.sessionMessages.filter((message) => message.sessionId !== sessionId),
    whiteboards: Object.fromEntries(
      Object.entries(state.whiteboards).filter(([id]) => id !== sessionId)
    ),
    whiteboardConnections: Object.fromEntries(
      Object.entries(state.whiteboardConnections).filter(([id]) => id !== sessionId)
    ),
  })),
  addMemberToSession: (sessionId, lobsterId) => set((state) => ({
    sessions: state.sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            memberIds: session.memberIds.includes(lobsterId)
              ? session.memberIds
              : [...session.memberIds, lobsterId],
            updatedAt: new Date().toISOString(),
          }
        : session
    ),
  })),
  removeMemberFromSession: (sessionId, lobsterId) => set((state) => ({
    sessions: state.sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            memberIds: session.memberIds.filter((id) => id !== lobsterId),
            updatedAt: new Date().toISOString(),
          }
        : session
    ),
  })),
  addWhiteboardNote: (note) => set((state) => {
    const currentNotes = state.whiteboards[note.sessionId] || [];
    const nextNote = {
      ...note,
      x: Number.isFinite(note.x) ? note.x : 16,
      y: Number.isFinite(note.y) ? note.y : 16,
      updatedAt: note.updatedAt || note.createdAt,
    };

    return {
      whiteboards: {
        ...state.whiteboards,
        [note.sessionId]: [...currentNotes, nextNote].slice(-40),
      },
    };
  }),
  clearWhiteboard: (sessionId) => set((state) => ({
    whiteboards: {
      ...state.whiteboards,
      [sessionId]: [],
    },
    whiteboardConnections: {
      ...state.whiteboardConnections,
      [sessionId]: [],
    },
  })),
  updateWhiteboardNote: (sessionId, noteId, updates) => set((state) => {
    const currentNotes = state.whiteboards[sessionId] || [];
    const targetNote = currentNotes.find((note) => note.id === noteId);
    if (!targetNote) {
      return {};
    }

    const updatedNote = {
      ...targetNote,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    return {
      whiteboards: {
        ...state.whiteboards,
        [sessionId]: updatedNote.text.trim()
          ? currentNotes.map((note) => (note.id === noteId ? updatedNote : note))
          : currentNotes.filter((note) => note.id !== noteId),
      },
      whiteboardConnections: updatedNote.text.trim()
        ? state.whiteboardConnections
        : {
            ...state.whiteboardConnections,
            [sessionId]: (state.whiteboardConnections[sessionId] || []).filter(
              (connection) => connection.fromNoteId !== noteId && connection.toNoteId !== noteId
            ),
          },
    };
  }),
  moveWhiteboardNote: (sessionId, noteId, x, y) => set((state) => ({
    whiteboards: {
      ...state.whiteboards,
      [sessionId]: (state.whiteboards[sessionId] || []).map((note) =>
        note.id === noteId
          ? {
              ...note,
              x,
              y,
              updatedAt: new Date().toISOString(),
            }
          : note
      ),
    },
  })),
  deleteWhiteboardNote: (sessionId, noteId) => set((state) => ({
    whiteboards: {
      ...state.whiteboards,
      [sessionId]: (state.whiteboards[sessionId] || []).filter((note) => note.id !== noteId),
    },
    whiteboardConnections: {
      ...state.whiteboardConnections,
      [sessionId]: (state.whiteboardConnections[sessionId] || []).filter(
        (connection) => connection.fromNoteId !== noteId && connection.toNoteId !== noteId
      ),
    },
  })),
  addWhiteboardConnection: (connection) => set((state) => {
    if (connection.fromNoteId === connection.toNoteId) return {};
    const currentConnections = state.whiteboardConnections[connection.sessionId] || [];
    const exists = currentConnections.some(
      (item) =>
        (item.fromNoteId === connection.fromNoteId && item.toNoteId === connection.toNoteId) ||
        (item.fromNoteId === connection.toNoteId && item.toNoteId === connection.fromNoteId)
    );
    if (exists) return {};

    return {
      whiteboardConnections: {
        ...state.whiteboardConnections,
        [connection.sessionId]: [...currentConnections, connection],
      },
    };
  }),
  deleteWhiteboardConnection: (sessionId, connectionId) => set((state) => ({
    whiteboardConnections: {
      ...state.whiteboardConnections,
      [sessionId]: (state.whiteboardConnections[sessionId] || []).filter(
        (connection) => connection.id !== connectionId
      ),
    },
  })),

  openclawConfigs: [
    {
      workspacePath: 'C:\\Users\\Administrator\\.openclaw\\workspace',
      port: 3001,
      isActive: true,
    },
    {
      workspacePath: 'C:\\Users\\Administrator\\.openclaw\\workspace-research-bot-td',
      port: 3002,
      isActive: true,
    }
  ],

  spendCoins: (amount) => set((state) => ({ coins: Math.max(0, state.coins - amount) })),

  // Data fetching
  fetchCaves: async () => {
    try {
      const caves = await api.fetchCaves();
      set({ caves });
    } catch (error) {
      console.error('Failed to fetch caves:', error);
    }
  },

  fetchAgents: async (caveId?: string) => {
    try {
      set({ isLoading: true });
      const desktop = getOpenClawDesktop();
      if (desktop?.listLocalAgents) {
        const result = await desktop.listLocalAgents();
        set({ lobsters: result.agents.map(desktopAgentToLobster), isLoading: false });
        return;
      }
      if (desktop?.scanLocalAgents) {
        const result = await desktop.scanLocalAgents();
        const lobsters = result.agents.map((agent) => desktopAgentToLobster({
          id: `local-agent-${agent.path}`,
          name: agent.name,
          description: agent.reason,
          platform: agent.type,
          workspacePath: agent.path,
          confidence: agent.confidence,
          reason: agent.reason,
          imported: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        set({ lobsters, isLoading: false });
        return;
      }
      const agents = await api.fetchAgents(caveId);
      const lobsters = agents.map(agentToLobster);
      set({ lobsters, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch agents:', error);
      set({ isLoading: false });
    }
  },

  fetchProjects: async () => {
    try {
      const desktop = getOpenClawDesktop();
      if (desktop?.listLocalProjects) {
        const projects = await desktop.listLocalProjects();
        set({ projects });
        return;
      }
      const projects = await api.fetchProjects();
      set({ projects });
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      set({ projects: [] });
    }
  },

  fetchArchitectures: async () => {
    try {
      const architectures = await api.fetchArchitectures();
      set({ architectures });
    } catch (error) {
      console.error('Failed to fetch architectures:', error);
      set({ architectures: [] });
    }
  },

  // Cave actions
  addCave: (cave) => set((state) => ({ caves: [...state.caves, cave] })),
  removeCave: (id) => set((state) => ({ caves: state.caves.filter(c => c.id !== id) })),
  updateCave: (id, updates) => set((state) => ({
    caves: state.caves.map(c => c.id === id ? { ...c, ...updates } : c)
  })),

  createCaveAPI: async (name, color) => {
    const cave = await api.createCave(name, color);
    get().addCave(agentCaveToCave(cave));
    return cave;
  },

  deleteCaveAPI: async (id) => {
    await api.deleteCave(id);
    get().removeCave(id);
  },

  // Lobster actions
  setLobsters: (lobsters) => set({ lobsters }),
  addLobster: (lobster) => set((state) => ({ lobsters: [...state.lobsters, lobster] })),
  updateLobsterStatus: (id, status) => set((state) => ({
    lobsters: state.lobsters.map(l => l.id === id ? { ...l, status } : l)
  })),
  setActiveLobster: (id) => set({ activeLobsterId: id }),
  setActiveAgent: (id) => set({ activeAgentId: id }),
  setCurrentTask: (task) => set({ currentTask: task }),
  addConversation: (lobsterId, conversation) => set((state) => ({
    lobsters: state.lobsters.map(l => {
      if (l.id === lobsterId) {
        return {
          ...l,
          conversations: [...l.conversations, {
            id: `conv-${Date.now()}`,
            ...conversation,
            timestamp: new Date().toISOString()
          }]
        };
      }
      return l;
    })
  })),
  moveLobsterToCave: (lobsterId, caveId) => set((state) => ({
    lobsters: state.lobsters.map(l => l.id === lobsterId ? { ...l, caveId: caveId ?? undefined } : l)
  })),

  moveAgentToCaveAPI: async (agentId, caveId) => {
    await api.updateAgent(agentId, { caveId: caveId ?? null });
    get().moveLobsterToCave(agentId, caveId);
  },

  createAgentAPI: async (name, description) => {
    const agent = await api.createAgent({ name, description });
    const lobster = agentToLobster(agent);
    get().addLobster(lobster);
    return agent;
  },

  deleteAgentAPI: async (id) => {
    const desktop = getOpenClawDesktop();
    if (desktop?.deleteLocalAgent) {
      const result = await desktop.deleteLocalAgent(id);
      if (!result?.success) {
        throw new Error('删除本地 Agent 失败');
      }
      set((state) => ({ lobsters: state.lobsters.filter(l => l.id !== id) }));
      return;
    }
    if (desktop) {
      throw new Error('当前桌面客户端不支持删除本地 Agent，请更新桌面端或在本地注册表中移除。');
    }
    await api.deleteAgent(id);
    set((state) => ({ lobsters: state.lobsters.filter(l => l.id !== id) }));
  },

  // Architecture actions
  addArchitecture: (architecture) => set((state) => ({
    architectures: [architecture, ...state.architectures.filter((item) => item.id !== architecture.id)],
  })),
  createArchitectureAPI: async (architecture) => {
    const created = await api.createArchitecture(architecture);
    set((state) => ({
      architectures: [created, ...state.architectures.filter((item) => item.id !== created.id)],
    }));
    return created;
  },
  updateArchitectureAPI: async (archId, updates) => {
    const updated = await api.updateArchitecture(archId, updates);
    set((state) => ({
      architectures: state.architectures.map((architecture) =>
        architecture.id === archId ? updated : architecture
      ),
    }));
    return updated;
  },
  updateAgentStatus: (archId, agentId, status) => set((state) => ({
    architectures: state.architectures.map((architecture) =>
      architecture.id === archId
        ? {
            ...architecture,
            agents: architecture.agents.map((agent) =>
              agent.id === agentId ? { ...agent, status } : agent
            ),
          }
        : architecture
    ),
  })),
  updateAgentLink: (archId, agentId, lobsterId) => set((state) => ({
    architectures: state.architectures.map((architecture) =>
      architecture.id === archId
        ? {
            ...architecture,
            agents: architecture.agents.map((agent) =>
              agent.id === agentId
                ? { ...agent, linkedLobsterId: lobsterId ?? undefined }
                : agent
            ),
          }
        : architecture
    ),
  })),

  createProjectAPI: async (data) => {
    const desktop = getOpenClawDesktop();
    if (desktop?.createLocalProject) {
      const project = await desktop.createLocalProject(data);
      set((state) => ({ projects: [project, ...state.projects.filter((item) => item.id !== project.id)] }));
      return project;
    }
    const project = await api.createProject(data);
    set((state) => ({ projects: [project, ...state.projects] }));
    return project;
  },

  updateProjectAPI: async (projectId, data) => {
    const desktop = getOpenClawDesktop();
    if (desktop?.updateLocalProject) {
      const project = await desktop.updateLocalProject(projectId, data);
      set((state) => ({
        projects: state.projects.map((item) => (item.id === projectId ? project : item)),
      }));
      return project;
    }
    const project = await api.updateProject(projectId, data);
    set((state) => ({
      projects: state.projects.map((item) => (item.id === projectId ? project : item)),
    }));
    return project;
  },

  openProjectAPI: async (projectId) => {
    const desktop = getOpenClawDesktop();
    if (desktop?.openLocalProject) {
      const project = await desktop.openLocalProject(projectId);
      set((state) => ({
        projects: [project, ...state.projects.filter((item) => item.id !== projectId)],
      }));
      return project;
    }
    const project = await api.openProject(projectId);
    set((state) => ({
      projects: [project, ...state.projects.filter((item) => item.id !== projectId)],
    }));
    return project;
  },

  deleteProjectAPI: async (projectId) => {
    const desktop = getOpenClawDesktop();
    if (desktop?.deleteLocalProject) {
      await desktop.deleteLocalProject(projectId);
      set((state) => ({
        projects: state.projects.filter((item) => item.id !== projectId),
      }));
      return;
    }
    await api.deleteProject(projectId);
    set((state) => ({
      projects: state.projects.filter((item) => item.id !== projectId),
    }));
  },

  // OpenClaw actions
  setOpenclawConfigs: (configs) => set({ openclawConfigs: configs }),
  updateOpenclawConfig: (workspacePath, config) => set((state) => ({
    openclawConfigs: state.openclawConfigs.map(c =>
      c.workspacePath === workspacePath ? { ...c, ...config } : c
    )
  })),

  // Initialize - fetch data from API
  initialize: async () => {
    const desktop = getOpenClawDesktop();
    if (desktop) {
      try {
        await Promise.all([
          get().fetchAgents(),
          get().fetchProjects(),
        ]);
        set({ isInitialized: true });
      } catch (error) {
        console.error('Failed to initialize desktop store:', error);
        set({ isInitialized: true });
      }
      return;
    }

    const token = useAuthStore.getState().token;
    if (!token) {
      set({ isInitialized: true });
      return;
    }

    try {
      await Promise.all([
        get().fetchCaves(),
        get().fetchAgents(),
        get().fetchProjects(),
        get().fetchArchitectures(),
      ]);
      set({ isInitialized: true });
    } catch (error) {
      console.error('Failed to initialize store:', error);
      set({ isInitialized: true });
    }
  },
    }),
    {
      name: 'lobster-workspace-state',
      partialize: (state) => ({
        sessions: state.sessions,
        sessionMessages: state.sessionMessages,
        whiteboards: state.whiteboards,
        whiteboardConnections: state.whiteboardConnections,
      }),
    }
  )
);
