import { create } from 'zustand';
import { Lobster, Cave, ArchitectureAgent, OpenClawConfig } from '@/types';
import * as api from '@/lib/api';
import { useAuthStore } from './useAuthStore';

interface LobsterStore {
  lobsters: Lobster[];
  caves: Cave[];
  messages: any[];
  sessions: any[];
  sessionMessages: any[];
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

export const useStore = create<LobsterStore>((set, get) => ({
  lobsters: [],
  caves: [],
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
      const agents = await api.fetchAgents(caveId);
      const lobsters = agents.map(agentToLobster);
      set({ lobsters, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch agents:', error);
      set({ isLoading: false });
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
    // Delete cave API call would go here
    get().removeCave(id);
  },

  // Lobster actions
  setLobsters: (lobsters) => set({ lobsters }),
  addLobster: (lobster) => set((state) => ({ lobsters: [...state.lobsters, lobster] })),
  updateLobsterStatus: (id, status) => set((state) => ({
    lobsters: state.lobsters.map(l => l.id === id ? { ...l, status } : l)
  })),
  setActiveLobster: (id) => set({ activeLobsterId: id }),
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
    const token = useAuthStore.getState().token;
    await fetch(`http://localhost:3002/api/agents/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    set((state) => ({ lobsters: state.lobsters.filter(l => l.id !== id) }));
  },

  // Architecture actions
  updateAgentStatus: (archId, agentId, status) => {
    // Not implemented in this version
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
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ isInitialized: true });
      return;
    }

    try {
      await Promise.all([
        get().fetchCaves(),
        get().fetchAgents(),
      ]);
      set({ isInitialized: true });
    } catch (error) {
      console.error('Failed to initialize store:', error);
      set({ isInitialized: true });
    }
  },
}));
