import bcrypt from 'bcryptjs';
import { getRawDb } from '../db/index.js';
import type { User, NewUser } from '../db/schema.js';

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface CreateUserDto {
  email: string;
  username: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    username: string;
  };
  accessToken: string;
}

export async function createUser(dto: CreateUserDto): Promise<User> {
  const db = getRawDb();

  // Check if email already exists
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(dto.email);
  if (existing) {
    throw new Error('该邮箱已被注册');
  }

  // Check if username already exists
  const existingUsername = db.prepare('SELECT * FROM users WHERE username = ?').get(dto.username);
  if (existingUsername) {
    throw new Error('该用户名已被使用');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(dto.password, 10);

  const now = Date.now();
  const id = generateId();

  db.prepare(`
    INSERT INTO users (id, email, username, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, dto.email, dto.username, passwordHash, now, now);

  return {
    id,
    email: dto.email,
    username: dto.username,
    passwordHash,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

export async function validateUser(dto: LoginDto): Promise<User | null> {
  const db = getRawDb();

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(dto.email) as {
    id: string;
    email: string;
    username: string;
    password_hash: string;
    created_at: number;
    updated_at: number;
  } | undefined;

  if (!row) {
    return null;
  }

  const isValid = await bcrypt.compare(dto.password, row.password_hash);
  if (!isValid) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function getUserById(id: string): Promise<User | null> {
  const db = getRawDb();

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as {
    id: string;
    email: string;
    username: string;
    password_hash: string;
    created_at: number;
    updated_at: number;
  } | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
