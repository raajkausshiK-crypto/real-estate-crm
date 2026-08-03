import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isVercel = !!process.env.VERCEL;

interface StmtResult { changes: number; lastInsertRowid: number | bigint; }
interface PreparedLike {
  get(...params: any[]): any;
  all(...params: any[]): any[];
  run(...params: any[]): StmtResult;
}
interface DbLike {
  prepare(sql: string): PreparedLike;
  exec(sql: string): void;
  pragma(p: string): void;
}

let db: DbLike;
let _initPromise: Promise<void> | null = null;

function makeSqlJsWrapper(raw: any): DbLike {
  function rowObj(stmt: any): any {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    const row: any = {};
    for (let i = 0; i < cols.length; i++) row[cols[i]] = vals[i];
    return row;
  }
  return {
    prepare(sql: string): PreparedLike {
      return {
        get(...params: any[]) {
          const stmt = raw.prepare(sql);
          if (params.length) stmt.bind(params);
          if (stmt.step()) { const r = rowObj(stmt); stmt.free(); return r; }
          stmt.free();
          return undefined;
        },
        all(...params: any[]) {
          const results: any[] = [];
          const stmt = raw.prepare(sql);
          if (params.length) stmt.bind(params);
          while (stmt.step()) results.push(rowObj(stmt));
          stmt.free();
          return results;
        },
        run(...params: any[]) {
          raw.run(sql, params);
          const rid = raw.exec("SELECT last_insert_rowid()");
          const lastId = rid.length && rid[0].values.length ? rid[0].values[0][0] : 0;
          return { changes: raw.getRowsModified(), lastInsertRowid: lastId as number };
        }
      };
    },
    exec(sql: string) { raw.exec(sql); },
    pragma(p: string) { try { raw.exec(`PRAGMA ${p}`); } catch {} }
  };
}

async function initDbInternal() {
  if (isVercel) {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const raw = new SQL.Database();
    db = makeSqlJsWrapper(raw);
  } else {
    const Database = (await import('better-sqlite3')).default;
    const dbPath = path.join(__dirname, '..', '..', 'data.db');
    db = new Database(dbPath) as any;
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  let schema: string;
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    schema = fs.readFileSync(schemaPath, 'utf-8');
  } else {
    const altPath = path.join(process.cwd(), 'server', 'src', 'config', 'schema.sql');
    schema = fs.readFileSync(altPath, 'utf-8');
  }
  db.exec(schema);

  const cols = db.prepare("PRAGMA table_info(leads)").all() as any[];
  const has = (name: string) => cols.find((c: any) => c.name === name);
  if (!has('assigned_to')) db.exec('ALTER TABLE leads ADD COLUMN assigned_to INTEGER REFERENCES employees(id)');
  if (!has('budget')) db.exec("ALTER TABLE leads ADD COLUMN budget TEXT");
  if (!has('project_lead_for')) db.exec("ALTER TABLE leads ADD COLUMN project_lead_for TEXT");
  if (!has('suggested_projects')) db.exec("ALTER TABLE leads ADD COLUMN suggested_projects TEXT");
  if (!has('location_looking')) db.exec("ALTER TABLE leads ADD COLUMN location_looking TEXT");
  if (!has('remarks')) db.exec("ALTER TABLE leads ADD COLUMN remarks TEXT");
  if (!has('next_call_date')) db.exec("ALTER TABLE leads ADD COLUMN next_call_date TEXT");
  if (!has('next_call_time')) db.exec("ALTER TABLE leads ADD COLUMN next_call_time TEXT");
  if (!has('site_visit_plan')) db.exec("ALTER TABLE leads ADD COLUMN site_visit_plan TEXT DEFAULT 'None'");
  if (!has('site_visit_date')) db.exec("ALTER TABLE leads ADD COLUMN site_visit_date TEXT");
  if (!has('lead_assign_date')) db.exec("ALTER TABLE leads ADD COLUMN lead_assign_date TEXT");
  if (!has('assigned_by')) db.exec("ALTER TABLE leads ADD COLUMN assigned_by TEXT");
  if (!has('buyer_purpose')) db.exec("ALTER TABLE leads ADD COLUMN buyer_purpose TEXT DEFAULT 'Self Use'");
  if (!has('final_meeting_date')) db.exec("ALTER TABLE leads ADD COLUMN final_meeting_date TEXT");
  if (!has('final_meeting_notes')) db.exec("ALTER TABLE leads ADD COLUMN final_meeting_notes TEXT");
  if (!has('pattern')) db.exec("ALTER TABLE leads ADD COLUMN pattern TEXT DEFAULT 'Call'");
  if (!has('followup_date')) db.exec("ALTER TABLE leads ADD COLUMN followup_date TEXT");
  if (!has('followup_time')) db.exec("ALTER TABLE leads ADD COLUMN followup_time TEXT");

  console.log('Database initialized (vercel:', isVercel, ')');
}

export async function initDb() {
  if (!_initPromise) _initPromise = initDbInternal();
  return _initPromise;
}

export function getDb(): DbLike {
  if (!db) throw new Error('Database not initialized — call initDb() first');
  return db;
}

export default new Proxy({} as DbLike, {
  get(_target, prop) {
    if (!db) throw new Error('Database not initialized — call initDb() first');
    return (db as any)[prop];
  }
});
