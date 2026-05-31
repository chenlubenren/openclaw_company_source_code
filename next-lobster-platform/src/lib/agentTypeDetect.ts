export type AgentPlatformType =
  | 'claude-code'
  | 'codex'
  | 'opencode'
  | 'openclaw'
  | 'hermes'
  | 'unknown';

export interface AgentTypeOption {
  id: AgentPlatformType;
  label: string;
  description: string;
}

export const AGENT_TYPE_OPTIONS: AgentTypeOption[] = [
  { id: 'claude-code', label: 'Claude Code', description: 'Anthropic Claude Code workspace' },
  { id: 'codex', label: 'Codex', description: 'OpenAI Codex agent' },
  { id: 'opencode', label: 'OpenCode', description: 'OpenCode agent workspace' },
  { id: 'openclaw', label: 'OpenClaw', description: 'OpenClaw gateway agent' },
  { id: 'hermes', label: 'Hermes', description: 'Hermes agent runtime' },
];

interface DetectionRule {
  type: Exclude<AgentPlatformType, 'unknown'>;
  /**
   * Absolute-path patterns (e.g. .claude/settings.json, .openclaw/workspace/AGENTS.md)
   * Supports glob-like: ** prefix means "ends with"
   */
  pathPatterns: RegExp[];
  /**
   * Unique bootstrap/workspace files that only this platform uses.
   * These give 100% confidence when present.
   */
  uniqueFiles?: string[];
  /**
   * Content hints for config file inspection
   */
  contentHints?: string[];
  /**
   * Base score for path matches
   */
  weight: number;
}

/**
 * Detection rules with 100% accurate distinguishing features
 *
 * Key differentiators:
 * - Claude Code: .claude/settings.json, .claude/rules/, CLAUDE.md (lowercase)
 * - Codex: .codex/, codex.toml, AGENTS.override.md
 * - OpenCode: opencode.json, .opencode/agents/*.md (YAML frontmatter)
 * - OpenClaw: SOUL.md, IDENTITY.md, BOOTSTRAP.md, BOOT.md, AGENTS.md (bootstrap files)
 * - Hermes: .hermes/config.yaml, .env, memories/ (plural), cron/, sessions/
 */
const DETECTION_RULES: DetectionRule[] = [
  {
    type: 'claude-code',
    pathPatterns: [
      /^\.claude\/settings\.json$/i,
      /^\.claude\/rules\//i,
      /^\.claude\/agents\//i,
      /^\.claude\/skills\//i,
      /^\.claude\/commands\//i,
      /^\.claude\/workspace\//i,
      /(^|\/)CLAUDE\.md$/i,
      /(^|\/)claude\.md$/i,
      /^\.claude\.json$/i,
    ],
    uniqueFiles: ['.claude/settings.json', 'CLAUDE.md', '.claude/rules'],
    contentHints: ['"claude"', '"anthropic"'],
    weight: 3,
  },
  {
    type: 'codex',
    pathPatterns: [
      /^\.codex\//i,
      /(^|\/)codex\.toml$/i,
      /(^|\/)codex\.json$/i,
      /(^|\/)AGENTS\.override\.md$/i,
    ],
    uniqueFiles: ['.codex/', 'codex.toml', 'AGENTS.override.md'],
    contentHints: ['[codex]', 'codex', 'openai codex'],
    weight: 3,
  },
  {
    type: 'opencode',
    pathPatterns: [
      // Root folder named "opencode" (primary identifier)
      /^opencode\//i,
      /^opencode$/i,
      // .opencode/ directory (alternative structure)
      /^\.opencode\//i,
      /(^|\/)opencode\.json$/i,
      /^\.opencode\/agents\//i,
    ],
    uniqueFiles: ['opencode/', '.opencode/agents/', 'opencode.json'],
    contentHints: ['"opencode"', '"$schema".*opencode'],
    weight: 3,
  },
  {
    type: 'openclaw',
    pathPatterns: [
      /^\.openclaw\//i,
      /(^|\/)openclaw\.json$/i,
      /(^|\/)openclaw\.toml$/i,
      /(^|\/)agent\.manifest\.json$/i,
      // OpenClaw workspace bootstrap files (unique identifiers)
      /(^|\/)SOUL\.md$/i,
      /(^|\/)IDENTITY\.md$/i,
      /(^|\/)TOOLS\.md$/i,
      /(^|\/)USER\.md$/i,
      /(^|\/)BOOTSTRAP\.md$/i,
      /(^|\/)BOOT\.md$/i,
      /(^|\/)AGENTS\.md$/i,
      /(^|\/)HEARTBEAT\.md$/i,
      /(^|\/)MEMORY\.md$/i,
      /(^|\/)canvas\//i,
      // Memory directory (note: singular, not memories like Hermes)
      /(^|\/)memory\/\d{4}-\d{2}-\d{2}\.md$/i,
    ],
    uniqueFiles: ['SOUL.md', 'IDENTITY.md', 'BOOTSTRAP.md', 'BOOT.md', 'HEARTBEAT.md', 'TOOLS.md'],
    contentHints: ['openclaw', '"type":"openclaw"', 'openclaw.ai'],
    weight: 3,
  },
  {
    type: 'hermes',
    pathPatterns: [
      /^\.hermes\//i,
      /(^|\/)hermes\.yaml$/i,
      /(^|\/)hermes\.yml$/i,
      /(^|\/)hermes\.json$/i,
      // Hermes-specific directories
      /^\.hermes\/memories\//i,
      /^\.hermes\/cron\//i,
      /^\.hermes\/sessions\//i,
      /^\.hermes\/skills\//i,
      /^\.hermes\/logs\//i,
      // Hermes SOUL.md (in memories/ directory context)
      /^\.hermes\/SOUL\.md$/i,
    ],
    uniqueFiles: ['.hermes/config.yaml', '.hermes/memories/', '.hermes/cron/', '.hermes/sessions/'],
    contentHints: ['hermes', 'terminal:', 'backend:', 'provider:'],
    weight: 3,
  },
];

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Check if file exists in list (case-insensitive)
 */
