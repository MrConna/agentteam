import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { getCategorizedUsers } from "../src/config.js";
import { prefilterTweets, parseLlmJson, toMarkdown, userCategoryBadge } from "../src/processor.js";
import type { DailyRadarReport } from "../src/processor.js";
import {
  DAILY_SUBDIR,
  HOMEPAGE_FILENAME,
  renderObsidianNote,
  reportFileName,
  upsertHomepagePanel,
  writeRadarReport,
  ensureHomepagePanel,
} from "../src/obsidian.js";
import type { Tweet } from "../src/types.js";

function tweet(partial: Partial<Tweet>): Tweet {
  return {
    id: "1",
    username: "karpathy",
    text: "",
    url: "https://nitter.net/karpathy/status/1",
    createdAt: "2026-06-09T00:00:00.000Z",
    isRetweet: false,
    source: "nitter-rss",
    ...partial,
  };
}

const sampleReport: DailyRadarReport = {
  date: "2026-06-09",
  generatedAt: "2026-06-09T01:00:00.000Z",
  model: "gpt-4o-mini",
  provider: "openai",
  totalRaw: 5,
  totalSent: 3,
  totalKept: 2,
  items: [
    {
      username: "karpathy",
      userCategory: "ai_leader",
      userDisplayName: "Andrej Karpathy",
      category: "新技术/新模型",
      original: "New tiny model released, runs on a laptop.",
      translation: "发布了可在笔记本上运行的小模型。",
      summary: "小模型本地可跑",
      insight: "可以试着在 side project 里替换云端推理以降本。",
      url: "https://nitter.net/karpathy/status/1",
      createdAt: "2026-06-09T00:00:00.000Z",
      signal: 0.9,
    },
    {
      username: "sama",
      userCategory: "ai_leader",
      userDisplayName: "Sam Altman",
      category: "前沿观点",
      original: "Scaling still matters.",
      translation: "规模化依然重要。",
      summary: "规模化仍是主线",
      insight: "",
      url: "https://nitter.net/sama/status/2",
      createdAt: "2026-06-09T00:10:00.000Z",
      signal: 0.6,
    },
  ],
  byCategory: { "新技术/新模型": 1, "前沿观点": 1 },
  byUserCategory: {
    ai_leader: 2,
    ai_company: 0,
    ai_dev_kol: 0,
    ai_chinese: 0,
    tech_business: 0,
    personal_interest: 0,
  },
};

// --- config: categorized users --------------------------------------------

test("getCategorizedUsers 为默认名单保留分类，并兼容 AI_RADAR_USERNAMES 旧格式", () => {
  const previous = process.env.AI_RADAR_USERNAMES;
  try {
    delete process.env.AI_RADAR_USERNAMES;
    const defaults = getCategorizedUsers();
    assert.ok(defaults.some((user) => user.username === "karpathy" && user.category === "ai_leader"));
    assert.ok(defaults.some((user) => user.username === "deepseek_ai" && user.category === "ai_company"));

    process.env.AI_RADAR_USERNAMES = "karpathy,unknown_builder";
    const configured = getCategorizedUsers();
    assert.deepEqual(
      configured.map((user) => [user.username, user.category]),
      [
        ["karpathy", "ai_leader"],
        ["unknown_builder", "personal_interest"],
      ],
    );
  } finally {
    if (previous === undefined) {
      delete process.env.AI_RADAR_USERNAMES;
    } else {
      process.env.AI_RADAR_USERNAMES = previous;
    }
  }
});

// --- processor: prefilter -------------------------------------------------

test("prefilterTweets 丢弃转推/纯链接/表情口水推，保留实质内容", () => {
  const input = [
    tweet({ id: "a", text: "Big release: a new open model with strong reasoning." }),
    tweet({ id: "b", text: "RT @someone: cool", isRetweet: true }),
    tweet({ id: "c", text: "https://example.com" }),
    tweet({ id: "d", text: "🔥🔥🔥!!!" }),
    tweet({ id: "e", text: "   " }),
  ];
  const kept = prefilterTweets(input);
  assert.deepEqual(kept.map((t) => t.id), ["a"]);
});

// --- processor: JSON 容错 --------------------------------------------------

