import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  createAgent,
  createCave,
  getUserAgents,
  moveAgentToCave,
  readAgentUserConfig,
  updateAgentConfig,
  type CreateAgentDto,
} from './agent.service.js';
import type { UserAgentInstance } from '../db/schema.js';
import { createArchitecture } from './architecture.service.js';
import { resolveStoredPath } from './workspace.service.js';
import type { WorkflowAgentKind, WorkflowDsl } from './workflow-executor.service.js';

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ==================== Team Template Types ====================

export interface TeamTemplateMember {
  roleCode: string;
  name: string;
  description: string;
  skills: string[];
  /** Hex color for visual identity in graph */
  color: string;
  /** Optional per-agent avatar used when materializing the team. */
  avatar?: string;
  /** Agent runtime platform; defaults to the team's platform when omitted. */
  platform?: 'openclaw' | 'opencode' | 'hermes' | 'codex' | 'claude-code';
}

export interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  /** Default platform for members that don't specify their own. */
  platform: 'openclaw' | 'opencode' | 'hermes' | 'codex' | 'claude-code';
  color: string;
  avatar: string;
  memberCount: number;
  tags: string[];
  members: TeamTemplateMember[];
  workflow: {
    description: string;
    stages: string[];
  };
  communication: {
    mode: string;
    description: string;
  };
  isolation: {
    description: string;
  };
}

export interface TeamTemplateArchitectureAgent {
  id: string;
  nodeId: string;
  name: string;
  role: string;
  kind: WorkflowAgentKind;
  isManager: boolean;
  linkedLobsterId?: string;
  avatar?: string;
  roleCode: string;
  color: string;
  status: 'standby';
}

