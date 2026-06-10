/**
 * RADAR-02 — LLM 处理器与 Prompt 调试
 * ============================================================================
 * 输入：某博主过去 24h 的推文集合（Tweet[]，由 RADAR-01 的 sources/ 抓取）。
 * 输出：结构化日报（DailyRadarReport），可被 RADAR-03 的 obsidian.ts 渲染落盘。
 *
 * 设计目标
 *  1. 多模型对接：OpenAI / DeepSeek（同为 /chat/completions 协议）走同一适配器，
 *     Gemini 走 generateContent。统一用 fetch，零 SDK 依赖、可移植。
 *  2. 两段式去噪：先用廉价的本地启发式过滤掉纯转推 / 表情 / 空内容，再把剩余
 *     推文交给 LLM 做语义级去噪、中英对照翻译、分类、灵感提炼 —— 省 token、降噪声。
 *  3. 强约束输出：要求模型返回 JSON（OpenAI/DeepSeek 用 response_format，
 *     Gemini 用 responseMimeType），并在解析层做容错（剥离 ``` 围栏、校验结构）。
 *
 * 依赖契约（由 RADAR-01 / 脚手架提供，本文件只消费、不重复定义）：
 *  - ./types.ts        导出 Tweet（见 spec §2.1）
 *  - ./config.ts       可选；若缺失则本文件回退到 process.env（见 resolveLlmConfig）
 *
 * 写入范围：仅本文件（tools/ai-radar/src/processor.ts）。
 */

import type { CategorizedUser, Tweet, UserCategory } from "./types.js";
import type { GithubTrendingRepo } from "./sources/github.js";

// ============================================================================
// 1. 类型定义（处理器对外契约）
// ============================================================================

/** 推文分类标签。与 spec §1.2 对齐，外加 noise 兜底。 */
export type RadarCategory =
  | "新技术/新模型"
  | "前沿观点"
  | "行业趋势"
  | "精彩 Demo"
  | "其他";

/** 一条被保留并提炼后的雷达条目。 */
export interface RadarItem {
  username: string;
  userCategory: UserCategory;
  userDisplayName?: string;
  category: RadarCategory;
  /** 原文（英文/原语言）。 */
  original: string;
  /** 中文对照翻译。 */
  translation: string;
  /** 一句话精华摘要（中文）。 */
  summary: string;
  /** AI 灵感：对读者自身研究 / side project 的启发（中文，可为空）。 */
  insight: string;
  url: string;
  createdAt: string;
  /** 0–1，模型对“此条值得收录”的置信度，便于 RADAR-03 排序/截断。 */
  signal: number;
}

/** 单次处理产出的完整日报。 */
export interface DailyRadarReport {
  date: string; // YYYY-MM-DD
  generatedAt: string; // ISO
  model: string;
  provider: LlmProvider;
  /** 抓取到的原始推文数。 */
  totalRaw: number;
  /** 本地启发式过滤后送入 LLM 的数量。 */
  totalSent: number;
  /** 最终保留的高价值条目数。 */
  totalKept: number;
  items: RadarItem[];
  /** 按分类聚合的计数，方便前端/Dataview 概览。 */
  byCategory: Record<string, number>;
  /** 按关注对象分类聚合的计数，方便判断信号来自哪类账号。 */
  byUserCategory: Record<UserCategory, number>;
  /** GitHub Trending daily source summary, appended by the orchestration layer. */
  trending?: TrendingSummary;
}

export type LlmProvider = "openai" | "deepseek" | "gemini";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  /** chat/completions 或 generateContent 的根地址，留空用各家默认。 */
  baseUrl?: string;
  /** 创造性，去噪/翻译任务偏低更稳定。 */
  temperature?: number;
  /** 单次请求超时（ms）。 */
  timeoutMs?: number;
}

export interface ProcessOptions {
  /** 显式覆盖配置；缺省时走 resolveLlmConfig()。 */
  llm?: Partial<LlmConfig>;
  /** 报告日期，缺省今天。 */
  date?: string;
  /** signal 低于该阈值的条目丢弃，默认 0.35。 */
  minSignal?: number;
  /** 关注对象分类 metadata，用于在日报中展示来源标签。 */
  users?: CategorizedUser[];
}

