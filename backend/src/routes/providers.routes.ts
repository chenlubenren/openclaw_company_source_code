import { Router, Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  createProvider,
  getUserProviders,
  getUserProvidersByType,
  updateProvider,
  deleteProvider,
} from '../services/provider.service.js';

const router = Router();

router.use(authMiddleware);

// GET /api/providers - Get all user providers
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { type } = req.query;
    const provs = type ? await getUserProvidersByType(userId, type as string) : await getUserProviders(userId);
    res.json({ providers: provs });
  } catch (error) {
    console.error('Get providers error:', error);
    res.status(500).json({ message: '获取供应商失败' });
  }
});

// GET /api/providers/:id - Get single provider
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const prov = await getUserProviders(userId);
    const found = prov.find(p => p.id === id);
    if (!found) {
      res.status(404).json({ message: '供应商不存在' });
      return;
    }
    res.json({ provider: found });
  } catch (error) {
    console.error('Get provider error:', error);
    res.status(500).json({ message: '获取供应商失败' });
  }
});

// POST /api/providers - Create provider
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, type, apiKey, baseUrl, models } = req.body;
    if (!name || !type || !apiKey) {
      res.status(400).json({ message: '缺少必填字段' });
      return;
    }
    const validTypes = ['claude', 'codex', 'opencode', 'openclaw', 'gemini', 'hermes'];
    if (!validTypes.includes(type)) {
      res.status(400).json({ message: '无效的供应商类型' });
      return;
    }
    const provider = await createProvider(userId, { name, type, apiKey, baseUrl, models });
    res.json({ provider });
  } catch (error) {
    console.error('Create provider error:', error);
    res.status(500).json({ message: '创建供应商失败' });
  }
});

// PATCH /api/providers/:id - Update provider
router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const updates = req.body;
    if (updates.type) {
      const validTypes = ['claude', 'codex', 'opencode', 'openclaw', 'gemini', 'hermes'];
      if (!validTypes.includes(updates.type)) {
        res.status(400).json({ message: '无效的供应商类型' });
        return;
      }
    }
    const provider = await updateProvider(id, userId, updates);
    if (!provider) {
      res.status(404).json({ message: '供应商不存在' });
      return;
    }
    res.json({ provider });
  } catch (error) {
    console.error('Update provider error:', error);
    res.status(500).json({ message: '更新供应商失败' });
  }
});

// DELETE /api/providers/:id - Delete provider
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const success = await deleteProvider(id, userId);
    if (!success) {
      res.status(404).json({ message: '供应商不存在' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete provider error:', error);
    res.status(500).json({ message: '删除供应商失败' });
  }
});

export default router;
