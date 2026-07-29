import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  console.log('Database initialized at', dbPath);
}

export default db;
