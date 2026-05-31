import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  createAgent,
  getUserAgents,
  getAgentsByCave,
  getUnassignedAgents,
  getAgentByIdAndUser,
  updateAgent,
  moveAgentToCave,
  deleteAgent,
  createCave,
  getUserCaves,
  updateCave,
  deleteCave,
  updateAgentConfig,
  uploadAgentAvatar,
} from '../services/agent.service.js';
import {
  listAgentSkills,
  uploadAgentSkill,
} from '../services/agent-skills.service.js';
import { agentRunner } from '../services/agent-runner.service.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
const skillUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// All routes require authentication
router.use(authMiddleware);

// ==================== AGENTS ====================

// GET /api/agents - Get all user agents
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { caveId } = req.query;

    let agents;
    if (caveId === 'unassigned') {
      agents = await getUnassignedAgents(userId);
    } else if (caveId && typeof caveId === 'string') {
      agents = await getAgentsByCave(userId, caveId);
    } else {
      agents = await getUserAgents(userId);
    }

    res.json({ agents });
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({ message: '获取Agent列表失败' });
  }
});

// POST /api/agents - Create a new agent
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, description, avatar, tags, manifest, sourceMarketAgentId, sourceVersion } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ message: '请提供Agent名称' });
      return;
    }

    const agent = await createAgent(userId, {
      name: name.trim(),
      description,
      avatar,
      tags,
      manifest,
      sourceMarketAgentId,
      sourceVersion,
    });

    res.status(201).json({ agent });
  } catch (error) {
    console.error('Create agent error:', error);
    res.status(500).json({ message: '创建Agent失败' });
  }
});

// GET /api/agents/:id - Get a specific agent
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const agent = await getAgentByIdAndUser(id, userId);
    if (!agent) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    res.json({ agent });
  } catch (error) {
    console.error('Get agent error:', error);
    res.status(500).json({ message: '获取Agent详情失败' });
  }
});

// PATCH /api/agents/:id - Update an agent
router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { name, description, avatar, tags, status } = req.body;

    const agent = await updateAgent(id, userId, {
      name,
      description,
      avatar,
      tags,
      status,
    } as any);

    if (!agent) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    res.json({ agent });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ message: '更新Agent失败' });
  }
});

// POST /api/agents/:id/move - Move agent to/from cave
router.post('/:id/move', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { caveId } = req.body; // null to remove from cave

    const success = await moveAgentToCave(id, userId, caveId || null);
    if (!success) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Move agent error:', error);
    res.status(500).json({ message: '移动Agent失败' });
  }
});

// DELETE /api/agents/:id - Delete an agent
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const success = await deleteAgent(id, userId);
    if (!success) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({ message: '删除Agent失败' });
  }
});

// PATCH /api/agents/:id/config - Update agent user config (API keys, model settings, etc.)
router.patch('/:id/config', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const config = req.body;

    const success = await updateAgentConfig(id, userId, config);
    if (!success) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update agent config error:', error);
    res.status(500).json({ message: '更新Agent配置失败' });
  }
});

// POST /api/agents/:id/avatar - Upload agent avatar
router.post('/:id/avatar', upload.single('avatar'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    // Get avatar file from multipart form
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: '请上传头像文件' });
      return;
    }

    const result = await uploadAgentAvatar(id, userId, file);
    if (!result) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    res.json({ success: true, avatarUrl: result.avatarUrl });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ message: '上传头像失败' });
  }
});

// GET /api/agents/:id/skills - List SKILL.md files from this agent workspace
router.get('/:id/skills', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    const skills = await listAgentSkills(id, userId);
    if (!skills) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }

    res.json({ skills });
  } catch (error) {
    console.error('List agent skills error:', error);
    res.status(500).json({ message: 'Failed to list agent skills' });
  }
});

// POST /api/agents/:id/skills - Upload a SKILL.md/.md file or zip containing skills
router.post('/:id/skills', skillUpload.single('skill'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const { name } = req.body;
    const file = req.file;

    if (!file) {
      res.status(400).json({ message: 'Please upload a skill file' });
      return;
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !['md', 'zip'].includes(extension)) {
      res.status(400).json({ message: 'Please upload a SKILL.md, .md, or .zip file' });
      return;
    }

    const result = await uploadAgentSkill(
      id,
      userId,
      file,
      typeof name === 'string' ? name : undefined
    );

    if (!result) {
      res.status(404).json({ message: 'Agent not found' });
      return;
    }

    res.status(201).json({ success: true, ...result });
  } catch (error) {
    console.error('Upload agent skill error:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to upload skill',
    });
  }
});

// ==================== CAVES ====================

// GET /api/caves - Get all user caves
router.get('/caves', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const caves = await getUserCaves(userId);
    res.json({ caves });
  } catch (error) {
    console.error('Get caves error:', error);
    res.status(500).json({ message: '获取Agent窝列表失败' });
  }
});

// POST /api/caves - Create a new cave
router.post('/caves', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, color } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ message: '请提供窝名称' });
      return;
    }

    const cave = await createCave(userId, name.trim(), color || '#3b82f6');
    res.status(201).json({ cave });
  } catch (error) {
    console.error('Create cave error:', error);
    res.status(500).json({ message: '创建Agent窝失败' });
  }
});

// PATCH /api/caves/:id - Update a cave
router.patch('/caves/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { name, color } = req.body;

    const cave = await updateCave(id, userId, { name, color } as any);
    if (!cave) {
      res.status(404).json({ message: 'Agent窝不存在' });
      return;
    }

    res.json({ cave });
  } catch (error) {
    console.error('Update cave error:', error);
    res.status(500).json({ message: '更新Agent窝失败' });
  }
});

// DELETE /api/caves/:id - Delete a cave
router.delete('/caves/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const success = await deleteCave(id, userId);
    if (!success) {
      res.status(404).json({ message: 'Agent窝不存在' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete cave error:', error);
    res.status(500).json({ message: '删除Agent窝失败' });
  }
});

// POST /api/agents/:id/test - Test agent with provider config
router.post('/:id/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const agentId = req.params.id;

    const agent = await getAgentByIdAndUser(agentId, userId);
    if (!agent) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    // Import providers to get config
    const { getDb } = await import('../db/index.js');
    const { providers } = await import('../db/schema.js');
    const { eq } = await import('drizzle-orm');

    const db = getDb();
    let providerConfig: { apiKey: string; baseUrl?: string; models?: string[] } | undefined;

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
        };
      }
    }

    // Check if CLI is available
    const manifest = JSON.parse(agent.manifest || '{}');
    const platform = manifest?.entrypoint?.type || 'openclaw';
    const cliCheck = await agentRunner.checkCliAvailable(platform as any);

    res.json({
      agent: {
        id: agent.id,
        name: agent.name,
        platform,
      },
      provider: providerConfig ? {
        hasApiKey: true,
        apiKeyPrefix: providerConfig.apiKey.substring(0, 8) + '...',
        baseUrl: providerConfig.baseUrl || 'default',
        modelCount: providerConfig.models?.length || 0,
      } : null,
      cli: cliCheck,
    });
  } catch (error) {
    console.error('Test agent error:', error);
    res.status(500).json({ message: '测试失败' });
  }
});

export default router;
