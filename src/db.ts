import initSqlJs, { type Database } from "sql.js";
import { readDatabase, writeDatabase } from "./opfs.js";

let db: Database | null = null;
let sqlPromise: ReturnType<typeof initSqlJs> | null = null;
let dbFilename = "supahub.sqlite";
let onSave: (() => void) | null = null;
let configuredWasmUrl = "/sql-wasm.wasm";

export interface InitOptions {
  /** Path or URL to sql-wasm.wasm file. Default: "/sql-wasm.wasm" */
  wasmUrl?: string;
  /** Filename for OPFS/IDB storage. Default: "supahub.sqlite" */
  filename?: string;
  /** SQL schema to run on init (CREATE TABLE statements). */
  schema?: string;
  /** Callback fired after every save (useful for triggering sync). */
  onSave?: () => void;
}

function getSql(wasmUrl: string) {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: () => wasmUrl,
    });
  }
  return sqlPromise;
}

export async function initDb(opts: InitOptions = {}): Promise<void> {
  if (db) return;

  configuredWasmUrl = opts.wasmUrl ?? "/sql-wasm.wasm";
  dbFilename = opts.filename ?? "supahub.sqlite";
  onSave = opts.onSave ?? null;

  const SQL = await getSql(configuredWasmUrl);
  const existing = await readDatabase(dbFilename);

  if (existing) {
    db = new SQL.Database(existing);
  } else {
    db = new SQL.Database();
  }

  if (opts.schema) {
    db.run(opts.schema);
  }

  await save();
}

export function getDb(): Database {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  return db;
}

export function run(sql: string, params?: unknown[]): void {
  getDb().run(sql, params as never);
}

export function queryAll<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): T[] {
  const stmt = getDb().prepare(sql);
  if (params) stmt.bind(params as never);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): T | null {
  const results = queryAll<T>(sql, params);
  return results[0] ?? null;
}

export async function save(): Promise<void> {
  if (!db) return;
  const data = db.export();
  await writeDatabase(dbFilename, data);
  onSave?.();
}

export function exportBytes(): Uint8Array {
  return getDb().export();
}

export async function importBytes(data: Uint8Array): Promise<void> {
  const SQL = await getSql(configuredWasmUrl);
  if (db) db.close();
  db = new SQL.Database(data);
  await save();
}

export function isInitialized(): boolean {
  return db !== null;
}