export interface TrendingSummary {
  date: string;
  repos: GithubTrendingRepo[];
  summary?: string;
}

export interface ProcessTrendingOptions {
  /** 报告日期，缺省今天。 */
  date?: string;
  /** 最多保留多少个仓库，默认 10。 */
  limit?: number;
}

// ============================================================================
// 2. 本地启发式预过滤（送 LLM 前的廉价去噪）
// ============================================================================

const EMOJI_AND_PUNCT = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\s\p{P}]/gu;
const URL_ONLY = /^\s*(https?:\/\/\S+\s*)+$/i;

/** 去掉表情、空白、标点后是否还剩“实质字符”。 */
function strippedLength(text: string): number {
  return text.replace(EMOJI_AND_PUNCT, "").length;
}

/**
 * 第一道筛子：明显无信息量的推文不值得花 token。
 * 规则刻意保守 —— 宁可让 LLM 再判一次，也不误杀真内容。
 */
export function prefilterTweets(tweets: Tweet[]): Tweet[] {
  return tweets.filter((t) => {
    if (t.isRetweet) return false; // 纯转推交给来源去重，这里直接弃
    const text = (t.text ?? "").trim();
    if (!text) return false;
    if (URL_ONLY.test(text)) return false; // 只有链接、没有评述
    if (strippedLength(text) < 12) return false; // 表情/感叹为主的口水推
    return true;
  });
}

// ============================================================================
// 3. System Prompt（核心资产）
// ============================================================================

/**
 * 高水平系统提示词：把“资深 AI 行业分析师”的判断标准显式编码进去。
 * 关键约束：只输出 JSON、中英对照、灵感必须可执行、噪声直接丢弃。
 */
export const SYSTEM_PROMPT = `你是一名顶尖的 AI 行业研究分析师，专为一位正在做 AI 研究与 side project 的工程师做情报筛选。
你将收到某位 AI 大 V 在过去 24 小时内的推文集合。你的任务是“沙里淘金”：丢弃噪声，提炼真正有价值的信号。

【保留标准】只保留满足以下任一条的推文：
- 新技术 / 新模型 / 新论文 / 新工具的发布或重要更新；
- 对 AI 发展有信息量的前沿观点或判断（非情绪宣泄、非寒暄）；
- 可验证的行业趋势、数据或事件；
- 有启发性的 Demo / 实验结果 / 工程实践。

【丢弃标准】坚决丢弃：纯转推无评述、打招呼、情绪/玩梗、纯表情、活动预告无干货、招聘、营销口号。

【对每条保留的推文输出】
- category：从 ["新技术/新模型","前沿观点","行业趋势","精彩 Demo","其他"] 中择一；
- translation：忠实、地道的简体中文对照翻译（保留专有名词原文，如 GPT-5、Transformer）；
- summary：一句话中文精华（≤40 字），点出“它说了什么”；
- insight：一句话中文“灵感”，回答“这对一个做 AI 研究/side project 的人有什么可执行的启发”。若确实无启发，给空字符串 ""；
- signal：0~1 的浮点数，表示该条对从业者的情报价值（0.9=必读，0.4=边缘，<0.35 应被你直接丢弃不收录）。

【硬性要求】
1. 只输出一个 JSON 对象，不要任何解释、不要 Markdown 代码围栏。
2. 顶层结构：{"items": RadarItem[]}。每个 RadarItem 含字段：original, category, translation, summary, insight, signal。
3. 若全部都是噪声，返回 {"items": []}。
4. 不要编造原文中不存在的事实；翻译与摘要必须忠于原文。`;

/** 把一个博主的推文集合渲染成 user 消息。 */
export function buildUserPrompt(username: string, tweets: Tweet[]): string {
  const lines = tweets.map(
    (t, i) =>
      `#${i + 1} [${t.createdAt}] (${t.url})\n${t.text.trim()}`,
  );
  return `博主：@${username}\n过去 24 小时推文（共 ${tweets.length} 条），请按系统指令筛选与提炼：\n\n${lines.join("\n\n---\n\n")}`;
}

