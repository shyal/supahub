import { QueryBuilder, type ColumnConfig } from "./query-builder.js";
type Row = Record<string, unknown>;
type QueryResult<T> = {
    data: T;
    error: null;
} | {
    data: null;
    error: Error;
};
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
        invoke(name: string, opts?: {
            body?: unknown;
        }): Promise<{
            data: unknown;
            error: Error | null;
        }>;
    };
    auth: {
        getSession(): Promise<{
            data: {
                session: unknown | null;
            };
        }>;
        signUp(creds: Record<string, string>): Promise<{
            error: Error | null;
        }>;
        signInWithPassword(creds: Record<string, string>): Promise<{
            error: Error | null;
        }>;
        signOut(): Promise<void>;
        onAuthStateChange(cb: (event: string, session: unknown) => void): {
            data: {
                subscription: {
                    unsubscribe: () => void;
                };
            };
        };
    };
}
export declare function createClient(opts?: SupahubClientOptions): SupahubClient;
export {};
