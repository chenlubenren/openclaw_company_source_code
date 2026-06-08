import { Router, Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  createProject,
  deleteProject,
  getProject,
  listProjectFiles,
  listProjects,
  readProjectFileContent,
  touchProject,
  updateProject,
} from '../services/project.service.js';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projects = await listProjects(req.user!.userId);
    res.json({ projects });
  } catch (error) {
    console.error('List projects error:', error);
    res.status(500).json({ message: '获取项目列表失败' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const project = await createProject(req.user!.userId, req.body);
    res.status(201).json({ project });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(400).json({
      message: error instanceof Error ? error.message : '创建项目失败',
    });
  }
});

router.get('/:id/files', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tree = await listProjectFiles(req.user!.userId, String(req.params.id), req.query.path);
    if (!tree) {
      res.status(404).json({ message: '项目不存在' });
      return;
    }
    res.json({ tree });
  } catch (error) {
    console.error('List project files error:', error);
    res.status(400).json({
      message: error instanceof Error ? error.message : '读取项目文件失败',
    });
  }
});

router.get('/:id/files/content', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const file = await readProjectFileContent(req.user!.userId, String(req.params.id), req.query.path);
    if (!file) {
      res.status(404).json({ message: '项目不存在' });
      return;
    }
    res.json({ file });
  } catch (error) {
    console.error('Read project file error:', error);
    res.status(400).json({
      message: error instanceof Error ? error.message : '读取文件内容失败',
    });
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const project = await getProject(req.user!.userId, String(req.params.id));
    if (!project) {
      res.status(404).json({ message: '项目不存在' });
      return;
    }
    res.json({ project });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ message: '获取项目失败' });
  }
});

router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const project = await updateProject(req.user!.userId, String(req.params.id), req.body);
    if (!project) {
      res.status(404).json({ message: '项目不存在' });
      return;
    }
    res.json({ project });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(400).json({
      message: error instanceof Error ? error.message : '更新项目失败',
    });
  }
});

router.post('/:id/open', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const project = await touchProject(req.user!.userId, String(req.params.id));
    if (!project) {
      res.status(404).json({ message: '项目不存在' });
      return;
    }
    res.json({ project });
  } catch (error) {
    console.error('Open project error:', error);
    res.status(500).json({ message: '打开项目失败' });
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const success = await deleteProject(req.user!.userId, String(req.params.id));
    if (!success) {
      res.status(404).json({ message: '项目不存在' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ message: '删除项目失败' });
  }
});

export default router;
