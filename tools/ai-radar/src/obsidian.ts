/**
 * RADAR-03 — Obsidian 写入与主页挂载
 * ============================================================================
 * 职责：
 *  1. 把 DailyRadarReport 渲染成「精排 + 可被 Dataview 检索」的 Obsidian Markdown
 *     （YAML frontmatter + 核心灵感总结 + 分类双语正文）。
 *  2. 写入 <vault>/无记录不过程/每日记录/AI雷达-<Date>.md。
 *  3. 幂等地在 <vault>/🏠 主页.md 挂载「最近 3 日 AI 灵感雷达」Dataview 面板。
 *
 * 设计要点：渲染（纯函数）与落盘（含 fs 副作用）分离，便于单测；所有路径可注入，
 * 默认指向用户的真实 vault，但测试时传入临时目录即可。
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DailyRadarReport, RadarItem } from "./processor.js";
import { toMarkdown, userCategoryBadge, userCategoryLabel } from "./processor.js";

/** 用户 Obsidian 库根目录；可用 AI_RADAR_VAULT_DIR 覆盖。 */
export const DEFAULT_VAULT_DIR =
  process.env.AI_RADAR_VAULT_DIR ?? "/Users/luffy/Downloads/code/Github/my_note";

/** 日报相对 vault 的目录。 */
export const DAILY_SUBDIR = join("无记录不过程", "每日记录");

/** 主页文件名（含 emoji，与 RADAR 早前落盘的 🏠 主页.md 一致）。 */
export const HOMEPAGE_FILENAME = "🏠 主页.md";

/** 面板用 HTML 注释作幂等标记，重复运行只替换标记之间的内容。 */
const PANEL_START = "<!-- AI-RADAR-PANEL:START (auto-managed by ai-radar) -->";
const PANEL_END = "<!-- AI-RADAR-PANEL:END -->";

export interface WriteOptions {
  /** 覆盖 vault 根目录（测试用）。 */
  vaultDir?: string;
}

// ----------------------------------------------------------------------------
// 路径助手
// ----------------------------------------------------------------------------

export function reportFileName(date: string): string {
  return `AI雷达-${date}.md`;
}

export function reportFilePath(date: string, vaultDir = DEFAULT_VAULT_DIR): string {
  return join(vaultDir, DAILY_SUBDIR, reportFileName(date));
}

// ----------------------------------------------------------------------------
// 渲染（纯函数）
// ----------------------------------------------------------------------------

/** 分类计数渲染成 "新技术/新模型(3), 前沿观点(2)" 形式，供 frontmatter / 面板展示。 */
function categoriesField(report: DailyRadarReport): string {
  const parts = Object.entries(report.byCategory).map(([k, v]) => `${k}(${v})`);
  return parts.join(", ") || "无";
}

function userCategoriesField(report: DailyRadarReport): string {
  const parts = Object.entries(report.byUserCategory)
    .filter(([, count]) => count > 0)
    .map(([k, v]) => `${userCategoryLabel(k as keyof DailyRadarReport["byUserCategory"])}(${v})`);
  return parts.join(", ") || "无";
}

/** 取信号最高的若干条灵感做「核心总结」。 */
function topInsights(items: RadarItem[], limit = 3): RadarItem[] {
  return items.filter((i) => i.insight).slice(0, limit);
}

/**
 * 生成完整的 Obsidian 笔记内容。
 * frontmatter 字段刻意做成可被 Dataview 直接 TABLE 的形状（type/radar_date/kept/...）。
 */
