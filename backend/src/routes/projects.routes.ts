import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  buildProjectWorkspaceArchive,
  createProject,
  deleteProjectFile,
  deleteProject,
  getProject,
  listProjectFiles,
  listProjects,
  readProjectFileContent,
  renameProjectFile,
  touchProject,
  updateProject,
} from '../services/project.service.js';
import {
  listProjectDeliverables,
  reviewDeliverable,
} from '../services/deliverable.service.js';
import { resolveStoredPath } from '../services/workspace.service.js';

const router = Router();

router.use(authMiddleware);

router.get('/:id/deliverables', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deliverables = listProjectDeliverables(req.user!.userId, String(req.params.id));
    res.json({ deliverables });
  } catch (error) {
    console.error('List deliverables error:', error);
    res.status(500).json({ message: '获取交付物列表失败' });
  }
});

router.patch('/:id/deliverables/:deliverableId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = req.body?.status;
    if (status !== 'accepted' && status !== 'revision') {
      res.status(400).json({ message: 'status 必须是 accepted 或 revision' });
      return;
    }
    const deliverable = reviewDeliverable(req.user!.userId, String(req.params.deliverableId), status);
    if (!deliverable) {
      res.status(404).json({ message: '交付物不存在' });
      return;
    }
    res.json({ deliverable });
  } catch (error) {
    console.error('Review deliverable error:', error);
    res.status(500).json({ message: '更新交付物状态失败' });
  }
});

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

router.get('/:id/files/download', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const project = await getProject(req.user!.userId, String(req.params.id));
    if (!project) {
      res.status(404).json({ message: '项目不存在' });
      return;
    }
    const relativePath = typeof req.query.path === 'string' ? req.query.path : '';
    if (!relativePath || relativePath.includes('..')) {
      res.status(400).json({ message: '无效路径' });
      return;
    }
    const absolutePath = path.join(resolveStoredPath(project.workspacePath), relativePath);
    if (!fs.existsSync(absolutePath)) {
      res.status(404).json({ message: '文件不存在' });
      return;
    }
    const fileName = path.basename(relativePath);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(absolutePath).pipe(res);
  } catch (error) {
    console.error('Download project file error:', error);
    res.status(400).json({
      message: error instanceof Error ? error.message : '下载文件失败',
    });
  }
});

router.get('/:id/files/archive', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const archive = await buildProjectWorkspaceArchive(req.user!.userId, String(req.params.id));
    if (!archive) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(archive.filename)}"; filename*=UTF-8''${encodeURIComponent(archive.filename)}`);
    res.setHeader('X-OpenClaw-File-Count', String(archive.fileCount));
    res.send(archive.buffer);
  } catch (error) {
    console.error('Archive project files error:', error);
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to archive project files',
    });
  }
});

router.patch('/:id/files', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const file = await renameProjectFile(req.user!.userId, String(req.params.id), req.body?.path, req.body?.name);
    if (!file) {
      res.status(404).json({ message: '项目不存在' });
      return;
    }
    res.json({ file });
  } catch (error) {
    console.error('Rename project file error:', error);
    res.status(400).json({
      message: error instanceof Error ? error.message : '重命名文件失败',
    });
  }
});

router.delete('/:id/files', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const success = await deleteProjectFile(req.user!.userId, String(req.params.id), req.body?.path ?? req.query.path);
    if (success === null) {
      res.status(404).json({ message: '项目不存在' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete project file error:', error);
    res.status(400).json({
      message: error instanceof Error ? error.message : '删除文件失败',
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
