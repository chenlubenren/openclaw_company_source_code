import { Router, Request, Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  getMarketAgents,
  getMarketAgentById,
  getMarketAgentVersions,
  cleanInvalidMarketAgents,
  cacheAllMarketAgentIcons,
  getOrCacheAvatar,
  clearAvatarCache,
  incrementDownloadCount,
  publishAgentToMarket,
} from '../services/market.service.js';

const router = Router();

// ==================== Public Market Routes ====================

// GET /api/market - List all active market agents
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, visibility, search, tags, limit = '50', offset = '0' } = req.query;

    const agents = await getMarketAgents({
      status: status as string || 'active',
      visibility: visibility as string || 'public',
      search: search as string,
      tags: tags ? (tags as string).split(',') : undefined,
      limit: Math.min(parseInt(limit as string) || 50, 100),
      offset: parseInt(offset as string) || 0,
    });

    res.json({ agents });
  } catch (error) {
    console.error('Get market agents error:', error);
    res.status(500).json({ message: '获取市场列表失败' });
  }
});

// GET /api/market/:id - Get a specific market agent
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await getMarketAgentById(id);

    if (!agent) {
      res.status(404).json({ message: '市场Agent不存在' });
      return;
    }

    res.json({ agent });
  } catch (error) {
    console.error('Get market agent error:', error);
    res.status(500).json({ message: '获取Agent详情失败' });
  }
});

// GET /api/market/:id/versions - Get versions of a market agent
router.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const versions = await getMarketAgentVersions(id);
    res.json({ versions });
  } catch (error) {
    console.error('Get versions error:', error);
    res.status(500).json({ message: '获取版本列表失败' });
  }
});

// ==================== Protected Market Routes (require auth) ====================

router.use(authMiddleware);

// POST /api/market/:id/download - Download an agent (creates user instance)
router.post('/:id/download', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const agent = await getMarketAgentById(id);
    if (!agent) {
      res.status(404).json({ message: '市场Agent不存在' });
      return;
    }

    // Increment download count
    await incrementDownloadCount(id);

    // TODO: Create user agent instance from market agent
    // This would clone the workspace and create a user_agent_instances record

    res.json({ success: true, message: '下载成功' });
  } catch (error) {
    console.error('Download agent error:', error);
    res.status(500).json({ message: '下载失败' });
  }
});

// POST /api/market/publish - Publish user's agent to market
router.post('/publish', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { agentInstanceId, name, description, tags, visibility } = req.body;

    if (!agentInstanceId || !name) {
      res.status(400).json({ message: '缺少必要参数' });
      return;
    }

    const result = await publishAgentToMarket(
      userId,
      agentInstanceId,
      name,
      description || '',
      tags || [],
      visibility || 'public'
    );

    if (!result.success) {
      res.status(400).json({ message: result.error });
      return;
    }

    res.json({ success: true, marketAgentId: result.marketAgentId });
  } catch (error) {
    console.error('Publish agent error:', error);
    res.status(500).json({ message: '发布到市场失败' });
  }
});

// ==================== Admin Routes ====================

// POST /api/market/clean - Clean invalid market agents (admin only)
router.post('/clean', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // TODO: Add admin role check
    const result = await cleanInvalidMarketAgents();
    res.json({
      success: true,
      deleted: result.deleted,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Clean market error:', error);
    res.status(500).json({ message: '清理失败' });
  }
});

// POST /api/market/cache-icons - Cache all market agent icons
router.post('/cache-icons', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await cacheAllMarketAgentIcons();
    res.json({
      success: true,
      cached: result.cached,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Cache icons error:', error);
    res.status(500).json({ message: '缓存头像失败' });
  }
});

// DELETE /api/market/cache/:agentId - Clear avatar cache for an agent
router.delete('/cache/:agentId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { agentId } = req.params;
    clearAvatarCache(agentId);
    res.json({ success: true });
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({ message: '清理缓存失败' });
  }
});

// DELETE /api/market/cache - Clear all avatar cache
router.delete('/cache', async (req: AuthenticatedRequest, res: Response) => {
  try {
    clearAvatarCache();
    res.json({ success: true });
  } catch (error) {
    console.error('Clear all cache error:', error);
    res.status(500).json({ message: '清理缓存失败' });
  }
});

export default router;
