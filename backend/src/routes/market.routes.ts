import { Router, Request, Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  getMarketAgents,
  getMarketAgentById,
  getMarketAgentVersions,
  cleanInvalidMarketAgents,
  cacheAllMarketAgentIcons,
  clearAvatarCache,
  publishAgentToMarket,
  downloadMarketAgentToUser,
} from '../services/market.service.js';
import {
  deployCozeAgentToUser,
  getCozeRuntimeInfo,
  listCozeMarketAgents,
} from '../services/coze-market.service.js';
import {
  adoptTeamTemplate,
  findDuplicateTeamAgents,
  getTeamTemplateById,
  listTeamTemplates,
} from '../services/team-template.service.js';

const router = Router();

function firstParam(value: unknown, fallback = ''): string {
  if (Array.isArray(value)) return value[0] ? String(value[0]) : fallback;
  return typeof value === 'string' ? value : fallback;
}

// ==================== Public Market Routes ====================

// GET /api/market - List all active market agents
router.get('/', async (req: Request, res: Response) => {
  try {
    const status = firstParam(req.query.status, 'active');
    const visibility = firstParam(req.query.visibility, 'public');
    const search = firstParam(req.query.search);
    const tags = firstParam(req.query.tags);
    const limit = firstParam(req.query.limit, '50');
    const offset = firstParam(req.query.offset, '0');

    const agents = await getMarketAgents({
      status,
      visibility,
      search,
      tags: tags ? tags.split(',') : undefined,
      limit: Math.min(parseInt(limit) || 50, 100),
      offset: parseInt(offset) || 0,
    });

    res.json({ agents });
  } catch (error) {
    console.error('Get market agents error:', error);
    res.status(500).json({ message: '获取市场列表失败' });
  }
});

// GET /api/market/coze - List deployable Coze-backed agents
router.get('/coze', async (req: Request, res: Response) => {
  try {
    const search = firstParam(req.query.search);
    const category = firstParam(req.query.category);
    const limit = firstParam(req.query.limit, '50');

    const agents = listCozeMarketAgents({
      search,
      category,
      limit: Math.min(parseInt(limit) || 50, 100),
    });

    res.json({
      agents,
      runtime: getCozeRuntimeInfo(),
    });
  } catch (error) {
    console.error('Get Coze market agents error:', error);
    res.status(500).json({ message: '获取跨次元市场失败' });
  }
});

// GET /api/market/team-templates - List available team templates
router.get('/team-templates', async (_req: Request, res: Response) => {
  try {
    const templates = listTeamTemplates();
    res.json({ templates });
  } catch (error) {
    console.error('Get team templates error:', error);
    res.status(500).json({ message: '获取团队模板列表失败' });
  }
});

// GET /api/market/team-templates/:id - Get a specific team template
router.get('/team-templates/:id', async (req: Request, res: Response) => {
  try {
    const id = firstParam(req.params.id);
    const template = getTeamTemplateById(id);
    if (!template) {
      res.status(404).json({ message: '团队模板不存在' });
      return;
    }
    res.json({ template });
  } catch (error) {
    console.error('Get team template error:', error);
    res.status(500).json({ message: '获取团队模板失败' });
  }
});

// GET /api/market/:id - Get a specific market agent
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = firstParam(req.params.id);
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
    const id = firstParam(req.params.id);
    const versions = await getMarketAgentVersions(id);
    res.json({ versions });
  } catch (error) {
    console.error('Get versions error:', error);
    res.status(500).json({ message: '获取版本列表失败' });
  }
});

// ==================== Protected Market Routes (require auth) ====================

router.use(authMiddleware);

// POST /api/market/coze/:botId/deploy - Deploy a Coze bot as a local user agent
router.post('/coze/:botId/deploy', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const botId = firstParam(req.params.botId);

    const result = await deployCozeAgentToUser(userId, botId);
    if (!result.success) {
      res.status(400).json({ message: result.error || '部署 Coze Agent 失败' });
      return;
    }

    res.json({
      success: true,
      agentId: result.agentId,
      message: '已部署为本平台 Agent',
      runtime: getCozeRuntimeInfo(),
    });
  } catch (error) {
    console.error('Deploy Coze agent error:', error);
    res.status(500).json({ message: '部署 Coze Agent 失败' });
  }
});

// GET /api/market/team-templates/:id/duplicates - Find existing agents from this template
router.get('/team-templates/:id/duplicates', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = firstParam(req.params.id);
    const duplicates = await findDuplicateTeamAgents(userId, id);
    res.json({ duplicates });
  } catch (error) {
    console.error('Find team template duplicates error:', error);
    res.status(500).json({ message: '检查重复 Agent 失败' });
  }
});

// POST /api/market/team-templates/:id/adopt - Adopt a team template
router.post('/team-templates/:id/adopt', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = firstParam(req.params.id);
    const teamName = typeof req.body?.teamName === 'string' ? req.body.teamName.trim() : undefined;
    const duplicateChoices = Array.isArray(req.body?.duplicateChoices) ? req.body.duplicateChoices : [];

    const result = await adoptTeamTemplate(userId, id, teamName, duplicateChoices);
    if (!result.success) {
      res.status(400).json({ message: result.error || '领养团队失败' });
      return;
    }

    res.json({
      success: true,
      caveId: result.caveId,
      caveName: result.caveName,
      teamId: result.teamId,
      agentIds: result.agentIds,
      message: '团队领养成功！已创建 Agent 窝和团队架构。',
    });
  } catch (error) {
    console.error('Adopt team template error:', error);
    res.status(500).json({ message: '领养团队失败' });
  }
});

// POST /api/market/:id/download - Download an agent (creates user instance)
router.post('/:id/download', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = firstParam(req.params.id);

    const result = await downloadMarketAgentToUser(userId, id);
    if (!result.success) {
      res.status(400).json({ message: result.error || '下载失败' });
      return;
    }

    res.json({ success: true, agentId: result.agentId, message: '下载成功' });
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
    const agentId = firstParam(req.params.agentId);
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
