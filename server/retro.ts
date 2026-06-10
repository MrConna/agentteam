import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PROJECT_ROOT } from "./worktree.ts";
import type { Task } from "../src/types/domain.ts";

/**
 * Agent 自我进化循环 — 复盘与召回（见 docs/agent-self-evolution-loop.md）。
 *
 * 两个 best-effort 包装，全部建立在既有 `bin/memory` 之上，不新增基建：
 *  - recallLessons：开工前调取「同类任务」的过往教训，拼成可注入 prompt 的 Markdown。
 *  - recordRetro：完成 / 失败后把「下次怎么改」沉淀回 memory/learnings.jsonl。
 *
 * 设计红线：任一调用失败都不得影响任务主流程 —— 出错只 log，召回返回空串。
 */

const MEMORY_BIN = join(PROJECT_ROOT, "bin", "memory");

/** 全局开关：设为 "1" 时 recall/retro 都成为 no-op（测试 / 禁用自进化时用）。 */
function memoryDisabled(): boolean {
  return process.env.AGENTTEAM_MEMORY_DISABLED === "1";
}

/** learnings.jsonl 里一条记录的形状（仅取本模块用到的字段）。 */
interface Learning {
  id: string;
  pattern: string;
  confidence: number;
  tags?: string[];
  context?: string;
  reference_count?: number;
}

export interface RecallInput {
  role: string;
  task: Pick<Task, "title" | "fileScope">;
  /** 召回条数上限，默认 3。 */
  limit?: number;
}

export interface RetroInput {
  role: string;
  task: Pick<Task, "id" | "title" | "fileScope">;
  provider: string;
  /** 真实运行结果状态。 */
  status: "completed" | "blocked" | "failed";
  drunId?: string;
  blockers?: string[];
  /** agent 自报的复盘三段（解析自 RETROSPECTIVE 块）；缺省时用机械信号兜底。 */
  wentWell?: string;
  wentWrong?: string;
  nextTime?: string;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "with", "add",
  "fix", "update", "实现", "修改", "增加", "完成", "支持", "任务", "功能",
]);

/** 从标题 / 文件范围廉价派生匹配关键词，作为 query 与 tasktype 的素材。 */
function keywordsFor(task: Pick<Task, "title" | "fileScope">): string[] {
  const fromTitle = task.title
    .toLowerCase()
    .split(/[^a-z0-9一-龥]+/i)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  const fromScope = (task.fileScope ?? [])
    .map((p) => p.split("/").filter(Boolean).pop() ?? "")
    .map((f) => f.replace(/\.[a-z]+$/i, "").toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...fromTitle, ...fromScope])).slice(0, 6);
}

/** tasktype tag：取第一个关键词，召不到再退化为 role。 */
function taskType(task: Pick<Task, "title" | "fileScope">): string {
  return keywordsFor(task)[0] ?? "general";
}

function runMemory(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  try {
    const res = spawnSync(MEMORY_BIN, args, {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      shell: false,
      timeout: 15_000,
    });
    return {
      ok: res.status === 0,
      stdout: (res.stdout ?? "").trim(),
      stderr: (res.stderr ?? "").trim(),
    };
  } catch (e) {
    return { ok: false, stdout: "", stderr: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 召回同类任务的过往教训，返回可直接拼进 prompt 的 Markdown 段；无结果返回空串。
 * 优先 `retro` 标签的高置信度教训，没有再用全部高置信度记录兜底。
 */
export function recallLessons(input: RecallInput): string {
  if (memoryDisabled()) return "";
  const limit = input.limit ?? 3;
  const query = [input.role, ...keywordsFor(input.task)].join(" ").trim();
  if (!query) return "";

  const res = runMemory(["apply", "--query", query, "--json"]);
  if (!res.ok || !res.stdout) return "";

  let records: Learning[] = [];
  try {
    const parsed = JSON.parse(res.stdout);
    if (Array.isArray(parsed)) records = parsed as Learning[];
  } catch {
    return "";
  }
  if (records.length === 0) return "";

  const retroFirst = records.filter((r) => (r.tags ?? []).includes("retro"));
  const chosen = (retroFirst.length ? retroFirst : records).slice(0, limit);
  if (chosen.length === 0) return "";

  const lines = chosen.map((r) => {
    const ctx = r.context ? `（${r.context}）` : "";
    return `- [${r.confidence}/10] ${r.pattern}${ctx}`;
  });
  return ["## 过往同类任务教训（开工前先读）", ...lines].join("\n");
}

/**
 * 把本次任务的复盘沉淀回 memory。best-effort：成功与否都不抛错。
 * 教训内容优先用 agent 自报的 nextTime；缺省则按 status/blockers 机械生成。
 */
export function recordRetro(input: RetroInput): { ok: boolean; pattern: string } {
  if (memoryDisabled()) return { ok: false, pattern: "" };
  const tasktype = taskType(input.task);
  const failed = input.status !== "completed";

  const nextTime =
    input.nextTime?.trim() ||
    (failed
      ? `下次避免：${input.blockers?.join("；") || `${input.provider} 运行${input.status}`}`
      : "");

  // 完成且 agent 没有任何可执行复盘时，不写噪声。
  if (!nextTime && !input.wentWrong?.trim()) {
    return { ok: false, pattern: "" };
  }

  const head = `[retro][${input.role}]`;
  const parts = [
    nextTime && `下次：${nextTime}`,
    input.wentWrong?.trim() && `做得差：${input.wentWrong.trim()}`,
    input.wentWell?.trim() && `做得好：${input.wentWell.trim()}`,
  ].filter(Boolean);
  const pattern = `${head} ${input.task.title} —— ${parts.join("；")}`.slice(0, 280);

  // 失败/阻塞的教训给 7（≥7 才会被 apply 自动召回）；成功经验给 6，靠强化升权。
  const confidence = failed ? 7 : 6;
  const tags = ["retro", `role:${input.role}`, `tasktype:${tasktype}`, input.provider];

  const res = runMemory([
    "add", pattern,
    "--confidence", String(confidence),
    "--source", `${input.role}/${input.drunId ?? "drun"}`,
    "--tags", tags.join(","),
    "--context", `provider=${input.provider}, status=${input.status}`,
  ]);
  if (!res.ok) {
    console.error(`[retro] recordRetro failed: ${res.stderr || "unknown"}`);
  }
  return { ok: res.ok, pattern };
}

export { keywordsFor as _keywordsFor, taskType as _taskType };
