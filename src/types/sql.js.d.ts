declare module 'sql.js' {
    export interface Database {
        exec(sql: string): QueryExecResult[];
        run(sql: string, params?: any[]): Database;
        prepare(sql: string): Statement;
        export(): Uint8Array;
        close(): void;
    }

    export interface Statement {
        bind(params?: any[]): boolean;
        step(): boolean;
        get(params?: any[]): any[];
        getColumnNames(): string[];
        free(): boolean;
        reset(): void;
    }

    export interface QueryExecResult {
        columns: string[];
        values: any[][];
    }

    export interface SqlJsStatic {
        Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
    }

    export interface InitSqlJsOptions {
        locateFile?: (filename: string) => string;
    }

    export default function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>;
}
