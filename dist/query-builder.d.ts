type Row = Record<string, unknown>;
type QueryResult<T> = {
    data: T;
    error: null;
} | {
    data: null;
    error: Error;
};
export type ColumnConfig = {
    /** Column names that store JSON (objects/arrays serialized as TEXT). */
    json?: string[];
    /** Column names that store booleans (SQLite 0/1 ↔ true/false). */
    bool?: string[];
};
/** Configure which columns need JSON parsing or boolean conversion. */
export declare function configureColumns(config: ColumnConfig): void;
export declare class QueryBuilder {
    private _table;
    private _operation;
    private _columns;
    private _wheres;
    private _orderBys;
    private _limitVal;
    private _data;
    private _onConflict;
    private _returnData;
    private _singleReturn;
    private _maybeSingle;
    constructor(table: string);
    select(columns?: string): this;
    insert(data: Row | Row[]): this;
    upsert(data: Row | Row[], opts?: {
        onConflict?: string;
    }): this;
    update(data: Row): this;
    delete(): this;
    eq(col: string, val: unknown): this;
    neq(col: string, val: unknown): this;
    gt(col: string, val: unknown): this;
    gte(col: string, val: unknown): this;
    lt(col: string, val: unknown): this;
    lte(col: string, val: unknown): this;
    order(col: string, opts?: {
        ascending?: boolean;
    }): this;
    limit(n: number): this;
    single(): QueryResult<Row>;
    maybeSingle(): QueryResult<Row | null>;
    then<TResult1 = QueryResult<Row[]>, TResult2 = never>(onfulfilled?: ((value: QueryResult<Row[]>) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2>;
    private _execute;
    private _buildWhere;
    private _buildOrderLimit;
    private _runQuery;
    private _executeSelect;
    private _executeInsert;
    private _getInsertedRow;
    private _executeUpsert;
    private _executeUpdate;
    private _executeDelete;
}
export {};
