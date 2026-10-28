import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type BoundValue = null | number | string | Uint8Array | bigint;

type D1Result = {
  success: true;
  results: Record<string, unknown>[];
  meta: { changes?: number; last_row_id?: number | bigint };
};

class LocalPreparedStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly values: BoundValue[] = [],
  ) {}

  bind(...values: BoundValue[]) {
    return new LocalPreparedStatement(this.database, this.sql, values);
  }

  private statement(): StatementSync {
    return this.database.prepare(this.sql);
  }

  async all(): Promise<D1Result> {
    const rows = this.statement().all(...this.values) as Record<string, unknown>[];
    return { success: true, results: rows, meta: {} };
  }

  async raw(): Promise<unknown[][]> {
    const statement=this.statement();
    statement.setReturnArrays(true);
    return statement.all(...this.values) as unknown as unknown[][];
  }

  async first(column?: string): Promise<unknown> {
    const row = this.statement().get(...this.values) as Record<string, unknown> | undefined;
    return column ? row?.[column] ?? null : row ?? null;
  }

  async run(): Promise<D1Result> {
    if (/\breturning\b/i.test(this.sql)) return this.all();
    const result = this.statement().run(...this.values);
    return {
      success: true,
      results: [],
      meta: { changes: Number(result.changes), last_row_id: result.lastInsertRowid },
    };
  }
}

class LocalD1Database {
  constructor(private readonly database: DatabaseSync) {}

  prepare(sql: string) {
    return new LocalPreparedStatement(this.database, sql);
  }

  async batch(statements: LocalPreparedStatement[]) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

type LocalState = {
  sqlite: DatabaseSync;
  db: ReturnType<typeof drizzle<typeof schema>>;
  path: string;
};

const globalState = globalThis as typeof globalThis & { __orbitLocalDb?: LocalState };

function databasePath() {
  const configured = process.env.ORBIT_DB_PATH?.trim();
  return resolve(configured || join(process.cwd(), "data", "database", "orbit-video.sqlite"));
}

function applyMigrations(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _orbit_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const migrationDir = resolve(process.env.ORBIT_MIGRATIONS_DIR?.trim() || join(process.cwd(), "drizzle"));
  const applied = new Set(
    (database.prepare("SELECT name FROM _orbit_migrations").all() as { name: string }[]).map((row) => row.name),
  );
  for (const name of readdirSync(migrationDir).filter((item) => /^\d+.*\.sql$/i.test(item)).sort()) {
    if (applied.has(name)) continue;
    const sql = readFileSync(join(migrationDir, name), "utf8").replaceAll("--> statement-breakpoint", "");
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(sql);
      database.prepare("INSERT INTO _orbit_migrations (name) VALUES (?)").run(name);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw new Error(`数据库升级失败：${name}`, { cause: error });
    }
  }
  database.exec("PRAGMA optimize");
}

function createLocalState(): LocalState {
  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA journal_mode=WAL");
  sqlite.exec("PRAGMA synchronous=NORMAL");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec("PRAGMA busy_timeout=5000");
  applyMigrations(sqlite);
  const client = new LocalD1Database(sqlite);
  return {
    sqlite,
    db: drizzle(client as unknown as Parameters<typeof drizzle>[0], { schema }),
    path,
  };
}

function state() {
  globalState.__orbitLocalDb ??= createLocalState();
  return globalState.__orbitLocalDb;
}

export function getDb() {
  return state().db;
}

export function getDatabasePath() {
  return state().path;
}

export function checkpointDatabase() {
  state().sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)");
}

// For synchronous atomic business writes; never await inside a transaction.
export function getLocalDatabase() {
  return state().sqlite;
}
