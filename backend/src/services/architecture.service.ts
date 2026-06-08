import path from 'path';
import crypto from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { teams, type Team } from '../db/schema.js';
import { deleteFile, getUserWorkspaceRoot, readFile, writeFile } from './workspace.service.js';

type ArchitectureAgent = Record<string, unknown>;
type ArchitectureNode = Record<string, unknown>;
type ArchitectureEdge = Record<string, unknown>;
type WorkflowDsl = Record<string, unknown>;

export interface ArchitecturePayload {
  id: string;
  name: string;
  description: string;
  agents: ArchitectureAgent[];
  nodes?: ArchitectureNode[];
  edges?: ArchitectureEdge[];
  workflowDsl?: WorkflowDsl;
  createdAt: string;
  updatedAt?: string;
}

interface ArchitectureInput {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  agents?: unknown;
  nodes?: unknown;
  edges?: unknown;
  workflowDsl?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

function generateId(): string {
  return `arch-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function normalizeWorkflowDsl(value: unknown): WorkflowDsl | undefined {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? (value as WorkflowDsl)
    : undefined;
}

function toIso(value: unknown, fallback = new Date()): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return fallback.toISOString();
}

function getArchitectureManifestPath(userId: string, architectureId: string): string {
  return path.join(getUserWorkspaceRoot(userId), 'teams', architectureId, 'architecture.json');
}

function readManifest(team: Team): Partial<ArchitecturePayload> {
  const content = readFile(team.manifestPath);
  if (!content) return {};

  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeArchitecture(
  input: ArchitectureInput,
  id: string,
  createdAt: string,
  updatedAt: string
): ArchitecturePayload {
  const name = normalizeText(input.name);
  if (!name) {
    throw new Error('团队名称不能为空');
  }

  const nodes = normalizeArray(input.nodes);
  const edges = normalizeArray(input.edges);
  const workflowDsl = normalizeWorkflowDsl(input.workflowDsl);

  return {
    id,
    name,
    description: normalizeText(input.description),
    agents: normalizeArray(input.agents),
    ...(nodes.length > 0 ? { nodes } : {}),
    ...(edges.length > 0 ? { edges } : {}),
    ...(workflowDsl ? { workflowDsl } : {}),
    createdAt,
    updatedAt,
  };
}

function safeArchitecture(team: Team): ArchitecturePayload {
  const manifest = readManifest(team);
  const createdAt = toIso(manifest.createdAt, team.createdAt);
  const updatedAt = toIso(manifest.updatedAt, team.updatedAt);

  return normalizeArchitecture(
    {
      ...manifest,
      id: team.id,
      name: normalizeText(manifest.name, team.name),
      description: normalizeText(manifest.description, team.description),
      createdAt,
      updatedAt,
    },
    team.id,
    createdAt,
    updatedAt
  );
}

export async function listArchitectures(userId: string): Promise<ArchitecturePayload[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(teams)
    .where(eq(teams.userId, userId))
    .orderBy(desc(teams.updatedAt), desc(teams.createdAt));

  return rows.map(safeArchitecture);
}

export async function getArchitecture(userId: string, architectureId: string): Promise<ArchitecturePayload | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, architectureId), eq(teams.userId, userId)))
    .limit(1);

  return rows[0] ? safeArchitecture(rows[0]) : null;
}

export async function getArchitectureByIdAnyUser(
  architectureId: string
): Promise<{ architecture: ArchitecturePayload; userId: string } | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(teams)
    .where(eq(teams.id, architectureId))
    .limit(1);

  return rows[0]
    ? {
        architecture: safeArchitecture(rows[0]),
        userId: rows[0].userId,
      }
    : null;
}

export async function createArchitecture(
  userId: string,
  input: ArchitectureInput
): Promise<ArchitecturePayload> {
  const db = getDb();
  const now = new Date();
  const id = normalizeText(input.id) || generateId();
  const manifestPath = getArchitectureManifestPath(userId, id);
  const architecture = normalizeArchitecture(input, id, toIso(input.createdAt, now), now.toISOString());

  await db.insert(teams).values({
    id,
    userId,
    name: architecture.name,
    description: architecture.description,
    orchestratorAgentId: null,
    manifestPath,
    status: 'idle',
    runCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  writeArchitectureManifest(manifestPath, architecture);
  return architecture;
}

export async function updateArchitecture(
  userId: string,
  architectureId: string,
  input: ArchitectureInput
): Promise<ArchitecturePayload | null> {
  const existing = await getArchitecture(userId, architectureId);
  if (!existing) return null;

  const db = getDb();
  const now = new Date();
  const next = normalizeArchitecture(
    {
      ...existing,
      ...input,
      id: architectureId,
      createdAt: existing.createdAt,
      updatedAt: now.toISOString(),
    },
    architectureId,
    existing.createdAt,
    now.toISOString()
  );

  await db
    .update(teams)
    .set({
      name: next.name,
      description: next.description,
      updatedAt: now,
    })
    .where(and(eq(teams.id, architectureId), eq(teams.userId, userId)));

  const rows = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, architectureId), eq(teams.userId, userId)))
    .limit(1);

  const manifestPath = rows[0]?.manifestPath ?? getArchitectureManifestPath(userId, architectureId);
  writeArchitectureManifest(manifestPath, next);
  return next;
}

export async function deleteArchitecture(userId: string, architectureId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, architectureId), eq(teams.userId, userId)))
    .limit(1);

  if (!rows[0]) return false;

  await db.delete(teams).where(and(eq(teams.id, architectureId), eq(teams.userId, userId)));
  deleteFile(rows[0].manifestPath);
  return true;
}

function writeArchitectureManifest(manifestPath: string, architecture: ArchitecturePayload): void {
  const ok = writeFile(manifestPath, JSON.stringify(architecture, null, 2));
  if (!ok) {
    throw new Error('团队架构文件写入失败');
  }
}
