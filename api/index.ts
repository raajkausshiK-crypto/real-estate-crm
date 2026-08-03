import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import initSqlJs from 'sql.js';

const app = express();
app.use(cors());
app.use(express.json());

let db: any = null;
let dbReady: Promise<void> | null = null;

function rowObj(stmt: any): any {
  const cols = stmt.getColumnNames();
  const vals = stmt.get();
  const row: any = {};
  for (let i = 0; i < cols.length; i++) row[cols[i]] = vals[i];
  return row;
}

function createDbWrapper(raw: any) {
  return {
    prepare(sql: string) {
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
          return { changes: raw.getRowsModified(), lastInsertRowid: lastId };
        }
      };
    },
    exec(sql: string) { raw.exec(sql); }
  };
}

async function ensureDb() {
  if (db) return db;
  if (!dbReady) {
    dbReady = (async () => {
      const SQL = await initSqlJs();
      const raw = new SQL.Database();
      db = createDbWrapper(raw);
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS contacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, phone TEXT,
          address TEXT, city TEXT, state TEXT, zip TEXT, notes TEXT,
          created_by INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS properties (
          id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL, city TEXT, state TEXT, zip TEXT,
          price REAL, bedrooms INTEGER, bathrooms REAL, sqft INTEGER, photo_url TEXT,
          status TEXT DEFAULT 'Active', description TEXT, created_by INTEGER,
          created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS leads (
          id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
          status TEXT DEFAULT 'Warm' CHECK (status IN ('Hot','Warm','Cold','Closed','Follow-up Needed')),
          source TEXT, notes TEXT, assigned_to INTEGER, budget TEXT, project_lead_for TEXT,
          suggested_projects TEXT, location_looking TEXT, remarks TEXT, next_call_date TEXT,
          next_call_time TEXT, site_visit_plan TEXT DEFAULT 'None', site_visit_date TEXT,
          lead_assign_date TEXT, assigned_by TEXT, buyer_purpose TEXT DEFAULT 'Self Use',
          final_meeting_date TEXT, final_meeting_notes TEXT, pattern TEXT DEFAULT 'Call',
          followup_date TEXT, followup_time TEXT, created_by INTEGER,
          created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS employees (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, phone TEXT,
          role TEXT DEFAULT 'Agent', avatar_color TEXT DEFAULT '#6366f1',
          created_by INTEGER, created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS contact_property_interest (
          id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, property_id INTEGER,
          interest_level TEXT DEFAULT 'Medium', notes TEXT, created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(contact_id, property_id)
        );
        CREATE TABLE IF NOT EXISTS integrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, platform TEXT NOT NULL,
          config TEXT NOT NULL DEFAULT '{}', enabled INTEGER DEFAULT 0, webhook_token TEXT,
          created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE(user_id, platform)
        );
        CREATE TABLE IF NOT EXISTS webhook_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL, user_id INTEGER,
          payload TEXT, status TEXT DEFAULT 'received', error TEXT, lead_id INTEGER,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS call_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, contact_id INTEGER,
          lead_id INTEGER, twilio_sid TEXT, from_number TEXT, to_number TEXT,
          direction TEXT DEFAULT 'outbound', status TEXT DEFAULT 'initiated',
          duration INTEGER DEFAULT 0, notes TEXT, created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS twilio_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNIQUE,
          account_sid TEXT NOT NULL, auth_token TEXT NOT NULL, twilio_number TEXT NOT NULL,
          twiml_app_sid TEXT DEFAULT '', api_key TEXT DEFAULT '', api_secret TEXT DEFAULT '',
          enabled INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
    })();
  }
  await dbReady;
  return db;
}

function auth(req: any, res: any, next: any) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'dev-secret') as any;
    req.userId = decoded.id;
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

// Auth
app.post('/api/auth/register', async (req, res) => {
  try {
    const d = await ensureDb();
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    const existing = d.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const result = d.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name, email, hash);
    const token = jwt.sign({ id: result.lastInsertRowid }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
    res.status(201).json({ user: { id: result.lastInsertRowid, name, email }, token });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const d = await ensureDb();
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = d.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
    res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

// Leads
app.get('/api/leads', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const { status, search, page = '1', limit = '20' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE l.created_by = ?';
    const params: any[] = [req.userId];
    if (status) { where += ' AND l.status = ?'; params.push(status); }
    if (search) { where += ' AND (c.name LIKE ? OR c.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    const total = (d.prepare(`SELECT COUNT(*) as count FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id ${where}`).get(...params) as any).count;
    const leads = d.prepare(`SELECT l.*, c.name as contact_name, c.email as contact_email, c.phone as contact_phone, e.name as assigned_name, e.avatar_color as assigned_color FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id LEFT JOIN employees e ON l.assigned_to = e.id ${where} ORDER BY l.updated_at DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), offset);
    res.json({ leads, total });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.get('/api/leads/pipeline', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const rows = d.prepare(`SELECT l.*, c.name as contact_name, c.email as contact_email, c.phone as contact_phone, e.name as assigned_name, e.avatar_color as assigned_color FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id LEFT JOIN employees e ON l.assigned_to = e.id WHERE l.created_by = ? ORDER BY l.updated_at DESC`).all(req.userId);
    const pipeline: Record<string, any[]> = { 'Hot': [], 'Warm': [], 'Cold': [], 'Follow-up Needed': [], 'Closed': [] };
    for (const lead of rows as any[]) pipeline[lead.status]?.push(lead);
    res.json(pipeline);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.get('/api/leads/:id', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const lead = d.prepare(`SELECT l.*, c.name as contact_name, c.email as contact_email, c.phone as contact_phone FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id WHERE l.id = ? AND l.created_by = ?`).get(req.params.id, req.userId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.post('/api/leads', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const b = req.body;
    if (!b.contact_id) return res.status(400).json({ error: 'contact_id is required' });
    const result = d.prepare(`INSERT INTO leads (contact_id, status, source, notes, assigned_to, budget, project_lead_for, suggested_projects, location_looking, remarks, next_call_date, next_call_time, site_visit_plan, site_visit_date, lead_assign_date, assigned_by, buyer_purpose, final_meeting_date, final_meeting_notes, pattern, followup_date, followup_time, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(b.contact_id, b.status || 'Warm', b.source || null, b.notes || null, b.assigned_to || null, b.budget || null, b.project_lead_for || null, b.suggested_projects || null, b.location_looking || null, b.remarks || null, b.next_call_date || null, b.next_call_time || null, b.site_visit_plan || 'None', b.site_visit_date || null, b.lead_assign_date || null, b.assigned_by || null, b.buyer_purpose || 'Self Use', b.final_meeting_date || null, b.final_meeting_notes || null, b.pattern || 'Call', b.followup_date || null, b.followup_time || null, req.userId);
    const lead = d.prepare('SELECT * FROM leads WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(lead);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.put('/api/leads/:id', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const b = req.body;
    const existing = d.prepare('SELECT * FROM leads WHERE id = ? AND created_by = ?').get(req.params.id, req.userId) as any;
    if (!existing) return res.status(404).json({ error: 'Lead not found' });
    const v = (key: string) => b[key] !== undefined ? (b[key] || null) : existing[key];
    d.prepare(`UPDATE leads SET status=?, source=?, notes=?, assigned_to=?, budget=?, project_lead_for=?, suggested_projects=?, location_looking=?, remarks=?, next_call_date=?, next_call_time=?, site_visit_plan=?, site_visit_date=?, lead_assign_date=?, assigned_by=?, buyer_purpose=?, final_meeting_date=?, final_meeting_notes=?, pattern=?, followup_date=?, followup_time=?, updated_at=datetime('now') WHERE id=? AND created_by=?`).run(b.status ?? existing.status, v('source'), v('notes'), b.assigned_to !== undefined ? (b.assigned_to || null) : existing.assigned_to, v('budget'), v('project_lead_for'), v('suggested_projects'), v('location_looking'), v('remarks'), v('next_call_date'), v('next_call_time'), v('site_visit_plan'), v('site_visit_date'), v('lead_assign_date'), v('assigned_by'), v('buyer_purpose'), v('final_meeting_date'), v('final_meeting_notes'), v('pattern'), v('followup_date'), v('followup_time'), req.params.id, req.userId);
    res.json(d.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id));
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.delete('/api/leads/:id', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const result = d.prepare('DELETE FROM leads WHERE id = ? AND created_by = ?').run(req.params.id, req.userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Lead not found' });
    res.json({ message: 'Lead deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

// Contacts
app.get('/api/contacts', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const { search } = req.query;
    let where = 'WHERE created_by = ?'; const params: any[] = [req.userId];
    if (search) { where += ' AND (name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    const contacts = d.prepare(`SELECT * FROM contacts ${where} ORDER BY updated_at DESC`).all(...params);
    res.json(contacts);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.post('/api/contacts', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const { name, email, phone, address, city, state, zip, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = d.prepare('INSERT INTO contacts (name,email,phone,address,city,state,zip,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?)').run(name, email||null, phone||null, address||null, city||null, state||null, zip||null, notes||null, req.userId);
    res.status(201).json(d.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid));
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.put('/api/contacts/:id', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const b = req.body;
    d.prepare('UPDATE contacts SET name=?,email=?,phone=?,address=?,city=?,state=?,zip=?,notes=?,updated_at=datetime(\'now\') WHERE id=? AND created_by=?').run(b.name, b.email||null, b.phone||null, b.address||null, b.city||null, b.state||null, b.zip||null, b.notes||null, req.params.id, req.userId);
    res.json(d.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id));
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.delete('/api/contacts/:id', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const result = d.prepare('DELETE FROM contacts WHERE id = ? AND created_by = ?').run(req.params.id, req.userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json({ message: 'Contact deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

// Properties
app.get('/api/properties', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const { search } = req.query;
    let where = 'WHERE created_by = ?'; const params: any[] = [req.userId];
    if (search) { where += ' AND (address LIKE ? OR city LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    res.json(d.prepare(`SELECT * FROM properties ${where} ORDER BY updated_at DESC`).all(...params));
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.post('/api/properties', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const b = req.body;
    const result = d.prepare('INSERT INTO properties (address,city,state,zip,price,bedrooms,bathrooms,sqft,photo_url,status,description,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(b.address, b.city||null, b.state||null, b.zip||null, b.price||null, b.bedrooms||null, b.bathrooms||null, b.sqft||null, b.photo_url||null, b.status||'Active', b.description||null, req.userId);
    res.status(201).json(d.prepare('SELECT * FROM properties WHERE id = ?').get(result.lastInsertRowid));
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.put('/api/properties/:id', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const b = req.body;
    d.prepare('UPDATE properties SET address=?,city=?,state=?,zip=?,price=?,bedrooms=?,bathrooms=?,sqft=?,photo_url=?,status=?,description=?,updated_at=datetime(\'now\') WHERE id=? AND created_by=?').run(b.address, b.city||null, b.state||null, b.zip||null, b.price||null, b.bedrooms||null, b.bathrooms||null, b.sqft||null, b.photo_url||null, b.status||'Active', b.description||null, req.params.id, req.userId);
    res.json(d.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id));
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.delete('/api/properties/:id', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const result = d.prepare('DELETE FROM properties WHERE id = ? AND created_by = ?').run(req.params.id, req.userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Property deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

// Employees
app.get('/api/employees', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    res.json(d.prepare('SELECT * FROM employees WHERE created_by = ? ORDER BY name').all(req.userId));
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.post('/api/employees', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const { name, email, phone, role } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const result = d.prepare('INSERT INTO employees (name,email,phone,role,avatar_color,created_by) VALUES (?,?,?,?,?,?)').run(name, email||null, phone||null, role||'Agent', color, req.userId);
    res.status(201).json(d.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid));
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.put('/api/employees/:id', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const { name, email, phone, role } = req.body;
    d.prepare('UPDATE employees SET name=?,email=?,phone=?,role=? WHERE id=? AND created_by=?').run(name, email||null, phone||null, role||'Agent', req.params.id, req.userId);
    res.json(d.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id));
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.delete('/api/employees/:id', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    d.prepare('UPDATE leads SET assigned_to = NULL WHERE assigned_to = ?').run(req.params.id);
    const result = d.prepare('DELETE FROM employees WHERE id = ? AND created_by = ?').run(req.params.id, req.userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Employee deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

// Integrations
app.get('/api/integrations', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    res.json(d.prepare('SELECT * FROM integrations WHERE user_id = ?').all(req.userId));
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

// Call logs
app.get('/api/calls', auth, async (req: any, res) => {
  try {
    const d = await ensureDb();
    const logs = d.prepare(`SELECT cl.*, c.name as contact_name, c.phone as contact_phone FROM call_logs cl LEFT JOIN contacts c ON cl.contact_id = c.id WHERE cl.user_id = ? ORDER BY cl.created_at DESC LIMIT 50`).all(req.userId);
    res.json(logs);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

// Health
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