// ============================================================================
// 4. 多模型 LLM 客户端（fetch，无 SDK 依赖）
// ============================================================================

const DEFAULTS: Record<LlmProvider, { baseUrl: string; model: string }> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.0-flash",
  },
};

/**
 * 解析最终生效的 LLM 配置。优先级：显式 opts > config.ts（若存在）> 环境变量。
 * 这里用动态 import 软依赖 config.ts，缺失时静默回退到 env，使本文件可独立运行。
 */
export async function resolveLlmConfig(
  override: Partial<LlmConfig> = {},
): Promise<LlmConfig> {
  let fromConfig: Partial<LlmConfig> = {};
  try {
    // RADAR-01 的 config.ts 若导出 getLlmConfig() 则采用之。
    const mod: any = await import("./config.js");
    fromConfig = (mod.getLlmConfig?.() ?? mod.llmConfig ?? {}) as Partial<LlmConfig>;
  } catch {
    /* config.ts 尚未就绪：回退到 env */
  }

  const provider = (override.provider ??
    fromConfig.provider ??
    (process.env.AI_RADAR_LLM_PROVIDER as LlmProvider) ??
    "openai") as LlmProvider;

  const apiKey =
    override.apiKey ??
    fromConfig.apiKey ??
    process.env[`${provider.toUpperCase()}_API_KEY`] ??
    process.env.AI_RADAR_LLM_API_KEY ??
    "";

  const model =
    override.model ?? fromConfig.model ?? process.env.AI_RADAR_LLM_MODEL ?? DEFAULTS[provider].model;

  return {
    provider,
    apiKey,
    model,
    baseUrl: override.baseUrl ?? fromConfig.baseUrl ?? DEFAULTS[provider].baseUrl,
    temperature: override.temperature ?? fromConfig.temperature ?? 0.2,
    timeoutMs: override.timeoutMs ?? fromConfig.timeoutMs ?? 60_000,
  };
}

/** 统一的“给系统+用户提示词、要 JSON 文本回来”的调用入口。 */
async function callLlm(cfg: LlmConfig, system: string, user: string): Promise<string> {
  if (!cfg.apiKey) throw new Error(`[processor] 缺少 ${cfg.provider} 的 API Key`);
  return cfg.provider === "gemini"
    ? callGemini(cfg, system, user)
    : callOpenAiCompatible(cfg, system, user);
}

