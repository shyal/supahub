import initSqlJs from "sql.js";
import { readDatabase, writeDatabase } from "./opfs.js";
let db = null;
let sqlPromise = null;
let dbFilename = "supahub.sqlite";
let onSave = null;
function getSql(wasmUrl) {
    if (!sqlPromise) {
        sqlPromise = initSqlJs({
            locateFile: () => wasmUrl,
        });
    }
    return sqlPromise;
}
export async function initDb(opts = {}) {
    if (db)
        return;
    const wasmUrl = opts.wasmUrl ?? "/sql-wasm.wasm";
    dbFilename = opts.filename ?? "supahub.sqlite";
    onSave = opts.onSave ?? null;
    const SQL = await getSql(wasmUrl);
    const existing = await readDatabase(dbFilename);
    if (existing) {
        db = new SQL.Database(existing);
    }
    else {
        db = new SQL.Database();
    }
    if (opts.schema) {
        db.run(opts.schema);
    }
    await save();
}
export function getDb() {
    if (!db)
        throw new Error("Database not initialized. Call initDb() first.");
    return db;
}
export function run(sql, params) {
    getDb().run(sql, params);
}
export function queryAll(sql, params) {
    const stmt = getDb().prepare(sql);
    if (params)
        stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}
export function queryOne(sql, params) {
    const results = queryAll(sql, params);
    return results[0] ?? null;
}
export async function save() {
    if (!db)
        return;
    const data = db.export();
    await writeDatabase(dbFilename, data);
    onSave?.();
}
export function exportBytes() {
    return getDb().export();
}
export async function importBytes(data) {
    const SQL = await getSql("/sql-wasm.wasm");
    if (db)
        db.close();
    db = new SQL.Database(data);
    await save();
}
export function isInitialized() {
    return db !== null;
}
