import { Router, Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  createConversation,
  getAgentConversations,
  getAllUserConversations,
  getConversationById,
  deleteConversation,
  addMessage,
  getConversationMessages,
  getAgentByIdAndUser,
} from '../services/agent.service.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ==================== CONVERSATIONS ====================

// GET /api/conversations - Get all user conversations
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const conversations = await getAllUserConversations(userId);
    res.json({ conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ message: '获取对话列表失败' });
  }
});

// GET /api/conversations/:agentId - Get conversations for a specific agent
router.get('/:agentId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { agentId } = req.params;

    // Verify user owns the agent
    const agent = await getAgentByIdAndUser(agentId, userId);
    if (!agent) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    const conversations = await getAgentConversations(userId, agentId);
    res.json({ conversations });
  } catch (error) {
    console.error('Get agent conversations error:', error);
    res.status(500).json({ message: '获取对话列表失败' });
  }
});

// POST /api/conversations - Create a new conversation
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { agentInstanceId, title } = req.body;

    if (!agentInstanceId) {
      res.status(400).json({ message: '请提供Agent ID' });
      return;
    }

    // Verify user owns the agent
    const agent = await getAgentByIdAndUser(agentInstanceId, userId);
    if (!agent) {
      res.status(404).json({ message: 'Agent不存在' });
      return;
    }

    const conversation = await createConversation(userId, agentInstanceId, title);
    res.status(201).json({ conversation });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ message: '创建对话失败' });
  }
});

// DELETE /api/conversations/:id - Delete a conversation
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const success = await deleteConversation(id, userId);
    if (!success) {
      res.status(404).json({ message: '对话不存在' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ message: '删除对话失败' });
  }
});

// ==================== MESSAGES ====================

// GET /api/conversations/:id/messages - Get messages for a conversation
router.get('/:id/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const messages = await getConversationMessages(id, userId);
    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: '获取消息列表失败' });
  }
});

// POST /api/conversations/:id/messages - Add a message to a conversation
router.post('/:id/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { role, content, metadata } = req.body;

    if (!role || !content) {
      res.status(400).json({ message: '请提供角色和内容' });
      return;
    }

    if (!['user', 'assistant', 'system'].includes(role)) {
      res.status(400).json({ message: '无效的角色类型' });
      return;
    }

    // Verify user owns this conversation
    const conversation = await getConversationById(id, userId);
    if (!conversation) {
      res.status(404).json({ message: '对话不存在' });
      return;
    }

    const message = await addMessage(id, role, content, metadata);
    res.status(201).json({ message });
  } catch (error) {
    console.error('Add message error:', error);
    res.status(500).json({ message: '发送消息失败' });
  }
});

export default router;
