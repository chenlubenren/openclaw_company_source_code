import { eq, and, desc, sql, like, inArray, isNull } from 'drizzle-orm';
import { getDb, getRawDb } from '../db/index.js';
import {
  socialPosts,
  socialComments,
  socialLikes,
  socialFollows,
  userAgentInstances,
  users,
} from '../db/schema.js';
import crypto from 'crypto';

// ==================== Types ====================

export interface SocialPostWithAuthor {
  id: string;
  authorType: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  mediaUrls: string[];
  postType: string;
  parentPostId: string | null;
  tags: string[];
  visibility: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  isPinned: boolean;
  isLiked?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialCommentWithAuthor {
  id: string;
  postId: string;
  authorType: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  parentCommentId: string | null;
  likeCount: number;
  isLiked?: boolean;
  replies?: SocialCommentWithAuthor[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePostDto {
  authorType?: 'agent' | 'user';
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  mediaUrls?: string[];
  postType?: 'post' | 'reply' | 'repost' | 'question' | 'poll';
  parentPostId?: string;
  tags?: string[];
  visibility?: 'public' | 'followers' | 'private';
}

export interface FeedOptions {
  type?: 'home' | 'latest' | 'following' | 'agent' | 'trending';
  authorId?: string;
  agentId?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  userId?: string; // Current user for checking likes
}

// ==================== Post Operations ====================

export async function createPost(dto: CreatePostDto): Promise<SocialPostWithAuthor> {
  const db = getDb();
  const rawDb = getRawDb();
  const now = new Date();
  const id = crypto.randomUUID().replace(/-/g, '');

  rawDb.prepare(`
    INSERT INTO social_posts (
      id, author_type, author_id, author_name, author_avatar,
      content, media_urls, post_type, parent_post_id, tags,
      visibility, like_count, comment_count, repost_count,
      is_pinned, is_deleted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    dto.authorType || 'agent',
    dto.authorId,
    dto.authorName,
    dto.authorAvatar || '',
    dto.content,
    JSON.stringify(dto.mediaUrls || []),
    dto.postType || 'post',
    dto.parentPostId || null,
    JSON.stringify(dto.tags || []),
    dto.visibility || 'public',
    0, // like_count
    0, // comment_count
    0, // repost_count
    0, // is_pinned
    0, // is_deleted
    now.getTime(),
    now.getTime()
  );

  // If it's a reply, update parent's comment count
  if (dto.parentPostId) {
    rawDb.prepare(`
      UPDATE social_posts SET comment_count = comment_count + 1 WHERE id = ?
    `).run(dto.parentPostId);
  }

  return {
    id,
    authorType: dto.authorType || 'agent',
    authorId: dto.authorId,
    authorName: dto.authorName,
    authorAvatar: dto.authorAvatar || '',
    content: dto.content,
    mediaUrls: dto.mediaUrls || [],
    postType: dto.postType || 'post',
    parentPostId: dto.parentPostId || null,
    tags: dto.tags || [],
    visibility: dto.visibility || 'public',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    isPinned: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getFeed(options: FeedOptions = {}): Promise<SocialPostWithAuthor[]> {
  const db = getDb();
  const {
    type = 'latest',
    authorId,
    agentId,
    tags,
    limit = 20,
    offset = 0,
    userId,
  } = options;

  let query = db
    .select()
    .from(socialPosts)
    .where(and(
      eq(socialPosts.isDeleted, false),
      eq(socialPosts.visibility, 'public')
    ))
    .orderBy(desc(socialPosts.isPinned), desc(socialPosts.createdAt))
    .limit(limit)
    .offset(offset);

  // Apply filters based on type
  switch (type) {
    case 'home':
      // Home feed: mix of trending and following
      query = db
        .select()
        .from(socialPosts)
        .where(and(
          eq(socialPosts.isDeleted, false),
          eq(socialPosts.visibility, 'public')
        ))
        .orderBy(
          sql`(${socialPosts.likeCount} * 2 + ${socialPosts.commentCount} * 3 + ${socialPosts.repostCount} * 5) DESC`,
          desc(socialPosts.createdAt)
        )
        .limit(limit)
        .offset(offset) as any;
      break;

    case 'following':
      if (userId) {
        // Get posts from followed agents
        const followed = await db
          .select({ followingId: socialFollows.followingId })
          .from(socialFollows)
          .where(and(
            eq(socialFollows.followerType, 'agent'),
            eq(socialFollows.followerId, userId)
          ))
          .all();

        const followedIds = followed.map(f => f.followingId);
        if (followedIds.length > 0) {
          query = db
            .select()
            .from(socialPosts)
            .where(and(
              eq(socialPosts.isDeleted, false),
              eq(socialPosts.visibility, 'public'),
              inArray(socialPosts.authorId, followedIds)
            ))
            .orderBy(desc(socialPosts.createdAt))
            .limit(limit)
            .offset(offset) as any;
        }
      }
      break;

    case 'agent':
      if (agentId) {
        query = db
          .select()
          .from(socialPosts)
          .where(and(
            eq(socialPosts.isDeleted, false),
            eq(socialPosts.authorId, agentId)
          ))
          .orderBy(desc(socialPosts.createdAt))
          .limit(limit)
          .offset(offset) as any;
      }
      break;

    case 'trending':
      query = db
        .select()
        .from(socialPosts)
        .where(and(
          eq(socialPosts.isDeleted, false),
          eq(socialPosts.visibility, 'public')
        ))
        .orderBy(
          sql`(${socialPosts.likeCount} * 3 + ${socialPosts.commentCount} * 5 + ${socialPosts.repostCount} * 10) DESC`,
          desc(socialPosts.createdAt)
        )
        .limit(limit)
        .offset(offset) as any;
      break;

    case 'latest':
    default:
      // Already configured above
      break;
  }

  const posts = await query;

  // Get user's likes if userId provided
  let likedPostIds: Set<string> = new Set();
  if (userId) {
    const likes = await db
      .select({ targetId: socialLikes.targetId })
      .from(socialLikes)
      .where(and(
        eq(socialLikes.targetType, 'post'),
        eq(socialLikes.userType, 'user'),
        eq(socialLikes.userId, userId),
        inArray(socialLikes.targetId, posts.map(p => p.id))
      ))
      .all();
    likedPostIds = new Set(likes.map(l => l.targetId));
  }

  return posts.map(post => ({
    ...post,
    mediaUrls: typeof post.mediaUrls === 'string' ? JSON.parse(post.mediaUrls) : post.mediaUrls || [],
    tags: typeof post.tags === 'string' ? JSON.parse(post.tags) : post.tags || [],
    isLiked: likedPostIds.has(post.id),
  }));
}

export async function getPostById(postId: string, userId?: string): Promise<SocialPostWithAuthor | null> {
  const db = getDb();
  const post = await db
    .select()
    .from(socialPosts)
    .where(eq(socialPosts.id, postId))
    .get();

  if (!post || post.isDeleted) return null;

  let isLiked = false;
  if (userId) {
    const like = await db
      .select()
      .from(socialLikes)
      .where(and(
        eq(socialLikes.targetType, 'post'),
        eq(socialLikes.targetId, postId),
        eq(socialLikes.userType, 'user'),
        eq(socialLikes.userId, userId)
      ))
      .get();
    isLiked = !!like;
  }

  return {
    ...post,
    mediaUrls: typeof post.mediaUrls === 'string' ? JSON.parse(post.mediaUrls) : post.mediaUrls || [],
    tags: typeof post.tags === 'string' ? JSON.parse(post.tags) : post.tags || [],
    isLiked,
  };
}

export async function deletePost(postId: string, authorId: string): Promise<boolean> {
  const db = getRawDb();
  const result = db.prepare(`
    UPDATE social_posts SET is_deleted = 1, updated_at = ? 
    WHERE id = ? AND author_id = ?
  `).run(Date.now(), postId, authorId);
  return result.changes > 0;
}

// ==================== Comment Operations ====================

export async function getComments(
  postId: string,
  userId?: string
): Promise<SocialCommentWithAuthor[]> {
  const db = getDb();

  const comments = await db
    .select()
    .from(socialComments)
    .where(and(
      eq(socialComments.postId, postId),
      eq(socialComments.isDeleted, false),
      isNull(socialComments.parentCommentId)
    ))
    .orderBy(socialComments.createdAt)
    .all();

  // Get replies for each comment
  const result: SocialCommentWithAuthor[] = [];
  for (const comment of comments) {
    const replies = await db
      .select()
      .from(socialComments)
      .where(and(
        eq(socialComments.parentCommentId, comment.id),
        eq(socialComments.isDeleted, false)
      ))
      .orderBy(socialComments.createdAt)
      .all();

    result.push({
      ...comment,
      replies: replies.map(r => ({
        ...r,
        replies: [],
      })),
    });
  }

  return result;
}

export async function createComment(
  postId: string,
  dto: {
    authorType?: 'agent' | 'user';
    authorId: string;
    authorName: string;
    authorAvatar?: string;
    content: string;
    parentCommentId?: string;
  }
): Promise<SocialCommentWithAuthor> {
  const db = getRawDb();
  const now = new Date();
  const id = crypto.randomUUID().replace(/-/g, '');

  db.prepare(`
    INSERT INTO social_comments (
      id, post_id, author_type, author_id, author_name, author_avatar,
      content, parent_comment_id, like_count, is_deleted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    postId,
    dto.authorType || 'agent',
    dto.authorId,
    dto.authorName,
    dto.authorAvatar || '',
    dto.content,
    dto.parentCommentId || null,
    0,
    0,
    now.getTime(),
    now.getTime()
  );

  // Update post's comment count
  db.prepare(`
    UPDATE social_posts SET comment_count = comment_count + 1 WHERE id = ?
  `).run(postId);

  return {
    id,
    postId,
    authorType: dto.authorType || 'agent',
    authorId: dto.authorId,
    authorName: dto.authorName,
    authorAvatar: dto.authorAvatar || '',
    content: dto.content,
    parentCommentId: dto.parentCommentId || null,
    likeCount: 0,
    replies: [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function deleteComment(commentId: string, authorId: string): Promise<boolean> {
  const db = getRawDb();
  const result = db.prepare(`
    UPDATE social_comments SET is_deleted = 1, updated_at = ? 
    WHERE id = ? AND author_id = ?
  `).run(Date.now(), commentId, authorId);

  if (result.changes > 0) {
    // Update post's comment count
    db.prepare(`
      UPDATE social_posts SET comment_count = comment_count - 1 
      WHERE id = (SELECT post_id FROM social_comments WHERE id = ?)
    `).run(commentId);
  }

  return result.changes > 0;
}

// ==================== Like Operations ====================

export async function toggleLike(
  targetType: 'post' | 'comment',
  targetId: string,
  userType: 'agent' | 'user',
  userId: string
): Promise<{ liked: boolean; likeCount: number }> {
  const db = getRawDb();

  // Check if already liked
  const existing = db.prepare(`
    SELECT id FROM social_likes 
    WHERE target_type = ? AND target_id = ? AND user_type = ? AND user_id = ?
  `).get(targetType, targetId, userType, userId);

  if (existing) {
    // Unlike
    db.prepare(`
      DELETE FROM social_likes WHERE target_type = ? AND target_id = ? AND user_type = ? AND user_id = ?
    `).run(targetType, targetId, userType, userId);

    // Decrement count
    const table = targetType === 'post' ? 'social_posts' : 'social_comments';
    db.prepare(`UPDATE ${table} SET like_count = like_count - 1 WHERE id = ?`).run(targetId);
    const updated = db.prepare(`SELECT like_count FROM ${table} WHERE id = ?`).get(targetId) as { like_count: number };

    return { liked: false, likeCount: updated?.like_count || 0 };
  } else {
    // Like
    const id = crypto.randomUUID().replace(/-/g, '');
    db.prepare(`
      INSERT INTO social_likes (id, target_type, target_id, user_type, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, targetType, targetId, userType, userId, Date.now());

    // Increment count
    const table = targetType === 'post' ? 'social_posts' : 'social_comments';
    db.prepare(`UPDATE ${table} SET like_count = like_count + 1 WHERE id = ?`).run(targetId);
    const updated = db.prepare(`SELECT like_count FROM ${table} WHERE id = ?`).get(targetId) as { like_count: number };

    return { liked: true, likeCount: updated?.like_count || 0 };
  }
}

// ==================== Follow Operations ====================

export async function toggleFollow(
  followerType: 'agent' | 'user',
  followerId: string,
  followingType: 'agent' | 'user',
  followingId: string
): Promise<{ following: boolean; followerCount: number; followingCount: number }> {
  const db = getRawDb();

  // Check if already following
  const existing = db.prepare(`
    SELECT id FROM social_follows 
    WHERE follower_type = ? AND follower_id = ? AND following_type = ? AND following_id = ?
  `).get(followerType, followerId, followingType, followingId);

  if (existing) {
    // Unfollow
    db.prepare(`
      DELETE FROM social_follows 
      WHERE follower_type = ? AND follower_id = ? AND following_type = ? AND following_id = ?
    `).run(followerType, followerId, followingType, followingId);
    return { following: false, followerCount: 0, followingCount: 0 };
  } else {
    // Follow
    const id = crypto.randomUUID().replace(/-/g, '');
    db.prepare(`
      INSERT INTO social_follows (id, follower_type, follower_id, following_type, following_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, followerType, followerId, followingType, followingId, Date.now());
    return { following: true, followerCount: 0, followingCount: 0 };
  }
}

export async function getFollowers(
  userType: 'agent' | 'user',
  userId: string,
  limit = 50,
  offset = 0
): Promise<{ followerId: string; followerType: string; followerName?: string; createdAt: Date }[]> {
  const db = getDb();
  const followers = await db
    .select()
    .from(socialFollows)
    .where(and(
      eq(socialFollows.followingType, userType),
      eq(socialFollows.followingId, userId)
    ))
    .orderBy(desc(socialFollows.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  return followers.map(f => ({
    followerId: f.followerId,
    followerType: f.followerType,
    createdAt: f.createdAt,
  }));
}

export async function getFollowing(
  userType: 'agent' | 'user',
  userId: string,
  limit = 50,
  offset = 0
): Promise<{ followingId: string; followingType: string; createdAt: Date }[]> {
  const db = getDb();
  const following = await db
    .select()
    .from(socialFollows)
    .where(and(
      eq(socialFollows.followerType, userType),
      eq(socialFollows.followerId, userId)
    ))
    .orderBy(desc(socialFollows.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  return following.map(f => ({
    followingId: f.followingId,
    followingType: f.followingType,
    createdAt: f.createdAt,
  }));
}
