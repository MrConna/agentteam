import { createHash } from "node:crypto";
import Parser from "rss-parser";
import type { NitterRssSourceConfig, Tweet, TwitterSource } from "../types.js";

interface RssItemLike {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  contentSnippet?: string;
  summary?: string;
  creator?: string;
}

interface ParsedFeedLike {
  items?: RssItemLike[];
}

const DEFAULT_NITTER_HOST = "https://nitter.net";
const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export class NitterRssSource implements TwitterSource {
  private readonly hosts: string[];
  private readonly lookbackHours: number;
  private readonly timeoutMs: number;
  private readonly now: () => Date;
  private readonly fetchImpl: typeof fetch;
  private readonly parser = new Parser();

  constructor(config: NitterRssSourceConfig = {}) {
    const configuredHosts = config.hosts?.length ? config.hosts : [config.host ?? DEFAULT_NITTER_HOST];
    this.hosts = [...new Set(configuredHosts.map(normalizeHost))];
    this.lookbackHours = config.lookbackHours ?? DEFAULT_LOOKBACK_HOURS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = config.now ?? (() => new Date());
    this.fetchImpl = config.fetch ?? globalThis.fetch;

    if (!this.fetchImpl) {
      throw new Error("NitterRssSource requires a fetch implementation. Use Node 20+ or pass config.fetch.");
    }
    if (this.lookbackHours <= 0) {
      throw new Error("lookbackHours must be greater than 0.");
    }
  }

  async fetchLatestTweets(username: string): Promise<Tweet[]> {
    const handle = normalizeUsername(username);
    const errors: string[] = [];

    for (const host of this.hosts) {
      try {
        const feedXml = await this.fetchFeedXml(buildRssUrl(host, handle));
        const parsedFeed = (await this.parser.parseString(feedXml)) as ParsedFeedLike;
        return this.toTweets(parsedFeed.items ?? [], handle);
      } catch (error) {
        errors.push(`${host}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`Failed to fetch Nitter RSS for @${handle}. Attempts: ${errors.join(" | ")}`);
  }

  private async fetchFeedXml(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: {
          accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
          "user-agent": "AI-Inspiration-Radar/0.1 (+https://github.com/agentteam)"
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      }

      const body = await response.text();
      if (!body.trim()) {
        throw new Error("empty RSS response");
      }
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  private toTweets(items: RssItemLike[], username: string): Tweet[] {
    const now = this.now();
    const cutoff = new Date(now.getTime() - this.lookbackHours * 60 * 60 * 1000);
    const seen = new Set<string>();
    const tweets: Tweet[] = [];

    for (const item of items) {
      const createdAtDate = parseRssDate(item);
      if (!createdAtDate) continue;
      if (createdAtDate < cutoff) continue;
      if (createdAtDate.getTime() - now.getTime() > MAX_FUTURE_SKEW_MS) continue;

      const text = cleanTweetText(item.contentSnippet ?? item.content ?? item.summary ?? item.title ?? "");
      if (!text) continue;

      const url = normalizeTweetUrl(item.link ?? item.guid ?? "", this.hosts[0], username);
      const id = extractTweetId(url) ?? extractTweetId(item.guid ?? "") ?? fallbackId(username, createdAtDate, text);
      if (seen.has(id)) continue;
      seen.add(id);

      tweets.push({
        id,
        username,
        text,
        url,
        createdAt: createdAtDate.toISOString(),
        isRetweet: detectRetweet(text, item.title),
        source: "nitter-rss"
      });
    }

    return tweets.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
}

function normalizeHost(host: string): string {
  const withProtocol = /^https?:\/\//i.test(host) ? host : `https://${host}`;
  const url = new URL(withProtocol);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
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

function buildRssUrl(host: string, username: string): string {
  return `${host}/${encodeURIComponent(username)}/rss`;
}

function parseRssDate(item: RssItemLike): Date | null {
  const rawDate = item.isoDate ?? item.pubDate;
  if (!rawDate) return null;

  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function cleanTweetText(input: string): string {
  return decodeXmlEntities(
    input
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/?p\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeXmlEntities(input: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"'
  };

  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return namedEntities[entity] ?? match;
  });
}

function normalizeTweetUrl(rawUrl: string, host: string, username: string): string {
  if (!rawUrl) return `${host}/${username}`;

  try {
    return new URL(rawUrl, host).toString();
  } catch {
    return rawUrl;
  }
}

function extractTweetId(value: string): string | null {
  return value.match(/\/status(?:es)?\/(\d+)/i)?.[1] ?? null;
}

function fallbackId(username: string, createdAt: Date, text: string): string {
  return createHash("sha1").update(`${username}\0${createdAt.toISOString()}\0${text}`).digest("hex");
}

function detectRetweet(text: string, title?: string): boolean {
  const candidate = `${title ?? ""}\n${text}`.trim();
  return /^(RT\s+@|retweet(?:ed)?\b|reposted\b|🔁)/i.test(candidate);
}
