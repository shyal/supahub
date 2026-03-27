import { type Database } from "sql.js";
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
export declare function initDb(opts?: InitOptions): Promise<void>;
export declare function getDb(): Database;
export declare function run(sql: string, params?: unknown[]): void;
export declare function queryAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
export declare function queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | null;
export declare function save(): Promise<void>;
export declare function exportBytes(): Uint8Array;
export declare function importBytes(data: Uint8Array): Promise<void>;
export declare function isInitialized(): boolean;
