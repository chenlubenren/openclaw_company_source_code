import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WorkflowDsl } from '../services/workflow-executor.service.js';

if (os.platform() !== 'win32') {
  console.log(JSON.stringify({
    skipped: true,
    reason: 'Windows-only smoke test.',
    platform: os.platform(),
  }, null, 2));
  process.exit(0);
}

const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-no-wsl-'));
const appData = path.join(tempRoot, 'AppData', 'Roaming');
const fakeNpmDir = path.join(appData, 'npm');
const fakeOpenClawBinDir = path.join(fakeNpmDir, 'node_modules', 'openclaw', 'bin');
const fakeLogPath = path.join(tempRoot, 'openclaw-calls.jsonl');
const fakeWslLogPath = path.join(tempRoot, 'wsl-called.txt');
const workspacePath = path.join(tempRoot, 'workspace');
const directStateDir = path.join(tempRoot, 'direct-state');

fs.mkdirSync(fakeOpenClawBinDir, { recursive: true });
fs.mkdirSync(workspacePath, { recursive: true });

const fakeOpenClawEntry = path.join(fakeOpenClawBinDir, 'openclaw.js');
fs.writeFileSync(fakeOpenClawEntry, [
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  "const argv = process.argv.slice(2);",
  "const logPath = process.env.OPENCLAW_FAKE_LOG;",
  "if (logPath) {",
  "  fs.appendFileSync(logPath, JSON.stringify({",
  "    argv,",
  "    cwd: process.cwd(),",
  "    workspace: process.env.OPENCLAW_WORKSPACE_DIR,",
  "    stateDir: process.env.OPENCLAW_STATE_DIR,",
  "    configPath: process.env.OPENCLAW_CONFIG_PATH,",
  "    messageFile: process.env.OPENCLAW_RUNTIME_MESSAGE_FILE,",
  "  }) + '\\n');",
  "}",
  "if (argv.includes('--version')) { console.log('openclaw fake 1.0.0'); process.exit(0); }",
  "if (argv[0] !== 'agent') { console.error(`unexpected fake openclaw command: ${argv.join(' ')}`); process.exit(2); }",
  "const messageIndex = argv.indexOf('--message');",
  "const message = messageIndex >= 0 ? argv[messageIndex + 1] || '' : '';",
  "if (!message || message === '__OPENCLAW_RUNTIME_MESSAGE__') { console.error('runtime message was not materialized'); process.exit(3); }",
  "console.error('[tools] fake OpenClaw warning before JSON');",
  "console.error(JSON.stringify({ payloads: [{ text: `fake openclaw response: ${message.slice(0, 80)}` }], meta: { stream: 'stderr' } }, null, 2));",
].join('\n'), 'utf-8');

fs.writeFileSync(path.join(fakeNpmDir, 'openclaw.cmd'), [
  '@ECHO off',
  'SETLOCAL',
  'CALL :find_dp0',
  'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"',
  ') ELSE (',
  '  SET "_prog=node"',
  '  SET PATHEXT=%PATHEXT:;.JS;=;%',
  ')',
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%" "%dp0%\\node_modules\\openclaw\\bin\\openclaw.js" %*',
  ':find_dp0',
  'SET dp0=%~dp0',
  'EXIT /b',
].join('\r\n'), 'utf-8');

fs.writeFileSync(path.join(fakeNpmDir, 'wsl.cmd'), [
  '@ECHO off',
  'echo WSL SHOULD NOT RUN > "%OPENCLAW_FAKE_WSL_LOG%"',
  'exit /b 99',
].join('\r\n'), 'utf-8');

