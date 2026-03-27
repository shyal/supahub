import { getDb } from "./db.js";
import { QueryBuilder, configureColumns } from "./query-builder.js";
export function createClient(opts = {}) {
    if (opts.columns) {
        configureColumns(opts.columns);
    }
    const rpcHandlers = opts.rpc ?? {};
    return {
        from(table) {
            return new QueryBuilder(table);
        },
        rpc(name, params = {}) {
            const handler = rpcHandlers[name];
            if (handler) {
                try {
                    return handler(params);
                }
                catch (e) {
                    return { data: null, error: e };
                }
            }
            // Fallback: try to execute as a raw SQL function
            try {
                const db = getDb();
                const paramKeys = Object.keys(params);
                const placeholders = paramKeys.map(() => "?").join(", ");
                const sql = `SELECT * FROM ${name}(${placeholders})`;
                const stmt = db.prepare(sql);
                stmt.bind(paramKeys.map((k) => params[k]));
                const results = [];
                while (stmt.step()) {
                    results.push(stmt.getAsObject());
                }
                stmt.free();
                return { data: results, error: null };
            }
            catch (e) {
                return { data: null, error: e };
            }
        },
        functions: {
            invoke(_name, _opts) {
                return Promise.resolve({
                    data: null,
                    error: new Error("Edge functions not available in local mode"),
                });
            },
        },
        auth: {
            async getSession() {
                return { data: { session: null } };
            },
            async signUp() {
                return { error: new Error("Auth not implemented — use your own auth layer") };
            },
            async signInWithPassword() {
                return { error: new Error("Auth not implemented — use your own auth layer") };
            },
            async signOut() { },
            onAuthStateChange() {
                return { data: { subscription: { unsubscribe: () => { } } } };
            },
        },
    };
}
