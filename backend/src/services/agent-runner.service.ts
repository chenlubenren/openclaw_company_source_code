/**
 * Agent Runner Service - CLI-based Agent Process Management
 * 
 * Manages spawning and communicating with agent CLI processes
 * for platforms: Claude Code, OpenClaw, Codex, Hermes, OpenCode
 * 
 * Supports both Windows and Linux environments
 */

import { spawn, ChildProcess, execFileSync } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

export type AgentPlatform = 'claude-code' | 'openclaw' | 'codex' | 'hermes' | 'opencode';

export interface AgentSession {
  sessionId: string;
  agentId: string;
  platform: AgentPlatform;
  workspacePath: string;
  process: ChildProcess | null;
  status: 'idle' | 'running' | 'waiting' | 'error' | 'stopped';
  startedAt: Date;
  providerConfig?: {
    apiKey: string;
    baseUrl?: string;
    models?: Array<string | { id?: string; name?: string }>;
    stateDir?: string | null;
    providerType?: string;
  };
}

export interface RunnerResponse {
  type: 'output' | 'error' | 'status' | 'done';
  content: string;
  timestamp: Date;
}

export interface CliHealthCheck {
  available: boolean;
  version: string;
  command: string;
  args: string[];
  displayCommand: string;
  usesWsl: boolean;
  errorName?: string;
  errorCode?: string;
  errorMessage?: string;
  status?: number | null;
  signal?: string | null;
  stderr?: string;
  stdout?: string;
}

interface PlatformConfig {
  command: string;
  args: (workspace: string, providerConfig?: ProviderConfig) => string[];
  interactive: boolean;
  workspaceEnv?: string;
  checkCommand: string;
  versionFlag: string;
  useShell?: boolean;
  /** Use --print mode for one-shot queries */
  usePrintMode?: boolean;
  /** Environment variables to set for API key */
  apiKeyEnv?: string;
  baseUrlEnv?: string;
}

interface CommandInvocation {
  command: string;
  args: string[];
  shell: boolean;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  models?: Array<string | { id?: string; name?: string }>;
  stateDir?: string | null;
  providerType?: string;
}

// Detect platform
const isWindows = os.platform() === 'win32';
const OPENCLAW_PROXY_PROVIDER_ID = 'openclaw_proxy';
const OPENCLAW_MESSAGE_ARG_PLACEHOLDER = '__OPENCLAW_RUNTIME_MESSAGE__';

function buildOpenClawSessionId(agentId: string, sessionId: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(`${agentId}:${sessionId}`)
    .digest('hex')
    .slice(0, 32);
  return `agent-${digest}`;
}

function isWindowsDrivePath(filePath: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(filePath);
}