const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH';
process.env.APPDATA = appData;
process.env[pathKey] = fakeNpmDir;
process.env.PATH = fakeNpmDir;
process.env.OPENCLAW_FAKE_LOG = fakeLogPath;
process.env.OPENCLAW_FAKE_WSL_LOG = fakeWslLogPath;
process.env.WORKFLOW_DRY_RUN_NODE_DELAY_MS = '1';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function readFakeCalls(): Array<{
  argv: string[];
  cwd: string;
  workspace?: string;
  stateDir?: string;
  configPath?: string;
  messageFile?: string;
}> {
  if (!fs.existsSync(fakeLogPath)) return [];
  return fs
    .readFileSync(fakeLogPath, 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function assertWindowsPath(value: string | undefined, label: string) {
  assert(value, `${label} was not set.`);
  assert(!value.startsWith('/mnt/'), `${label} unexpectedly used a WSL path: ${value}`);
  assert(/^[A-Za-z]:[\\/]/.test(value), `${label} was not a Windows path: ${value}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExecution(id: string, userId: string, workflowExecutor: any) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const execution = workflowExecutor.get(id, userId);
    if (!execution) throw new Error(`Execution disappeared: ${id}`);
    if (!['queued', 'running'].includes(execution.status)) return execution;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for execution ${id}`);
}

async function main() {
  const { agentRunner } = await import('../services/agent-runner.service.js');
  const { getRuntimeHealth } = await import('../services/runtime-health.service.js');
  const { createUser } = await import('../services/auth.service.js');
  const { createProvider } = await import('../services/provider.service.js');
  const { createAgent, deleteAgent } = await import('../services/agent.service.js');
  const { workflowExecutor } = await import('../services/workflow-executor.service.js');
  const { getRawDb } = await import('../db/index.js');

  let userId = '';
  const createdAgentIds: string[] = [];

  try {
    const cli = await agentRunner.checkCliAvailable('openclaw');
    assert(cli.available, `OpenClaw fake CLI should be available: ${JSON.stringify(cli)}`);
    assert(cli.usesWsl === false, 'OpenClaw CLI health unexpectedly uses WSL.');
    assert(!/^wsl(?:\.exe|\.cmd)?$/i.test(path.basename(cli.command)), `OpenClaw health used WSL: ${cli.command}`);

    const direct = await agentRunner.executeMessage(
      'smoke-direct-openclaw',
      'openclaw',
      workspacePath,
      'Direct Windows no WSL smoke message.',
      {
        apiKey: 'sk-smoke-openclaw-fake',
        baseUrl: 'https://example.test/v1',
        models: ['fake-model'],
        stateDir: directStateDir,
      },
      5000
    );
    assert(direct.includes('fake openclaw response'), `Unexpected direct response: ${direct}`);
    assert(!direct.includes('[tools]'), `Direct response leaked OpenClaw warning text: ${direct}`);
    assert(!direct.includes('"payloads"'), `Direct response leaked raw OpenClaw JSON: ${direct}`);

    const directConfigPath = path.join(directStateDir, 'openclaw.json');
    assert(fs.existsSync(directConfigPath), 'Direct OpenClaw config was not written.');
    const directConfig = JSON.parse(fs.readFileSync(directConfigPath, 'utf-8'));
    assertWindowsPath(directConfig?.agents?.defaults?.workspace, 'OpenClaw config workspace');

    const user = await createUser({
      email: `windows-no-wsl-${unique}@example.test`,
      username: `wnw${unique.slice(-10)}`,
      password: 'smoke-password',
    });
    userId = user.id;

    const provider = await createProvider(userId, {
      name: `Windows No WSL OpenClaw ${unique}`,
      type: 'openclaw',
      apiKey: 'sk-smoke-openclaw-provider',
      baseUrl: 'https://example.test/v1',
      models: ['fake-model'],
    });

    const runtimeHealth = await getRuntimeHealth(userId);
    const openClawHealth = runtimeHealth.platforms.find((item) => item.platform === 'openclaw');
    assert(openClawHealth, 'Runtime health did not include OpenClaw.');
    assert(openClawHealth.cli.available, `Runtime health did not see fake OpenClaw CLI: ${JSON.stringify(openClawHealth.cli)}`);
    assert(openClawHealth.cli.usesWsl === false, 'Runtime health unexpectedly marked OpenClaw as using WSL.');
    assert((openClawHealth.provider.configuredCount || 0) >= 1, 'Runtime health did not count the OpenClaw provider.');

    const agent = await createAgent(userId, {
      name: `Windows No WSL Agent ${unique}`,
      description: 'Smoke agent that proves OpenClaw runs natively on Windows.',
      providerId: provider.id,
      manifest: {
        schemaVersion: '1.0',
        name: 'Windows No WSL Agent',
        entrypoint: { type: 'openclaw' },
        capabilities: ['workflow'],
      },
    });
    createdAgentIds.push(agent.id);

    const workflowDsl: WorkflowDsl = {
      schemaVersion: '1.0',
      name: 'Windows No WSL Runtime Smoke',
      description: 'Verifies team workflow execution can call native Windows OpenClaw.',
      entryNodeId: 'node-start',
      nodes: [
        { id: 'node-start', type: 'start', label: 'Start' },
        {
          id: 'agent-openclaw',
          type: 'agent',
          label: 'Native OpenClaw Agent',
          kind: 'worker',
          role: 'Return a fake native OpenClaw response.',
          agentInstanceId: agent.id,
        },
        { id: 'node-end', type: 'end', label: 'End' },
      ],
      edges: [
        { id: 'edge-start-agent', from: 'node-start', to: 'agent-openclaw' },
        { id: 'edge-agent-end', from: 'agent-openclaw', to: 'node-end' },
      ],
      execution: {
        mode: 'dag',
        maxConcurrency: 1,
        timeoutSec: 5,
      },
    };

    const started = await workflowExecutor.start({
      userId,
      architectureId: 'smoke-windows-no-wsl-runtime',
      workflowDsl,
      task: 'Run the fake OpenClaw agent through the team workflow executor.',
      dryRun: false,
    });
    const execution = await waitForExecution(started.id, userId, workflowExecutor);
    assert(execution.status === 'succeeded', `Workflow expected succeeded, got ${execution.status}: ${execution.error || ''}`);
    assert(
      execution.nodeStates['agent-openclaw']?.output?.includes('fake openclaw response'),
      'Workflow agent node did not receive fake OpenClaw output.'
    );
    assert(
      !execution.nodeStates['agent-openclaw']?.output?.includes('"payloads"'),
      'Workflow agent node leaked raw OpenClaw JSON.'
    );

    const calls = readFakeCalls();
    const agentCalls = calls.filter((call) => call.argv[0] === 'agent');
    assert(agentCalls.length >= 2, `Expected direct and workflow OpenClaw agent calls, got ${agentCalls.length}.`);
    for (const call of agentCalls) {
      const messageIndex = call.argv.indexOf('--message');
      const sessionIdIndex = call.argv.indexOf('--session-id');
      assert(messageIndex >= 0, `OpenClaw agent call missed --message: ${JSON.stringify(call.argv)}`);
      assert(!call.argv.includes('--model'), `OpenClaw CLI should read model config from openclaw.json, not --model: ${JSON.stringify(call.argv)}`);
      assert(!call.argv.includes('--session-key'), `OpenClaw CLI should use --session-id, not --session-key: ${JSON.stringify(call.argv)}`);
      assert(sessionIdIndex >= 0, `OpenClaw agent call missed --session-id: ${JSON.stringify(call.argv)}`);
      assert(call.argv[messageIndex + 1] !== '__OPENCLAW_RUNTIME_MESSAGE__', 'OpenClaw message placeholder leaked into native Windows CLI args.');
      assert(/^agent-[a-f0-9]{32}$/.test(call.argv[sessionIdIndex + 1] || ''), `OpenClaw session id should be CLI-safe: ${JSON.stringify(call.argv)}`);
      assertWindowsPath(call.workspace, 'OpenClaw env workspace');
      assertWindowsPath(call.stateDir, 'OpenClaw env stateDir');
      assertWindowsPath(call.configPath, 'OpenClaw env configPath');
    }

    assert(!fs.existsSync(fakeWslLogPath), 'WSL shim was executed; Windows no-WSL runtime path regressed.');

    console.log(JSON.stringify({
      windowsNoWslRuntimeVerified: true,
      openClawHealthCommand: cli.command,
      runtimeHealthOpenClawReady: openClawHealth.ready,
      directResponseVerified: true,
      workflowStatus: execution.status,
      fakeOpenClawCalls: calls.length,
      fakeOpenClawAgentCalls: agentCalls.length,
      wslCalled: false,
    }, null, 2));
  } finally {
    for (const agentId of createdAgentIds) {
      if (userId) {
        await deleteAgent(agentId, userId).catch(() => undefined);
      }
    }
    if (userId) {
      const db = getRawDb();
      db.prepare('DELETE FROM providers WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
