/**
 * WebSocket Server for Real-time Agent Chat
 */

import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { verifyToken } from '../utils/jwt.js';
import { agentRunner, type AgentPlatform } from './agent-runner.service.js';
import { getDb } from '../db/index.js';
import { userAgentInstances, conversations, messages, providers } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  sessionId?: string;
  agentId?: string;
  isAlive?: boolean;
}

interface ChatMessage {
  type: 'message' | 'start' | 'stop' | 'ping' | 'pong';
  payload?: string | Record<string, unknown>;
}

const SUPPORTED_AGENT_PLATFORMS: AgentPlatform[] = [
  'claude-code',
  'openclaw',
  'codex',
  'hermes',
  'opencode',
];

class ChatWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, AuthenticatedWebSocket> = new Map();

  constructor(port: number = 3003) {
    this.wss = new WebSocketServer({ port });
    this.setupServer();
    console.log(`🔌 WebSocket server running on ws://localhost:${port}`);
  }

  private setupServer(): void {
    // Handle new connections
    this.wss.on('connection', (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    // Heartbeat to detect dead connections
    const interval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const authWs = ws as AuthenticatedWebSocket;
        if (authWs.isAlive === false) {
          return authWs.terminate();
        }
        authWs.isAlive = false;
        authWs.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(interval);
    });

    // Set up agent runner event listeners
    this.setupAgentEvents();
  }

  private async handleConnection(ws: AuthenticatedWebSocket, req: IncomingMessage): Promise<void> {
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Extract token from query string
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const agentId = url.searchParams.get('agentId');

    if (!token) {
      ws.close(4001, 'Missing authentication token');
      return;
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      ws.close(4002, 'Invalid token');
      return;
    }

    ws.userId = decoded.userId;

    if (!agentId) {
      ws.close(4003, 'Missing agent ID');
      return;
    }

    // Verify user owns this agent
    const db = getDb();
    const agent = db
      .select()
      .from(userAgentInstances)
      .where(
        and(
          eq(userAgentInstances.id, agentId),
          eq(userAgentInstances.userId, decoded.userId)
        )
      )
      .get();

    if (!agent) {
      ws.close(4004, 'Agent not found or unauthorized');
      return;
    }

    ws.agentId = agentId;
    const clientKey = `${decoded.userId}:${agentId}`;
    this.clients.set(clientKey, ws);

    console.log(`✅ Client connected: ${clientKey}`);

    // Send connection success
    this.sendToClient(ws, {
      type: 'connected',
      payload: {
        agentId,
        agentName: agent.name,
        platform: this.getPlatformFromManifest(agent.manifest),
        status: 'ready',
      },
    });

    // Handle messages
    ws.on('message', async (data) => {
      try {
        const msg: ChatMessage = JSON.parse(data.toString());
        await this.handleMessage(ws, msg);
      } catch (error) {
        console.error('Failed to parse message:', error);
        this.sendToClient(ws, { type: 'error', payload: 'Invalid message format' });
      }
    });

    ws.on('close', () => {
      console.log(`❌ Client disconnected: ${clientKey}`);
      this.clients.delete(clientKey);
      
      // Optionally stop the agent session
      const session = agentRunner.getSessionByAgentId(agentId!);
      if (session) {
        // Keep session alive for a bit in case user reconnects
      }
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${clientKey}:`, error);
    });
  }

  private async handleMessage(ws: AuthenticatedWebSocket, msg: ChatMessage): Promise<void> {
    const { userId, agentId } = ws;

    if (!userId || !agentId) {
      this.sendToClient(ws, { type: 'error', payload: 'Not authenticated' });
      return;
    }

    switch (msg.type) {
      case 'start':
        await this.handleStartSession(ws, agentId);
        break;

      case 'stop':
        await this.handleStopSession(ws, agentId);
        break;

      case 'message':
        await this.handleChatMessage(ws, agentId, msg.payload as string);
        break;

      case 'ping':
        this.sendToClient(ws, { type: 'pong' });
        break;

      default:
        this.sendToClient(ws, { type: 'error', payload: 'Unknown message type' });
    }
  }

  private async handleStartSession(ws: AuthenticatedWebSocket, agentId: string): Promise<void> {
    const db = getDb();
    const agent = db
      .select()
      .from(userAgentInstances)
      .where(eq(userAgentInstances.id, agentId))
      .get();

    if (!agent) {
      this.sendToClient(ws, { type: 'error', payload: 'Agent not found' });
      return;
    }

    // Check if session already exists
    let session = agentRunner.getSessionByAgentId(agentId);

    if (!session) {
      try {
        const platform = this.getPlatformFromManifest(agent.manifest) || 'openclaw';

        // Fetch provider config if agent has a providerId
        let providerConfig: { apiKey: string; baseUrl?: string; models?: string[]; stateDir?: string | null } | undefined;
        if (agent.providerId) {
          const provider = db
            .select()
            .from(providers)
            .where(eq(providers.id, agent.providerId))
            .get();
          if (provider) {
            providerConfig = {
              apiKey: provider.apiKey,
              baseUrl: provider.baseUrl || undefined,
              models: provider.models ? JSON.parse(provider.models) : undefined,
              stateDir: agent.stateDir,
            };
          }
        }

        session = await agentRunner.startSession(
          agentId,
          platform as AgentPlatform,
          agent.workspacePath,
          providerConfig
        );

        // Update agent status
        db.update(userAgentInstances)
          .set({ status: 'busy', lastActiveAt: new Date(), updatedAt: new Date() })
          .where(eq(userAgentInstances.id, agentId))
          .run();

        this.sendToClient(ws, {
          type: 'session_started',
          payload: { sessionId: session.sessionId, platform },
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to start session';
        this.sendToClient(ws, { type: 'error', payload: errorMsg });
      }
    } else {
      this.sendToClient(ws, {
        type: 'session_started',
        payload: { sessionId: session.sessionId, platform: session.platform },
      });
    }
  }

  private async handleStopSession(ws: AuthenticatedWebSocket, agentId: string): Promise<void> {
    const session = agentRunner.getSessionByAgentId(agentId);

    if (session) {
      await agentRunner.stopSession(session.sessionId);
    }

    const db = getDb();
    db.update(userAgentInstances)
      .set({ status: 'idle', updatedAt: new Date() })
      .where(eq(userAgentInstances.id, agentId))
      .run();

    this.sendToClient(ws, { type: 'session_stopped', payload: { agentId } });
  }

  private async handleChatMessage(
    ws: AuthenticatedWebSocket,
    agentId: string,
    content: string
  ): Promise<void> {
    if (!content?.trim()) {
      this.sendToClient(ws, { type: 'error', payload: 'Empty message' });
      return;
    }

    // Get or create session
    let session = agentRunner.getSessionByAgentId(agentId);

    if (!session) {
      // Auto-start session if not running
      const db = getDb();
      const agent = db
        .select()
        .from(userAgentInstances)
        .where(eq(userAgentInstances.id, agentId))
        .get();

      if (!agent) {
        this.sendToClient(ws, { type: 'error', payload: 'Agent not found' });
        return;
      }

      try {
        const platform = this.getPlatformFromManifest(agent.manifest) || 'openclaw';

        // Fetch provider config if agent has a providerId
        let providerConfig: { apiKey: string; baseUrl?: string; models?: string[]; stateDir?: string | null } | undefined;
        if (agent.providerId) {
          const provider = db
            .select()
            .from(providers)
            .where(eq(providers.id, agent.providerId))
            .get();
          if (provider) {
            providerConfig = {
              apiKey: provider.apiKey,
              baseUrl: provider.baseUrl || undefined,
              models: provider.models ? JSON.parse(provider.models) : undefined,
              stateDir: agent.stateDir,
            };
          }
        }

        session = await agentRunner.startSession(
          agentId,
          platform as AgentPlatform,
          agent.workspacePath,
          providerConfig
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to start agent';
        this.sendToClient(ws, { type: 'error', payload: errorMsg });
        return;
      }
    }

    // Save user message to database
    const db = getDb();
    
    // Get or create conversation
    let conv = db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.agentInstanceId, agentId),
          eq(conversations.userId, ws.userId!)
        )
      )
      .orderBy()
      .get();

    if (!conv) {
      // Create new conversation
      const convId = `conv_${Date.now()}`;
      const now = new Date();
      db.insert(conversations).values({
        id: convId,
        userId: ws.userId!,
        agentInstanceId: agentId,
        title: '新对话',
        lastMessage: content.substring(0, 100),
        messageCount: 1,
        isPinned: false,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      }).run();
      conv = db.select().from(conversations).where(eq(conversations.id, convId)).get()!;
    }

    // Save user message
    const msgId = `msg_${Date.now()}`;
    db.insert(messages).values({
      id: msgId,
      conversationId: conv.id,
      role: 'user',
      content,
      metadata: JSON.stringify({ source: 'websocket' }),
      createdAt: new Date(),
    }).run();

    // Update conversation
    db.update(conversations)
      .set({
        lastMessage: content.substring(0, 200),
        messageCount: conv.messageCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conv.id))
      .run();

    // Send message to agent
    const sent = agentRunner.sendMessage(session.sessionId, content);

    if (!sent) {
      this.sendToClient(ws, { type: 'error', payload: 'Failed to send message to agent' });
    }
  }

  private setupAgentEvents(): void {
    // Forward agent responses to clients
    agentRunner.on('response', ({ sessionId, response }) => {
      const session = agentRunner.getSession(sessionId);
      if (!session) return;

      // Find client by agentId (format: userId:agentId)
      for (const [key, ws] of this.clients) {
        if (key.endsWith(`:${session.agentId}`)) {
          this.sendToClient(ws, {
            type: 'agent_output',
            payload: {
              content: response.content,
              outputType: response.type,
              timestamp: response.timestamp.toISOString(),
            },
          });
        }
      }
    });

    agentRunner.on('sessionEnd', ({ sessionId, exitCode }) => {
      const session = agentRunner.getSession(sessionId);
      if (!session) return;

      // Update agent status
      const db = getDb();
      db.update(userAgentInstances)
        .set({ status: 'idle', updatedAt: new Date() })
        .where(eq(userAgentInstances.id, session.agentId))
        .run();

      // Notify client
      for (const [key, ws] of this.clients) {
        if (key.endsWith(`:${session.agentId}`)) {
          this.sendToClient(ws, {
            type: 'session_ended',
            payload: { exitCode },
          });
        }
      }
    });
  }

  private sendToClient(ws: AuthenticatedWebSocket, data: Record<string, unknown>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  private getPlatformFromManifest(manifestJson: string): AgentPlatform | null {
    try {
      const manifest = JSON.parse(manifestJson);
      const type = manifest?.entrypoint?.type;
      return SUPPORTED_AGENT_PLATFORMS.includes(type) ? type : null;
    } catch {
      return null;
    }
  }

  /**
   * Broadcast to all clients
   */
  broadcast(data: Record<string, unknown>): void {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Shutdown server
   */
  async shutdown(): Promise<void> {
    // Stop all agent sessions
    await agentRunner.stopAll();

    // Close all connections
    this.wss.clients.forEach((client) => {
      client.close();
    });

    this.wss.close();
    console.log('WebSocket server shut down');
  }
}

// Singleton instance
let chatServer: ChatWebSocketServer | null = null;

export function startChatServer(port?: number): ChatWebSocketServer {
  if (!chatServer) {
    chatServer = new ChatWebSocketServer(port);
  }
  return chatServer;
}

export function getChatServer(): ChatWebSocketServer | null {
  return chatServer;
}

export default chatServer;
