import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { providers } from '../db/schema.js';
import type { Provider } from '../db/schema.js';

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface CreateProviderDto {
  name: string;
  type: 'claude' | 'codex' | 'opencode' | 'openclaw' | 'gemini' | 'hermes';
  apiKey: string;
  baseUrl?: string;
  models?: string[];
}

export async function createProvider(userId: string, dto: CreateProviderDto): Promise<Provider> {
  const db = getDb();
  const id = generateId();
  const now = new Date();

  await db.insert(providers).values({
    id,
    userId,
    name: dto.name,
    type: dto.type,
    apiKey: dto.apiKey,
    baseUrl: dto.baseUrl || null,
    models: JSON.stringify(dto.models || []),
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  });

  return (await getProviderById(id, userId))!;
}

export async function getProviderById(id: string, userId: string): Promise<Provider | null> {
  const db = getDb();
  const result = await db.select().from(providers).where(and(eq(providers.id, id), eq(providers.userId, userId))).limit(1);
  return result[0] || null;
}

export async function getUserProviders(userId: string): Promise<Provider[]> {
  const db = getDb();
  const result = await db.select().from(providers).where(eq(providers.userId, userId));
  return result;
}

export async function getUserProvidersByType(userId: string, type: string): Promise<Provider[]> {
  const db = getDb();
  const result = await db.select().from(providers).where(and(eq(providers.userId, userId), eq(providers.type, type)));
  return result;
}

export async function updateProvider(id: string, userId: string, updates: Partial<CreateProviderDto & { isDefault: boolean }>): Promise<Provider | null> {
  const db = getDb();
  const existing = await getProviderById(id, userId);
  if (!existing) return null;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.type !== undefined) updateData.type = updates.type;
  if (updates.apiKey !== undefined) updateData.apiKey = updates.apiKey;
  if (updates.baseUrl !== undefined) updateData.baseUrl = updates.baseUrl || null;
  if (updates.models !== undefined) updateData.models = JSON.stringify(updates.models);
  if (updates.isDefault !== undefined) updateData.isDefault = updates.isDefault;

  // If setting as default, unset other defaults of same type
  if (updates.isDefault) {
    await db.update(providers).set({ isDefault: false }).where(and(eq(providers.userId, userId), eq(providers.type, existing.type)));
  }

  await db.update(providers).set(updateData).where(and(eq(providers.id, id), eq(providers.userId, userId)));
  return getProviderById(id, userId);
}

export async function deleteProvider(id: string, userId: string): Promise<boolean> {
  const db = getDb();
  const existing = await getProviderById(id, userId);
  if (!existing) return false;

  await db.delete(providers).where(and(eq(providers.id, id), eq(providers.userId, userId)));
  return true;
}
