import { Router, Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  acceptFeishuWebhook,
  FeishuIntegrationError,
  getFeishuWebhookInfo,
  type FeishuIntegrationScope,
} from '../services/feishu-integration.service.js';

const router = Router();

router.get(
  '/feishu/webhook/:scope/:subjectId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const scope = normalizeScope(paramToString(req.params.scope));
      if (!scope) {
        res.status(400).json({ message: 'scope 必须是 agent 或 team' });
        return;
      }

      const info = await getFeishuWebhookInfo(req.user!.userId, scope, paramToString(req.params.subjectId));
      if (!info) {
        res.status(404).json({ message: '未找到可接入的 Agent 或团队' });
        return;
      }

      res.json({ integration: info });
    } catch (error) {
      console.error('Get Feishu webhook info error:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : '获取飞书接入信息失败',
      });
    }
  }
);

router.get('/feishu/:scope/:subjectId/:token', (req, res) => {
  const scope = normalizeScope(paramToString(req.params.scope));
  if (!scope) {
    res.status(400).json({ message: 'scope 必须是 agent 或 team' });
    return;
  }

  res.json({
    ok: true,
    message: 'Feishu event callback endpoint is reachable. Configure this URL in Feishu event subscriptions.',
    scope,
    subjectId: paramToString(req.params.subjectId),
  });
});

router.post('/feishu/:scope/:subjectId/:token', async (req, res) => {
  try {
    const scope = normalizeScope(paramToString(req.params.scope));
    if (!scope) {
      res.status(400).json({ message: 'scope 必须是 agent 或 team' });
      return;
    }

    const result = await acceptFeishuWebhook(
      scope,
      paramToString(req.params.subjectId),
      paramToString(req.params.token),
      req.body
    );

    if (result.challenge) {
      res.json({ challenge: result.challenge });
      return;
    }

    res.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof FeishuIntegrationError) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    console.error('Feishu webhook error:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : '飞书回调处理失败',
    });
  }
});

function normalizeScope(value: string | undefined): FeishuIntegrationScope | null {
  return value === 'agent' || value === 'team' ? value : null;
}

function paramToString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export default router;