function isWslMountPath(filePath: string): boolean {
  return /^\/mnt\/[A-Za-z](\/|$)/.test(filePath);
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

function resolveHostPath(filePath: string): string {
  if (isWindows) {
    const hostPath = isWslMountPath(filePath)
      ? wslPathToWindows(filePath)
      : filePath.replace(/[\\/]+/g, '\\');
    return path.isAbsolute(hostPath) ? path.normalize(hostPath) : path.resolve(hostPath);
  }

  const hostPath = isWindowsDrivePath(filePath)
    ? windowsPathToWsl(filePath)
    : filePath.replace(/\\/g, '/');
  return path.posix.isAbsolute(hostPath) ? path.posix.normalize(hostPath) : path.resolve(hostPath);
}

function toWslPath(filePath: string): string {
  if (isWslMountPath(filePath)) {
    return filePath.replace(/\\/g, '/');
  }

  if (isWindowsDrivePath(filePath)) {
    return windowsPathToWsl(filePath);
  }

  const resolvedPath = resolveHostPath(filePath);
  return isWindowsDrivePath(resolvedPath)
    ? windowsPathToWsl(resolvedPath)
    : resolvedPath.replace(/\\/g, '/');
}

function getOpenClawRuntimePath(filePath: string): string {
  const resolvedPath = resolveHostPath(filePath);
  return isWindows ? resolvedPath : toWslPath(resolvedPath);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function displayShellArg(value: string): string {
  return /^[A-Za-z0-9_./:=@+-]+$/.test(value)
    ? value
    : `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function getPathEnvValue(): string {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path');
  return pathKey ? process.env[pathKey] || '' : process.env.PATH || '';
}

function findExistingExecutable(candidates: string[]): string | undefined {
  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function getWindowsCommandSearchDirs(): string[] {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return [
    path.join(appData, 'npm'),
    ...getPathEnvValue().split(path.delimiter).filter(Boolean),
  ];
}

function resolveWindowsCommandPath(command: string): string | undefined {
  if (!isWindows) return undefined;
  if (path.isAbsolute(command)) {
    return findExistingExecutable([command]);
  }

  const extension = path.extname(command);
  const extensions = extension ? [''] : ['.cmd', '.exe', '.bat', ''];
  const candidates = getWindowsCommandSearchDirs().flatMap((dir) =>
    extensions.map((suffix) => path.join(dir, `${command}${suffix}`))
  );
  return findExistingExecutable(candidates);
}

function getWindowsNpmCommand(commandName: string): string {
  if (!isWindows) return commandName;

  const extensions = ['.cmd', '.exe', '.bat', ''];
  const searchDirs = getWindowsCommandSearchDirs();
  const candidates = searchDirs.flatMap((dir) =>
    extensions.map((extension) => path.join(dir, `${commandName}${extension}`))
  );

  return findExistingExecutable(candidates) || `${commandName}.cmd`;
}

function isWindowsCommandScript(command: string): boolean {
  return isWindows && /\.(?:cmd|bat)$/i.test(command);
}

function resolveNpmCommandShim(command: string): { scriptPath: string } | null {
  const commandPath = resolveWindowsCommandPath(command);
  if (!commandPath || !isWindowsCommandScript(commandPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(commandPath, 'utf-8');
    const match = content.match(/"%_prog%"\s+"%dp0%\\([^"]+)"\s+%\*/i);
    if (!match?.[1]) return null;

    const scriptPath = path.resolve(path.dirname(commandPath), match[1].replace(/\//g, '\\'));
    return fs.existsSync(scriptPath) ? { scriptPath } : null;
  } catch {
    return null;
  }
}

function resolveCommandInvocation(command: string, args: string[]): CommandInvocation {
  const commandPath = resolveWindowsCommandPath(command) || command;
  const npmShim = resolveNpmCommandShim(command);
  if (npmShim) {
    return {
      command: process.execPath,
      args: [npmShim.scriptPath, ...args],
      shell: false,
    };
  }

  return {
    command: commandPath,
    args,
    shell: isWindowsCommandScript(commandPath),
  };
}

function getOpenClawCommand(): string {
  return isWindows ? getWindowsNpmCommand('openclaw') : 'openclaw';
}

function getOpenCodeCommand(): string {
  return isWindows ? getWindowsNpmCommand('opencode') : 'opencode';
}

function getOpenClawStateDir(workspacePath: string, providerConfig?: ProviderConfig): string {
  const stateDir = providerConfig?.stateDir || process.env.OPENCLAW_STATE_DIR;
  return resolveHostPath(stateDir || path.join(workspacePath, '.openclaw'));
}

function getOpenClawConfigPath(workspacePath: string, providerConfig?: ProviderConfig): string {
  return path.join(getOpenClawStateDir(workspacePath, providerConfig), 'openclaw.json');
}

function getOpenClawRuntimeMessageDir(workspacePath: string, providerConfig?: ProviderConfig): string {
  return path.join(getOpenClawStateDir(workspacePath, providerConfig), 'runtime-messages');
}

function writeOpenClawRuntimeMessageFile(
  workspacePath: string,
  providerConfig: ProviderConfig | undefined,
  message: string
): string {
  const messageDir = getOpenClawRuntimeMessageDir(workspacePath, providerConfig);
  fs.mkdirSync(messageDir, { recursive: true });
  const messagePath = path.join(
    messageDir,
    `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.txt`
  );
  fs.writeFileSync(messagePath, message, 'utf-8');
  return messagePath;
}

function deleteOpenClawRuntimeMessageFile(messagePath: string): void {
  try {
    if (fs.existsSync(messagePath)) {
      fs.unlinkSync(messagePath);
    }
  } catch {
    // Best-effort cleanup only.
  }
}

function prepareOpenClawProviderConfig(workspacePath: string, providerConfig?: ProviderConfig): void {
  const model = getFirstModelId(providerConfig);
  if (!providerConfig?.baseUrl || !model) {
    return;
  }
  const api = getOpenClawProviderApi(providerConfig);

  const stateDir = getOpenClawStateDir(workspacePath, providerConfig);
  const configPath = getOpenClawConfigPath(workspacePath, providerConfig);
  const authProfilesPath = path.join(stateDir, 'agents', 'main', 'agent', 'auth-profiles.json');

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.mkdirSync(path.dirname(authProfilesPath), { recursive: true });

  const config = {
    agents: {
      defaults: {
        workspace: getOpenClawRuntimePath(workspacePath),
        model: {
          primary: `${OPENCLAW_PROXY_PROVIDER_ID}/${model}`,
        },
      },
    },
    tools: {
      profile: 'coding',
    },
    auth: {
      profiles: {
        [`${OPENCLAW_PROXY_PROVIDER_ID}:default`]: {
          provider: OPENCLAW_PROXY_PROVIDER_ID,
          mode: 'api_key',
        },
      },
    },
    models: {
      mode: 'merge',
      providers: {
        [OPENCLAW_PROXY_PROVIDER_ID]: {
          baseUrl: normalizeBaseUrl(providerConfig.baseUrl),
          api,
          authHeader: true,
          models: [buildOpenClawModelConfig(model, providerConfig)],
        },
      },
    },
  };

  const authProfiles = {
    version: 1,
    profiles: {
      [`${OPENCLAW_PROXY_PROVIDER_ID}:default`]: {
        type: 'api_key',
        provider: OPENCLAW_PROXY_PROVIDER_ID,
        keyRef: {
          source: 'env',
          provider: 'default',
          id: 'OPENAI_API_KEY',
        },
      },
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  fs.writeFileSync(authProfilesPath, JSON.stringify(authProfiles, null, 2), 'utf-8');
}

function buildOpenClawShellScript(
  workspacePath: string,
  providerConfig: ProviderConfig | undefined,
  command: string
): string {
  const wslWorkspace = toWslPath(workspacePath);
  const wslStateDir = toWslPath(getOpenClawStateDir(workspacePath, providerConfig));
  const wslConfigPath = toWslPath(getOpenClawConfigPath(workspacePath, providerConfig));
  const apiKey = providerConfig?.apiKey || process.env.OPENCLAW_API_KEY || process.env.OPENAI_API_KEY || '';
  const baseUrl = providerConfig?.baseUrl || process.env.OPENCLAW_BASE_URL || process.env.OPENAI_BASE_URL || '';

  const lines = [
    'set -e',
    `export OPENCLAW_WORKSPACE_DIR=${shellQuote(wslWorkspace)}`,
    `export OPENCLAW_WORKSPACE=${shellQuote(wslWorkspace)}`,
    `export OPENCLAW_STATE_DIR=${shellQuote(wslStateDir)}`,
    `export OPENCLAW_CONFIG_PATH=${shellQuote(wslConfigPath)}`,
  ];

  if (apiKey) {
    lines.push(`export OPENCLAW_API_KEY=${shellQuote(apiKey)}`);
    lines.push(`export OPENAI_API_KEY=${shellQuote(apiKey)}`);
  }

  if (baseUrl) {
    lines.push(`export OPENCLAW_BASE_URL=${shellQuote(baseUrl)}`);
    lines.push(`export OPENAI_BASE_URL=${shellQuote(baseUrl)}`);
  }

  lines.push(`mkdir -p ${shellQuote(wslWorkspace)} ${shellQuote(wslStateDir)}`);
  lines.push(`cd ${shellQuote(wslWorkspace)}`);
  lines.push(command);

  return lines.join('\n');
}

function getBashLauncher(script: string): { command: string; args: string[] } {
  return { command: 'bash', args: ['-lc', script] };
}

function getClaudeCommand(): string {
  if (!isWindows) return 'claude';

  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const claudeExePath = path.join(
    appData,
    'npm',
    'node_modules',
    '@anthropic-ai',
    'claude-code',
    'bin',
    'claude.exe'
  );

  return fs.existsSync(claudeExePath) ? claudeExePath : 'claude.exe';
}

function getStringEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';

  if (isWindows) {
    const npmGlobalBin = process.env.APPDATA
      ? path.join(process.env.APPDATA, 'npm')
      : path.join(os.homedir(), 'AppData', 'Roaming', 'npm');
    const currentPath = env[pathKey] || '';
    env[pathKey] = [npmGlobalBin, currentPath]
      .filter(Boolean)
      .join(path.delimiter);
  } else {
    const home = os.homedir();
    const pathEntries = [
      path.join(home, '.local', 'bin'),
      path.join(home, '.local', 'node-v24.16.0-linux-x64', 'bin'),
      path.join(home, '.npm-global', 'bin'),
      '/usr/local/sbin',
      '/usr/local/bin',
      '/usr/sbin',
      '/usr/bin',
      '/sbin',
      '/bin',
    ];
    const currentPath = env[pathKey] || '';
    env[pathKey] = [...pathEntries, currentPath]
      .filter(Boolean)
      .join(path.delimiter);
  }

  return env;
}

function getFirstModelId(providerConfig?: ProviderConfig): string | undefined {
  const model = providerConfig?.models?.[0];
  if (!model) return undefined;
  return typeof model === 'string' ? model : model.id || model.name;
}

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl || '').trim().replace(/\/+$/, '');
}

function shouldUseOpenAiCompletions(providerConfig?: ProviderConfig): boolean {
  const baseUrl = normalizeBaseUrl(providerConfig?.baseUrl).toLowerCase();
  if (!baseUrl) return false;
  return !baseUrl.includes('api.openai.com');
}

function isDeepSeekProvider(providerConfig?: ProviderConfig): boolean {
  return normalizeBaseUrl(providerConfig?.baseUrl).toLowerCase().includes('deepseek.com');
}

function isKimiCodingProvider(providerConfig?: ProviderConfig): boolean {
  return normalizeBaseUrl(providerConfig?.baseUrl).toLowerCase().includes('api.kimi.com/coding');
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function getOpenClawProviderApi(providerConfig?: ProviderConfig): 'openai-responses' | 'openai-completions' {
  return shouldUseOpenAiCompletions(providerConfig) ? 'openai-completions' : 'openai-responses';
}

function buildOpenClawModelConfig(
  model: string,
  providerConfig?: ProviderConfig
): Record<string, unknown> {
  const api = getOpenClawProviderApi(providerConfig);

  if (isDeepSeekProvider(providerConfig)) {
    return {
      id: model,
      name: model,
      reasoning: true,
      input: ['text'],
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      contextWindow: 1000000,
      maxTokens: 384000,
      api,
      compat: {
        supportsUsageInStreaming: true,
        supportsReasoningEffort: true,
        maxTokensField: 'max_tokens',
        supportsStrictMode: false,
        thinkingFormat: 'deepseek',
        supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      },
    };
  }

  const modelConfig: Record<string, unknown> = {
    id: model,
    name: model,
    reasoning: api === 'openai-responses',
    input: ['text'],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 1000000,
    maxTokens: 32768,
    api,
  };

  return modelConfig;
}

function cleanCliStderr(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes("Expected '=' in /etc/wsl.conf"))
    .filter((line) => !line.includes('no stdin data received in 3s'))
    .filter((line) => !line.includes('redirect stdin explicitly'))
    .join('\n');
}

function terminateProcessTree(childProcess: ChildProcess): void {
  if (isWindows && childProcess.pid) {
    try {
      execFileSync('taskkill', ['/PID', String(childProcess.pid), '/T', '/F'], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      return;
    } catch {
      // Fall back to Node's best-effort kill below.
    }
  }

  childProcess.kill();
}

function buildOpenClawFileMessageCommand(args: string[], messagePath: string): string {
  const nodeWrapper = [
    "const { spawn } = require('node:child_process');",
    "const fs = require('node:fs');",
    "const args = JSON.parse(process.env.OPENCLAW_RUNTIME_ARGS_JSON || '[]');",
    "const messagePath = process.env.OPENCLAW_RUNTIME_MESSAGE_FILE;",
    "if (!messagePath) { console.error('Missing OPENCLAW_RUNTIME_MESSAGE_FILE'); process.exit(1); }",
    "const messageIndex = args.indexOf('__OPENCLAW_RUNTIME_MESSAGE__');",
    "if (messageIndex === -1) { console.error('Missing runtime message placeholder'); process.exit(1); }",
    "args[messageIndex] = fs.readFileSync(messagePath, 'utf8');",
    "const child = spawn('openclaw', args, { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });",
    "child.on('error', (error) => { console.error(error && error.message ? error.message : String(error)); process.exit(1); });",
    "child.on('close', (code, signal) => { if (signal) process.kill(process.pid, signal); process.exit(code ?? 1); });",
  ].join('\n');

  return [
    `export OPENCLAW_RUNTIME_MESSAGE_FILE=${shellQuote(toWslPath(messagePath))}`,
    `export OPENCLAW_RUNTIME_ARGS_JSON=${shellQuote(JSON.stringify(args))}`,
    "node <<'OPENCLAW_MESSAGE_WRAPPER'",
    nodeWrapper,
    'OPENCLAW_MESSAGE_WRAPPER',
  ].join('\n');
}

function buildOpenClawNativeArgs(args: string[], messagePath: string): string[] {
  const nativeArgs = [...args];
  const messageIndex = nativeArgs.indexOf(OPENCLAW_MESSAGE_ARG_PLACEHOLDER);
  if (messageIndex === -1) {
    throw new Error('Missing OpenClaw runtime message placeholder.');
  }
  nativeArgs[messageIndex] = fs.readFileSync(messagePath, 'utf-8');
  return nativeArgs;
}

function buildOpenClawEnv(
  workspacePath: string,
  providerConfig?: ProviderConfig,
  messagePath?: string
): Record<string, string> {
  const env = getStringEnv();
  const workspace = getOpenClawRuntimePath(workspacePath);
  const stateDir = getOpenClawRuntimePath(getOpenClawStateDir(workspacePath, providerConfig));
  const configPath = getOpenClawRuntimePath(getOpenClawConfigPath(workspacePath, providerConfig));
  const apiKey = providerConfig?.apiKey || process.env.OPENCLAW_API_KEY || process.env.OPENAI_API_KEY || '';
  const baseUrl = providerConfig?.baseUrl || process.env.OPENCLAW_BASE_URL || process.env.OPENAI_BASE_URL || '';

  env.OPENCLAW_WORKSPACE_DIR = workspace;
  env.OPENCLAW_WORKSPACE = workspace;
  env.OPENCLAW_STATE_DIR = stateDir;
  env.OPENCLAW_CONFIG_PATH = configPath;

  if (messagePath) {
    env.OPENCLAW_RUNTIME_MESSAGE_FILE = getOpenClawRuntimePath(messagePath);
  }

  if (apiKey) {
    env.OPENCLAW_API_KEY = apiKey;
    env.OPENAI_API_KEY = apiKey;
  }

  if (baseUrl) {
    env.OPENCLAW_BASE_URL = baseUrl;
    env.OPENAI_BASE_URL = baseUrl;
  }

  return env;
}

const PLATFORM_CONFIGS: Record<AgentPlatform, PlatformConfig> = {
  'claude-code': {
    command: getClaudeCommand(),
    args: (workspace) => ['-p', `--add-dir=${workspace}`],
    interactive: true,
    checkCommand: getClaudeCommand(),
    versionFlag: '--version',
    usePrintMode: true,
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    baseUrlEnv: 'ANTHROPIC_BASE_URL',
  },
  'openclaw': {
    command: isWindows ? getOpenClawCommand() : 'bash',
    args: (workspace, providerConfig) => {
      if (isWindows) {
        return ['tui', '--local', '--session', 'main'];
      }

      const script = buildOpenClawShellScript(
        workspace,
        providerConfig,
        'exec openclaw tui --local --session main'
      );
      return ['-lc', script];
    },
    interactive: true,
    workspaceEnv: 'OPENCLAW_WORKSPACE_DIR',
    checkCommand: getOpenClawCommand(),
    versionFlag: '--version',
    apiKeyEnv: 'OPENCLAW_API_KEY',
    baseUrlEnv: 'OPENCLAW_BASE_URL',
  },
  'codex': {
    command: isWindows ? 'npx.cmd' : 'npx',
    args: () => ['-y', '@openai/codex', '--print'],
    interactive: false,
    checkCommand: isWindows ? 'npx.cmd' : 'npx',
    versionFlag: '--version',
    usePrintMode: true,
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrlEnv: 'OPENAI_BASE_URL',
  },
  'hermes': {
    command: isWindows ? 'hermes.cmd' : 'hermes',
    args: () => ['-z'],
    interactive: false,
    checkCommand: isWindows ? 'hermes.cmd' : 'hermes',
    versionFlag: 'version',
    usePrintMode: true,
    apiKeyEnv: 'HERMES_API_KEY',
  },
  'opencode': {
    command: getOpenCodeCommand(),
    args: () => ['--print'],
    interactive: false,
    checkCommand: getOpenCodeCommand(),
    versionFlag: '--version',
    usePrintMode: true,
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrlEnv: 'OPENAI_BASE_URL',
  },
};

function getCliHealthInvocation(platform: AgentPlatform): { command: string; args: string[]; usesWsl: boolean } {
  const config = PLATFORM_CONFIGS[platform];
  return {
    command: config.checkCommand,
    args: [config.versionFlag],
    usesWsl: false,
  };
}

function redactRuntimeDiagnostic(value: unknown): string {
  const raw = Buffer.isBuffer(value)
    ? value.toString('utf-8')
    : typeof value === 'string'
      ? value
      : value == null
        ? ''
        : String(value);
  let text = raw.replace(/\x1b\[[0-9;]*m/g, '').replace(/\s+/g, ' ').trim();

  for (const [name, envValue] of Object.entries(process.env)) {
    if (!envValue || envValue.length < 8) continue;
    if (!/(KEY|TOKEN|SECRET|PASSWORD|AUTH|CREDENTIAL)/i.test(name)) continue;
    text = text.split(envValue).join(`[redacted:${name}]`);
  }

  text = text
    .replace(/\bsk-[A-Za-z0-9_\-]{12,}\b/g, '[redacted:key]')
    .replace(/\b(?:anthropic|claude|openai|cohere|deepseek|kimi|coze)[_-]?[A-Za-z0-9_\-]{16,}\b/gi, '[redacted:token]');

  return text.slice(0, 600);
}

function buildCliHealthResult(
  invocation: { command: string; args: string[]; usesWsl: boolean },
  overrides: Partial<CliHealthCheck>
): CliHealthCheck {
  return {
    available: false,
    version: '',
    command: invocation.command,
    args: invocation.args,
    displayCommand: [invocation.command, ...invocation.args].map(displayShellArg).join(' '),
    usesWsl: invocation.usesWsl,
    ...overrides,
  };
}

export function formatCliHealthFailure(platform: AgentPlatform | string, cli: CliHealthCheck): string {
  const detail = cli.stderr || cli.errorMessage || cli.stdout || '';
  const code = [cli.errorCode, cli.errorName].filter(Boolean).join('/');
  const prefix = `${platform} CLI 不可用`;
  const command = cli.displayCommand ? `检查命令：${cli.displayCommand}` : `命令：${cli.command}`;
  const reason = detail || code || (cli.status != null ? `退出码 ${cli.status}` : '') || '未返回详细错误';
  return `${prefix}。${command}。${code ? `错误：${code}。` : ''}${reason}`;
}

class AgentRunner extends EventEmitter {
  private sessions: Map<string, AgentSession> = new Map();
  private outputBuffers: Map<string, string> = new Map();

  async checkCliAvailable(platform: AgentPlatform): Promise<CliHealthCheck> {
    const invocation = getCliHealthInvocation(platform);
    const resolvedInvocation = resolveCommandInvocation(invocation.command, invocation.args);

    try {
      const output = execFileSync(resolvedInvocation.command, resolvedInvocation.args, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: getStringEnv(),
        shell: resolvedInvocation.shell,
      });
      return buildCliHealthResult(invocation, {
        available: true,
        version: redactRuntimeDiagnostic(output),
      });
    } catch (error) {
      const err = error as Error & {
        code?: string;
        status?: number | null;
        signal?: string | null;
        stderr?: Buffer | string;
        stdout?: Buffer | string;
      };
      return buildCliHealthResult(invocation, {
        available: false,
        version: '',
        errorName: err.name,
        errorCode: typeof err.code === 'string' ? err.code : undefined,
        errorMessage: redactRuntimeDiagnostic(err.message),
        status: typeof err.status === 'number' ? err.status : null,
        signal: typeof err.signal === 'string' ? err.signal : null,
        stderr: redactRuntimeDiagnostic(err.stderr),
        stdout: redactRuntimeDiagnostic(err.stdout),
      });
    }
  }

  async getAvailablePlatforms(): Promise<{ platform: AgentPlatform; available: boolean; version: string }[]> {
    const results = [];
    for (const platform of Object.keys(PLATFORM_CONFIGS) as AgentPlatform[]) {
      const check = await this.checkCliAvailable(platform);
      results.push({ platform, ...check });
    }
    return results;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  private extractOpenClawText(rawOutput: string): string {
    const trimmed = rawOutput.trim();
    if (!trimmed) return '';

    const candidates = [
      trimmed,
      ...this.extractEmbeddedJsonCandidates(trimmed),
      ...trimmed.split(/\r?\n/).reverse(),
    ];
    for (const candidate of candidates) {
      try {
        const parsed: unknown = JSON.parse(candidate);
        const payloadText = this.findOpenClawPayloadText(parsed);
        if (payloadText) return payloadText;
        const text = this.findStringField(parsed, [
          'content',
          'message',
          'reply',
          'response',
          'text',
          'output',
          'result',
        ]);
        if (text) return text;
      } catch {
        // Try the next candidate.
      }
    }

    return trimmed;
  }

  private extractEmbeddedJsonCandidates(text: string): string[] {
    const candidates: string[] = [];
    const objectStart = text.indexOf('{');
    const objectEnd = text.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      candidates.push(text.slice(objectStart, objectEnd + 1).trim());
    }

    const arrayStart = text.indexOf('[');
    const arrayEnd = text.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      candidates.push(text.slice(arrayStart, arrayEnd + 1).trim());
    }

    return Array.from(new Set(candidates.filter((candidate) => candidate && candidate !== text)));
  }

  private findOpenClawPayloadText(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;

    const record = value as Record<string, unknown>;
    const payloads = Array.isArray(record.payloads)
      ? record.payloads
      : record.result && typeof record.result === 'object' && Array.isArray((record.result as Record<string, unknown>).payloads)
        ? (record.result as Record<string, unknown>).payloads as unknown[]
        : null;

    if (!payloads) return null;

    const parts = payloads
      .map((payload) => this.findStringField(payload, [
        'text',
        'content',
        'message',
        'reply',
        'response',
        'output',
      ]))
      .filter((part): part is string => Boolean(part?.trim()));

    return parts.length > 0 ? parts.join('\n').trim() : null;
  }

  private findStringField(value: unknown, keys: string[]): string | null {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return null;

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findStringField(item, keys);
        if (found) return found;
      }
      return null;
    }

    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const direct = record[key];
      if (typeof direct === 'string' && direct.trim()) return direct;
      const nested = this.findStringField(direct, keys);
      if (nested) return nested;
    }

    for (const nested of Object.values(record)) {
      const found = this.findStringField(nested, keys);
      if (found) return found;
    }

    return null;
  }

  private extractCliText(rawOutput: string): string {
    const trimmed = rawOutput.trim();
    if (!trimmed) return '';

    const candidates = [trimmed, ...trimmed.split(/\r?\n/).reverse()];
    for (const candidate of candidates) {
      try {
        const parsed: unknown = JSON.parse(candidate);
        const text = this.findStringField(parsed, [
          'result',
          'content',
          'message',
          'reply',
          'response',
          'text',
          'output',
        ]);
        if (text) return text;
      } catch {
        // Try the next candidate.
      }
    }

    return trimmed;
  }

  private buildProviderEnv(
    config: PlatformConfig,
    workspacePath: string,
    providerConfig?: ProviderConfig
  ): Record<string, string> {
    const env = getStringEnv();
    if (config.workspaceEnv) {
      env[config.workspaceEnv] = workspacePath;
    }

    if (providerConfig) {
      if (config.apiKeyEnv) {
        env[config.apiKeyEnv] = providerConfig.apiKey;
      }
      if (config.baseUrlEnv && providerConfig.baseUrl) {
        env[config.baseUrlEnv] = isKimiCodingProvider(providerConfig)
          ? ensureTrailingSlash(normalizeBaseUrl(providerConfig.baseUrl))
          : providerConfig.baseUrl;
      }

      if (config.apiKeyEnv === 'ANTHROPIC_API_KEY' && isKimiCodingProvider(providerConfig)) {
        env.ANTHROPIC_AUTH_TOKEN = providerConfig.apiKey;
      }
    }

    return env;
  }

  private buildOneShotArgs(
    platform: AgentPlatform,
    workspacePath: string,
    message: string,
    providerConfig?: ProviderConfig
  ): string[] {
    const model = getFirstModelId(providerConfig);

    if (platform === 'hermes') {
      return ['-z', message];
    }

    if (platform === 'claude-code') {
      const args = [
        '-p',
        message,
        `--add-dir=${workspacePath}`,
        '--output-format=json',
        '--no-chrome',
      ];
      if (isKimiCodingProvider(providerConfig)) {
        args.push('--bare');
      }
      if (model) {
        args.push('--model', model);
      }
      return args;
    }

    if (platform === 'codex') {
      const args = ['-y', '@openai/codex', '--print'];
      if (model) {
        args.push('--model', model);
      }
      args.push(message);
      return args;
    }

    if (platform === 'opencode') {
      const args = ['--print', message];
      if (model) {
        args.push('--model', model);
      }
      return args;
    }

    return PLATFORM_CONFIGS[platform].args(workspacePath, providerConfig);
  }

  private executeOneShotTurn(session: AgentSession, message: string): Promise<string> {
    const config = PLATFORM_CONFIGS[session.platform];
    const args = this.buildOneShotArgs(
      session.platform,
      session.workspacePath,
      message,
      session.providerConfig
    );
    const env = this.buildProviderEnv(config, session.workspacePath, session.providerConfig);

    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';

      const invocation = resolveCommandInvocation(config.command, args);
      const childProcess = spawn(invocation.command, invocation.args, {
        cwd: session.workspacePath,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: config.useShell ?? invocation.shell,
      });

      session.process = childProcess;
      childProcess.stdin?.end();

      childProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      childProcess.on('close', (code) => {
        session.process = null;
        if (session.status !== 'stopped') {
          session.status = code === 0 ? 'idle' : 'error';
        }

        if (code === 0) {
          resolve(this.extractCliText(output));
        } else {
          const outputText = this.extractCliText(output);
          const stderrText = cleanCliStderr(errorOutput);
          reject(new Error(outputText || stderrText || `${session.platform} exited with code ${code}`));
        }
      });

      childProcess.on('error', (error) => {
        session.process = null;
        session.status = 'error';
        reject(error);
      });
    });
  }

  private executeOpenClawTurn(session: AgentSession, message: string, timeoutMs = 300000): Promise<string> {
    const providerConfig = session.providerConfig;
    const sessionId = buildOpenClawSessionId(session.agentId, session.sessionId);
    prepareOpenClawProviderConfig(session.workspacePath, providerConfig);
    const messagePath = writeOpenClawRuntimeMessageFile(session.workspacePath, providerConfig, message);

    const commandParts = [
      'agent',
      '--local',
    ];

    commandParts.push(
      '--session-id',
      sessionId,
      '--message',
      OPENCLAW_MESSAGE_ARG_PLACEHOLDER
    );

    const commandSuffixParts = [
      '--timeout',
      String(Math.max(1, Math.ceil(timeoutMs / 1000))),
      '--json',
    ];

    const openClawArgs = [...commandParts, ...commandSuffixParts];
    const launcher: { command: string; args: string[]; env: Record<string, string>; shell: boolean } = isWindows
      ? (() => {
          const invocation = resolveCommandInvocation(
            getOpenClawCommand(),
            buildOpenClawNativeArgs(openClawArgs, messagePath)
          );
          return {
            ...invocation,
            env: buildOpenClawEnv(session.workspacePath, providerConfig, messagePath),
          };
        })()
      : (() => {
          const script = buildOpenClawShellScript(
            session.workspacePath,
            providerConfig,
            buildOpenClawFileMessageCommand(openClawArgs, messagePath)
          );
          const bashLauncher = getBashLauncher(script);
          return {
            ...bashLauncher,
            env: getStringEnv(),
            shell: false,
          };
        })();

    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      let settled = false;

      const childProcess = spawn(launcher.command, launcher.args, {
        cwd: session.workspacePath,
        env: launcher.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: launcher.shell,
      });

      session.process = childProcess;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        session.process = null;
        session.status = 'error';
        terminateProcessTree(childProcess);
        deleteOpenClawRuntimeMessageFile(messagePath);
        reject(new Error(`Command timed out after ${Math.ceil(timeoutMs / 1000)} seconds`));
      }, timeoutMs);

      childProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      childProcess.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        session.process = null;
        deleteOpenClawRuntimeMessageFile(messagePath);
        if (session.status !== 'stopped') {
          session.status = code === 0 ? 'idle' : 'error';
        }

        if (code === 0) {
          resolve(this.extractOpenClawText(output) || this.extractOpenClawText(errorOutput));
        } else {
          reject(new Error(errorOutput.trim() || output.trim() || `OpenClaw exited with code ${code}`));
        }
      });

      childProcess.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        session.process = null;
        session.status = 'error';
        deleteOpenClawRuntimeMessageFile(messagePath);
        reject(error);
      });
    });
  }

  /**
   * Execute a single message and return response
   * Used for platforms that work best with one-shot execution
   */
  async executeMessage(
    agentId: string,
    platform: AgentPlatform,
    workspacePath: string,
    message: string,
    providerConfig?: ProviderConfig,
    timeoutMs = 300000
  ): Promise<string> {
    const resolvedWorkspacePath = resolveHostPath(workspacePath);
    const resolvedProviderConfig = providerConfig
      ? {
          ...providerConfig,
          stateDir: providerConfig.stateDir ? resolveHostPath(providerConfig.stateDir) : undefined,
        }
      : undefined;

    if (!fs.existsSync(resolvedWorkspacePath)) {
      throw new Error(`Workspace not found: ${resolvedWorkspacePath}`);
    }

    const cliCheck = await this.checkCliAvailable(platform);
    if (!cliCheck.available) {
      throw new Error(formatCliHealthFailure(platform, cliCheck));
    }

    if (platform === 'openclaw') {
      const session: AgentSession = {
        sessionId: this.generateSessionId(),
        agentId,
        platform,
        workspacePath: resolvedWorkspacePath,
        process: null,
        status: 'waiting',
        startedAt: new Date(),
        providerConfig: resolvedProviderConfig,
      };
      return this.executeOpenClawTurn(session, message, timeoutMs);
    }

    const config = PLATFORM_CONFIGS[platform];
    
    // Build environment
    const env = this.buildProviderEnv(config, resolvedWorkspacePath, resolvedProviderConfig);

    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      let settled = false;

      const args = this.buildOneShotArgs(platform, resolvedWorkspacePath, message, resolvedProviderConfig);

      console.log(`Executing ${platform} one-shot command with ${args.length} args`);
      console.log(`Workspace: ${resolvedWorkspacePath}`);

      const invocation = resolveCommandInvocation(config.command, args);
      const childProcess = spawn(invocation.command, invocation.args, {
        cwd: resolvedWorkspacePath,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: config.useShell ?? invocation.shell,
      });

      childProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      childProcess.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (code === 0) {
          resolve(this.extractCliText(output));
        } else {
          const outputText = this.extractCliText(output);
          const stderrText = cleanCliStderr(errorOutput);
          reject(new Error(outputText || stderrText || `Process exited with code ${code}`));
        }
      });

      childProcess.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        terminateProcessTree(childProcess);
        reject(new Error(`Command timed out after ${Math.ceil(timeoutMs / 1000)} seconds`));
      }, timeoutMs);
    });
  }

  /**
   * Start a persistent interactive session
   */
  async startSession(
    agentId: string,
    platform: AgentPlatform,
    workspacePath: string,
    providerConfig?: ProviderConfig
  ): Promise<AgentSession> {
    const resolvedWorkspacePath = resolveHostPath(workspacePath);
    const resolvedProviderConfig = providerConfig
      ? {
          ...providerConfig,
          stateDir: providerConfig.stateDir ? resolveHostPath(providerConfig.stateDir) : undefined,
        }
      : undefined;

    if (!fs.existsSync(resolvedWorkspacePath)) {
      throw new Error(`Workspace not found: ${resolvedWorkspacePath}`);
    }

    const cliCheck = await this.checkCliAvailable(platform);
    if (!cliCheck.available) {
      throw new Error(formatCliHealthFailure(platform, cliCheck));
    }

    const sessionId = this.generateSessionId();
    const config = PLATFORM_CONFIGS[platform];

    if (platform === 'openclaw') {
      const session: AgentSession = {
        sessionId,
        agentId,
        platform,
        workspacePath: resolvedWorkspacePath,
        process: null,
        status: 'idle',
        startedAt: new Date(),
        providerConfig: resolvedProviderConfig,
      };

      this.sessions.set(sessionId, session);
      this.outputBuffers.set(sessionId, '');
      this.emit('sessionStart', { sessionId, agentId, platform });

      return session;
    }

    if (config.usePrintMode) {
      const session: AgentSession = {
        sessionId,
        agentId,
        platform,
        workspacePath: resolvedWorkspacePath,
        process: null,
        status: 'idle',
        startedAt: new Date(),
        providerConfig: resolvedProviderConfig,
      };

      this.sessions.set(sessionId, session);
      this.outputBuffers.set(sessionId, '');
      this.emit('sessionStart', { sessionId, agentId, platform });

      return session;
    }

    // Build environment with provider config
    const env = this.buildProviderEnv(config, resolvedWorkspacePath, resolvedProviderConfig);

    // For interactive sessions, just spawn and wait for messages
    const args = config.args(resolvedWorkspacePath, resolvedProviderConfig);

    const invocation = resolveCommandInvocation(config.command, args);
    const childProcess = spawn(invocation.command, invocation.args, {
      cwd: resolvedWorkspacePath,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: config.useShell ?? invocation.shell,
    });

    const session: AgentSession = {
      sessionId,
      agentId,
      platform,
      workspacePath: resolvedWorkspacePath,
      process: childProcess,
      status: 'running',
      startedAt: new Date(),
      providerConfig: resolvedProviderConfig,
    };

    this.sessions.set(sessionId, session);
    this.outputBuffers.set(sessionId, '');

    childProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.outputBuffers.set(sessionId, this.outputBuffers.get(sessionId)! + text);
      
      this.emit('response', {
        sessionId,
        response: {
          type: 'output',
          content: text,
          timestamp: new Date(),
        } as RunnerResponse,
      });
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      
      this.emit('response', {
        sessionId,
        response: {
          type: 'error',
          content: text,
          timestamp: new Date(),
        } as RunnerResponse,
      });
    });

    childProcess.on('exit', (code) => {
      const sess = this.sessions.get(sessionId);
      if (sess) {
        sess.process = null;
        sess.status = code === 0 ? 'idle' : 'error';
      }
      
      this.emit('response', {
        sessionId,
        response: {
          type: 'done',
          content: `Process exited with code ${code}`,
          timestamp: new Date(),
        } as RunnerResponse,
      });
      
      this.emit('sessionEnd', { sessionId, exitCode: code });
      
      setTimeout(() => {
        this.sessions.delete(sessionId);
        this.outputBuffers.delete(sessionId);
      }, 60000);
    });

    this.emit('sessionStart', { sessionId, agentId, platform });

    return session;
  }

  sendMessage(sessionId: string, message: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (session.platform === 'openclaw') {
      if (session.status === 'waiting') {
        this.emit('response', {
          sessionId,
          response: {
            type: 'error',
            content: 'OpenClaw is still processing the previous message.',
            timestamp: new Date(),
          } as RunnerResponse,
        });
        return true;
      }

      session.status = 'waiting';
      void this.executeOpenClawTurn(session, message)
        .then((content) => {
          const text = content || 'OpenClaw completed without output.';
          this.outputBuffers.set(sessionId, `${this.outputBuffers.get(sessionId) || ''}${text}`);
          this.emit('response', {
            sessionId,
            response: {
              type: 'output',
              content: text,
              timestamp: new Date(),
            } as RunnerResponse,
          });
        })
        .catch((error: unknown) => {
          const content = error instanceof Error ? error.message : 'OpenClaw failed to process the message.';
          this.emit('response', {
            sessionId,
            response: {
              type: 'error',
              content,
              timestamp: new Date(),
            } as RunnerResponse,
          });
      });
      return true;
    }

    const config = PLATFORM_CONFIGS[session.platform];
    if (config.usePrintMode) {
      if (session.status === 'waiting') {
        this.emit('response', {
          sessionId,
          response: {
            type: 'error',
            content: `${session.platform} is still processing the previous message.`,
            timestamp: new Date(),
          } as RunnerResponse,
        });
        return true;
      }

      session.status = 'waiting';
      void this.executeOneShotTurn(session, message)
        .then((content) => {
          const text = content || `${session.platform} completed without output.`;
          this.outputBuffers.set(sessionId, `${this.outputBuffers.get(sessionId) || ''}${text}`);
          this.emit('response', {
            sessionId,
            response: {
              type: 'output',
              content: text,
              timestamp: new Date(),
            } as RunnerResponse,
          });
        })
        .catch((error: unknown) => {
          const content = error instanceof Error ? error.message : `${session.platform} failed to process the message.`;
          this.emit('response', {
            sessionId,
            response: {
              type: 'error',
              content,
              timestamp: new Date(),
            } as RunnerResponse,
          });
        });
      return true;
    }

    if (!session.process || session.process.stdin === null) {
      return false;
    }

    try {
      session.process.stdin.write(message + '\n');
      session.status = 'waiting';
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }

  getBufferedOutput(sessionId: string): string {
    return this.outputBuffers.get(sessionId) || '';
  }

  clearBuffer(sessionId: string): void {
    this.outputBuffers.set(sessionId, '');
  }

  async stopSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      if (session.process) {
        session.process.stdin?.write('\x03');
        session.process.stdin?.write('exit\n');
        
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        if (!session.process.killed) {
          session.process.kill('SIGTERM');
        }
        session.process = null;
      }
      
      session.status = 'stopped';
      return true;
    } catch (error) {
      console.error('Failed to stop session:', error);
      return false;
    }
  }

  getSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByAgentId(agentId: string): AgentSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.agentId === agentId) {
        return session;
      }
    }
    return undefined;
  }

  getActiveSessions(): AgentSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === 'running' || s.status === 'waiting'
    );
  }

  async stopSessionsByAgentId(agentId: string): Promise<number> {
    const sessionIds = Array.from(this.sessions.values())
      .filter((session) => session.agentId === agentId)
      .map((session) => session.sessionId);

    for (const sessionId of sessionIds) {
      await this.stopSession(sessionId);
    }

    return sessionIds.length;
  }

  async stopAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.stopSession(sessionId);
    }
  }
}

export const agentRunner = new AgentRunner();

export default agentRunner;
