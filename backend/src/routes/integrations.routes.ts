import { Router, Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  acceptFeishuWebhook,
  deleteFeishuConfig,
  FeishuIntegrationError,
  getFeishuConfig,
  getFeishuWebhookInfo,
  saveFeishuConfig,
  type FeishuConfigInput,
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

// ==================== Per-Agent/Team Feishu Config ====================
// These MUST be defined BEFORE the generic /feishu/:scope/:subjectId/:token
// routes to avoid Express treating "config" as a scope parameter.

router.get(
  '/feishu/config/:scope/:subjectId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const scope = normalizeScope(paramToString(req.params.scope));
      if (!scope) {
        res.status(400).json({ message: 'scope 必须是 agent 或 team' });
        return;
      }

      const config = await getFeishuConfig(
        req.user!.userId,
        scope,
        paramToString(req.params.subjectId)
      );

      if (!config) {
        res.status(404).json({ message: '未找到飞书配置' });
        return;
      }

      // Do NOT return appSecret in full; mask it
      res.json({
        config: {
          id: config.id,
          scope: config.scope,
          subjectId: config.subjectId,
          appId: config.appId,
          appSecretMasked: config.appSecret ? `${config.appSecret.slice(0, 4)}****` : '',
          chatId: config.chatId,
          enabled: config.enabled,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
        },
      });
    } catch (error) {
      console.error('Get Feishu config error:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : '获取飞书配置失败',
      });
    }
  }
);

router.post(
  '/feishu/config/:scope/:subjectId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const scope = normalizeScope(paramToString(req.params.scope));
      if (!scope) {
        res.status(400).json({ message: 'scope 必须是 agent 或 team' });
        return;
      }

      const body = req.body as FeishuConfigInput;
      if (!body?.appId?.trim() || !body?.appSecret?.trim()) {
        res.status(400).json({ message: 'appId 与 appSecret 为必填项' });
        return;
      }

      const id = await saveFeishuConfig(
        req.user!.userId,
        scope,
        paramToString(req.params.subjectId),
        {
          appId: body.appId.trim(),
          appSecret: body.appSecret.trim(),
          chatId: body.chatId?.trim(),
          verificationToken: body.verificationToken?.trim(),
          webhookSecret: body.webhookSecret?.trim(),
        }
      );

      res.json({ ok: true, id });
    } catch (error) {
      console.error('Save Feishu config error:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : '保存飞书配置失败',
      });
    }
  }
);

router.delete(
  '/feishu/config/:scope/:subjectId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const scope = normalizeScope(paramToString(req.params.scope));
      if (!scope) {
        res.status(400).json({ message: 'scope 必须是 agent 或 team' });
        return;
      }

      await deleteFeishuConfig(req.user!.userId, scope, paramToString(req.params.subjectId));
      res.json({ ok: true });
    } catch (error) {
      console.error('Delete Feishu config error:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : '删除飞书配置失败',
      });
    }
  }
);

// Generic webhook callback routes (must come after /feishu/config)
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