test("parseLlmJson 能剥离 ``` 围栏并解析", () => {
  const raw = "```json\n{\"items\":[{\"original\":\"x\",\"signal\":0.8}]}\n```";
  const out = parseLlmJson(raw);
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].original, "x");
});

test("parseLlmJson 对坏输入返回空 items 而非抛错", () => {
  assert.deepEqual(parseLlmJson("not json at all"), { items: [] });
});

// --- processor: markdown ---------------------------------------------------

test("toMarkdown 含双语、分类与灵感", () => {
  const md = toMarkdown(sampleReport);
  assert.match(md, /AI 灵感雷达 · 2026-06-09/);
  assert.match(md, /新技术\/新模型/);
  assert.match(md, /发布了可在笔记本上运行的小模型/);
  assert.match(md, /灵感/);
});

test("toMarkdown 在 @用户名 旁渲染分类 emoji 徽章", () => {
  const md = toMarkdown(sampleReport);
  // ai_leader → 🧠，应紧邻 @karpathy。
  assert.match(md, /🧠 @karpathy/);
});

test("userCategoryBadge 覆盖全部分类且对 undefined 安全", () => {
  assert.equal(userCategoryBadge("ai_leader"), "🧠");
  assert.equal(userCategoryBadge("ai_chinese"), "🇨🇳");
  assert.equal(userCategoryBadge("ai_company"), "🏢");
  assert.equal(userCategoryBadge("ai_dev_kol"), "💻");
  assert.equal(userCategoryBadge(undefined), "");
});

// --- obsidian: 渲染 --------------------------------------------------------

test("renderObsidianNote 产出可被 Dataview 检索的 frontmatter", () => {
  const note = renderObsidianNote(sampleReport);
  assert.match(note, /^---\n/);
  assert.match(note, /type: ai-radar/);
  assert.match(note, /radar_date: 2026-06-09/);
  assert.match(note, /kept: 2/);
  assert.match(note, /今日核心灵感/);
});

test("reportFileName 形如 AI雷达-<Date>.md", () => {
  assert.equal(reportFileName("2026-06-09"), "AI雷达-2026-06-09.md");
});

// --- obsidian: 主页面板幂等 -------------------------------------------------

test("upsertHomepagePanel 追加后再次运行保持幂等", () => {
  const base = "# 🏠 我的知识库\n\n## 🚀 快速入口\n";
  const first = upsertHomepagePanel(base);
  assert.equal(first.changed, true);
  assert.match(first.content, /AI 灵感雷达（最近 3 日）/);

  const second = upsertHomepagePanel(first.content);
  assert.equal(second.changed, false);
  assert.equal(second.content, first.content);
});

// --- obsidian: 落盘（临时目录） --------------------------------------------

test("writeRadarReport + ensureHomepagePanel 写入临时 vault", async () => {
  const vaultDir = mkdtempSync(join(tmpdir(), "ai-radar-vault-"));
  try {
    // 准备一个已有主页。
    const homepagePath = join(vaultDir, HOMEPAGE_FILENAME);
    writeFileSync(homepagePath, "# 🏠 我的知识库\n", "utf8");

    const path = await writeRadarReport(sampleReport, { vaultDir });
    assert.ok(path.endsWith(join(DAILY_SUBDIR, "AI雷达-2026-06-09.md")));
    const written = readFileSync(path, "utf8");
    assert.match(written, /type: ai-radar/);

    const res = await ensureHomepagePanel({ vaultDir });
    assert.equal(res.status, "updated");
    assert.match(readFileSync(homepagePath, "utf8"), /AI 灵感雷达（最近 3 日）/);

    // 再跑一次应为 unchanged（幂等）。
    const again = await ensureHomepagePanel({ vaultDir });
    assert.equal(again.status, "unchanged");
  } finally {
    rmSync(vaultDir, { recursive: true, force: true });
  }
});

test("ensureHomepagePanel 主页缺失时返回 missing 而不报错", async () => {
  const vaultDir = mkdtempSync(join(tmpdir(), "ai-radar-empty-"));
  try {
    const res = await ensureHomepagePanel({ vaultDir });
    assert.equal(res.status, "missing");
  } finally {
    rmSync(vaultDir, { recursive: true, force: true });
  }
});
