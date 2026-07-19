# Learning Record 0001: 多 Agent 协作分类框架

**Date**: 2026-07-19
**Source**: 《深入理解 AI Agent》第 10 章
**Type**: Knowledge acquisition

## Key Insights

1. 多 Agent 协作的两个核心设计维度是"上下文是否共享"和"协作拓扑"——理解这两个维度就能分类和比较任何多 Agent 系统。
2. AgentTeam 当前采用的是"不共享上下文 + 管理者模式"——leader 拆任务，各窗口独立执行。
3. "新信息原则"是判断多 Agent 是否优于单 Agent 的黄金标准：没有新信息引入的多 Agent 协作通常无效。
4. 成本是绕不开的问题——Token 消耗 3-15 倍于单 Agent。

## AgentTeam 映射

| 书中概念 | AgentTeam 对应 |
|---------|---------------|
| 不共享上下文 | tmux send-keys 独立派任务 |
| 管理者模式 | leader 窗口拆活分配 |
| 显式 handoff | session_send / intercom / tmux output |
| 消息总线 | session_send (Mailbox 轮询) |
| 步骤预算 | 尚未显式管理 |

## Next Actions

- [ ] 为 claude/codex/agy 分别写 System Prompt 模板
- [ ] 引入"步骤预算"概念：根据任务复杂度分配不同步骤数
- [ ] 讨论：AgentTeam 应该保留"纯管理者模式"还是尝试"去中心化模式"？

## Questions

- 当 Agent 数量扩展到 5+ 时，管理者模式会否成为瓶颈？
- 是否需要给每个子 Agent 设置"步骤预算"？如何估算？
