-- Real Estate CRM — Supabase Schema
-- Paste this into Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor → New query)

-- Users
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  notes TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Properties
CREATE TABLE IF NOT EXISTS properties (
  id BIGSERIAL PRIMARY KEY,
  address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  zip TEXT,
  price DOUBLE PRECISION,
  bedrooms INTEGER,
  bathrooms DOUBLE PRECISION,
  sqft INTEGER,
  photo_url TEXT,
  status TEXT DEFAULT 'Active',
  description TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Employees
CREATE TABLE IF NOT EXISTS employees (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'Agent',
  avatar_color TEXT DEFAULT '#6366f1',
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Leads
CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'Warm' CHECK (status IN ('Hot', 'Warm', 'Cold', 'Closed', 'Follow-up Needed')),
  source TEXT,
  notes TEXT,
  assigned_to BIGINT REFERENCES employees(id),
  budget TEXT,
  project_lead_for TEXT,
  suggested_projects TEXT,
  location_looking TEXT,
  remarks TEXT,
  next_call_date TEXT,
  next_call_time TEXT,
  site_visit_plan TEXT DEFAULT 'None',
  site_visit_date TEXT,
  lead_assign_date TEXT,
  assigned_by TEXT,
  buyer_purpose TEXT DEFAULT 'Self Use',
  final_meeting_date TEXT,
  final_meeting_notes TEXT,
  pattern TEXT DEFAULT 'Call',
  followup_date TEXT,
  followup_time TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Contact-Property Interest
CREATE TABLE IF NOT EXISTS contact_property_interest (
  id BIGSERIAL PRIMARY KEY,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE CASCADE,
  property_id BIGINT REFERENCES properties(id) ON DELETE CASCADE,
  interest_level TEXT DEFAULT 'Medium' CHECK (interest_level IN ('High', 'Medium', 'Low')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contact_id, property_id)
);

-- Integrations
CREATE TABLE IF NOT EXISTS integrations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google')),
  config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN DEFAULT false,
  webhook_token TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- Webhook Logs
CREATE TABLE IF NOT EXISTS webhook_logs (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  user_id BIGINT REFERENCES users(id),
  payload JSONB,
  status TEXT DEFAULT 'received',
  error TEXT,
  lead_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Twilio Settings
CREATE TABLE IF NOT EXISTS twilio_settings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE REFERENCES users(id),
  account_sid TEXT NOT NULL,
  auth_token TEXT NOT NULL,
  twilio_number TEXT NOT NULL,
  twiml_app_sid TEXT DEFAULT '',
  api_key TEXT DEFAULT '',
  api_secret TEXT DEFAULT '',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Call Logs
CREATE TABLE IF NOT EXISTS call_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id BIGINT REFERENCES leads(id) ON DELETE SET NULL,
  twilio_sid TEXT,
  from_number TEXT,
  to_number TEXT,
  direction TEXT DEFAULT 'outbound',
  status TEXT DEFAULT 'initiated',
  duration INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_contact ON leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads(created_by);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON contacts(created_by);
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);
CREATE INDEX IF NOT EXISTS idx_employees_created_by ON employees(created_by);
CREATE INDEX IF NOT EXISTS idx_call_logs_user ON call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_contact ON call_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_user ON webhook_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_token ON integrations(webhook_token);

-- Disable RLS for simplicity (app handles auth via JWT)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Allow the service_role key full access (used server-side)
CREATE POLICY "service_role_all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON properties FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON call_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON integrations FOR ALL USING (true) WITH CHECK (true);
