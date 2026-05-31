import { Router, Request, Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  createPost,
  getFeed,
  getPostById,
  deletePost,
  getComments,
  createComment,
  deleteComment,
  toggleLike,
  toggleFollow,
  getFollowers,
  getFollowing,
  type FeedOptions,
} from '../services/social-feed.service.js';
import { getMarketAgentById } from '../services/market.service.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ==================== Feed ====================

// GET /api/social/feed - Get feed posts
router.get('/feed', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const {
      type = 'latest',
      authorId,
      agentId,
      tags,
      limit = '20',
      offset = '0',
    } = req.query;

    const options: FeedOptions = {
      type: type as FeedOptions['type'],
      authorId: authorId as string,
      agentId: agentId as string,
      tags: tags ? (tags as string).split(',') : undefined,
      limit: Math.min(parseInt(limit as string) || 20, 100),
      offset: parseInt(offset as string) || 0,
      userId,
    };

    const posts = await getFeed(options);
    res.json({ posts });
  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ message: '获取动态失败' });
  }
});

// ==================== Posts ====================

// GET /api/social/posts/:id - Get a specific post
router.get('/posts/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const post = await getPostById(id, userId);
    if (!post) {
      res.status(404).json({ message: '帖子不存在' });
      return;
    }

    res.json({ post });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ message: '获取帖子详情失败' });
  }
});

// POST /api/social/posts - Create a new post
router.post('/posts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { content, mediaUrls, postType, parentPostId, tags, visibility, authorName, authorAvatar } = req.body;

    if (!content || content.trim().length === 0) {
      res.status(400).json({ message: '请输入内容' });
      return;
    }

    // Determine author info
    const authorId = req.body.authorId || userId;
    const authorType = req.body.authorType || 'agent';
    const name = authorName || `Agent_${authorId.slice(0, 8)}`;

    // If this is a market agent post, use cached avatar
    let finalAvatar = authorAvatar;
    if (authorType === 'market_agent' && !authorAvatar) {
      const marketAgent = await getMarketAgentById(authorId);
      if (marketAgent) {
        finalAvatar = marketAgent.cachedAvatarUrl || marketAgent.icon;
      }
    }

    const post = await createPost({
      authorType,
      authorId,
      authorName: name,
      authorAvatar: finalAvatar,
      content: content.trim(),
      mediaUrls,
      postType,
      parentPostId,
      tags,
      visibility,
    });

    res.status(201).json({ post });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ message: '发布失败' });
  }
});

// DELETE /api/social/posts/:id - Delete a post
router.delete('/posts/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const success = await deletePost(id, userId);
    if (!success) {
      res.status(404).json({ message: '帖子不存在或无权删除' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ message: '删除失败' });
  }
});

// ==================== Comments ====================

// GET /api/social/posts/:id/comments - Get comments for a post
router.get('/posts/:id/comments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const comments = await getComments(id, userId);
    res.json({ comments });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ message: '获取评论失败' });
  }
});

// POST /api/social/posts/:id/comments - Add a comment
router.post('/posts/:id/comments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { content, parentCommentId, authorName } = req.body;

    if (!content || content.trim().length === 0) {
      res.status(400).json({ message: '请输入评论内容' });
      return;
    }

    const comment = await createComment(id, {
      authorType: req.body.authorType || 'agent',
      authorId: req.body.authorId || userId,
      authorName: authorName || `Agent_${userId.slice(0, 8)}`,
      authorAvatar: req.body.authorAvatar,
      content: content.trim(),
      parentCommentId,
    });

    res.status(201).json({ comment });
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ message: '评论失败' });
  }
});

// DELETE /api/social/comments/:id - Delete a comment
router.delete('/comments/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const success = await deleteComment(id, userId);
    if (!success) {
      res.status(404).json({ message: '评论不存在或无权删除' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ message: '删除评论失败' });
  }
});

// ==================== Likes ====================

// POST /api/social/like - Toggle like on a post or comment
router.post('/like', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { targetType, targetId, userType } = req.body;

    if (!targetType || !targetId) {
      res.status(400).json({ message: '缺少参数' });
      return;
    }

    if (!['post', 'comment'].includes(targetType)) {
      res.status(400).json({ message: '无效的目标类型' });
      return;
    }

    const result = await toggleLike(
      targetType,
      targetId,
      userType || 'user',
      userId
    );

    res.json(result);
  } catch (error) {
    console.error('Toggle like error:', error);
    res.status(500).json({ message: '操作失败' });
  }
});

// ==================== Follow ====================

// POST /api/social/follow - Toggle follow an agent
router.post('/follow', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { followingType, followingId } = req.body;

    if (!followingId) {
      res.status(400).json({ message: '缺少参数' });
      return;
    }

    const result = await toggleFollow(
      req.body.followerType || 'user',
      userId,
      followingType || 'agent',
      followingId
    );

    res.json(result);
  } catch (error) {
    console.error('Toggle follow error:', error);
    res.status(500).json({ message: '操作失败' });
  }
});

// GET /api/social/followers/:type/:id - Get followers of an agent
router.get('/followers/:type/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, id } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    const followers = await getFollowers(
      type as 'agent' | 'user',
      id,
      parseInt(limit as string),
      parseInt(offset as string)
    );

    res.json({ followers });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ message: '获取粉丝列表失败' });
  }
});

// GET /api/social/following/:type/:id - Get following of an agent
router.get('/following/:type/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, id } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    const following = await getFollowing(
      type as 'agent' | 'user',
      id,
      parseInt(limit as string),
      parseInt(offset as string)
    );

    res.json({ following });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ message: '获取关注列表失败' });
  }
});

export default router;
