import type { LlmConfig } from "./processor.js";
import type { CategorizedUser, RadarConfig, UserCategory } from "./types.js";

export const DEFAULT_CATEGORIZED_USERS: CategorizedUser[] = [
  { username: "karpathy", category: "ai_leader", displayName: "Andrej Karpathy" },
  { username: "fchollet", category: "ai_leader", displayName: "Francois Chollet" },
  { username: "sama", category: "ai_leader", displayName: "Sam Altman" },
  { username: "ylecun", category: "ai_leader", displayName: "Yann LeCun" },
  { username: "drfeifei", category: "ai_leader", displayName: "Fei-Fei Li" },
  { username: "ID_AA_Carmack", category: "ai_leader", displayName: "John Carmack" },
  { username: "elonmusk", category: "ai_leader" },
  { username: "jeremyphoward", category: "ai_leader", displayName: "Jeremy Howard" },
  { username: "lilianweng", category: "ai_leader", displayName: "Lilian Weng" },
  { username: "polynoamial", category: "ai_leader", displayName: "Noam Brown" },
  { username: "goodside", category: "ai_leader", displayName: "Riley Goodside" },
  { username: "simonw", category: "ai_leader", displayName: "Simon Willison" },

  { username: "deepseek_ai", category: "ai_company", displayName: "DeepSeek" },
  { username: "ElevenLabs", category: "ai_company" },
  { username: "GoogleAI", category: "ai_company" },
  { username: "xai", category: "ai_company" },
  { username: "cursor_ai", category: "ai_company" },
  { username: "anthropicai", category: "ai_company" },
  { username: "OpenClaw", category: "ai_company" },
  { username: "theworldlabs", category: "ai_company", displayName: "World Labs" },
  { username: "thinkymachines", category: "ai_company", displayName: "Thinking Machines Lab" },
  { username: "chorus_agent", category: "ai_company" },
  { username: "isoformai", category: "ai_company" },
  { username: "wesight_ai", category: "ai_company" },

  { username: "bcherny", category: "ai_dev_kol", displayName: "Boris Cherny" },
  { username: "leerob", category: "ai_dev_kol", displayName: "Lee Robinson" },
  { username: "mattpocockuk", category: "ai_dev_kol", displayName: "Matt Pocock" },
  { username: "milichab", category: "ai_dev_kol", displayName: "Andrew Milich" },
  { username: "ericzakariasson", category: "ai_dev_kol", displayName: "Eric Zakariasson" },
  { username: "ammaar", category: "ai_dev_kol", displayName: "Ammaar Reshi" },
  { username: "OfficialLoganK", category: "ai_dev_kol", displayName: "Logan Kilpatrick" },
  { username: "jxnlco", category: "ai_dev_kol", displayName: "Jason" },
  { username: "gabriel1", category: "ai_dev_kol", displayName: "Gabriel" },
  { username: "trq212", category: "ai_dev_kol", displayName: "Thariq" },
  { username: "fofrAI", category: "ai_dev_kol", displayName: "fofr" },
  { username: "gregisenberg", category: "ai_dev_kol", displayName: "Greg Isenberg" },
  { username: "levelsio", category: "ai_dev_kol" },
  { username: "jackfriks", category: "ai_dev_kol" },
  { username: "corbin_braun", category: "ai_dev_kol" },

  { username: "dontbesilent", category: "ai_chinese" },
  { username: "xiaoxiaodong01", category: "ai_chinese", displayName: "小小东" },
  { username: "MissCat_AI", category: "ai_chinese", displayName: "猫小姐学AI" },
  { username: "HiTw93", category: "ai_chinese" },
  { username: "lxfater", category: "ai_chinese" },
  { username: "yetone", category: "ai_chinese" },
  { username: "CoderDaMing", category: "ai_chinese" },
  { username: "MinLiBuilds", category: "ai_chinese", displayName: "实践哥MinLi" },
  { username: "muskdashu", category: "ai_chinese", displayName: "马斯克大叔" },
  { username: "TinaLearning", category: "ai_chinese" },
  { username: "godofprompt", category: "ai_chinese" },
  { username: "bourneliu66", category: "ai_chinese" },
  { username: "canghe", category: "ai_chinese" },
  { username: "laobaishare", category: "ai_chinese", displayName: "老白分享" },
  { username: "Zesee", category: "ai_chinese" },
  { username: "lifesinger", category: "ai_chinese" },
  { username: "knowledgefxg", category: "ai_chinese", displayName: "知识FXG" },
  { username: "songguoxiansen", category: "ai_chinese", displayName: "宋国先生" },
  { username: "trawasthi_ai", category: "ai_chinese" }
];

export function getRadarConfig(): RadarConfig {
  const users = getCategorizedUsers();
  const usernames = users.map((user) => user.username);
  const hosts = process.env.NITTER_HOSTS?.split(",").map((host) => host.trim()).filter(Boolean);

  return {
    usernames,
    users,
    sources: {
      nitter: {
        hosts,
        lookbackHours: numberFromEnv("AI_RADAR_LOOKBACK_HOURS"),
        timeoutMs: numberFromEnv("AI_RADAR_NITTER_TIMEOUT_MS")
      }
    }
  };
}

export function getCategorizedUsers(): CategorizedUser[] {
  const configured = process.env.AI_RADAR_USERNAMES?.split(",").map((name) => name.trim()).filter(Boolean);
  if (!configured?.length) return DEFAULT_CATEGORIZED_USERS;

  const defaults = new Map(DEFAULT_CATEGORIZED_USERS.map((user) => [normalizeUsername(user.username), user]));
  return configured.map((username) => {
    const known = defaults.get(normalizeUsername(username));
    return known ? { ...known, username } : { username, category: "personal_interest" };
  });
}

export function getLlmConfig(): Partial<LlmConfig> {
  const provider = process.env.AI_RADAR_LLM_PROVIDER as LlmConfig["provider"] | undefined;

  return {
    provider,
    apiKey: process.env.AI_RADAR_LLM_API_KEY,
    model: process.env.AI_RADAR_LLM_MODEL,
    baseUrl: process.env.AI_RADAR_LLM_BASE_URL,
    temperature: numberFromEnv("AI_RADAR_LLM_TEMPERATURE"),
    timeoutMs: numberFromEnv("AI_RADAR_LLM_TIMEOUT_MS")
  };
}

function numberFromEnv(key: string): number | undefined {
  const value = process.env[key];
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, "").toLowerCase();
}
