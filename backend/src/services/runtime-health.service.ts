import { agentRunner, type AgentPlatform, type CliHealthCheck } from './agent-runner.service.js';
import { getUserProviders } from './provider.service.js';

type ProviderType = 'claude' | 'codex' | 'opencode' | 'openclaw' | 'hermes';

interface RuntimePlatformSpec {
  platform: AgentPlatform;
  label: string;
  providerType: ProviderType;
  envVarNames: string[];
  installHint: string;
}

export interface RuntimePlatformHealth {
  platform: AgentPlatform;
  label: string;
  providerType: ProviderType;
  cli: {
    available: boolean;
    version: string;
  } & Pick<
    CliHealthCheck,
    | 'command'
    | 'args'
    | 'displayCommand'
    | 'usesWsl'
    | 'errorName'
    | 'errorCode'
    | 'errorMessage'
    | 'status'
    | 'signal'
    | 'stderr'
    | 'stdout'
  >;
  provider: {
    configuredCount: number;
    envConfigured: boolean;
    envVarNames: string[];
  };
  ready: boolean;
  issues: string[];
  installHint: string;
}

export interface RuntimeHealthSummary {
  total: number;
  ready: number;
  missingCli: number;
  missingProvider: number;
}

export interface RuntimeHealth {
  checkedAt: string;
  platforms: RuntimePlatformHealth[];
  summary: RuntimeHealthSummary;
}

const RUNTIME_PLATFORM_SPECS: RuntimePlatformSpec[] = [
  {
    platform: 'claude-code',
    label: 'Claude Code',
    providerType: 'claude',
    envVarNames: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
    installHint: '安装 Claude Code CLI，并确保 claude 在 PATH 中可执行。',
  },
  {
    platform: 'codex',
    label: 'Codex',
    providerType: 'codex',
    envVarNames: ['OPENAI_API_KEY'],
    installHint: '确保 Node.js/npx 可用，并能运行 @openai/codex。',
  },
  {
    platform: 'opencode',
    label: 'OpenCode',
    providerType: 'opencode',
    envVarNames: ['OPENAI_API_KEY'],
    installHint: '安装 OpenCode CLI，并确保 opencode 在 PATH 中可执行。',
  },
  {
    platform: 'hermes',
    label: 'Hermes',
    providerType: 'hermes',
    envVarNames: ['HERMES_API_KEY'],
    installHint: '安装 Hermes CLI，并确保 hermes 在 PATH 中可执行。',
  },
  {
    platform: 'openclaw',
    label: 'OpenClaw',
    providerType: 'openclaw',
    envVarNames: ['OPENCLAW_API_KEY', 'OPENAI_API_KEY'],
    installHint: '安装 OpenClaw CLI，并确保 openclaw 在当前系统 PATH 中可执行；Windows 桌面端使用本机 CLI，不依赖 WSL。',
  },
];

function hasEnvValue(names: string[]): boolean {
  return names.some((name) => typeof process.env[name] === 'string' && process.env[name]!.trim().length > 0);
}

function cliIssueMessage(spec: RuntimePlatformSpec, cli: CliHealthCheck): string {
  const detail = cli.stderr || cli.errorMessage || cli.stdout || '';

  if (cli.errorCode === 'ENOENT') {
    return `${spec.label} CLI 未找到：${cli.command} 不在 PATH 中。`;
  }
  if (cli.errorCode === 'EINVAL') {
    return `${spec.label} CLI 启动失败：spawn EINVAL，通常是命令路径或当前系统启动参数不可执行。`;
  }
  if (cli.usesWsl) {
    return `CLI 预检失败：${detail || cli.displayCommand}`;
  }
  if (cli.status != null) {
    return `${spec.label} CLI 预检退出码 ${cli.status}：${detail || cli.displayCommand}`;
  }
  if (cli.signal) {
    return `${spec.label} CLI 预检被信号 ${cli.signal} 终止。`;
  }
  return `${spec.label} CLI 预检失败：${detail || cli.errorCode || cli.errorName || cli.displayCommand}`;
}

export async function getRuntimeHealth(userId: string): Promise<RuntimeHealth> {
  const providers = await getUserProviders(userId);
  const providerCounts = new Map<ProviderType, number>();

  for (const provider of providers) {
    const type = provider.type as ProviderType;
    providerCounts.set(type, (providerCounts.get(type) || 0) + 1);
  }

  const platforms = await Promise.all(
    RUNTIME_PLATFORM_SPECS.map(async (spec): Promise<RuntimePlatformHealth> => {
      const cli = await agentRunner.checkCliAvailable(spec.platform);
      const configuredCount = providerCounts.get(spec.providerType) || 0;
      const envConfigured = hasEnvValue(spec.envVarNames);
      const issues: string[] = [];

      if (!cli.available) {
        issues.push(cliIssueMessage(spec, cli));
      }
      if (configuredCount === 0 && !envConfigured) {
        issues.push('未配置该平台供应商，也没有可用的环境变量兜底。');
      }

      return {
        platform: spec.platform,
        label: spec.label,
        providerType: spec.providerType,
        cli,
        provider: {
          configuredCount,
          envConfigured,
          envVarNames: spec.envVarNames,
        },
        ready: issues.length === 0,
        issues,
        installHint: spec.installHint,
      };
    })
  );

  return {
    checkedAt: new Date().toISOString(),
    platforms,
    summary: {
      total: platforms.length,
      ready: platforms.filter((item) => item.ready).length,
      missingCli: platforms.filter((item) => !item.cli.available).length,
      missingProvider: platforms.filter((item) => item.provider.configuredCount === 0 && !item.provider.envConfigured).length,
    },
  };
}
