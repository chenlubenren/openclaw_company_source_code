import { Router, Request, Response } from 'express';
import { createUser, validateUser, getUserById } from '../services/auth.service.js';
import { generateToken } from '../utils/jwt.js';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, username, password } = req.body;

    // Validation
    if (!email || !username || !password) {
      res.status(400).json({ message: '请提供邮箱、用户名和密码' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ message: '密码长度至少为6个字符' });
      return;
    }

    if (username.length < 3) {
      res.status(400).json({ message: '用户名长度至少为3个字符' });
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ message: '请提供有效的邮箱地址' });
      return;
    }

    const user = await createUser({ email, username, password });

    // Generate token
    const token = generateToken({ userId: user.id, email: user.email });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      accessToken: token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '注册失败';
    res.status(400).json({ message });
  }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ message: '请提供邮箱和密码' });
      return;
    }

    const user = await validateUser({ email, password });

    if (!user) {
      res.status(401).json({ message: '邮箱或密码错误' });
      return;
    }

    // Generate token
    const token = generateToken({ userId: user.id, email: user.email });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      accessToken: token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: '登录失败' });
  }
});

// GET /auth/me
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ message: '未授权' });
      return;
    }

    const user = await getUserById(userId);

    if (!user) {
      res.status(404).json({ message: '用户不存在' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: '获取用户信息失败' });
  }
});

export default router;
