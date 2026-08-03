import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
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

  console.log('Database initialized at', dbPath);
}

export default db;
