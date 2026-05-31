/**
 * Agent Runner Service - CLI-based Agent Process Management
 * 
 * Manages spawning and communicating with agent CLI processes
 * for platforms: Claude Code, OpenClaw, Codex, Hermes, OpenCode
 * 
 * Supports both Windows and Linux environments
 */

import { spawn, ChildProcess, execFileSync, execSync } from 'child_process';
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
    models?: string[];
    stateDir?: string | null;
  };
}

export interface RunnerResponse {
  type: 'output' | 'error' | 'status' | 'done';
  content: string;
  timestamp: Date;
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

interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  models?: string[];
  stateDir?: string | null;
}

// Detect platform
const isWindows = os.platform() === 'win32';
const OPENCLAW_PROXY_PROVIDER_ID = 'openclaw_proxy';

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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function getOpenClawStateDir(workspacePath: string, providerConfig?: ProviderConfig): string {
  const stateDir = providerConfig?.stateDir || process.env.OPENCLAW_STATE_DIR;
  return resolveHostPath(stateDir || path.join(workspacePath, '.openclaw'));
}

function getOpenClawConfigPath(workspacePath: string, providerConfig?: ProviderConfig): string {
  return path.join(getOpenClawStateDir(workspacePath, providerConfig), 'openclaw.json');
}

