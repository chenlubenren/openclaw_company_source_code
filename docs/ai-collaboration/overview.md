# AI Collaboration Overview

## 7.3 AI 协作产物与所在位置

本目录用于集中记录本项目在 AI 协作开发过程中沉淀下来的规范、提示词、验证方式和开发日志。它不是普通说明文档，而是后续继续使用 Codex 或其他 Agent 参与项目开发时的协作入口：AI 在动手修改代码前，应先读取这里的 spec、rules 和 harness，确认当前功能边界、运行约定和验收方式。

整个文档体系按“产品说明、技术说明、AI 协作规范”三层组织。其中 `docs/ai-collaboration/` 专门保存 AI 协作产物，最重要的是 `specs/` 目录。后续凡是涉及 Agent 团队、项目 workspace、Tea Party、运行时上下文、handoff、artifacts 等核心行为的改动，都应优先以 spec 为准。

Codex 对话 session 是本目录的重要来源，但仓库只保存整理后的摘要和规范，不保存原始 session。这样既能利用项目开发过程中与 Codex 的完整协作记录，又避免把系统提示、密钥、本机路径或终端完整输出提交到 GitHub。项目相关 session 的摘要索引见 `logs/codex-session-index.md`。

## 文档组织

```text
docs/
  product/
    product-overview.md       # 产品定位、用户、核心能力和市场化方向
    demo-script.md            # 演示流程和重点讲解路径
  tech/
    architecture.md           # 前后端、Agent runtime、workspace 和桌面端架构
    deployment.md             # 前后端分离部署、环境变量、Nginx 和验证方式
  ai-collaboration/
    overview.md               # AI 协作产物总览
    specs/                    # 核心行为规范，优先级最高
    skills/                   # Codex 与项目内 Agent skill 说明
    rules/                    # 编码、文档、Agent 使用约定
    harness/                  # 提示词、验证配置和记录模板
    logs/                     # Codex session 摘要与迭代历史
```

## 核心产物

- `specs/agent-team-workflow.md`：规定团队编排、Workflow DSL、节点 handoff、artifacts 和多 Agent 协作模式。
- `specs/project-workspace.md`：规定 Market、User Agent、Project、Workflow Run 的 workspace 生命周期和写入边界。
- `specs/tea-party.md`：规定 Tea Party 群聊模式与正式 workflow 的差异，避免群聊误触发任务执行。
- `skills/skill-list.md`：记录本项目使用过的 Codex skills，以及 Agent workspace 内 `SKILL.md` 的使用方式。
- `rules/coding-rules.md`：记录代码修改、前后端边界、安全、Git 和最小改动原则。
- `rules/doc-rules.md`：记录文档更新、spec 维护和敏感信息处理规则。
- `rules/agent-rules.md`：记录 direct-chat、group-chat、workflow 三种 Agent 运行模式的约定。
- `harness/prompts/`：保存 Workflow DSL 生成和 runtime context 注入相关提示词模板说明。
- `harness/configs/verification-config.md`：记录 build、smoke、浏览器验证和部署检查方式。
- `harness/templates/session-summary-template.md`：提供后续整理 AI 协作 session 的统一模板。
- `logs/codex-session-index.md`：整理本项目相关 Codex session 的主题、贡献和沉淀位置。
- `logs/development-notes.md` 与 `logs/iteration-history.md`：记录开发经验和迭代时间线。

## 协作流程

AI 参与本项目开发时，推荐按以下顺序工作：

1. 先读 `specs/`，确认业务边界和运行规则。
2. 再读 `rules/`，确认代码、文档、Agent 行为和安全约定。
3. 如需生成工作流、运行 Agent 或做验证，读取 `harness/`。
4. 如需了解历史背景，读取 `logs/codex-session-index.md` 和 `iteration-history.md`。
5. 最后再进入代码实现、测试和提交。

如果代码行为和 spec 不一致，需要先判断是代码偏离规范，还是规范已经过期。默认不直接重写 spec，而是在 logs 中记录差异，再决定是修代码还是更新 spec。
