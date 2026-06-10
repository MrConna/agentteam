import { pathToFileURL } from "node:url";
import { getCategorizedUsers, getLlmConfig, getRadarConfig } from "./config.js";
import { processTweets, processTrendingRepos } from "./processor.js";
import type { DailyRadarReport } from "./processor.js";
import { publishReport } from "./obsidian.js";
import { NitterRssSource } from "./sources/rss.js";
import { TavilySource } from "./sources/tavily.js";
import { fetchGithubTrending } from "./sources/github.js";
import type { FetchTweetsResult, Tweet } from "./types.js";

export * from "./types.js";
export type { TwitterSource } from "./sources/base.js";
export { NitterRssSource } from "./sources/rss.js";
export { TavilySource } from "./sources/tavily.js";
export { fetchGithubTrending } from "./sources/github.js";
export type { GithubTrendingRepo } from "./sources/github.js";

const DEFAULT_USERNAMES = ["karpathy", "fchollet", "sama", "ylecun", "swyx"];

export async function fetchLatestTweetsForUsers(usernames: string[]): Promise<FetchTweetsResult[]> {
  const hosts = process.env.NITTER_HOSTS?.split(",").map((host) => host.trim()).filter(Boolean);
  const nitterSource = new NitterRssSource({ hosts });
  const tavilySource = new TavilySource();

  return Promise.all(
    usernames.map(async (username) => {
      try {
        const tweets = await nitterSource.fetchLatestTweets(username);
        if (tweets.length > 0) return { username, tweets };
        console.warn(`[radar] @${username} Nitter RSS returned 0 tweets; falling back to Tavily search.`);
      } catch (error) {
        console.warn(
          `[radar] @${username} Nitter RSS failed; falling back to Tavily search: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      try {
        return {
          username,
          tweets: await tavilySource.fetchLatestTweets(username)
        };
      } catch (error) {
        console.warn(
          `[radar] @${username} Tavily fallback failed: ${error instanceof Error ? error.message : String(error)}`
        );
        return { username, tweets: [] };
      }
    })
  );
}

/** FetchTweetsResult[] → processor 期望的 Record<username, Tweet[]>。 */
function groupByAuthor(results: FetchTweetsResult[]): Record<string, Tweet[]> {
  const out: Record<string, Tweet[]> = {};
  for (const r of results) out[r.username] = r.tweets;
  return out;
}

/**
 * 端到端流水线：抓取 → 本地预过滤 + LLM 去噪/翻译/分类/提炼 → 写入 Obsidian + 挂主页面板。
 * 预过滤在 processor.processTweets 内部完成（prefilterTweets），此处只做编排。
 */
export async function runRadar(options: { usernames?: string[]; dryRun?: boolean; trendingLanguage?: string } = {}): Promise<{
  report: DailyRadarReport;
  reportPath?: string;
}> {
  const radarConfig = getRadarConfig();
  const configuredUsers = options.usernames
    ? getCategorizedUsers().filter((user) => options.usernames?.includes(user.username))
    : radarConfig.users;
  const usernames = options.usernames ?? configuredUsers.map((user) => user.username) ?? DEFAULT_USERNAMES;

  console.log(`[radar] 抓取 ${usernames.length} 位博主推文：${usernames.join(", ")}`);
  const fetched = await fetchLatestTweetsForUsers(usernames);
  const rawCount = fetched.reduce((n, r) => n + r.tweets.length, 0);
  console.log(`[radar] 共抓取 ${rawCount} 条，开始 LLM 处理…`);

  const report = await processTweets(groupByAuthor(fetched), { llm: getLlmConfig(), users: configuredUsers });
  console.log(`[radar] 处理完成：送审 ${report.totalSent} → 收录 ${report.totalKept} 条`);

  const trendingLanguage = options.trendingLanguage ?? process.env.AI_RADAR_GITHUB_LANGUAGE;
  try {
    console.log(`[radar] 抓取 GitHub Trending${trendingLanguage ? `（${trendingLanguage}）` : ""}…`);
    const trendingRepos = await fetchGithubTrending(trendingLanguage);
    report.trending = processTrendingRepos(trendingRepos, { date: report.date });
    console.log(`[radar] GitHub Trending 收录 ${report.trending.repos.length} 个仓库。`);
  } catch (error) {
    console.warn(`[radar] GitHub Trending 抓取失败：${error instanceof Error ? error.message : String(error)}`);
    report.trending = processTrendingRepos([], { date: report.date });
  }

  if (options.dryRun) {
    console.log("[radar] dryRun：跳过写入 Obsidian。");
    return { report };
  }

  const { reportPath, homepage } = await publishReport(report);
  console.log(`[radar] 日报已写入：${reportPath}`);
  console.log(`[radar] 主页面板：${homepage.status}（${homepage.path}）`);
  return { report, reportPath };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const trendingLanguage = args
    .find((arg) => arg.startsWith("--github-language=") || arg.startsWith("--trending-language="))
    ?.split("=", 2)[1];
  const usernames = args.filter((a) => !a.startsWith("--"));
  await runRadar({ usernames: usernames.length ? usernames : undefined, dryRun, trendingLanguage });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