/** OpenAI 与 DeepSeek 共用 /chat/completions 协议。 */
async function callOpenAiCompatible(cfg: LlmConfig, system: string, user: string): Promise<string> {
  const res = await fetchWithTimeout(
    `${cfg.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: cfg.temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    },
    cfg.timeoutMs ?? 60_000,
  );
  if (!res.ok) throw new Error(`[processor] ${cfg.provider} HTTP ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

/** Gemini generateContent。把 system 当 systemInstruction，要求 JSON MIME。 */
async function callGemini(cfg: LlmConfig, system: string, user: string): Promise<string> {
  const url = `${cfg.baseUrl}/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: cfg.temperature,
          responseMimeType: "application/json",
        },
      }),
    },
    cfg.timeoutMs ?? 60_000,
  );
  if (!res.ok) throw new Error(`[processor] gemini HTTP ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// ============================================================================
// 5. 输出解析与容错
// ============================================================================

/** 即便要求了 JSON 模式，也防御性地剥离 ```json 围栏并定位首个 JSON 对象。 */
export function parseLlmJson(raw: string): { items: Partial<RadarItem>[] } {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  try {
    const obj = JSON.parse(text);
    return { items: Array.isArray(obj?.items) ? obj.items : [] };
  } catch {
    return { items: [] };
  }
}

const CATEGORIES: RadarCategory[] = ["新技术/新模型", "前沿观点", "行业趋势", "精彩 Demo", "其他"];

/** 把模型给的松散对象规整成严格的 RadarItem，并补齐来源元数据。 */
function normalizeItem(
  raw: Partial<RadarItem>,
  username: string,
  sourceTweets: Tweet[],
  userMeta: CategorizedUser,
): RadarItem | null {
  const original = (raw.original ?? "").trim();
  if (!original) return null;
  // 用原文回连到源推文，拿回真实 url / createdAt（模型可能不会原样回传）。
  const match = sourceTweets.find((t) => t.text.trim().startsWith(original.slice(0, 24)));
  const category = CATEGORIES.includes(raw.category as RadarCategory)
    ? (raw.category as RadarCategory)
    : "其他";
  const signal = clamp01(typeof raw.signal === "number" ? raw.signal : 0.5);
  return {
    username,
    userCategory: userMeta.category,
    userDisplayName: userMeta.displayName,
    category,
    original,
    translation: (raw.translation ?? "").trim(),
    summary: (raw.summary ?? "").trim(),
    insight: (raw.insight ?? "").trim(),
    url: match?.url ?? raw.url ?? "",
    createdAt: match?.createdAt ?? raw.createdAt ?? "",
    signal,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, "").toLowerCase();
}

function emptyUserCategoryCounts(): Record<UserCategory, number> {
  return {
    ai_leader: 0,
    ai_company: 0,
    ai_dev_kol: 0,
    ai_chinese: 0,
    tech_business: 0,
    personal_interest: 0,
  };
}

// ============================================================================
// 6. 主入口
// ============================================================================

/**
 * 处理“多博主 → 单份日报”。逐博主调用 LLM（隔离 token、防止串味），
 * 汇总后按 signal 降序，产出结构化 DailyRadarReport。
 */
export async function processTweets(
  tweetsByAuthor: Record<string, Tweet[]>,
  options: ProcessOptions = {},
): Promise<DailyRadarReport> {
  const cfg = await resolveLlmConfig(options.llm);
  const minSignal = options.minSignal ?? 0.35;
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const usersByName = new Map(
    (options.users ?? []).map((user) => [normalizeUsername(user.username), user]),
  );

  let totalRaw = 0;
  let totalSent = 0;
  const items: RadarItem[] = [];

  for (const [username, tweets] of Object.entries(tweetsByAuthor)) {
    const userMeta = usersByName.get(normalizeUsername(username)) ?? {
      username,
      category: "personal_interest" as const,
    };
    totalRaw += tweets.length;
    const candidates = prefilterTweets(tweets);
    if (candidates.length === 0) continue;
    totalSent += candidates.length;

    const raw = await callLlm(cfg, SYSTEM_PROMPT, buildUserPrompt(username, candidates));
    const { items: parsed } = parseLlmJson(raw);
    for (const p of parsed) {
      const item = normalizeItem(p, username, candidates, userMeta);
      if (item && item.signal >= minSignal) items.push(item);
    }
  }

  items.sort((a, b) => b.signal - a.signal);

  const byCategory: Record<string, number> = {};
  for (const it of items) byCategory[it.category] = (byCategory[it.category] ?? 0) + 1;
  const byUserCategory = emptyUserCategoryCounts();
  for (const it of items) byUserCategory[it.userCategory] = (byUserCategory[it.userCategory] ?? 0) + 1;

  return {
    date,
    generatedAt: new Date().toISOString(),
    model: cfg.model,
    provider: cfg.provider,
    totalRaw,
    totalSent,
    totalKept: items.length,
    items,
    byCategory,
    byUserCategory,
  };
}

// ============================================================================
// 7. GitHub Trending 处理
// ============================================================================

/**
 * 处理 GitHub Trending 仓库：按今日新增 stars 降序、去重、截断，并生成一句稳定摘要。
 * 这里不调用 LLM，保证 dry-run / 无 API Key 时也能把趋势源合入日报。
 */
export function processTrendingRepos(
  repos: GithubTrendingRepo[],
  options: ProcessTrendingOptions = {},
): TrendingSummary {
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const limit = options.limit ?? 10;
  const seen = new Set<string>();
  const sorted = [...repos]
    .filter((repo) => {
      if (!repo.repo || seen.has(repo.repo)) return false;
      seen.add(repo.repo);
      return true;
    })
    .sort((a, b) => b.todayStars - a.todayStars)
    .slice(0, limit);

  const leader = sorted[0];
  return {
    date,
    repos: sorted,
    summary: leader
      ? `今日 GitHub Trending 收录 ${sorted.length} 个项目，最高为 ${leader.repo}（+${leader.todayStars} stars）。`
      : "今日 GitHub Trending 暂无可解析项目。",
  };
}

// ============================================================================
// 8. Markdown 渲染（供 RADAR-03 直接使用，或独立产出干净 MD）
// ============================================================================

/** 把结构化日报渲染成精排 Markdown。RADAR-03 可基于此再套 Obsidian 模板。 */
export function toMarkdown(report: DailyRadarReport): string {
  const head = [
    `# 📡 AI 灵感雷达 · ${report.date}`,
    "",
    `> 模型：\`${report.provider}/${report.model}\` · 抓取 ${report.totalRaw} 条 → 送审 ${report.totalSent} 条 → 收录 **${report.totalKept}** 条`,
    "",
  ];
  const trendingBlock = renderTrendingMarkdown(report.trending);

  if (report.items.length === 0) {
    return [...head, "_今日无高价值信号。_", "", ...trendingBlock].join("\n");
  }

  // 按分类分组输出。
  const grouped = new Map<RadarCategory, RadarItem[]>();
  for (const it of report.items) {
    const arr = grouped.get(it.category) ?? [];
    arr.push(it);
    grouped.set(it.category, arr);
  }

  const body: string[] = [];
  for (const [category, list] of grouped) {
    body.push(`## ${category}（${list.length}）`, "");
    for (const it of list) {
      body.push(
        `### ${renderUserLabel(it)} · ${userCategoryLabel(it.userCategory)} · ${"★".repeat(Math.round(it.signal * 5)).padEnd(5, "☆")}`,
        "",
        `**摘要**：${it.summary || "—"}`,
        "",
        `**原文**：${it.original}`,
        "",
        `**译文**：${it.translation || "—"}`,
        "",
        it.insight ? `> 💡 **灵感**：${it.insight}` : "> 💡 **灵感**：—",
        "",
        it.url ? `[原推链接](${it.url})` : "",
        "",
        "---",
        "",
      );
    }
  }

  return [...head, ...body, ...trendingBlock].join("\n");
}

function renderTrendingMarkdown(trending?: TrendingSummary): string[] {
  if (!trending || trending.repos.length === 0) return [];

  const lines = [
    "## 📈 GitHub 今日热门",
    "",
    trending.summary ? `> ${trending.summary}` : "",
    "",
  ];

  for (const repo of trending.repos) {
    const language = repo.language ? ` · ${repo.language}` : "";
    lines.push(
      `- **[${repo.repo}](${repo.url})**${language} · +${repo.todayStars.toLocaleString("en-US")} stars today`,
      repo.description ? `  - ${repo.description}` : "",
    );
  }

  lines.push("");
  return lines.filter((line, index, arr) => line || arr[index - 1] !== "");
}

export function userCategoryLabel(category: UserCategory): string {
  const labels: Record<UserCategory, string> = {
    ai_leader: "AI 领袖",
    ai_company: "AI 公司",
    ai_dev_kol: "AI 开发者 KOL",
    ai_chinese: "中文 AI",
    tech_business: "科技商业",
    personal_interest: "个人关注",
  };
  return labels[category];
}

/** 关注对象分类的 emoji 徽章，渲染在 @用户名 旁，一眼区分账号类型。 */
export function userCategoryBadge(category?: UserCategory): string {
  const badges: Record<UserCategory, string> = {
    ai_leader: "🧠",
    ai_company: "🏢",
    ai_dev_kol: "💻",
    ai_chinese: "🇨🇳",
    tech_business: "💼",
    personal_interest: "⭐",
  };
  return category ? badges[category] ?? "" : "";
}

function renderUserLabel(item: RadarItem): string {
  const badge = userCategoryBadge(item.userCategory);
  const prefix = badge ? `${badge} ` : "";
  return item.userDisplayName
    ? `${prefix}@${item.username}（${item.userDisplayName}）`
    : `${prefix}@${item.username}`;
}
