import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  const candidates = [cwd, path.resolve(cwd, '..')];

  for (const candidate of candidates) {
    const hasBackend = fs.existsSync(path.join(candidate, 'backend'));
    const hasFrontend = fs.existsSync(path.join(candidate, 'next-lobster-platform'));
    if (hasBackend && hasFrontend) {
      return candidate;
    }
  }

  return cwd;
}

const REPO_ROOT = resolveRepoRoot();
const PROFILE_CACHE_ROOT = path.join(REPO_ROOT, 'backend', 'data', 'claw_profile');
const PROFILE_SOURCE_ROOTS = [
  path.join(REPO_ROOT, 'claw_profile'),
  path.join(REPO_ROOT, 'next-lobster-platform', 'public', 'claw_profile'),
];

const router = Router();

function isProfileImage(filename: string): boolean {
  return /^[A-Za-z0-9._-]+\.(png|jpg|jpeg)$/i.test(filename);
}

function ensureProfileCache(): void {
  fs.mkdirSync(PROFILE_CACHE_ROOT, { recursive: true });

  for (const sourceRoot of PROFILE_SOURCE_ROOTS) {
    if (!fs.existsSync(sourceRoot)) continue;

    const files = fs.readdirSync(sourceRoot).filter(isProfileImage);
    for (const filename of files) {
      const sourcePath = path.join(sourceRoot, filename);
      const targetPath = path.join(PROFILE_CACHE_ROOT, filename);
      if (!fs.existsSync(targetPath)) {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }
}

function listProfileFiles(): string[] {
  ensureProfileCache();
  return fs
    .readdirSync(PROFILE_CACHE_ROOT)
    .filter(isProfileImage)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function buildProfileUrl(_req: Request, filename: string): string {
  return `/api/profile/${filename}`;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

// GET /api/profile - List available profile images
router.get('/', (req: Request, res: Response) => {
  try {
    const files = listProfileFiles();
    res.json({
      files: files.map((filename) => ({
        filename,
        label: path.parse(filename).name,
        url: buildProfileUrl(req, filename),
      })),
    });
  } catch (error) {
    console.error('List profile images error:', error);
    res.status(500).json({ message: '获取头像素材列表失败' });
  }
});

// GET /api/profile/:filename - Serve cached profile images
router.get('/:filename', (req: Request, res: Response) => {
  try {
    ensureProfileCache();

    const filename = firstParam(req.params.filename);
    if (!isProfileImage(filename)) {
      res.status(400).json({ message: '无效的文件名' });
      return;
    }

    const filePath = path.join(PROFILE_CACHE_ROOT, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: '图片不存在' });
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Serve profile image error:', error);
    res.status(500).json({ message: '获取图片失败' });
  }
});

// GET /api/profile/default/:type - Serve default avatars
router.get('/default/:type', (req: Request, res: Response) => {
  try {
    const type = firstParam(req.params.type);

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