export function renderObsidianNote(report: DailyRadarReport): string {
  const frontmatter = [
    "---",
    "type: ai-radar",
    `radar_date: ${report.date}`,
    `generated: ${report.generatedAt}`,
    `provider: ${report.provider}/${report.model}`,
    `raw: ${report.totalRaw}`,
    `sent: ${report.totalSent}`,
    `kept: ${report.totalKept}`,
    `categories: "${categoriesField(report)}"`,
    `user_categories: "${userCategoriesField(report)}"`,
    "tags: [ai-radar]",
    "---",
    "",
  ];

  const tops = topInsights(report.items);
  const summary =
    tops.length > 0
      ? [
          "## ✨ 今日核心灵感",
          "",
          ...tops.map((i) => `- **[${userCategoryLabel(i.userCategory)} · ${i.category}] ${userCategoryBadge(i.userCategory)}@${i.username}**：${i.insight}`),
          "",
        ]
      : [];

  // 正文复用 RADAR-02 的分类双语渲染，避免重复实现。
  const body = toMarkdown(report);

  return [...frontmatter, ...summary, body].join("\n");
}

/** 主页面板内容（不含标记包裹）。基于 frontmatter `type` 检索，比文件名匹配更稳。 */
export function radarPanelMarkdown(): string {
  return [
    "### 📡 AI 灵感雷达（最近 3 日）",
    "",
    "```dataview",
    "TABLE WITHOUT ID",
    '  ("[[" + file.name + "]]") AS 日报,',
    "  kept AS 收录,",
    "  categories AS 分类",
    'FROM "无记录不过程/每日记录"',
    'WHERE type = "ai-radar"',
    "SORT radar_date DESC",
    "LIMIT 3",
    "```",
  ].join("\n");
}

/** 把面板包进幂等标记。 */
function wrappedPanel(): string {
  return `${PANEL_START}\n${radarPanelMarkdown()}\n${PANEL_END}`;
}

/**
 * 把面板合入主页内容（纯函数，便于测试）：
 *  - 已有标记 → 替换标记之间内容（幂等，可随时升级面板）；
 *  - 无标记   → 追加到文末。
 * 返回 { content, changed }。
 */
export function upsertHomepagePanel(current: string): { content: string; changed: boolean } {
  const panel = wrappedPanel();
  const startIdx = current.indexOf(PANEL_START);
  const endIdx = current.indexOf(PANEL_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = current.slice(0, startIdx);
    const after = current.slice(endIdx + PANEL_END.length);
    const next = `${before}${panel}${after}`;
    return { content: next, changed: next !== current };
  }

  const sep = current.endsWith("\n") ? "\n" : "\n\n";
  return { content: `${current}${sep}${panel}\n`, changed: true };
}

// ----------------------------------------------------------------------------
// 落盘（副作用）
// ----------------------------------------------------------------------------

/** 渲染并写入当日 AI 雷达日报。返回写入的绝对路径。 */
export async function writeRadarReport(
  report: DailyRadarReport,
  opts: WriteOptions = {},
): Promise<string> {
  const vaultDir = opts.vaultDir ?? DEFAULT_VAULT_DIR;
  const dir = join(vaultDir, DAILY_SUBDIR);
  await mkdir(dir, { recursive: true });
  const path = join(dir, reportFileName(report.date));
  await writeFile(path, renderObsidianNote(report), "utf8");
  return path;
}

/**
 * 幂等挂载主页面板。主页不存在时跳过（不擅自创建主页），返回状态而非抛错。
 */
export async function ensureHomepagePanel(
  opts: WriteOptions = {},
): Promise<{ path: string; status: "updated" | "unchanged" | "missing" }> {
  const vaultDir = opts.vaultDir ?? DEFAULT_VAULT_DIR;
  const path = join(vaultDir, HOMEPAGE_FILENAME);
  if (!existsSync(path)) return { path, status: "missing" };

  const current = await readFile(path, "utf8");
  const { content, changed } = upsertHomepagePanel(current);
  if (changed) await writeFile(path, content, "utf8");
  return { path, status: changed ? "updated" : "unchanged" };
}

/** 一步到位：写日报 + 挂主页面板。 */
export async function publishReport(
  report: DailyRadarReport,
  opts: WriteOptions = {},
): Promise<{ reportPath: string; homepage: Awaited<ReturnType<typeof ensureHomepagePanel>> }> {
  const reportPath = await writeRadarReport(report, opts);
  const homepage = await ensureHomepagePanel(opts);
  return { reportPath, homepage };
}
