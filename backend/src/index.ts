import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import authRoutes from './routes/auth.routes.js';
import agentsRoutes from './routes/agents.routes.js';
import conversationsRoutes from './routes/conversations.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import marketRoutes from './routes/market.routes.js';
import socialRoutes from './routes/social.routes.js';
import profileRoutes from './routes/profile.routes.js';
import providersRoutes from './routes/providers.routes.js';
import workflowsRoutes from './routes/workflows.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import architecturesRoutes from './routes/architectures.routes.js';
import integrationsRoutes from './routes/integrations.routes.js';
import { initWorkspaceRoot, resolveStoredPath } from './services/workspace.service.js';
import { startChatServer } from './services/chat-websocket.service.js';
import { agentRunner } from './services/agent-runner.service.js';
import { cleanInvalidMarketAgents, cacheAllMarketAgentIcons } from './services/market.service.js';

const app = express();
const PORT = process.env.PORT || 3002;
const WS_PORT = process.env.WS_PORT || 3003;
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3010',
  'http://127.0.0.1:3010',
];

function getAllowedCorsOrigins(): string[] {
  const rawOrigins = process.env.CORS_ORIGIN?.trim()
    ? process.env.CORS_ORIGIN
    : DEFAULT_CORS_ORIGINS.join(',');
  return rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const allowedCorsOrigins = getAllowedCorsOrigins();

// Multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedCorsOrigins.includes('*') || allowedCorsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Initialize workspace root
initWorkspaceRoot();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    wsPort: WS_PORT,
  });
});

