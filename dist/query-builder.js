import { getDb, save } from "./db.js";
let jsonColumns = new Set();
let boolColumns = new Set();
/** Configure which columns need JSON parsing or boolean conversion. */
export function configureColumns(config) {
    jsonColumns = new Set(config.json ?? []);
    boolColumns = new Set(config.bool ?? []);
}
function parseRow(row) {
    const parsed = {};
    for (const [key, value] of Object.entries(row)) {
        if (jsonColumns.has(key) && typeof value === "string") {
            try {
                parsed[key] = JSON.parse(value);
            }
            catch {
                parsed[key] = value;
            }
        }
        else if (boolColumns.has(key)) {
            parsed[key] = value === 1 || value === true;
        }
        else {
            parsed[key] = value;
        }
    }
    return parsed;
}
function serializeValue(key, value) {
    if (jsonColumns.has(key) && typeof value === "object" && value !== null) {
        return JSON.stringify(value);
    }
    if (boolColumns.has(key)) {
        return value ? 1 : 0;
    }
    return value;
}
export class QueryBuilder {
    constructor(table) {
        this._operation = "select";
        this._columns = "*";
        this._wheres = [];
        this._orderBys = [];
        this._limitVal = null;
        this._data = null;
        this._onConflict = null;
        this._returnData = false;
        this._singleReturn = false;
        this._maybeSingle = false;
        this._table = table;
    }
    select(columns = "*") {
        if (this._operation === "insert" ||
            this._operation === "upsert" ||
            this._operation === "update") {
            this._returnData = true;
            return this;
        }
        this._operation = "select";
        this._columns = columns;
        return this;
    }
    insert(data) {
        this._operation = "insert";
        this._data = data;
        return this;
    }
    upsert(data, opts) {
        this._operation = "upsert";
        this._data = data;
        this._onConflict = opts?.onConflict ?? null;
        return this;
    }
    update(data) {
        this._operation = "update";
        this._data = data;
        return this;
    }
    delete() {
        this._operation = "delete";
        return this;
    }
    eq(col, val) {
        this._wheres.push({ col, op: "=", val });
        return this;
    }
    neq(col, val) {
        this._wheres.push({ col, op: "!=", val });
        return this;
    }
    gt(col, val) {
        this._wheres.push({ col, op: ">", val });
        return this;
    }
    gte(col, val) {
        this._wheres.push({ col, op: ">=", val });
        return this;
    }
    lt(col, val) {
        this._wheres.push({ col, op: "<", val });
        return this;
    }
    lte(col, val) {
        this._wheres.push({ col, op: "<=", val });
        return this;
    }
    order(col, opts) {
        this._orderBys.push({ col, ascending: opts?.ascending ?? true });
        return this;
    }
    limit(n) {
        this._limitVal = n;
        return this;
    }
    single() {
        this._singleReturn = true;
        return this._execute();
    }
    maybeSingle() {
        this._maybeSingle = true;
        return this._execute();
    }
    then(onfulfilled, onrejected) {
        try {
            const result = this._execute();
            return Promise.resolve(result).then(onfulfilled, onrejected);
        }
        catch (e) {
            if (onrejected)
                return Promise.reject(e).catch(onrejected);
            return Promise.reject(e);
        }
    }
    _execute() {
        try {
            const db = getDb();
            switch (this._operation) {
                case "select":
                    return this._executeSelect(db);
                case "insert":
                    return this._executeInsert(db);
                case "upsert":
                    return this._executeUpsert(db);
                case "update":
                    return this._executeUpdate(db);
                case "delete":
                    return this._executeDelete(db);
            }
        }
        catch (e) {
            return { data: null, error: e };
        }
    }
    _buildWhere() {
        if (this._wheres.length === 0)
            return { sql: "", params: [] };
        const parts = [];
        const params = [];
        for (const w of this._wheres) {
            parts.push(`"${w.col}" ${w.op} ?`);
            params.push(w.val);
        }
        return { sql: ` WHERE ${parts.join(" AND ")}`, params };
    }
    _buildOrderLimit() {
        let sql = "";
        if (this._orderBys.length > 0) {
            const parts = this._orderBys.map((o) => `"${o.col}" ${o.ascending ? "ASC" : "DESC"}`);
            sql += ` ORDER BY ${parts.join(", ")}`;
        }
        if (this._limitVal != null) {
            sql += ` LIMIT ${this._limitVal}`;
        }
        return sql;
    }
    _runQuery(sql, params) {
        const stmt = getDb().prepare(sql);
        if (params.length > 0)
            stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            results.push(parseRow(stmt.getAsObject()));
        }
        stmt.free();
        return results;
    }
    _executeSelect(_db) {
        const { sql: whereSql, params } = this._buildWhere();
        const orderLimitSql = this._buildOrderLimit();
        const sql = `SELECT ${this._columns === "*"
            ? "*"
            : this._columns
                .split(",")
                .map((c) => `"${c.trim()}"`)
                .join(", ")} FROM "${this._table}"${whereSql}${orderLimitSql}`;
        const rows = this._runQuery(sql, params);
        if (this._singleReturn) {
            if (rows.length === 0)
                return { data: null, error: new Error("No rows found") };
            return { data: rows[0], error: null };
        }
        if (this._maybeSingle) {
            return { data: rows[0] ?? null, error: null };
        }
        return { data: rows, error: null };
    }
    _executeInsert(_db) {
        const rows = Array.isArray(this._data) ? this._data : [this._data];
        const results = [];
        for (const row of rows) {
            const keys = Object.keys(row);
            const vals = keys.map((k) => serializeValue(k, row[k]));
            const placeholders = keys.map(() => "?").join(", ");
            const sql = `INSERT INTO "${this._table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${placeholders})`;
            getDb().run(sql, vals);
            if (this._returnData) {
                const lastId = getDb().exec("SELECT last_insert_rowid()")[0]
                    ?.values[0]?.[0];
                const inserted = this._getInsertedRow(row, lastId);
                if (inserted)
                    results.push(inserted);
            }
        }
        save();
        if (this._returnData) {
            if (this._singleReturn) {
                return { data: results[0] ?? null, error: null };
            }
            return { data: results, error: null };
        }
        return { data: null, error: null };
    }
    _getInsertedRow(originalRow, lastId) {
        const id = originalRow.id ?? lastId;
        if (id == null)
            return null;
        const sql = `SELECT * FROM "${this._table}" WHERE "id" = ? LIMIT 1`;
        const rows = this._runQuery(sql, [id]);
        return rows[0] ?? null;
    }
    _executeUpsert(_db) {
        const rows = Array.isArray(this._data) ? this._data : [this._data];
        const results = [];
        for (const row of rows) {
            const keys = Object.keys(row);
            const vals = keys.map((k) => serializeValue(k, row[k]));
            const placeholders = keys.map(() => "?").join(", ");
            let conflictTarget;
            if (this._onConflict) {
                const cols = this._onConflict.split(",").map((c) => c.trim());
                conflictTarget = `(${cols.map((c) => `"${c}"`).join(", ")})`;
            }
            else {
                conflictTarget = row.id !== undefined ? '("id")' : '("name")';
            }
            const updateParts = keys
                .map((k) => `"${k}" = excluded."${k}"`)
                .join(", ");
            const sql = `INSERT INTO "${this._table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${placeholders}) ON CONFLICT ${conflictTarget} DO UPDATE SET ${updateParts}`;
            getDb().run(sql, vals);
            if (this._returnData) {
                const inserted = this._getInsertedRow(row, null);
                if (inserted)
                    results.push(inserted);
            }
        }
        save();
        if (this._returnData) {
            if (this._singleReturn) {
                return { data: results[0] ?? null, error: null };
            }
            return { data: results, error: null };
        }
        return { data: null, error: null };
    }
    _executeUpdate(_db) {
        const row = this._data;
        const keys = Object.keys(row);
        const vals = keys.map((k) => serializeValue(k, row[k]));
        const setParts = keys.map((k) => `"${k}" = ?`).join(", ");
        const { sql: whereSql, params: whereParams } = this._buildWhere();
        const sql = `UPDATE "${this._table}" SET ${setParts}${whereSql}`;
        getDb().run(sql, [...vals, ...whereParams]);
        save();
        return { data: null, error: null };
    }
    _executeDelete(_db) {
        const { sql: whereSql, params } = this._buildWhere();
        const sql = `DELETE FROM "${this._table}"${whereSql}`;
        getDb().run(sql, params);
        save();
        return { data: null, error: null };
    }
}
