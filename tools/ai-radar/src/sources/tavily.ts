import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { Tweet, TwitterSource } from "../types.js";

interface TavilySearchResultLike {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string;
  published_date?: string;
  score?: number;
}

type TavilyJsonLike =
  | TavilySearchResultLike[]
  | {
      results?: TavilySearchResultLike[];
      answer?: string;
    };

export interface TavilySourceConfig {
  command?: string;
  maxResults?: number;
  now?: () => Date;
}

const DEFAULT_MAX_RESULTS = 3;

export class TavilySource implements TwitterSource {
  private readonly command: string;
  private readonly maxResults: number;
  private readonly now: () => Date;

  constructor(config: TavilySourceConfig = {}) {
    this.command = config.command ?? "tvly";
    this.maxResults = config.maxResults ?? DEFAULT_MAX_RESULTS;
    this.now = config.now ?? (() => new Date());
  }

  async fetchLatestTweets(username: string): Promise<Tweet[]> {
    const handle = normalizeUsername(username);
    const query = `${handle} latest tweets on x.com`;
    const result = spawnSync(
      this.command,
      ["search", query, "--max-results", String(this.maxResults), "--json"],
      {
        encoding: "utf8",
        env: process.env,
        timeout: 30_000
      }
    );

    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || "unknown tvly failure").trim();
      throw new Error(`Tavily search failed for @${handle}: ${detail}`);
    }

    return parseTavilyTweets(result.stdout, handle, this.now());
  }
}

export function parseTavilyTweets(rawJson: string, username: string, now = new Date()): Tweet[] {
  const handle = normalizeUsername(username);
  const parsed = parseJson(rawJson);
  const results = Array.isArray(parsed) ? parsed : parsed.results ?? [];
  const seen = new Set<string>();
  const tweets: Tweet[] = [];

  for (const item of results) {
    const url = normalizeTweetUrl(item.url ?? "", handle);
    const haystack = `${item.title ?? ""}\n${item.content ?? ""}\n${item.raw_content ?? ""}`;
    if (!isRelevantToHandle(url, haystack, handle)) continue;

    const text = extractTweetText(haystack, handle);
    if (!text) continue;

    const createdAt = parseDate(item.published_date) ?? now;
    const id = extractTweetId(url) ?? fallbackId(handle, createdAt, text);
    if (seen.has(id)) continue;
    seen.add(id);

    tweets.push({
      id,
      username: handle,
      text,
      url,
      createdAt: createdAt.toISOString(),
      isRetweet: detectRetweet(text),
      source: "tavily-search"
    });
  }

  return tweets.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function parseJson(rawJson: string): TavilyJsonLike {
  try {
    return JSON.parse(rawJson) as TavilyJsonLike;
  } catch (error) {
    throw new Error(`Malformed Tavily JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeUsername(username: string): string {
  const trimmed = username.trim().replace(/^@/, "");
  const fromUrl = trimmed.match(/(?:twitter\.com|x\.com|nitter\.[^/]+)\/([^/?#]+)/i)?.[1];
  const handle = (fromUrl ?? trimmed).replace(/\/.*$/, "");

  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    throw new Error(`Invalid Twitter/X username: ${username}`);
  }

  return handle;
}

function normalizeTweetUrl(rawUrl: string, username: string): string {
  if (!rawUrl) return `https://x.com/${username}`;

  try {
    const url = new URL(rawUrl);
    if (/^(?:www\.)?twitter\.com$/i.test(url.hostname)) {
      url.hostname = "x.com";
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function isRelevantToHandle(url: string, content: string, username: string): boolean {
  const escaped = escapeRegExp(username);
  return (
    new RegExp(`(?:x\\.com|twitter\\.com)/${escaped}(?:[/\\s?#]|$)`, "i").test(url) ||
    new RegExp(`@${escaped}\\b`, "i").test(content) ||
    new RegExp(`(?:x\\.com|twitter\\.com)/${escaped}(?:[/\\s?#]|$)`, "i").test(content)
  );
}

function extractTweetText(input: string, username: string): string {
  const cleaned = cleanText(input);
  if (!cleaned) return "";

  const handlePattern = new RegExp(`(?:^|\\s)@?${escapeRegExp(username)}\\s*[:：-]\\s*`, "i");
  const withoutPrefix = cleaned.replace(handlePattern, " ").trim();
  const statusSplit = withoutPrefix.split(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]+\/status(?:es)?\/\d+/i)[0];
  return trimTweetLength(statusSplit || withoutPrefix);
}

function cleanText(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimTweetLength(text: string): string {
  const maxLength = 600;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractTweetId(value: string): string | null {
  return value.match(/\/status(?:es)?\/(\d+)/i)?.[1] ?? null;
}

function fallbackId(username: string, createdAt: Date, text: string): string {
  return createHash("sha1").update(`tavily\0${username}\0${createdAt.toISOString()}\0${text}`).digest("hex");
}

function detectRetweet(text: string): boolean {
  return /^(RT\s+@|retweet(?:ed)?\b|reposted\b)/i.test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
