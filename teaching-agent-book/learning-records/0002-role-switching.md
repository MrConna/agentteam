# Learning Record 0002: 多阶段角色转换

**Date**: 2026-07-19
**Source**: 《深入理解 AI Agent》第 10 章
**Type**: Knowledge + Skill

## Key Insights

1. 角色转换有两种形态：多阶段（线性流程，工具触发转换）和跨领域（动态路由，transfer_to_agent）。
2. 角色模板 = 身份定义 + 行为指导 + 过渡规则 + 工具集。
3. AgentTeam 适合"跨领域角色转换"的思想——leader 做 triage 分诊，按需分配专业角色。
4. 最大启示：每个角色应该有**显式的过渡规则**（什么条件下移交给谁），而不是 leader 口述。

## AgentTeam 角色模板草案

| Session | 角色 | 身份 | 过渡 |
|---------|------|------|------|
| claude:1 | Reviewer | 代码审查/架构分析/文档 | 审查通过→通知 leader |
| codex:2 | Implementer | 按需求实现代码 | 实现+测试→通知 leader |
| agy:3 | Tester/Scout | 验证/侦察/快速评估 | 完成→报告 leader |

## Open Questions

- 是否需要引入"triage"角色？还是 leader 本身就是 triage？
- 不共享上下文的 AgentTeam 中，"角色模板"以什么形式传递？tmux send-keys 贴 System Prompt？
- 要不要做一个 `prompt register <role>` 的 CLI，存储角色模板到 agent-memory-tools 里？
