export interface GithubTrendingRepo {
  repo: string;
  description: string;
  todayStars: number;
  language?: string;
  url: string;
}

const GITHUB_TRENDING_URL = "https://github.com/trending";

/**
 * Fetch GitHub daily trending repositories and parse the public HTML page.
 *
 * GitHub does not expose an official Trending API, so this intentionally uses a
 * conservative, dependency-free parser scoped to the stable <article> cards on
 * https://github.com/trending. Missing optional fields are returned as empty
 * strings / undefined rather than failing the whole source.
 */
export async function fetchGithubTrending(language?: string): Promise<GithubTrendingRepo[]> {
  const url = buildTrendingUrl(language);
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "AI-Inspiration-Radar/0.1 (+https://github.com/agentteam)",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub Trending fetch failed: HTTP ${response.status} ${response.statusText}`.trim());
  }

  return parseGithubTrendingHtml(await response.text());
}

function buildTrendingUrl(language?: string): string {
  const trimmedLanguage = language?.trim();
  const path = trimmedLanguage ? `/${encodeURIComponent(trimmedLanguage)}` : "";
  return `${GITHUB_TRENDING_URL}${path}?since=daily`;
}

function parseGithubTrendingHtml(html: string): GithubTrendingRepo[] {
  const articles = html.match(/<article\b[\s\S]*?<\/article>/gi) ?? [];
  const repos: GithubTrendingRepo[] = [];
  const seen = new Set<string>();

  for (const article of articles) {
    const repo = extractRepo(article);
    if (!repo || seen.has(repo)) continue;
    seen.add(repo);

    repos.push({
      repo,
      description: extractDescription(article),
      todayStars: extractTodayStars(article),
      language: extractLanguage(article),
      url: `https://github.com/${repo}`,
    });
  }

  return repos;
}

function extractRepo(article: string): string | null {
  const href = article.match(/<h2\b[\s\S]*?<a\b[^>]*href=["']\/([^"'?#]+)["'][^>]*>/i)?.[1];
  if (!href) return null;

  const parts = href.split("/").map((part) => decodeURIComponent(part.trim())).filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[0]}/${parts[1]}`;
}

function extractDescription(article: string): string {
  const paragraph =
    article.match(/<p\b[^>]*class=["'][^"']*col-9[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ??
    article.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ??
    "";
  return cleanHtmlText(paragraph);
}

function extractLanguage(article: string): string | undefined {
  const language = article.match(/<span\b[^>]*itemprop=["']programmingLanguage["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const cleaned = language ? cleanHtmlText(language) : "";
  return cleaned || undefined;
}

function extractTodayStars(article: string): number {
  const raw = cleanHtmlText(article.match(/([\d,]+)\s+stars?\s+today/i)?.[1] ?? "0");
  const parsed = Number.parseInt(raw.replace(/,/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanHtmlText(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(input: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
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