export interface TeamTemplateCanvasNode {
  id: string;
  type: 'startNode' | 'agentNode' | 'endNode';
  data: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface TeamTemplateCanvasEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface TeamTemplateWithGraph extends TeamTemplate {
  agents: TeamTemplateArchitectureAgent[];
  nodes: TeamTemplateCanvasNode[];
  edges: TeamTemplateCanvasEdge[];
  workflowDsl: WorkflowDsl;
}

export interface AdoptTeamResult {
  success: boolean;
  caveId?: string;
  caveName?: string;
  teamId?: string;
  agentIds?: string[];
  error?: string;
}

export type DuplicateAgentMode = 'clone' | 'share-config';

export interface DuplicateAgentChoice {
  roleCode: string;
  existingAgentId: string;
  mode: DuplicateAgentMode;
}

export interface DuplicateTeamAgent {
  roleCode: string;
  templateName: string;
  existingAgentId: string;
  existingAgentName: string;
}

// ==================== Template Data ====================

const AI_MED_RESEARCH_TEAM: TeamTemplate = {
  id: 'tpl-ai-med-research-4oc',
  name: 'AI-Med 科研团队',
  description: '基于传统机器学习的医学数据科研团队。4 个 OpenClaw Agent 分工协作：首席研究员定方向、文献员查资料、实验员跑实验、写作员撰论文，全自动科研流水线。',
  category: '科研',
  platform: 'openclaw',
  color: '#10B981',
  avatar: '/claw_profile/03.png',
  memberCount: 4,
  tags: ['科研', '医学AI', '机器学习', '多Agent协作', 'OpenClaw'],
  members: [
    {
      roleCode: 'OC-PI',
      name: '首席研究员 (PI)',
      description: '负责课题选定、研究方向把控、三次门控评审（文献/实验/论文），维护流水线状态。不写代码、不做实验、不写论文——只做"学术质检"。',
      skills: [
        'pi-gate — 三阶段门控评审（文献 / 实验 / 论文）',
        'pi-direction — 设定研究方向和主题',
        'pipeline-coordinator — 维护 PIPELINE_STATE.json 状态机',
        'research-review — 文献质量审查',
        'novelty-check — 创新性评估',
        'auto-review-loop — 自动审查循环',
      ],
      color: '#EF4444',
      avatar: '/claw_profile/lobster-captain-coral.png',
    },
    {
      roleCode: 'OC-LIT',
      name: '文献研究员 (LIT)',
      description: '执行系统性文献检索（PubMed/arXiv/Semantic Scholar）、缺口分析、方法提议和实验计划设计。产出物写入 01-literature/ 目录。',
      skills: [
        'literature-search — PRISMA 系统文献检索',
        'systematic-review — 系统性综述',
        'verify-citations — 引用验证',
        'arxiv — arXiv 论文检索',
        'experiment-plan — 实验计划设计',
        'hypothesis-formulation — 假设构建',
        'meta-analysis — 荟萃分析',
        'idea-discovery — 创意发现',
      ],
      color: '#3B82F6',
      avatar: '/claw_profile/squid-research-silver.png',
    },
    {
      roleCode: 'OC-EXP',
      name: '实验执行员 (EXP)',
      description: '在 PI Gate 1 通过后执行实验：Python + sklearn/xgboost/lightgbm，基线对比，固定随机种子，失败记录到 FAILURE_MEMORY.md。产出物写入 02-experiment/。',
      skills: [
        'run-experiment — 执行实验',
        'analyze-results — 结果分析',
        'ablation-planner — 消融实验规划',
        'data-loading — 数据加载',
        'statistical-reporting — 统计报告',
        'scientific-visualization — 科学可视化',
        'experiment-bridge — 实验桥接',
      ],
      color: '#F59E0B',
      avatar: '/claw_profile/octopus-builder-teal.png',
    },
    {
      roleCode: 'OC-WRT',
      name: '论文写作员 (WRT)',
      description: '根据实验结果撰写 LaTeX 论文：大纲 → 初稿 → 自审 → 修订。严格引用管理，数据全部来自 02-experiment/results/。产出物写入 03-paper/。',
      skills: [
        'paper-write — 完整 LaTeX 论文生成',
        'paper-plan — 论文结构规划',
        'paper-figure — 论文配图',
        'paper-compile — LaTeX 编译',
        'scientific-writing — 科学写作',
        'result-to-claim — 结果→结论转换',
        'rebuttal — 审稿回复',
      ],
      color: '#8B5CF6',
      avatar: '/claw_profile/jellyfish-notes-lilac.png',
    },
  ],
  workflow: {
    description: '线性流水线 + 门控评审：PI → LIT → PI(Gate1) → EXP → PI(Gate2) → WRT → PI(Gate3)',
    stages: [
      'PI 设定研究方向 → RESEARCH_DIRECTION.md',
      'LIT 系统文献检索 + 缺口分析 + 实验计划',
      'PI Gate 1: 评审文献质量，APPROVE / REVISE',
      'EXP 执行实验 + 基线对比 + 消融分析',
      'PI Gate 2: 评审实验结果，APPROVE / REVISE',
      'WRT 撰写 LaTeX 论文 + 自审',
      'PI Gate 3: 终审论文 + 投稿就绪判定',
    ],
  },
  communication: {
    mode: '文件中介 + 状态机',
    description: '团队成员通过共享文件系统沟通（shared/PIPELINE_STATE.json 跟踪阶段），不通过实时消息。每个阶段的产出物放在约定目录（00-pi/, 01-literature/, 02-experiment/, 03-paper/），下游 Agent 读取上游产出物作为输入。',
  },
  isolation: {
    description: '每个 Agent 拥有独立的 workspace 和 state_dir（.openclaw），互不干扰。共享一个项目目录但分区操作：PI 只写 00-pi/，LIT 只写 01-literature/，EXP 只写 02-experiment/，WRT 只写 03-paper/。shared/ 目录为唯一公共区域，存放 PIPELINE_STATE.json 和 references.bib。',
  },
};

const SUPERPOWERS_DEV_TEAM: TeamTemplate = {
  id: 'tpl-superpowers-dev-3mix',
  name: 'Superpowers 软件开发团队',
  description: '基于 Superpowers 方法论的全流程软件开发团队。3 个混合平台 Agent 协作：OpenClaw CEO 负责需求头脑风暴与计划编写，OpenCode 全栈工程师执行开发与调试，Hermes 测试工程师把控质量。从想法到上线，全自动交付。',
  category: '软件开发',
  platform: 'openclaw',
  color: '#6366F1',
  avatar: '/claw_profile/01.png',
  memberCount: 3,
  tags: ['软件开发', '全栈', '测试', 'TDD', 'Superpowers', '多平台协作'],
  members: [
    {
      roleCode: 'OC-CEO',
      name: 'CEO 产品经理 (OpenClaw)',
      description: '负责需求头脑风暴、产品规格设计、实施计划编写。通过苏格拉底式对话打磨想法，输出设计文档和细粒度实施计划（每个任务 2-5 分钟），确保开发方向正确。',
      skills: [
        'brainstorming — 需求头脑风暴与产品设计',
        'writing-plans — 编写细粒度实施计划',
        'using-superpowers — Superpowers 方法论入口',
        'writing-skills — 技能编写与流程优化',
      ],
      color: '#EF4444',
      platform: 'openclaw',
      avatar: '/claw_profile/jellyfish-brainstorm-lime.png',
    },
    {
      roleCode: 'OCODE-DEV',
      name: '全栈工程师 (OpenCode)',
      description: '执行 CEO 制定的实施计划，负责前后端全栈开发。使用 Git Worktree 隔离工作、子Agent驱动开发、系统性调试、代码评审反馈处理，确保代码质量与工程规范。',
      skills: [
        'using-git-worktrees — Git Worktree 隔离开发',
        'subagent-driven-development — 子Agent驱动开发',
        'executing-plans — 执行实施计划',
        'dispatching-parallel-agents — 并行Agent调度',
        'systematic-debugging — 系统性调试（4阶段根因分析）',
        'receiving-code-review — 处理代码评审反馈',
        'finishing-a-development-branch — 完成开发分支',
      ],
      color: '#3B82F6',
      platform: 'opencode',
      avatar: '/claw_profile/shrimp-dev.png',
    },
    {
      roleCode: 'HRM-QA',
      name: '测试工程师 (Hermes)',
      description: '把控代码质量与交付标准。执行测试驱动开发（TDD）的 RED-GREEN-REFACTOR 循环，在任务边界发起代码评审，确保完成前有可验证的证据。',
      skills: [
        'test-driven-development — 测试驱动开发 (TDD)',
        'verification-before-completion — 完成前验证',
        'requesting-code-review — 发起代码评审',
      ],
      color: '#10B981',
      platform: 'hermes',
      avatar: '/claw_profile/crab-qa.png',
    },
  ],
  workflow: {
    description: '瀑布式迭代：CEO 设计 → CEO 计划 → DEV 开发(含 QA 并行测试) → QA 验收 → DEV 收尾',
    stages: [
      'CEO 需求头脑风暴 → docs/superpowers/specs/',
      'CEO 编写实施计划 → docs/superpowers/plans/',
      'DEV 使用 Git Worktree 隔离开发环境',
      'DEV 按计划逐任务执行，QA 同步 TDD 编写测试',
      'QA 发起代码评审 + 完成前验证',
      'DEV 处理评审反馈 + 完成开发分支',
    ],
  },
  communication: {
    mode: '文件中介 + 计划驱动',
    description: 'CEO 将设计规格写入 docs/superpowers/specs/，计划写入 docs/superpowers/plans/。DEV 读取计划逐一执行，产出代码。QA 读取代码变更并编写测试。所有产出均通过文件系统传递，项目根目录为共享工作区。',
  },
  isolation: {
    description: 'CEO 只写 docs/ 目录。DEV 使用 Git Worktree 在独立分支上开发，不影响主分支。QA 在独立测试目录工作。三方通过共享文件系统和 Git 仓库协作，互不阻塞。',
  },
};

const TEAM_TEMPLATES: TeamTemplate[] = [AI_MED_RESEARCH_TEAM, SUPERPOWERS_DEV_TEAM];

function getMemberKind(index: number): WorkflowAgentKind {
  return index === 0 ? 'orchestrator' : 'worker';
}

function buildTeamTemplateGraph(
  template: TeamTemplate,
  options: { teamName?: string; agentIds?: string[] } = {}
): Pick<TeamTemplateWithGraph, 'agents' | 'nodes' | 'edges' | 'workflowDsl'> {
  const teamName = options.teamName?.trim() || template.name;
  const previewAgentIds = template.members.map((_, i) => `template-agent-${template.id}-${i}`);
  const resolvedAgentIds = template.members.map((_, i) => options.agentIds?.[i] || previewAgentIds[i]);

  const agents: TeamTemplateArchitectureAgent[] = template.members.map((member, i) => {
    const nodeId = `node-agent-${i}`;
    const memberAvatar = member.avatar ?? template.avatar;
    return {
      id: nodeId,
      nodeId,
      name: member.name,
      role: member.roleCode,
      kind: getMemberKind(i),
      isManager: i === 0,
      linkedLobsterId: resolvedAgentIds[i],
      avatar: memberAvatar,
      roleCode: member.roleCode,
      color: member.color,
      status: 'standby',
    };
  });

  const workflowDsl: WorkflowDsl = {
    schemaVersion: '1.0',
    name: teamName,
    description: template.workflow.description,
    entryNodeId: 'node-start',
    nodes: [
      { id: 'node-start', type: 'start', label: '用户输入', outputKey: 'user_task' },
      ...template.members.map((member, i) => ({
        id: `node-agent-${i}`,
        type: 'agent' as const,
        label: member.name,
        agentInstanceId: resolvedAgentIds[i],
        role: member.roleCode,
        kind: getMemberKind(i),
        isManager: i === 0,
      })),
      { id: 'node-end', type: 'end', label: '最终输出', resultKey: 'final_output' },
    ],
    edges: [
      { id: 'de-start-0', from: 'node-start', to: 'node-agent-0', label: '启动' },
      ...template.members.slice(0, -1).map((_, i) => ({
        id: `de-${i}-${i + 1}`,
        from: `node-agent-${i}`,
        to: `node-agent-${i + 1}`,
        label: template.workflow.stages[i + 1] || '',
      })),
      { id: 'de-last-end', from: `node-agent-${template.members.length - 1}`, to: 'node-end', label: '完成' },
    ],
    execution: {
      mode: 'dag',
      maxConcurrency: 1,
      timeoutSec: 3600,
    },
  };

  const nodes: TeamTemplateCanvasNode[] = [
    { id: 'node-start', type: 'startNode', data: { label: '用户输入' }, position: { x: 180, y: 0 } },
    ...template.members.map((member, i) => {
      const nodeId = `node-agent-${i}`;
      const linkedLobsterId = resolvedAgentIds[i];
      const memberAvatar = member.avatar ?? template.avatar;
      return {
        id: nodeId,
        type: 'agentNode' as const,
        data: {
          label: member.name,
          role: member.roleCode,
          roleCode: member.roleCode,
          kind: getMemberKind(i),
          isManager: i === 0,
          inputs: i === 0 ? ['用户任务'] : [template.workflow.stages[i] || '上游输出'],
          outputs: [template.workflow.stages[i + 1] || '节点输出'],
          agentId: nodeId,
          linkedLobsterId,
          linkedLobsterName: member.name,
          linkedLobsterAvatar: memberAvatar,
          isDeletable: true,
          color: member.color,
        },
        position: { x: 60 + (i % 2) * 250, y: 100 + Math.floor(i / 2) * 160 },
      };
    }),
    {
      id: 'node-end',
      type: 'endNode',
      data: { label: '最终输出' },
      position: { x: 180, y: 100 + Math.ceil(template.members.length / 2) * 160 },
    },
  ];

  const edges: TeamTemplateCanvasEdge[] = [
    { id: 'ce-start-0', source: 'node-start', target: 'node-agent-0', label: '启动' },
    ...template.members.slice(0, -1).map((_, i) => ({
      id: `ce-${i}-${i + 1}`,
      source: `node-agent-${i}`,
      target: `node-agent-${i + 1}`,
      label: template.workflow.stages[i + 1] || '',
    })),
    { id: 'ce-last-end', source: `node-agent-${template.members.length - 1}`, target: 'node-end', label: '完成' },
  ];

  return { agents, nodes, edges, workflowDsl };
}

function withTemplateGraph(template: TeamTemplate): TeamTemplateWithGraph {
  return {
    ...template,
    ...buildTeamTemplateGraph(template),
  };
}

function readTemplateAgentManifest(agent: UserAgentInstance): { templateId?: string; roleCode?: string } {
  try {
    const parsed = JSON.parse(agent.manifest || '{}');
    return {
      templateId: typeof parsed.templateId === 'string' ? parsed.templateId : undefined,
      roleCode: typeof parsed.roleCode === 'string' ? parsed.roleCode : undefined,
    };
  } catch {
    return {};
  }
}

function makeDuplicateChoiceKey(roleCode: string, existingAgentId: string): string {
  return `${roleCode}::${existingAgentId}`;
}

export async function findDuplicateTeamAgents(
  userId: string,
  templateId: string
): Promise<DuplicateTeamAgent[]> {
  const template = getTeamTemplateById(templateId);
  if (!template) return [];

  const roleNames = new Map(template.members.map((member) => [member.roleCode, member.name]));
  const agents = await getUserAgents(userId);
  const byRole = new Map<string, DuplicateTeamAgent>();

  for (const agent of agents) {
    const manifest = readTemplateAgentManifest(agent);
    if (manifest.templateId !== template.id || !manifest.roleCode || !roleNames.has(manifest.roleCode)) {
      continue;
    }

    if (!byRole.has(manifest.roleCode)) {
      byRole.set(manifest.roleCode, {
        roleCode: manifest.roleCode,
        templateName: roleNames.get(manifest.roleCode) || manifest.roleCode,
        existingAgentId: agent.id,
        existingAgentName: agent.name,
      });
    }
  }

  return Array.from(byRole.values());
}

// ==================== Public API ====================

export function listTeamTemplates(): TeamTemplateWithGraph[] {
  return TEAM_TEMPLATES.map(withTemplateGraph);
}

export function getTeamTemplateById(id: string): TeamTemplateWithGraph | null {
  const template = TEAM_TEMPLATES.find((t) => t.id === id);
  return template ? withTemplateGraph(template) : null;
}

export async function adoptTeamTemplate(
  userId: string,
  templateId: string,
  teamName?: string,
  duplicateChoices: DuplicateAgentChoice[] = []
): Promise<AdoptTeamResult> {
  const template = getTeamTemplateById(templateId);
  if (!template) {
    return { success: false, error: '团队模板不存在' };
  }

  const finalTeamName = teamName?.trim() || template.name;

  try {
    // 1. Create a Cave (Agent窝) for this team
    const cave = await createCave(userId, finalTeamName, template.color);

    const duplicateChoiceMap = new Map(
      duplicateChoices.map((choice) => [makeDuplicateChoiceKey(choice.roleCode, choice.existingAgentId), choice])
    );
    const existingAgents = await getUserAgents(userId);
    const existingAgentMap = new Map(existingAgents.map((agent) => [agent.id, agent]));

    // 2. Create each agent and assign to the cave
    const agentIds: string[] = [];

    for (const member of template.members) {
      const matchingChoice = duplicateChoices.find((choice) =>
        choice.roleCode === member.roleCode &&
        choice.mode === 'share-config' &&
        duplicateChoiceMap.has(makeDuplicateChoiceKey(choice.roleCode, choice.existingAgentId))
      );
      const sharedAgent = matchingChoice ? existingAgentMap.get(matchingChoice.existingAgentId) : undefined;
      const sharedConfig = sharedAgent ? readAgentUserConfig(sharedAgent) : undefined;
      const memberPlatform = member.platform ?? template.platform;
      const memberAvatar = member.avatar ?? template.avatar;
      const agentDto: CreateAgentDto = {
        name: `${member.name}`,
        description: member.description,
        avatar: memberAvatar,
        tags: [...template.tags, member.roleCode],
        manifest: {
          templateId: template.id,
          roleCode: member.roleCode,
          teamName: finalTeamName,
          skills: member.skills,
          platform: memberPlatform,
          // getPlatformFromManifest reads entrypoint.type — populate it so the
          // runtime and provider-type validation resolve the correct platform.
          entrypoint: { type: memberPlatform },
        },
      };

      const agent = await createAgent(userId, agentDto);
      agentIds.push(agent.id);

      if (sharedAgent && sharedConfig) {
        const sharedProviderId = sharedConfig.providerId ?? sharedAgent.providerId ?? null;
        await updateAgentConfig(agent.id, userId, {
          providerId: sharedProviderId,
          model: sharedConfig.model,
          temperature: sharedConfig.temperature,
          maxTokens: sharedConfig.maxTokens,
        });
      }

      // Assign agent to cave
      await moveAgentToCave(agent.id, userId, cave.id);

      // Persist the platform into agent.config.json so config updates (e.g. the
      // "团队 API Key" modal) and runtime resolution agree on the platform.
      try {
        const cfgWorkspace = resolveStoredPath(agent.workspacePath);
        fs.mkdirSync(cfgWorkspace, { recursive: true });
        const cfgPath = path.join(cfgWorkspace, 'agent.config.json');
        fs.writeFileSync(
          cfgPath,
          JSON.stringify(
            {
              ...(sharedConfig ?? {}),
              agentId: agent.id,
              name: agent.name,
              description: member.description,
              avatar: memberAvatar,
              platform: memberPlatform,
              updatedAt: new Date().toISOString(),
            },
            null,
            2
          ),
          'utf-8'
        );
      } catch (cfgErr) {
        console.error('Failed to write adopted agent config:', cfgErr);
      }

      // Materialize skills as SKILL.md files in workspace
      if (member.skills.length > 0) {
        const workspacePath = resolveStoredPath(agent.workspacePath);
        const skillsRoot = path.join(workspacePath, 'skills');
        for (const skillLabel of member.skills) {
          const dashIdx = skillLabel.indexOf('—');
          const skillName = dashIdx > 0
            ? skillLabel.slice(0, dashIdx).trim()
            : skillLabel.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '-').slice(0, 40);
          const skillDesc = dashIdx > 0 ? skillLabel.slice(dashIdx + 1).trim() : skillLabel;
          const dirName = skillName.replace(/\s+/g, '-').toLowerCase();
          const skillDir = path.join(skillsRoot, dirName);
          fs.mkdirSync(skillDir, { recursive: true });

          // Try to copy real SKILL.md from superpowers source
          const superpowersSource = path.resolve(__dirname, '../../../../10.superpowers-main/skills', dirName);
          const sourceSkillMd = path.join(superpowersSource, 'SKILL.md');
          if (fs.existsSync(sourceSkillMd)) {
            copyDirRecursive(superpowersSource, skillDir);
          } else {
            const content = [
              '---',
              `name: "${skillName}"`,
              `description: "${skillDesc}"`,
              `agent: "${member.name}"`,
              `team: "${finalTeamName}"`,
              '---',
              '',
              `# ${skillName}`,
              '',
              skillDesc,
              '',
              `> 所属 Agent: ${member.name} (${member.roleCode})`,
              `> 所属团队: ${finalTeamName}`,
              '',
            ].join('\n');
            fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
          }
        }
      }

    }

    const materializedGraph = buildTeamTemplateGraph(template, {
      teamName: finalTeamName,
      agentIds,
    });

    const architecture = await createArchitecture(userId, {
      name: finalTeamName,
      description: template.description,
      agents: materializedGraph.agents,
      nodes: materializedGraph.nodes,
      edges: materializedGraph.edges,
      workflowDsl: materializedGraph.workflowDsl,
    });

    return {
      success: true,
      caveId: cave.id,
      caveName: finalTeamName,
      teamId: architecture.id,
      agentIds,
    };
  } catch (error) {
    console.error('Adopt team template error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '领养团队失败',
    };
  }
}
