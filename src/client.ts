import { getDb } from "./db.js";
import { QueryBuilder, type ColumnConfig, configureColumns } from "./query-builder.js";

type Row = Record<string, unknown>;
type QueryResult<T> = { data: T; error: null } | { data: null; error: Error };

export type RpcHandler = (params: Record<string, unknown>) => QueryResult<Row[]>;

export interface SupahubClientOptions {
  /** Column type configuration for JSON and boolean columns. */
  columns?: ColumnConfig;
  /** Register custom RPC functions by name. */
  rpc?: Record<string, RpcHandler>;
}

export interface SupahubClient {
  from(table: string): QueryBuilder;
  rpc(name: string, params?: Record<string, unknown>): QueryResult<Row[]>;
  functions: {
    invoke(
      name: string,
      opts?: { body?: unknown },
    ): Promise<{ data: unknown; error: Error | null }>;
  };
  auth: {
    getSession(): Promise<{ data: { session: unknown | null } }>;
    signUp(creds: Record<string, string>): Promise<{ error: Error | null }>;
    signInWithPassword(creds: Record<string, string>): Promise<{ error: Error | null }>;
    signOut(): Promise<void>;
    onAuthStateChange(cb: (event: string, session: unknown) => void): {
      data: { subscription: { unsubscribe: () => void } };
    };
  };
}

export function createClient(opts: SupahubClientOptions = {}): SupahubClient {
  if (opts.columns) {
    configureColumns(opts.columns);
  }

  const rpcHandlers = opts.rpc ?? {};

  return {
    from(table: string): QueryBuilder {
      return new QueryBuilder(table);
    },

    rpc(name: string, params: Record<string, unknown> = {}): QueryResult<Row[]> {
      const handler = rpcHandlers[name];
      if (handler) {
        try {
          return handler(params);
        } catch (e) {
          return { data: null, error: e as Error };
        }
      }

      // Fallback: try to execute as a raw SQL function
      try {
        const db = getDb();
        const paramKeys = Object.keys(params);
        const placeholders = paramKeys.map(() => "?").join(", ");
        const sql = `SELECT * FROM ${name}(${placeholders})`;
        const stmt = db.prepare(sql);
        stmt.bind(paramKeys.map((k) => params[k]) as never);
        const results: Row[] = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject() as Row);
        }
        stmt.free();
        return { data: results, error: null };
      } catch (e) {
        return { data: null, error: e as Error };
      }
    },

    functions: {
      invoke(_name: string, _opts?: { body?: unknown }) {
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
      async signOut() {},
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  };
}
