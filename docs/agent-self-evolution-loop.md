# Agent 自我进化循环 — 轻量设计

## 目标
让每个下属 agent 在完成任务后自动复盘（哪里做得好 / 哪里做得差 / 下次怎么改），
并在下次同类任务开始时自动调取这些教训改进行为。**不新增基建**：复用既有
`memory/learnings.jsonl` + `bin/memory` + 开发规范里的 Memory Sync Protocol。

## 为什么不造新东西
现有资产已覆盖存储与检索，缺的只是「自动触发 + 强制闭环」：

- **存储**：`memory/learnings.jsonl`，字段 `pattern/confidence/source/tags/files/context/reference_count/last_referenced/stale`。一条「教训」= 一条 learning。
- **检索**：`bin/memory apply --query "<kw>" --json` 已是给程序消费的接口：
  - 只返回 `confidence>=7` 且非 stale 的记录；
  - 按 `命中关键词数 × confidence` 排序，返回前 5 条完整 JSON；
  - **每次调用自增命中记录的 `reference_count`** —— 天然的「越有用越靠前」强化信号。
- **规范**：`docs/agent-development-standard.md` 已要求「开工前检索记忆、交付前 add learning」，但目前是手动、可跳过。本方案把它升级为生命周期里的自动钩子。

## 循环模型（两个自动钩子）
```
任务开始 ──[钩子A recall]── apply 召回同类任务教训 → 注入 prompt
   │
任务执行（real adapter 跑 CLI）
   │
任务完成 ──[钩子B retro]── 抽取 went_well/went_wrong/next_time → add 回 learnings.jsonl
```

## 教训的数据形态（复用现有 schema，零迁移）
一条复盘就是一条 learning，约定：

- `pattern`：`"[retro][coder] 写 fetch 适配器：超时默认值要可配置，上次硬编码 25min 导致 deepseek 卡死"`
- `tags`：`["retro", "role:coder", "tasktype:<关键词>", "<provider>"]` —— tag 即匹配键。
- `confidence`：踩坑/失败/超时 = 7（≥7 才会被 `apply` 自动召回，必须避免重复）；
  成功经验 = 6（不自动应用，靠被反复命中后 `reference_count` 升权后再浮现）。
- `source`：`"<role>/<drun-id>"`；`context`：一句话证据。
- `tasktype`：从 `task.title` / `task.fileScope` 廉价派生（去停用词后取主关键词，或写入目录名）。

## 需要改动的文件与思路

1. **`server/retro.ts`（新增，已落地为可复用构件）**
   - `recallLessons({role, task})`：拼 query = role + 任务关键词 → `bin/memory apply --query … --json` → 优先取 tag 含 `retro` 的前 3 条 → 返回一段「## 过往同类任务教训」Markdown。无结果 / 出错返回空串，**绝不阻断主流程**。
   - `recordRetro({role, task, provider, status, blockers, wentWell, wentWrong, nextTime})`：组装 pattern/tags/confidence → `bin/memory add`。best-effort，出错只 log。

2. **`server/realAdapter.ts`（待接线，2 处）**
   - 构造命令前：`const lessons = recallLessons({ role: "coder", task })`，并入 prompt（经下条 `{lessons}` token）；复用已有 `options.memoryNote` 记录本次受哪条记忆影响。
   - `finishTx` 内：完成 / 失败后调用 `recordRetro(...)`。教训来源优先级：① 解析 agent 自报的 `RETROSPECTIVE` 块（见第 4 条）；② 解析不到则用机械信号兜底（`status==="failed"/"blocked"`、`reason==="timeout"`、`blockers[]` → 自动生成「下次怎么改」教训）。

3. **`server/agentRegistry.ts` + `agents.config.json`（待接线，改 prompt 模板）**
   - `defaultPromptTemplate` 增加 `{lessons}` 占位符（`substitute()` 已支持任意 token，几乎零改动）。
   - 末尾加硬要求：开工前先读「过往教训」；交付时在最后输出 `RETROSPECTIVE` JSON 块 `{went_well, went_wrong, next_time}`（各一句话）。agent 由此**既消费上次教训、又产出本次教训**。

4. **`server/runArtifacts.ts`（待接线，小改 `createRunResult`）**
   - 加 `parseRetro(stdout)`：从 agent 输出抠出 `RETROSPECTIVE` JSON 塞进 `RealRunResult`（新增可选字段 `retro?`）。钩子B 优先用它，解析不到不报错。

5. **`docs/agent-development-standard.md`（待补一节 "Self-Retrospective Loop"）**
   - 把「开工前 recall、交付时 retro」从建议升级为生命周期必做项，写明 tag 约定与 confidence 规则，让人类与其它 Session 遵循同一契约。

6. **`tools/memory/memory.py` / `bin/*`：零改动。** 仅当需要按 tag 精确过滤时，可给 `apply` 加 `--tag` 过滤（~5 行），当前靠 query 关键词足够。

## 为什么能「进化」而非只是「记日志」
- **强化**：`apply` 每次召回自增 `reference_count`，真正有用的教训排序上浮；无用的沉底，配合 `bin/memory prune` 定期清理。
- **收敛**：同类教训重复出现时（pattern 相似）可做轻量去重（命中相似则升 confidence 而非新增），让反复踩的坑自然升到高置信度被自动应用。（v1 暂不做，列为后续。）
- **可观测**：教训进 `learnings.jsonl`（Git 可审阅）；召回记录进 run 的 `progress.md`「Memory Used」区块（规范已有该格式）。

## 风险与边界
- **质量依赖 agent 自评**：自夸式复盘无价值 → 机械信号兜底（失败 / 超时 / blocker 必产一条教训），且 next_time 必须可执行。
- **匹配过糙 / 过细**：tasktype 关键词太粗会召回不相关、太细召不到 → 起步用「role + title 主关键词」，召回上限 3 条，按命中率微调。
- **噪声膨胀**：靠 confidence 阈值（成功经验默认 <7 不自动应用）+ 去重 + `prune` 控制。
- **best-effort**：recall / retro 任一失败都不得阻断任务主流程（全部 try/catch + 空串兜底）。

## 改动量
新增 1 文件（`server/retro.ts`，已落地），待接线 4 文件（realAdapter / agentRegistry+config / runArtifacts / 本规范）；`memory.py` 与 `bin/*` 零改动。无新依赖、无新表、无新进程。
