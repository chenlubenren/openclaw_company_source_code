/**
 * Seed script to add sample market agents
 * Run: npx tsx src/scripts/seed-market.ts
 */
import { getRawDb } from '../db/index.js';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const db = getRawDb();

// Get first user or system
const firstUser = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
const systemUserId = firstUser?.id || 'system';

const SAMPLE_AGENTS = [
  {
    name: 'Red Hood',
    description: 'Skilled at creating stories and poems with rich imagination',
    role: 'Creative Writing Expert',
    tags: JSON.stringify(['writing', 'creative', 'stories']),
    rarity: 'rare',
    price: 500,
    avatar: '/lobsters/market-red-hood.png',
  },
  {
    name: 'Data Doc',
    description: 'Master of data analysis algorithms, finds insights in data',
    role: 'Data Analysis Expert',
    tags: JSON.stringify(['data', 'analysis', 'algorithms']),
    rarity: 'epic',
    price: 800,
    avatar: '/lobsters/market-data-doc.png',
  },
  {
    name: 'Code Hero',
    description: 'Full-stack developer, proficient in multiple languages',
    role: 'Coding Expert',
    tags: JSON.stringify(['coding', 'development', 'programming']),
    rarity: 'legendary',
    price: 1000,
    avatar: '/lobsters/market-code-hero.png',
  },
  {
    name: 'Research Cat',
    description: 'Good at literature review and research methodology',
    role: 'Research Assistant',
    tags: JSON.stringify(['research', 'academic', 'literature']),
    rarity: 'rare',
    price: 600,
    avatar: '/lobsters/market-research-cat.png',
  },
  {
    name: 'Translator',
    description: 'Fluent in 10+ languages, accurate translations',
    role: 'Multi-language Expert',
    tags: JSON.stringify(['translation', 'languages', 'nlp']),
    rarity: 'common',
    price: 400,
    avatar: '/lobsters/market-translator.png',
  },
  {
    name: 'Artist',
    description: 'Transforms text descriptions into beautiful images',
    role: 'AI Drawing Expert',
    tags: JSON.stringify(['art', 'image', 'generation']),
    rarity: 'epic',
    price: 900,
    avatar: '/lobsters/market-artist.png',
  },
  {
    name: 'Chef',
    description: 'Turns raw ingredients into structured recipe knowledge graphs',
    role: 'Kitchen Data Expert',
    tags: JSON.stringify(['cooking', 'recipes', 'knowledge-graph']),
    rarity: 'rare',
    price: 450,
    avatar: '/lobsters/lobster-004.png',
  },
  {
    name: 'Analyst Pro',
    description: 'Expert in financial modeling, market prediction, and risk assessment',
    role: 'Financial Analysis Expert',
    tags: JSON.stringify(['finance', 'analysis', 'prediction']),
    rarity: 'epic',
    price: 850,
    avatar: '/lobsters/lobster-003.png',
  },
  {
    name: 'Linguist',
    description: 'Deep expertise in natural language processing and semantic analysis',
    role: 'NLP Specialist',
    tags: JSON.stringify(['nlp', 'semantic', 'language']),
    rarity: 'epic',
    price: 700,
    avatar: '/lobsters/lobster-002.png',
  },
];

async function seedMarketAgents() {
  const now = Math.floor(Date.now() / 1000); // seconds, not milliseconds
  let inserted = 0;

  for (const agent of SAMPLE_AGENTS) {
    const id = crypto.randomUUID().replace(/-/g, '');
    const version = '1.0.0';
    
    // Create workspace directory
    const workspaceRoot = path.join(process.cwd(), 'data', 'workspaces', 'market', 'agents', id, version);
    fs.mkdirSync(workspaceRoot, { recursive: true });
    
    // Create minimal manifest
    const manifest = {
      name: agent.name,
      version: version,
      description: agent.description,
      role: agent.role,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(workspaceRoot, 'agent.manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    // Insert into database
    db.prepare(`
      INSERT INTO market_agents (
        id, name, description, owner_user_id, latest_version,
        visibility, status, tags, icon, cover_image,
        download_count, rating, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      agent.name,
      agent.description,
      systemUserId,
      version,
      'public',
      'active',
      agent.tags,
      agent.avatar,
      '',
      0,
      0,
      now,
      now
    );

    // Insert version record
    db.prepare(`
      INSERT INTO market_agent_versions (
        id, market_agent_id, version, manifest_path, source_workspace_path,
        checksum, changelog, file_size, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID().replace(/-/g, ''),
      id,
      version,
      path.join(workspaceRoot, 'agent.manifest.json'),
      workspaceRoot,
      '',
      'Initial release',
      0,
      now
    );

    console.log(`✓ Added: ${agent.name} (${id})`);
    inserted++;
  }

  console.log(`\n✅ Seeded ${inserted} market agents`);
}

seedMarketAgents().catch(console.error);