function prepareOpenClawProviderConfig(workspacePath: string, providerConfig?: ProviderConfig): void {
  const model = providerConfig?.models?.[0];
  if (!providerConfig?.baseUrl || !model) {
    return;
  }

  const stateDir = getOpenClawStateDir(workspacePath, providerConfig);
  const configPath = getOpenClawConfigPath(workspacePath, providerConfig);
  const authProfilesPath = path.join(stateDir, 'agents', 'main', 'agent', 'auth-profiles.json');

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.mkdirSync(path.dirname(authProfilesPath), { recursive: true });

  const config = {
    agents: {
      defaults: {
        workspace: toWslPath(workspacePath),
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
          baseUrl: providerConfig.baseUrl,
          api: 'openai-responses',
          models: [
            {
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
              maxTokens: 32768,
              api: 'openai-responses',
            },
          ],
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
  return isWindows
    ? { command: 'wsl', args: ['bash', '-lc', script] }
    : { command: 'bash', args: ['-lc', script] };
}

function getStringEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }
  return env;
}

const PLATFORM_CONFIGS: Record<AgentPlatform, PlatformConfig> = {
  'claude-code': {
    command: 'claude',
    args: (workspace) => ['-p', `--add-dir=${workspace}`],
    interactive: true,
    checkCommand: 'claude',
    versionFlag: '--version',
    usePrintMode: true,
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  'openclaw': {
    command: isWindows ? 'wsl' : 'bash',
    args: (workspace, providerConfig) => {
      const script = buildOpenClawShellScript(
        workspace,
        providerConfig,
        'exec openclaw tui --local --session main'
      );
      return isWindows ? ['bash', '-lc', script] : ['-lc', script];

      // 转换 Windows 路径为 WSL 路径格式
      // J:\path -> /mnt/j/path
      const wslWorkspace = workspace
        .replace(/^([A-Za-z]):/, (_match, letter) => `/mnt/${String(letter).toLowerCase()}`)
        .replace(/\\/g, '/');

      const apiKey = providerConfig?.apiKey || process.env.OPENCLAW_API_KEY || '';
      const baseUrl = providerConfig?.baseUrl || '';

      // Optional: per-agent isolated state dir
      const stateDir = providerConfig?.stateDir || process.env.OPENCLAW_STATE_DIR || '';
      const stateDirStr = typeof stateDir === 'string' ? stateDir : '';
      const wslStateDir = stateDirStr
        ? stateDirStr
            .replace(/^([A-Za-z]):/, (_match, letter) => `/mnt/${String(letter).toLowerCase()}`)
            .replace(/\\/g, '/')
        : '';

      // 完整的 openclaw 启动流程：
      // 1. 启动 gateway
      // 2. 等待网关就绪
      // 3. 切换到 workspace 目录
      // 4. 启动 tui（会自动使用当前目录作为 workspace）
      return [
        'bash', '-c',
        `export OPENCLAW_API_KEY=\"${apiKey}\" && ` +
        (baseUrl ? `export OPENCLAW_BASE_URL=\"${baseUrl}\" && ` : '') +
        (wslStateDir ? `export OPENCLAW_STATE_DIR=\"${wslStateDir}\" && ` : '') +
        `openclaw gateway & ` +
        `sleep 4 && ` +
        `cd \"${wslWorkspace}\" && ` +
        `openclaw tui`
      ];
    },
    interactive: true,
    workspaceEnv: 'OPENCLAW_WORKSPACE_DIR',
    checkCommand: isWindows ? 'wsl' : 'openclaw',
    versionFlag: '--version',
    useShell: false,
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
    command: 'opencode',
    args: () => ['--print'],
    interactive: false,
    checkCommand: 'opencode',
    versionFlag: '--version',
    usePrintMode: true,
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrlEnv: 'OPENAI_BASE_URL',
  },
};

class AgentRunner extends EventEmitter {
  private sessions: Map<string, AgentSession> = new Map();
  private outputBuffers: Map<string, string> = new Map();

  async checkCliAvailable(platform: AgentPlatform): Promise<{ available: boolean; version: string }> {
    const config = PLATFORM_CONFIGS[platform];
    
    try {
      if (platform === 'openclaw') {
        const output = isWindows
          ? execFileSync('wsl', ['bash', '-lc', 'command -v openclaw >/dev/null && openclaw --version'], {
              encoding: 'utf-8',
              timeout: 5000,
              stdio: ['pipe', 'pipe', 'pipe'],
            })
          : execFileSync('openclaw', ['--version'], {
              encoding: 'utf-8',
              timeout: 5000,
              stdio: ['pipe', 'pipe', 'pipe'],
            });
        return { available: true, version: output.trim() };
      }

      const output = execSync(`${config.checkCommand} ${config.versionFlag}`, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { available: true, version: output.trim() };
    } catch (error) {
      return { available: false, version: '' };
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

    const candidates = [trimmed, ...trimmed.split(/\r?\n/).reverse()];
    for (const candidate of candidates) {
      try {
        const parsed: unknown = JSON.parse(candidate);
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

  private executeOpenClawTurn(session: AgentSession, message: string): Promise<string> {
    const providerConfig = session.providerConfig;
    const sessionKey = `agent:${session.agentId}:main`;
    prepareOpenClawProviderConfig(session.workspacePath, providerConfig);

    const configuredModel = providerConfig?.models?.[0];
    const model = configuredModel && providerConfig?.baseUrl
      ? `${OPENCLAW_PROXY_PROVIDER_ID}/${configuredModel}`
      : configuredModel;
    const commandParts = [
      'openclaw',
      'agent',
      '--local',
      '--session-key',
      sessionKey,
      '--message',
      message,
      '--timeout',
      '600',
      '--json',
    ];

    if (model) {
      commandParts.splice(3, 0, '--model', model);
    }

    const script = buildOpenClawShellScript(
      session.workspacePath,
      providerConfig,
      `exec ${commandParts.map(shellQuote).join(' ')}`
    );
    const launcher = getBashLauncher(script);

    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';

      const childProcess = spawn(launcher.command, launcher.args, {
        cwd: session.workspacePath,
        env: getStringEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });

      session.process = childProcess;

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
          resolve(this.extractOpenClawText(output));
        } else {
          reject(new Error(errorOutput.trim() || output.trim() || `OpenClaw exited with code ${code}`));
        }
      });

      childProcess.on('error', (error) => {
        session.process = null;
        session.status = 'error';
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
    message: string
  ): Promise<string> {
    const resolvedWorkspacePath = resolveHostPath(workspacePath);

    if (!fs.existsSync(resolvedWorkspacePath)) {
      throw new Error(`Workspace not found: ${resolvedWorkspacePath}`);
    }

    const cliCheck = await this.checkCliAvailable(platform);
    if (!cliCheck.available) {
      throw new Error(`${platform} CLI is not installed or not in PATH`);
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
      };
      return this.executeOpenClawTurn(session, message);
    }

    const config = PLATFORM_CONFIGS[platform];
    const baseArgs = config.args(resolvedWorkspacePath);
    
    // Build environment
    const env = getStringEnv();
    if (config.workspaceEnv) {
      env[config.workspaceEnv] = resolvedWorkspacePath;
    }

    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';

      // Determine args based on platform
      let args: string[];
      
      if (platform === 'hermes') {
        // Hermes uses -z for one-shot mode
        args = ['-z', message, ...baseArgs];
      } else if (platform === 'claude-code') {
        // Claude Code -p mode with message as argument
        args = ['-p', message, `--add-dir=${resolvedWorkspacePath}`, '--output-format=json', '--no-chrome'];
      } else if (platform === 'codex') {
        // Codex --print mode
        args = ['-y', '@openai/codex', '--print', message];
      } else if (platform === 'opencode') {
        // OpenCode --print mode
        args = ['--print', message];
      } else {
        args = baseArgs;
      }

      console.log(`Executing: ${config.command} ${args.join(' ')}`);
      console.log(`Workspace: ${resolvedWorkspacePath}`);

      const childProcess = spawn(config.command, args, {
        cwd: resolvedWorkspacePath,
        env,
        shell: config.useShell ?? true,
      });

      childProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(errorOutput || `Process exited with code ${code}`));
        }
      });

      childProcess.on('error', (error) => {
        reject(error);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        childProcess.kill();
        reject(new Error('Command timed out after 5 minutes'));
      }, 300000);
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
      throw new Error(`${platform} CLI is not installed or not in PATH`);
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

    // Build environment with provider config
    const env = getStringEnv();
    if (config.workspaceEnv) {
      env[config.workspaceEnv] = resolvedWorkspacePath;
    }

    // Set API key and base URL from provider config
    if (resolvedProviderConfig) {
      if (config.apiKeyEnv) {
        env[config.apiKeyEnv] = resolvedProviderConfig.apiKey;
      }
      if (config.baseUrlEnv && resolvedProviderConfig.baseUrl) {
        env[config.baseUrlEnv] = resolvedProviderConfig.baseUrl;
      }
    }

    // For interactive sessions, just spawn and wait for messages
    const args = config.args(resolvedWorkspacePath, resolvedProviderConfig);

    const childProcess = spawn(config.command, args, {
      cwd: resolvedWorkspacePath,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: config.useShell ?? true,
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

  async stopAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.stopSession(sessionId);
    }
  }
}

export const agentRunner = new AgentRunner();

process.on('SIGINT', async () => {
  console.log('Shutting down agent runner...');
  await agentRunner.stopAll();
  process.exit(0);
});

export default agentRunner;
