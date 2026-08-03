declare module 'sql.js' {
  interface SqlJsStatic { Database: new (data?: ArrayLike<number>) => Database; }
  interface Database {
    run(sql: string, params?: any[]): Database;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    getRowsModified(): number;
    close(): void;
  }
  interface Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    get(params?: any[]): any[];
    getColumnNames(): string[];
    free(): boolean;
    run(params?: any[]): void;
  }
  interface QueryExecResult { columns: string[]; values: any[][]; }
  export default function initSqlJs(): Promise<SqlJsStatic>;
}
