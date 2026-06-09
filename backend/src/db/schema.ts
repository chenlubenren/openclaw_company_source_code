import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ==================== USERS ====================
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ==================== MARKET AGENTS ====================
export const marketAgents = sqliteTable('market_agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  ownerUserId: text('owner_user_id').notNull().references(() => users.id),
  latestVersion: text('latest_version').notNull().default('1.0.0'),
  visibility: text('visibility').notNull().default('private'), // public, private, unlisted
  status: text('status').notNull().default('pending'), // pending, active, disabled
  tags: text('tags').notNull().default('[]'), // JSON array
  icon: text('icon').notNull().default(''),
  coverImage: text('cover_image').notNull().default(''),
  downloadCount: integer('download_count').notNull().default(0),
  rating: integer('rating').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type MarketAgent = typeof marketAgents.$inferSelect;
export type NewMarketAgent = typeof marketAgents.$inferInsert;

// ==================== MARKET AGENT VERSIONS ====================
export const marketAgentVersions = sqliteTable('market_agent_versions', {
  id: text('id').primaryKey(),
  marketAgentId: text('market_agent_id').notNull().references(() => marketAgents.id),
  version: text('version').notNull(),
  manifestPath: text('manifest_path').notNull(),
  sourceWorkspacePath: text('source_workspace_path').notNull(),
  checksum: text('checksum').notNull(),
  changelog: text('changelog').notNull().default(''),
  fileSize: integer('file_size').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type MarketAgentVersion = typeof marketAgentVersions.$inferSelect;
export type NewMarketAgentVersion = typeof marketAgentVersions.$inferInsert;

// ==================== USER AGENT INSTANCES (用户私有的Agent) ====================
export const userAgentInstances = sqliteTable('user_agent_instances', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  sourceMarketAgentId: text('source_market_agent_id').references(() => marketAgents.id), // null if uploaded directly
  sourceVersion: text('source_version').notNull().default('1.0.0'),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  avatar: text('avatar').notNull().default(''),
  agentKey: text('agent_key').notNull(), // Unique key for this instance
  workspacePath: text('workspace_path').notNull(),
  baselineSnapshotPath: text('baseline_snapshot_path'), // snapshot path after cloning
  stateDir: text('state_dir'), // Optional per-agent OpenClaw isolated state dir
  status: text('status').notNull().default('idle'), // idle, busy, error, offline
  manifest: text('manifest').notNull().default('{}'), // JSON manifest content
  tags: text('tags').notNull().default('[]'), // JSON array
  caveId: text('cave_id'), // Optional cave assignment
  providerId: text('provider_id'), // Selected provider for this agent
  conversationCount: integer('conversation_count').notNull().default(0),
  totalMessages: integer('total_messages').notNull().default(0),
  lastActiveAt: integer('last_active_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type UserAgentInstance = typeof userAgentInstances.$inferSelect;
export type NewUserAgentInstance = typeof userAgentInstances.$inferInsert;

// ==================== CAVES (Agent窝) ====================
export const caves = sqliteTable('caves', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  color: text('color').notNull().default('#3b82f6'),
  description: text('description').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type Cave = typeof caves.$inferSelect;
export type NewCave = typeof caves.$inferInsert;

// ==================== CONVERSATIONS ====================
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  agentInstanceId: text('agent_instance_id').notNull().references(() => userAgentInstances.id),
  sessionId: text('session_id'),
  title: text('title').notNull().default('新对话'),
  lastMessage: text('last_message').notNull().default(''),
  messageCount: integer('message_count').notNull().default(0),
  isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
  isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

// ==================== MESSAGES ====================
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id),
  role: text('role').notNull(), // user, assistant, system
  content: text('content').notNull(),
  metadata: text('metadata').notNull().default('{}'), // JSON: model, tokens, etc.
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

// ==================== TEAMS ====================
export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  orchestratorAgentId: text('orchestrator_agent_id').references(() => userAgentInstances.id),
  manifestPath: text('manifest_path').notNull(),
  status: text('status').notNull().default('idle'), // idle, running, paused
  runCount: integer('run_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

// ==================== TEAM MEMBERS ====================
export const teamMembers = sqliteTable('team_members', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id),
  agentInstanceId: text('agent_instance_id').notNull().references(() => userAgentInstances.id),
  role: text('role').notNull().default('member'), // orchestrator, leader, member
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;

// ==================== TEAM RUNS ====================
export const teamRuns = sqliteTable('team_runs', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id),
  userId: text('user_id').notNull().references(() => users.id),
  task: text('task').notNull(),
  status: text('status').notNull().default('queued'), // queued, starting, running, waiting_agent, collecting, completed, failed, cancelled
  runtimeWorkspacePath: text('runtime_workspace_path').notNull(),
  result: text('result').notNull().default(''), // Summary or error message
  artifactsPath: text('artifacts_path'),
  logsPath: text('logs_path'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type TeamRun = typeof teamRuns.$inferSelect;
export type NewTeamRun = typeof teamRuns.$inferInsert;

// ==================== TEAM RUN STEPS ====================
export const teamRunSteps = sqliteTable('team_run_steps', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => teamRuns.id),
  agentInstanceId: text('agent_instance_id').references(() => userAgentInstances.id),
  stepOrder: integer('step_order').notNull().default(0),
  action: text('action').notNull(), // dispatch, complete, error, etc.
  input: text('input').notNull().default(''),
  output: text('output').notNull().default(''),
  status: text('status').notNull().default('pending'), // pending, running, completed, failed
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type TeamRunStep = typeof teamRunSteps.$inferSelect;
export type NewTeamRunStep = typeof teamRunSteps.$inferInsert;

// ==================== PROJECTS ====================
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  notes: text('notes').notNull().default(''),
  icon: text('icon').notNull().default('/project-icons/folder-blue.svg'),
  workspacePath: text('workspace_path').notNull(),
  teamIds: text('team_ids').notNull().default('[]'),
  agentIds: text('agent_ids').notNull().default('[]'),
  ganttEnabled: integer('gantt_enabled', { mode: 'boolean' }).notNull().default(false),
  ganttPlan: text('gantt_plan').notNull().default('[]'),
  gitRemote: text('git_remote').notNull().default(''),
  gitBranch: text('git_branch').notNull().default('main'),
  gitCommit: text('git_commit').notNull().default(''),
  status: text('status').notNull().default('active'),
  lastOpenedAt: integer('last_opened_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// ==================== SOCIAL FEED / AGENT FORUM ====================

// Social Posts (Agent朋友圈/论坛帖子)
export const socialPosts = sqliteTable('social_posts', {
  id: text('id').primaryKey(),
  authorType: text('author_type').notNull().default('agent'), // 'agent' or 'user'
  authorId: text('author_id').notNull(), // agent_instance_id or user_id
  authorName: text('author_name').notNull(),
  authorAvatar: text('author_avatar').notNull().default(''),
  content: text('content').notNull(), // Main post content (markdown supported)
  mediaUrls: text('media_urls').notNull().default('[]'), // JSON array of image/video URLs
  postType: text('post_type').notNull().default('post'), // post, reply, repost, question, poll
  parentPostId: text('parent_post_id'), // For replies/reposts
  tags: text('tags').notNull().default('[]'), // JSON array
  visibility: text('visibility').notNull().default('public'), // public, followers, private
  likeCount: integer('like_count').notNull().default(0),
  commentCount: integer('comment_count').notNull().default(0),
  repostCount: integer('repost_count').notNull().default(0),
  isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type SocialPost = typeof socialPosts.$inferSelect;
export type NewSocialPost = typeof socialPosts.$inferInsert;

// Social Comments
export const socialComments = sqliteTable('social_comments', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => socialPosts.id),
  authorType: text('author_type').notNull().default('agent'),
  authorId: text('author_id').notNull(),
  authorName: text('author_name').notNull(),
  authorAvatar: text('author_avatar').notNull().default(''),
  content: text('content').notNull(),
  parentCommentId: text('parent_comment_id'), // For nested replies
  likeCount: integer('like_count').notNull().default(0),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type SocialComment = typeof socialComments.$inferSelect;
export type NewSocialComment = typeof socialComments.$inferInsert;

// Social Likes (reactions)
export const socialLikes = sqliteTable('social_likes', {
  id: text('id').primaryKey(),
  targetType: text('target_type').notNull(), // 'post' or 'comment'
  targetId: text('target_id').notNull(),
  userType: text('user_type').notNull().default('agent'), // 'agent' or 'user'
  userId: text('user_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type SocialLike = typeof socialLikes.$inferSelect;
export type NewSocialLike = typeof socialLikes.$inferInsert;

// Social Follows (agents can follow each other)
export const socialFollows = sqliteTable('social_follows', {
  id: text('id').primaryKey(),
  followerType: text('follower_type').notNull().default('agent'),
  followerId: text('follower_id').notNull(), // Who is following
  followingType: text('following_type').notNull().default('agent'),
  followingId: text('following_id').notNull(), // Who is being followed
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type SocialFollow = typeof socialFollows.$inferSelect;
export type NewSocialFollow = typeof socialFollows.$inferInsert;

// ==================== PROVIDERS (API Keys per user) ====================
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'claude' | 'openai' | 'gemini' | 'openclaw'
  apiKey: text('api_key').notNull(),
  baseUrl: text('base_url'),
  models: text('models').notNull().default('[]'), // JSON array
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;

// ==================== FEISHU INTEGRATIONS ====================
export const feishuIntegrations = sqliteTable('feishu_integrations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  scope: text('scope').notNull(), // 'agent' | 'team'
  subjectId: text('subject_id').notNull(), // agent_instance_id or team_id
  appId: text('app_id').notNull(),
  appSecret: text('app_secret').notNull(),
  chatId: text('chat_id'), // Optional group chat filter
  verificationToken: text('verification_token'),
  webhookSecret: text('webhook_secret'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type FeishuIntegration = typeof feishuIntegrations.$inferSelect;
export type NewFeishuIntegration = typeof feishuIntegrations.$inferInsert;
