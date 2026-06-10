export type TweetSourceKind = "nitter-rss" | "rapidapi-twitter" | "tavily-search";

export type UserCategory =
  | "ai_leader"
  | "ai_company"
  | "ai_dev_kol"
  | "ai_chinese"
  | "tech_business"
  | "personal_interest";

export interface CategorizedUser {
  username: string;
  category: UserCategory;
  displayName?: string;
}

export interface Tweet {
  /** Stable tweet/status identifier when present in the source URL or RSS guid. */
  id: string;
  /** Twitter/X handle without @. */
  username: string;
  /** Plain-text tweet body with HTML/CDATA/entities removed. */
  text: string;
  /** Source URL for the original item, usually on the selected Nitter host. */
  url: string;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** Best-effort retweet/repost detection from Nitter title/body conventions. */
  isRetweet: boolean;
  /** Adapter that produced this item. */
  source: TweetSourceKind;
}

export interface TwitterSource {
  fetchLatestTweets(username: string): Promise<Tweet[]>;
}

export interface NitterRssSourceConfig {
  /** Preferred Nitter host, e.g. https://nitter.net. Ignored when hosts is provided. */
  host?: string;
  /** Ordered fallback Nitter hosts. */
  hosts?: string[];
  /** Only return tweets newer than now - lookbackHours. Defaults to 24. */
  lookbackHours?: number;
  /** Request timeout per host in milliseconds. Defaults to 15000. */
  timeoutMs?: number;
  /** Optional clock override for deterministic tests. */
  now?: () => Date;
  /** Optional fetch implementation for tests or custom runtimes. */
  fetch?: typeof fetch;
}

export interface RadarSourceConfig {
  nitter: NitterRssSourceConfig;
}

export interface RadarConfig {
  usernames: string[];
  users: CategorizedUser[];
  sources: RadarSourceConfig;
}

export interface FetchTweetsResult {
  username: string;
  tweets: Tweet[];
}
