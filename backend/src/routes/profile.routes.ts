import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const PROFILE_CACHE_ROOT = path.join(process.cwd(), 'data', 'claw_profile');

const router = Router();

// GET /api/profile/:filename - Serve cached profile images
router.get('/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    
    // Security: only allow alphanumeric, dash, underscore, and .png/.jpg extensions
    if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg)$/.test(filename)) {
      res.status(400).json({ message: '无效的文件名' });
      return;
    }

    const filePath = path.join(PROFILE_CACHE_ROOT, filename);
    
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: '图片不存在' });
      return;
    }

    // Determine content type
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.jpg' || ext === '.jpeg' 
      ? 'image/jpeg' 
      : 'image/png';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Serve profile image error:', error);
    res.status(500).json({ message: '获取图片失败' });
  }
});

// GET /api/profile/default/:type - Serve default avatars
router.get('/default/:type', (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    
    // Generate a simple SVG placeholder
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
    const color = colors[Math.abs(type.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % colors.length];
    
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="200" fill="${color}"/>
        <circle cx="100" cy="70" r="40" fill="white" opacity="0.9"/>
        <text x="100" y="150" font-family="Arial" font-size="24" fill="white" text-anchor="middle">
          ${type.slice(0, 2).toUpperCase()}
        </text>
      </svg>
    `;
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(svg);
  } catch (error) {
    console.error('Serve default avatar error:', error);
    res.status(500).json({ message: '获取默认头像失败' });
  }
});

export default router;
