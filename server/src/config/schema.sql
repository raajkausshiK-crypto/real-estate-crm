CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  zip TEXT,
  price REAL,
  bedrooms INTEGER,
  bathrooms REAL,
  sqft INTEGER,
  photo_url TEXT,
  status TEXT DEFAULT 'Active',
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'Warm' CHECK (status IN ('Hot', 'Warm', 'Cold', 'Closed', 'Follow-up Needed')),
  source TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_property_interest (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
  interest_level TEXT DEFAULT 'Medium' CHECK (interest_level IN ('High', 'Medium', 'Low')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(contact_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_contact ON leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);

CREATE TABLE IF NOT EXISTS integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google')),
  config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER DEFAULT 0,
  webhook_token TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, platform)
);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  payload TEXT,
  status TEXT DEFAULT 'received',
  error TEXT,
  lead_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_user ON webhook_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_token ON integrations(webhook_token);

CREATE TABLE IF NOT EXISTS twilio_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE REFERENCES users(id),
  account_sid TEXT NOT NULL,
  auth_token TEXT NOT NULL,
  twilio_number TEXT NOT NULL,
  twiml_app_sid TEXT DEFAULT '',
  api_key TEXT DEFAULT '',
  api_secret TEXT DEFAULT '',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS call_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  twilio_sid TEXT,
  from_number TEXT,
  to_number TEXT,
  direction TEXT DEFAULT 'outbound',
  status TEXT DEFAULT 'initiated',
  duration INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_call_logs_user ON call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_contact ON call_logs(contact_id);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'Agent',
  avatar_color TEXT DEFAULT '#6366f1',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_employees_created_by ON employees(created_by);

-- Add assigned_to column to leads if it doesn't exist
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we handle this in code
