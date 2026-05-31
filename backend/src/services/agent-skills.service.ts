import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { getAgentByIdAndUser } from './agent.service.js';

export interface WorkspaceSkill {
  id: string;
  name: string;
  summary: string;
  relativePath: string;
  skillMdPath: string;
  size: number;
  updatedAt: string;
}

interface SkillMetadata {
  name?: string;
  description?: string;
}

const SKILL_MD = 'SKILL.md';

function isWindowsDrivePath(filePath: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(filePath);
}

function windowsPathToWsl(filePath: string): string {
  return filePath
    .replace(/^([A-Za-z]):[\\/]/, (_match, letter) => `/mnt/${String(letter).toLowerCase()}/`)
    .replace(/\\/g, '/');
}

function wslPathToWindows(filePath: string): string {
  return filePath
    .replace(/^\/mnt\/([A-Za-z])(?:\/|$)/, (_match, letter) => `${String(letter).toUpperCase()}:\\`)
    .replace(/\//g, '\\');
}

function resolveStoredPath(filePath: string): string {
  if (os.platform() === 'win32') {
    const hostPath = /^\/mnt\/[A-Za-z](\/|$)/.test(filePath)
      ? wslPathToWindows(filePath)
      : filePath.replace(/\//g, '\\');
    return path.isAbsolute(hostPath) ? path.normalize(hostPath) : path.resolve(hostPath);
  }

  const hostPath = isWindowsDrivePath(filePath)
    ? windowsPathToWsl(filePath)
    : filePath.replace(/\\/g, '/');
  return path.posix.isAbsolute(hostPath) ? path.posix.normalize(hostPath) : path.resolve(hostPath);
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseFrontmatter(content: string): SkillMetadata {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const metadata: SkillMetadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const value = stripQuotes(line.slice(separator + 1));
    if (key === 'name') metadata.name = value;
    if (key === 'description') metadata.description = value;
  }

  return metadata;
}

function extractFirstParagraph(content: string): string {
  const withoutFrontmatter = content.replace(/^---\s*\r?\n[\s\S]*?\r?\n---/, '').trim();
  const paragraphs = withoutFrontmatter.split(/\r?\n\s*\r?\n/);

  for (const paragraph of paragraphs) {
    const text = paragraph
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .join(' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[`*_>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (text) return text;
  }

  return 'No summary provided in SKILL.md.';
}

function summarizeSkill(content: string): { name?: string; summary: string } {
  const metadata = parseFrontmatter(content);
  return {
    name: metadata.name,
    summary: metadata.description || extractFirstParagraph(content),
  };
}

function sanitizeSkillId(value: string): string {
  return value
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .toLowerCase() || `skill-${Date.now()}`;
}

function uniqueDirectory(root: string, desiredName: string): string {
  const base = sanitizeSkillId(desiredName);
  let candidate = path.join(root, base);
  let index = 2;

  while (fs.existsSync(candidate)) {
    candidate = path.join(root, `${base}-${index}`);
    index += 1;
  }

  return candidate;
}

function findSkillFiles(dirPath: string, result: string[] = []): string[] {
  if (!fs.existsSync(dirPath)) return result;

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      findSkillFiles(fullPath, result);
    } else if (entry.isFile() && entry.name.toLowerCase() === SKILL_MD.toLowerCase()) {
      result.push(fullPath);
    }
  }

  return result;
}

function copyDirectory(source: string, destination: string): void {
  ensureDir(destination);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function toWorkspaceSkill(skillMdPath: string, skillsRoot: string): WorkspaceSkill {
  const content = fs.readFileSync(skillMdPath, 'utf-8');
  const stats = fs.statSync(skillMdPath);
  const relativePath = path.relative(skillsRoot, path.dirname(skillMdPath)).replace(/\\/g, '/');
  const parsed = summarizeSkill(content);
  const fallbackName = path.basename(path.dirname(skillMdPath));

  return {
    id: relativePath || fallbackName,
    name: parsed.name || fallbackName,
    summary: parsed.summary,
    relativePath,
    skillMdPath: path.relative(skillsRoot, skillMdPath).replace(/\\/g, '/'),
    size: stats.size,
    updatedAt: stats.mtime.toISOString(),
  };
}

async function getAgentSkillsRoot(agentId: string, userId: string): Promise<string | null> {
  const agent = await getAgentByIdAndUser(agentId, userId);
  if (!agent) return null;

  const workspacePath = resolveStoredPath(agent.workspacePath);
  return path.join(workspacePath, 'skills');
}

export async function listAgentSkills(
  agentId: string,
  userId: string
): Promise<WorkspaceSkill[] | null> {
  const skillsRoot = await getAgentSkillsRoot(agentId, userId);
  if (!skillsRoot) return null;

  ensureDir(skillsRoot);
  return findSkillFiles(skillsRoot)
    .map((skillPath) => toWorkspaceSkill(skillPath, skillsRoot))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function installMarkdownSkill(
  file: Express.Multer.File,
  skillsRoot: string,
  requestedName?: string
): WorkspaceSkill {
  const content = file.buffer.toString('utf-8');
  const parsed = summarizeSkill(content);
  const desiredName = requestedName || parsed.name || path.basename(file.originalname, path.extname(file.originalname));
  const destinationDir = uniqueDirectory(skillsRoot, desiredName);
  ensureDir(destinationDir);

  const skillMdPath = path.join(destinationDir, SKILL_MD);
  fs.writeFileSync(skillMdPath, content, 'utf-8');
  return toWorkspaceSkill(skillMdPath, skillsRoot);
}

function writeZipToTemp(zipBuffer: Buffer, tmpRoot: string): void {
  const zip = new AdmZip(zipBuffer);
  for (const entry of zip.getEntries()) {
    const normalizedName = entry.entryName.replace(/\\/g, '/');
    const parts = normalizedName.split('/').filter(Boolean);

    if (
      !normalizedName ||
      normalizedName.startsWith('/') ||
      parts.some((part) => part === '..')
    ) {
      throw new Error('Zip contains an unsafe path.');
    }

    const destination = path.join(tmpRoot, ...parts);
    if (!isInside(tmpRoot, destination)) {
      throw new Error('Zip contains a path outside the extraction directory.');
    }

    if (entry.isDirectory) {
      ensureDir(destination);
    } else {
      ensureDir(path.dirname(destination));
      fs.writeFileSync(destination, entry.getData());
    }
  }
}

function installZipSkills(
  file: Express.Multer.File,
  skillsRoot: string,
  requestedName?: string
): WorkspaceSkill[] {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-skill-'));

  try {
    writeZipToTemp(file.buffer, tmpRoot);

    const skillFiles = findSkillFiles(tmpRoot);
    if (skillFiles.length === 0) {
      throw new Error('No SKILL.md file was found in the uploaded zip.');
    }

    return skillFiles.map((skillMdPath) => {
      const sourceDir = path.dirname(skillMdPath);
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const parsed = summarizeSkill(content);
      const fallbackName = path.basename(sourceDir);
      const desiredName = skillFiles.length === 1
        ? requestedName || parsed.name || fallbackName
        : parsed.name || fallbackName;
      const destinationDir = uniqueDirectory(skillsRoot, desiredName);

      copyDirectory(sourceDir, destinationDir);
      return toWorkspaceSkill(path.join(destinationDir, SKILL_MD), skillsRoot);
    });
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

export async function uploadAgentSkill(
  agentId: string,
  userId: string,
  file: Express.Multer.File,
  requestedName?: string
): Promise<{ uploaded: WorkspaceSkill[]; skills: WorkspaceSkill[] } | null> {
  const skillsRoot = await getAgentSkillsRoot(agentId, userId);
  if (!skillsRoot) return null;

  ensureDir(skillsRoot);

  const extension = path.extname(file.originalname).toLowerCase();
  const uploaded = extension === '.zip'
    ? installZipSkills(file, skillsRoot, requestedName)
    : [installMarkdownSkill(file, skillsRoot, requestedName)];
  const skills = await listAgentSkills(agentId, userId);

  return {
    uploaded,
    skills: skills || uploaded,
  };
}
