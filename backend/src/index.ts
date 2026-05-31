import express from 'express';
import cors from 'cors';
import multer from 'multer';
import 'dotenv/config';
import authRoutes from './routes/auth.routes.js';
import agentsRoutes from './routes/agents.routes.js';
import conversationsRoutes from './routes/conversations.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import marketRoutes from './routes/market.routes.js';
import socialRoutes from './routes/social.routes.js';
import profileRoutes from './routes/profile.routes.js';
import providersRoutes from './routes/providers.routes.js';
import { initWorkspaceRoot } from './services/workspace.service.js';
import { startChatServer } from './services/chat-websocket.service.js';
import { agentRunner } from './services/agent-runner.service.js';
import { cleanInvalidMarketAgents, cacheAllMarketAgentIcons } from './services/market.service.js';

const app = express();
const PORT = process.env.PORT || 3002;
const WS_PORT = process.env.WS_PORT || 3003;

// Multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
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

// Serve agent avatars from workspaces
app.get('/api/agents/:agentId/avatar/:filename', (req, res) => {
  const { agentId, filename } = req.params;
  // Try to find workspace in data/workspaces subdirectories
  const workspaceRoot = path.join(process.cwd(), 'data', 'workspaces');
  const dirs = fs.readdirSync(workspaceRoot).filter(f => {
    try {
      return fs.statSync(path.join(workspaceRoot, f)).isDirectory();
    } catch { return false; }
  });
  for (const userDir of dirs) {
    const avatarPath = path.join(workspaceRoot, userDir, agentId, 'avatars', filename);
    if (fs.existsSync(avatarPath)) {
      return res.sendFile(avatarPath);
    }
  }
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
  console.log('   Agent Config:');
  console.log('   PATCH  /api/agents/:id/config');
  console.log('   POST   /api/agents/:id/avatar');
  console.log('');
  console.log('🔌 WebSocket Chat:');
  console.log(`   ws://localhost:${WS_PORT}?token=<jwt>&agentId=<agentId>`);
});

// Start WebSocket server
startChatServer(Number(WS_PORT));

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await agentRunner.stopAll();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await agentRunner.stopAll();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
