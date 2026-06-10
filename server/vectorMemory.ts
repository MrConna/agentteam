import type Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { getDb } from "./db.ts";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-004";
const DEFAULT_LIMIT = 3;

let loadedForDb: WeakSet<Database.Database> = new WeakSet();

export interface VectorSearchResult {
  learningId: string;
  distance: number;
  score: number;
}

export interface AddEmbeddingResult {
  ok: boolean;
  learningId: string;
  reason?: string;
}

/**
 * Load sqlite-vec and create the embedding side table in the existing state.db.
 * This intentionally does not use migrations: the table is additive/cache-like,
 * and failures should not block core AgentTeam flows.
 */
export function initVectorMemory(db: Database.Database = getDb()): void {
  if (!loadedForDb.has(db)) {
    sqliteVec.load(db);
    loadedForDb.add(db);
  }

  db.exec(`CREATE TABLE IF NOT EXISTS learnings_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    learning_id TEXT NOT NULL UNIQUE,
    embedding BLOB NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_learnings_embeddings_learning_id ON learnings_embeddings(learning_id)");
}

/** Generate and persist an embedding for a project learning. Best-effort by design. */
export async function addEmbedding(learningId: string, text: string): Promise<AddEmbeddingResult> {
  const id = learningId.trim();
  const content = text.trim();
  if (!id || !content) return { ok: false, learningId: id, reason: "empty_learning_or_text" };

  try {
    const embedding = await embedText(content, "RETRIEVAL_DOCUMENT");
    const db = getDb();
    initVectorMemory(db);
    db.prepare(
      `INSERT INTO learnings_embeddings (learning_id, embedding, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(learning_id) DO UPDATE SET
         embedding = excluded.embedding,
         updated_at = excluded.updated_at`,
    ).run(id, float32Blob(embedding), new Date().toISOString());
    return { ok: true, learningId: id };
  } catch (error) {
    return { ok: false, learningId: id, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Generate a query embedding and search the sqlite-vec-backed cache by cosine distance. */
export async function searchSimilar(query: string, limit = DEFAULT_LIMIT): Promise<VectorSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const embedding = await embedText(q, "RETRIEVAL_QUERY");
    const db = getDb();
    initVectorMemory(db);
    const rows = db
      .prepare(
        `SELECT learning_id AS learningId,
                vec_distance_cosine(embedding, ?) AS distance
         FROM learnings_embeddings
         ORDER BY distance ASC
         LIMIT ?`,
      )
      .all(float32Blob(embedding), Math.max(1, limit)) as { learningId: string; distance: number }[];

    return rows.map((row) => ({
      learningId: row.learningId,
      distance: row.distance,
      score: 1 - row.distance,
    }));
  } catch (error) {
    if (process.env.AGENTTEAM_VECTOR_MEMORY_DEBUG === "1") {
      console.error(`[vectorMemory] searchSimilar failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return [];
  }
}

async function embedText(text: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[]> {
  const apiKey = embeddingApiKey();
  if (!apiKey) throw new Error("missing Gemini embedding API key");

  const model = process.env.AGENTTEAM_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      taskType,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini embedding HTTP ${response.status}: ${body.slice(0, 240)}`);
  }

  const data = (await response.json()) as { embedding?: { values?: unknown[] } };
  const values = data.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Gemini embedding response did not include values");
  }

  return values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

function embeddingApiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (process.env.AI_RADAR_LLM_PROVIDER === "gemini" && process.env.AI_RADAR_LLM_API_KEY) {
    return process.env.AI_RADAR_LLM_API_KEY;
  }
  return "";
}

function float32Blob(values: number[]): Buffer {
  return Buffer.from(new Float32Array(values).buffer);
}