function hasFile(paths: string[], fileOrDir: string): boolean {
  const normalized = paths.map(normalizePath);
  const searchTerm = normalizePath(fileOrDir);
  // Check exact match
  if (normalized.some(p => p === searchTerm || p.endsWith('/' + searchTerm) || p.endsWith(searchTerm))) {
    return true;
  }
  // Check directory match
  return normalized.some(p => p.startsWith(searchTerm + '/'));
}

function stripRootPrefix(paths: string[]): string[] {
  if (paths.length === 0) return paths;
  const parts = paths.map((p) => normalizePath(p).split('/'));
  const root = parts[0][0];
  if (parts.every((seg) => seg.length > 1 && seg[0] === root)) {
    return paths.map((p) => {
      const n = normalizePath(p);
      const idx = n.indexOf('/');
      return idx >= 0 ? n.slice(idx + 1) : n;
    });
  }
  return paths.map(normalizePath);
}

export interface DetectionResult {
  detected: AgentPlatformType | null;
  confidence: 'high' | 'low' | 'none';
  scores: Partial<Record<AgentPlatformType, number>>;
  reason?: string;
}

/**
 * Phase 1: Check for 100% unique identifiers
 * These files/directories can definitively identify a platform
 */
function checkUniqueIdentifiers(paths: string[]): { type: Exclude<AgentPlatformType, 'unknown'>; reason: string } | null {
  const normalized = paths.map(normalizePath);

  // OpenCode: Check for root folder named "opencode" (highest priority for OpenCode)
  // This must be checked BEFORE OpenClaw bootstrap files
  const hasOpenCodeRoot = normalized.some(p => {
    const parts = p.split('/');
    return parts.length >= 1 && parts[0].toLowerCase() === 'opencode';
  });
  if (hasOpenCodeRoot) {
    return { type: 'opencode', reason: 'Root folder named "opencode" found' };
  }

  // Claude Code unique
  if (normalized.some(p => /^\.claude\/settings\.json$/i.test(p) || /^\.claude\/rules\//i.test(p))) {
    return { type: 'claude-code', reason: '.claude/settings.json or .claude/rules/ found' };
  }

  // Codex unique
  if (normalized.some(p => /(^|\/)codex\.toml$/i.test(p) || /(^|\/)AGENTS\.override\.md$/i.test(p))) {
    return { type: 'codex', reason: 'codex.toml or AGENTS.override.md found' };
  }

  // OpenCode: .opencode/agents/ directory (fallback check)
  if (normalized.some(p => /^\.opencode\/agents\//i.test(p))) {
    return { type: 'opencode', reason: '.opencode/agents/ directory found' };
  }

  // OpenClaw unique bootstrap files (definitively identify OpenClaw)
  // NOTE: Only check these if we haven't already identified OpenCode
  const openclawUniqueFiles = ['SOUL.md', 'IDENTITY.md', 'BOOTSTRAP.md', 'BOOT.md', 'HEARTBEAT.md'];
  for (const file of openclawUniqueFiles) {
    if (normalized.some(p => new RegExp(`(^|/)` + file.replace('.', '\\.') + `$`, 'i').test(p))) {
      return { type: 'openclaw', reason: `${file} (OpenClaw bootstrap file) found` };
    }
  }

  // Hermes unique
  if (normalized.some(p => /^\.hermes\/memories\//i.test(p) || /^\.hermes\/cron\//i.test(p) || /^\.hermes\/sessions\//i.test(p))) {
    return { type: 'hermes', reason: '.hermes/memories/, cron/, or sessions/ found' };
  }

  // Additional Hermes indicator: .hermes/ with config.yaml pattern
  if (normalized.some(p => /^\.hermes\/[^/]+\.yaml$/i.test(p) && !p.includes('hermes.yaml'))) {
    return { type: 'hermes', reason: 'YAML config in .hermes/ directory' };
  }

  return null;
}

export function detectAgentTypeFromPaths(filePaths: string[]): DetectionResult {
  const normalized = filePaths.map(normalizePath);
  
  // Phase 1: Check for 100% unique identifiers FIRST (on original paths, before stripping)
  const uniqueMatch = checkUniqueIdentifiers(normalized);
  if (uniqueMatch) {
    return {
      detected: uniqueMatch.type,
      confidence: 'high',
      scores: { [uniqueMatch.type]: 100 },
      reason: uniqueMatch.reason,
    };
  }
  
  // After unique identifiers check, strip prefix for score-based detection
  const paths = stripRootPrefix(normalized);

  // Phase 2: Score-based detection for remaining cases
  const scores: Partial<Record<AgentPlatformType, number>> = {};

  for (const rule of DETECTION_RULES) {
    let score = 0;
    let matchedPatterns: string[] = [];

    for (const p of paths) {
      for (const pattern of rule.pathPatterns) {
        if (pattern.test(p)) {
          score += rule.weight;
          matchedPatterns.push(p);
          break;
        }
      }
    }

    if (score > 0) {
      scores[rule.type] = score;
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return { detected: null, confidence: 'none', scores };
  }

  const [topType, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;

  // High confidence: score >= 3 and significantly higher than second
  if (topScore >= 3 && topScore > secondScore) {
    return {
      detected: topType as AgentPlatformType,
      confidence: 'high',
      scores,
    };
  }

  // Low confidence: some evidence but not strong
  if (topScore > 0) {
    return {
      detected: topType as AgentPlatformType,
      confidence: 'low',
      scores,
    };
  }

  return { detected: null, confidence: 'none', scores };
}

export async function detectAgentTypeFromFiles(files: File[]): Promise<DetectionResult> {
  const paths = files.map((f) => f.webkitRelativePath || f.name);
  const pathResult = detectAgentTypeFromPaths(paths);

  // If high confidence from paths, return early
  if (pathResult.confidence === 'high') {
    return pathResult;
  }

  // Phase 2: Boost scores by inspecting content
  const scores = { ...pathResult.scores };

  const configFiles = files.filter((f) => {
    const name = (f.webkitRelativePath || f.name).toLowerCase();
    return (
      name.endsWith('.json') ||
      name.endsWith('.toml') ||
      name.endsWith('.yaml') ||
      name.endsWith('.yml') ||
      name.endsWith('manifest.json') ||
      name.endsWith('package.json')
    ) && f.size < 512 * 1024;
  });

  for (const file of configFiles.slice(0, 10)) {
    try {
      const text = await file.text();
      const lower = text.toLowerCase();

      // Hermes detection: config.yaml with terminal/backend pattern
      if (lower.includes('terminal:') && lower.includes('backend:')) {
        scores['hermes'] = (scores['hermes'] || 0) + 10;
      }

      // OpenClaw detection: specific patterns
      if (lower.includes('"type":"openclaw"') || lower.includes('"type": "openclaw"')) {
        scores['openclaw'] = (scores['openclaw'] || 0) + 10;
      }

      // Claude Code detection
      if (lower.includes('"claude"') && (lower.includes('"anthropic"') || lower.includes('claude-code'))) {
        scores['claude-code'] = (scores['claude-code'] || 0) + 10;
      }

      // Codex detection
      if (lower.includes('[codex]') || lower.includes('project_doc_')) {
        scores['codex'] = (scores['codex'] || 0) + 10;
      }

      // OpenCode detection
      if (lower.includes('$schema') && lower.includes('opencode')) {
        scores['opencode'] = (scores['opencode'] || 0) + 10;
      }

      // General content hints
      for (const rule of DETECTION_RULES) {
        if (rule.contentHints?.some((hint) => lower.includes(hint.toLowerCase()))) {
          scores[rule.type] = (scores[rule.type] || 0) + 2;
        }
      }
    } catch {
      // ignore read errors
    }
  }

  // Also scan markdown files for unique identifiers
  const mdFiles = files.filter((f) => {
    const name = (f.webkitRelativePath || f.name).toLowerCase();
    return name.endsWith('.md') && f.size < 100 * 1024;
  });

  for (const file of mdFiles.slice(0, 5)) {
    try {
      const text = await file.text();
      const lower = text.toLowerCase();

      // OpenClaw bootstrap files content check
      if (file.name.toUpperCase() === 'SOUL.MD' || file.name.toUpperCase() === 'IDENTITY.MD') {
        scores['openclaw'] = (scores['openclaw'] || 0) + 10;
      }

      // Hermes memories
      if (file.name.toUpperCase() === 'SOUL.MD' && lower.includes('hermes')) {
        scores['hermes'] = (scores['hermes'] || 0) + 10;
      }
    } catch {
      // ignore
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return { detected: null, confidence: 'none', scores };
  }

  const [topType, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;

  // Very high confidence with content-based detection
  if (topScore >= 5 && topScore > secondScore + 2) {
    return { detected: topType as AgentPlatformType, confidence: 'high', scores };
  }
  if (topScore >= 3) {
    return { detected: topType as AgentPlatformType, confidence: 'low', scores };
  }
  return { detected: null, confidence: 'none', scores };
}

export function getAgentTypeLabel(type: AgentPlatformType | null): string {
  if (!type || type === 'unknown') return '未识别';
  return AGENT_TYPE_OPTIONS.find((o) => o.id === type)?.label ?? type;
}