// Routes
app.use('/auth', authRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/providers', providersRoutes);
app.use('/api/workflows', workflowsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/architectures', architecturesRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/architectures', architecturesRoutes);

// Serve agent avatars from workspaces
app.get('/api/agents/:agentId/avatar/:filename', (req, res) => {
  const { agentId, filename } = req.params;
  const workspaceRoot = resolveStoredPath(process.env.WORKSPACE_ROOT || path.join(process.cwd(), 'data', 'workspaces'));
  const candidates: string[] = [];
  const usersRoot = path.join(workspaceRoot, 'users');

  if (fs.existsSync(usersRoot)) {
    for (const userDir of fs.readdirSync(usersRoot)) {
      candidates.push(path.join(usersRoot, userDir, 'agents', agentId, 'avatars', filename));
    }
  }

  if (fs.existsSync(workspaceRoot)) {
    for (const dir of fs.readdirSync(workspaceRoot)) {
      candidates.push(path.join(workspaceRoot, dir, agentId, 'avatars', filename));
    }
  }

  const avatarPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (avatarPath) return res.sendFile(avatarPath);

  res.status(404).json({ message: 'Avatar not found' });
});

// Cleanup invalid market agents and cache icons on startup
(async () => {
  try {
    const cleanResult = await cleanInvalidMarketAgents();
    if (cleanResult.deleted > 0) {
      console.log(`🧹 Cleaned ${cleanResult.deleted} invalid market agents`);
    }
    if (cleanResult.errors.length > 0) {
      console.error('Cleanup errors:', cleanResult.errors);
    }

    // Cache all market agent icons
    const cacheResult = await cacheAllMarketAgentIcons();
    if (cacheResult.cached > 0) {
      console.log(`📦 Cached ${cacheResult.cached} market agent icons`);
    }
    if (cacheResult.failed > 0) {
      console.log(`⚠️ Failed to cache ${cacheResult.failed} icons`);
    }
  } catch (error) {
    console.error('Market startup error:', error);
  }
})();

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: '服务器内部错误' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('');
  console.log('📝 API Endpoints:');
  console.log('   Auth:');
  console.log('   POST /auth/register');
  console.log('   POST /auth/login');
  console.log('   GET  /auth/me');
  console.log('');
  console.log('   Agents:');
  console.log('   GET    /api/agents');
  console.log('   POST   /api/agents');
  console.log('   GET    /api/agents/:id');
  console.log('   PATCH  /api/agents/:id');
  console.log('   POST   /api/agents/:id/move');
  console.log('   DELETE /api/agents/:id');
  console.log('');
  console.log('   Caves:');
  console.log('   GET    /api/agents/caves');
  console.log('   POST   /api/agents/caves');
  console.log('   PATCH  /api/agents/caves/:id');
  console.log('   DELETE /api/agents/caves/:id');
  console.log('');
  console.log('   Conversations:');
  console.log('   GET    /api/conversations');
  console.log('   GET    /api/conversations/:agentId');
  console.log('   POST   /api/conversations');
  console.log('   DELETE /api/conversations/:id');
  console.log('   GET    /api/conversations/:id/messages');
  console.log('   POST   /api/conversations/:id/messages');
  console.log('');
  console.log('   Upload:');
  console.log('   POST   /api/upload');
  console.log('   GET    /api/upload/template');
  console.log('');
  console.log('   Market:');
  console.log('   GET    /api/market');
  console.log('   GET    /api/market/:id');
  console.log('   POST   /api/market/:id/download');
  console.log('   POST   /api/market/publish');
  console.log('   POST   /api/market/clean');
  console.log('');
  console.log('   Social Feed (Agent朋友圈/论坛):');
  console.log('   GET    /api/social/feed');
  console.log('   GET    /api/social/posts/:id');
  console.log('   POST   /api/social/posts');
  console.log('   DELETE /api/social/posts/:id');
  console.log('   GET    /api/social/posts/:id/comments');
  console.log('   POST   /api/social/posts/:id/comments');
  console.log('   POST   /api/social/like');
  console.log('   POST   /api/social/follow');
  console.log('');
  console.log('   Market Admin:');
  console.log('   POST   /api/market/clean');
  console.log('   POST   /api/market/cache-icons');
  console.log('');
  console.log('   Profile:');
  console.log('   GET    /api/profile/:filename');
  console.log('');
  console.log('   Providers:');
  console.log('   GET    /api/providers');
  console.log('   POST   /api/providers');
  console.log('   GET    /api/providers/:id');
  console.log('   PATCH  /api/providers/:id');
  console.log('   DELETE /api/providers/:id');
  console.log('');
  console.log('   Workflows:');
  console.log('   POST   /api/workflows/generate-dsl');
  console.log('   POST   /api/workflows/execute');
  console.log('   GET    /api/workflows/executions');
  console.log('   GET    /api/workflows/executions/:id');
  console.log('   POST   /api/workflows/executions/:id/cancel');
  console.log('');
  console.log('   Projects:');
  console.log('   GET    /api/projects');
  console.log('   POST   /api/projects');
  console.log('   GET    /api/projects/:id');
  console.log('   PATCH  /api/projects/:id');
  console.log('   POST   /api/projects/:id/open');
  console.log('   DELETE /api/projects/:id');
  console.log('');
  console.log('   Integrations:');
  console.log('   GET    /api/integrations/feishu/webhook/:scope/:subjectId');
  console.log('   POST   /api/integrations/feishu/:scope/:subjectId/:token');
  console.log('');
  console.log('   Agent Config:');
  console.log('   PATCH  /api/agents/:id/config');
  console.log('   POST   /api/agents/:id/avatar');
  console.log('');
  console.log('🔌 WebSocket Chat:');
  console.log(`   ws://localhost:${WS_PORT}?token=<jwt>&agentId=<agentId>`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`HTTP port ${PORT} is already in use. Stop the old backend process and restart.`);
  } else {
    console.error('HTTP server error:', error);
  }
  process.exit(1);
});

// Start WebSocket server
const chatServer = startChatServer(Number(WS_PORT));

// Graceful shutdown
let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nReceived ${signal}; shutting down...`);

  const forceExitTimer = setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  try {
    await chatServer.shutdown();
    await agentRunner.stopAll();
    await new Promise<void>((resolve) => {
      server.close((error?: Error) => {
        if (error) {
          console.error('HTTP server close error:', error);
        }
        resolve();
      });
    });
    console.log('Server closed');
    process.exit(0);
  } catch (error) {
    console.error('Shutdown error:', error);
    process.exit(1);
  }
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

export default app;
