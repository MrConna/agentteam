import Database from "better-sqlite3";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..");

const DB_DIR = join(projectRoot, ".agentteam");
const DB_PATH = process.env.AGENTTEAM_DB ?? join(DB_DIR, "state.db");
const MIGRATIONS_DIR = join(projectRoot, "migrations");

let db: Database.Database | null = null;

/** Open the SQLite database, applying any pending migrations. */
export function getDb(): Database.Database {
  if (db) return db;
  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(database: Database.Database): void {
  database.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );
  const applied = new Set(
    database
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((row) => (row as { version: string }).version),
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const record = database.prepare(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
  );
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const runMigration = database.transaction(() => {
      database.exec(sql);
      record.run(file, new Date().toISOString());
    });
    runMigration();
    console.log(`[db] applied migration ${file}`);
  }
}

export { DB_PATH };
