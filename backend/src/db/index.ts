import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

let db: ReturnType<typeof drizzle> | null = null;
let sqliteDb: Database.Database | null = null;

function getBackendDataDir(): string {
  // backend/src/db -> backend/data
  return path.resolve(__dirname, '../../data');
}

function ensureColumns() {
  if (!sqliteDb) return;

  const cols = sqliteDb
    .prepare(`PRAGMA table_info(user_agent_instances)`)
    .all()
    .map((r: any) => r.name);

  if (!cols.includes('state_dir')) {
    sqliteDb.exec(`ALTER TABLE user_agent_instances ADD COLUMN state_dir TEXT`);

    // Backfill for existing rows: default to workspace_path/.openclaw
    const rows = sqliteDb
      .prepare(
        `SELECT id, workspace_path FROM user_agent_instances WHERE state_dir IS NULL OR state_dir = ''`
      )
      .all() as Array<{ id: string; workspace_path: string }>;
    const stmt = sqliteDb.prepare(
      `UPDATE user_agent_instances SET state_dir = ? WHERE id = ?`
    );
    for (const r of rows) {
      stmt.run(path.join(r.workspace_path, '.openclaw'), r.id);
    }
  }
}

export function getDb() {
  if (!db) {
    // Ensure data directory exists (fixed to backend/data)
    const dataDir = getBackendDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'openclaw.db');
    sqliteDb = new Database(dbPath);

    // Enable WAL mode for better performance
    sqliteDb.pragma('journal_mode = WAL');

    // Create all tables using raw SQL
    sqliteDb.exec(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Market Agents
      CREATE TABLE IF NOT EXISTS market_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        owner_user_id TEXT NOT NULL,
        latest_version TEXT NOT NULL DEFAULT '1.0.0',
        visibility TEXT NOT NULL DEFAULT 'private',
        status TEXT NOT NULL DEFAULT 'pending',
        tags TEXT NOT NULL DEFAULT '[]',
        icon TEXT NOT NULL DEFAULT '',
        cover_image TEXT NOT NULL DEFAULT '',
        download_count INTEGER NOT NULL DEFAULT 0,
        rating INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (owner_user_id) REFERENCES users(id)
      );

      -- Market Agent Versions
      CREATE TABLE IF NOT EXISTS market_agent_versions (
        id TEXT PRIMARY KEY,
        market_agent_id TEXT NOT NULL,
        version TEXT NOT NULL,
        manifest_path TEXT NOT NULL,
        source_workspace_path TEXT NOT NULL,
        checksum TEXT NOT NULL,
        changelog TEXT NOT NULL DEFAULT '',
        file_size INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (market_agent_id) REFERENCES market_agents(id)
      );

      -- User Agent Instances (用户私有的Agent)
      CREATE TABLE IF NOT EXISTS user_agent_instances (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source_market_agent_id TEXT,
        source_version TEXT NOT NULL DEFAULT '1.0.0',
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        avatar TEXT NOT NULL DEFAULT '',
        agent_key TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        state_dir TEXT,
        baseline_snapshot_path TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        manifest TEXT NOT NULL DEFAULT '{}',
        tags TEXT NOT NULL DEFAULT '[]',
        cave_id TEXT,
        provider_id TEXT,
        conversation_count INTEGER NOT NULL DEFAULT 0,
        total_messages INTEGER NOT NULL DEFAULT 0,
        last_active_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (source_market_agent_id) REFERENCES market_agents(id)
      );

      -- Caves (Agent窝)
      CREATE TABLE IF NOT EXISTS caves (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#3b82f6',
        description TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      -- Conversations
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_instance_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '新对话',
        last_message TEXT NOT NULL DEFAULT '',
        message_count INTEGER NOT NULL DEFAULT 0,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (agent_instance_id) REFERENCES user_agent_instances(id)
      );

      -- Messages
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );

      -- Teams
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        orchestrator_agent_id TEXT,
        manifest_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle',
        run_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (orchestrator_agent_id) REFERENCES user_agent_instances(id)
      );

      -- Team Members
      CREATE TABLE IF NOT EXISTS team_members (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        agent_instance_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (team_id) REFERENCES teams(id),
        FOREIGN KEY (agent_instance_id) REFERENCES user_agent_instances(id)
      );

      -- Team Runs
      CREATE TABLE IF NOT EXISTS team_runs (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        task TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        runtime_workspace_path TEXT NOT NULL,
        result TEXT NOT NULL DEFAULT '',
        artifacts_path TEXT,
        logs_path TEXT,
        started_at INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (team_id) REFERENCES teams(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      -- Team Run Steps
      CREATE TABLE IF NOT EXISTS team_run_steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        agent_instance_id TEXT,
        step_order INTEGER NOT NULL DEFAULT 0,
        action TEXT NOT NULL,
        input TEXT NOT NULL DEFAULT '',
        output TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (run_id) REFERENCES team_runs(id),
        FOREIGN KEY (agent_instance_id) REFERENCES user_agent_instances(id)
      );

      -- Social Posts (Agent朋友圈/论坛)
      CREATE TABLE IF NOT EXISTS social_posts (
        id TEXT PRIMARY KEY,
        author_type TEXT NOT NULL DEFAULT 'agent',
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        author_avatar TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        media_urls TEXT NOT NULL DEFAULT '[]',
        post_type TEXT NOT NULL DEFAULT 'post',
        parent_post_id TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        visibility TEXT NOT NULL DEFAULT 'public',
        like_count INTEGER NOT NULL DEFAULT 0,
        comment_count INTEGER NOT NULL DEFAULT 0,
        repost_count INTEGER NOT NULL DEFAULT 0,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Social Comments
      CREATE TABLE IF NOT EXISTS social_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        author_type TEXT NOT NULL DEFAULT 'agent',
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        author_avatar TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        parent_comment_id TEXT,
        like_count INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (post_id) REFERENCES social_posts(id)
      );

      -- Social Likes
      CREATE TABLE IF NOT EXISTS social_likes (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        user_type TEXT NOT NULL DEFAULT 'agent',
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      -- Social Follows
      CREATE TABLE IF NOT EXISTS social_follows (
        id TEXT PRIMARY KEY,
        follower_type TEXT NOT NULL DEFAULT 'agent',
        follower_id TEXT NOT NULL,
        following_type TEXT NOT NULL DEFAULT 'agent',
        following_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_market_agents_owner ON market_agents(owner_user_id);
      CREATE INDEX IF NOT EXISTS idx_market_agents_status ON market_agents(status);
      CREATE INDEX IF NOT EXISTS idx_user_agent_instances_user ON user_agent_instances(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_agent_instances_cave ON user_agent_instances(cave_id);
      CREATE INDEX IF NOT EXISTS idx_caves_user ON caves(user_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_instance_id);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_teams_user ON teams(user_id);
      CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
      CREATE INDEX IF NOT EXISTS idx_team_runs_team ON team_runs(team_id);
      CREATE INDEX IF NOT EXISTS idx_team_runs_user ON team_runs(user_id);
      CREATE INDEX IF NOT EXISTS idx_social_posts_author ON social_posts(author_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_social_posts_parent ON social_posts(parent_post_id);
      CREATE INDEX IF NOT EXISTS idx_social_comments_post ON social_comments(post_id);
      CREATE INDEX IF NOT EXISTS idx_social_likes_target ON social_likes(target_type, target_id);
      CREATE INDEX IF NOT EXISTS idx_social_follows_follower ON social_follows(follower_id);
      CREATE INDEX IF NOT EXISTS idx_social_follows_following ON social_follows(following_id);

      -- Providers (API Keys per user)
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        api_key TEXT NOT NULL,
        base_url TEXT,
        models TEXT NOT NULL DEFAULT '[]',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_providers_user ON providers(user_id);
    `);

    // Ensure additive schema migrations for existing DBs
    ensureColumns();

    // Wrap with Drizzle ORM for query builder API
    db = drizzle(sqliteDb, { schema });
  }

  return db;
}

export function getRawDb(): Database.Database {
  // Force initialization if not already done
  getDb();
  return sqliteDb!;
}

export function closeDb() {
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
    db = null;
  }
}
