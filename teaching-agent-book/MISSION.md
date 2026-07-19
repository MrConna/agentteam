# Mission: AI Agent 架构设计 — 多 Agent 协作与工程实践

## Why
我正在构建 AgentTeam，一个多 Agent 编排系统——通过 tmux 协调 pi/Claude Code/Codex CLI 会话，建设 memory/context 基础设施。需要系统性地理解 AI Agent 架构设计原理，特别是多 Agent 协作模式，把当前"手工作坊式"的协调升级为有理论支撑的架构。

## Success looks like
- 能清晰地解释 AgentTeam 中每种协调方式（tmux send-keys / intercom / delegate / session_send）对应的多 Agent 架构模式及其适用边界
- 为 AgentTeam 设计出合理的多 Agent 通信协议——基于书中的共享/隔离上下文理论
- 能够判断"什么时候多 Agent 协作真正优于单 Agent"并给出理由
- 给 AgentTeam 添加一个系统性的 Agent 评估方法（参考第 6 章）
- 能写出一份 AgentTeam 架构文档，标注出每种模式的理论来源和与书中模式的异同

## Constraints
- 学习材料以《深入理解 AI Agent》开源书为主，参考其配套代码
- 每次 lesson 控制在 15-30 分钟可完成的范围内
- 重点放在可直接应用于 AgentTeam 的章节（3, 4, 5, 10）

## Out of scope
- 模型后训练（第 7 章）—— 当前不涉及模型训练
- 多模态与实时交互（第 9 章）—— 暂不需要语音/视觉能力
- Agent 自我进化（第 8 章）—— 高阶话题，后续再说
