import { Router, Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  createArchitecture,
  deleteArchitecture,
  getArchitecture,
  listArchitectures,
  updateArchitecture,
} from '../services/architecture.service.js';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const architectures = await listArchitectures(req.user!.userId);
    res.json({ architectures });
  } catch (error) {
    console.error('List architectures error:', error);
    res.status(500).json({ message: '获取团队列表失败' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const architecture = await createArchitecture(req.user!.userId, req.body);
    res.status(201).json({ architecture });
  } catch (error) {
    console.error('Create architecture error:', error);
    res.status(400).json({
      message: error instanceof Error ? error.message : '创建团队失败',
    });
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const architecture = await getArchitecture(req.user!.userId, String(req.params.id));
    if (!architecture) {
      res.status(404).json({ message: '团队不存在' });
      return;
    }
    res.json({ architecture });
  } catch (error) {
    console.error('Get architecture error:', error);
    res.status(500).json({ message: '获取团队失败' });
  }
});

router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const architecture = await updateArchitecture(req.user!.userId, String(req.params.id), req.body);
    if (!architecture) {
      res.status(404).json({ message: '团队不存在' });
      return;
    }
    res.json({ architecture });
  } catch (error) {
    console.error('Update architecture error:', error);
    res.status(400).json({
      message: error instanceof Error ? error.message : '更新团队失败',
    });
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const success = await deleteArchitecture(req.user!.userId, String(req.params.id));
    if (!success) {
      res.status(404).json({ message: '团队不存在' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete architecture error:', error);
    res.status(500).json({ message: '删除团队失败' });
  }
});

export default router;
