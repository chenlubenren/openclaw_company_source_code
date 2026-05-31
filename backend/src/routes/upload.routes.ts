import { Router, Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  processFolderUpload,
  processZipUpload,
  type FolderFileInput,
  publishToMarket,
} from '../services/upload.service.js';

const router = Router();

router.use(authMiddleware);

interface UploadBody {
  name?: string;
  publishToMarket?: boolean;
  uploadType?: 'folder' | 'zip';
  agentType?: string;
  file?: string;
  fileName?: string;
  files?: FolderFileInput[];
}

// POST /api/upload
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const body = req.body as UploadBody;

    const { name, publishToMarket: shouldPublish = false, uploadType = 'zip', file, files, agentType } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ message: '请提供 Agent 名称' });
      return;
    }

    const agentName = name.trim();

    // 文件夹上传
    if (uploadType === 'folder') {
      if (!files || !Array.isArray(files) || files.length === 0) {
        res.status(400).json({ message: '请选择要上传的文件夹' });
        return;
      }

      const result = await processFolderUpload(userId, files, agentName, agentType, shouldPublish);

      if (!result.success) {
        res.status(400).json({ message: result.error || '上传失败' });
        return;
      }

      // Publish to market if requested
      if (shouldPublish && result.agentId) {
        try {
          await publishToMarket(userId, result.agentId, agentName, result.manifest);
        } catch (marketError) {
          console.error('Failed to publish to market:', marketError);
          // Don't fail the upload if market publish fails
        }
      }

      res.json({
        success: true,
        uploadType: 'folder',
        agentId: result.agentId,
        agentKey: result.agentKey,
        workspacePath: result.workspacePath,
        fileCount: result.fileCount,
        agentType: result.agentType,
        publishedToMarket: shouldPublish,
      });
      return;
    }

    // zip 上传
    if (!file) {
      res.status(400).json({ message: '请提供 zip 文件或选择文件夹上传' });
      return;
    }

    const buffer = Buffer.from(file, 'base64');
    const result = await processZipUpload(userId, buffer, agentName, agentType, shouldPublish);

    if (!result.success) {
      res.status(400).json({ message: result.error || '上传失败' });
      return;
    }

    // Publish to market if requested
    if (shouldPublish && result.agentId) {
      try {
        await publishToMarket(userId, result.agentId, agentName, result.manifest);
      } catch (marketError) {
        console.error('Failed to publish to market:', marketError);
      }
    }

    res.json({
      success: true,
      uploadType: 'zip',
      agentId: result.agentId,
      agentKey: result.agentKey,
      workspacePath: result.workspacePath,
      fileCount: result.fileCount,
      agentType: result.agentType,
      publishedToMarket: shouldPublish,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: '上传处理失败' });
  }
});

router.get('/template', (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    template: {
      schemaVersion: '1.0',
      name: 'my-agent',
      version: '1.0.0',
      description: '可选：上传文件夹时不需要此文件',
    },
    note: 'manifest.json 为可选项；直接上传文件夹即可，文件会保存到你的 workspace 目录',
  });
});

export default router;
