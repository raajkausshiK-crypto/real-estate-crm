import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function auth(req: any, res: any, next: any) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET) as any;
    req.userId = decoded.id;
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

// A user is an "employee" if their email matches a row in the employees table;
// otherwise they are an admin. Employees only see leads assigned to them.
async function resolveRoleByEmail(email: string): Promise<{ role: 'admin' | 'employee'; employeeId: number | null }> {
  if (!email) return { role: 'admin', employeeId: null };
  const { data: emp } = await supabase.from('employees').select('id').ilike('email', email).limit(1);
  if (emp?.length) return { role: 'employee', employeeId: emp[0].id };
  return { role: 'admin', employeeId: null };
}

async function getRoleForUser(userId: number): Promise<{ role: 'admin' | 'employee'; employeeId: number | null }> {
  const { data: user } = await supabase.from('users').select('email').eq('id', userId).single();
  return resolveRoleByEmail(user?.email || '');
}

// ── Auth ──
// Public registration is disabled. Employee logins are created by the
// admin from the Employees page; the single admin login is pre-provisioned.
app.post('/api/auth/register', (_req, res) => {
  res.status(403).json({ error: 'Registration is disabled. Ask your admin to create your login.' });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const { data: user, error } = await supabase.from('users').select('*').eq('email', email).single();
    if (error || !user) return res.status(401).json({ error: 'Invalid credentials' });
    if (String(user.password_hash).startsWith('DISABLED')) return res.status(401).json({ error: 'This account has been deactivated. Contact your admin.' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const { role, employeeId } = await resolveRoleByEmail(user.email);
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role, employee_id: employeeId }, token });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

// ── Leads ──
app.get('/api/leads', auth, async (req: any, res) => {
  try {
    const { status, search, page = '1', limit = '20' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const { role, employeeId } = await getRoleForUser(req.userId);
    let query = supabase.from('leads').select(`
      *, contacts!leads_contact_id_fkey(name, email, phone),
      employees!leads_assigned_to_fkey(name, avatar_color)
    `, { count: 'exact' }).order('updated_at', { ascending: false }).range(offset, offset + Number(limit) - 1);
    if (role === 'employee') query = query.eq('assigned_to', employeeId);
    if (status) query = query.eq('status', status);
    const { data: leads, count, error } = await query;
    if (error) throw error;
    const mapped = (leads || []).map((l: any) => ({
      ...l, contact_name: l.contacts?.name, contact_email: l.contacts?.email,
      contact_phone: l.contacts?.phone, assigned_name: l.employees?.name,
      assigned_color: l.employees?.avatar_color, contacts: undefined, employees: undefined
    }));
    if (search) {
      const s = (search as string).toLowerCase();
      const filtered = mapped.filter((l: any) => l.contact_name?.toLowerCase().includes(s) || l.contact_email?.toLowerCase().includes(s));
      return res.json({ leads: filtered, total: filtered.length });
    }
    res.json({ leads: mapped, total: count || 0 });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.get('/api/leads/pipeline', auth, async (req: any, res) => {
  try {
    const { role, employeeId } = await getRoleForUser(req.userId);
    let query = supabase.from('leads').select(`
      *, contacts!leads_contact_id_fkey(name, email, phone),
      employees!leads_assigned_to_fkey(name, avatar_color)
    `).order('updated_at', { ascending: false });
    if (role === 'employee') query = query.eq('assigned_to', employeeId);
    const { data: leads, error } = await query;
    if (error) throw error;
    const pipeline: Record<string, any[]> = { 'Hot': [], 'Warm': [], 'Cold': [], 'Follow-up Needed': [], 'Closed': [] };
    for (const l of leads || []) {
      const mapped = { ...l, contact_name: l.contacts?.name, contact_email: l.contacts?.email, contact_phone: l.contacts?.phone, assigned_name: l.employees?.name, assigned_color: l.employees?.avatar_color, contacts: undefined, employees: undefined };
      pipeline[mapped.status]?.push(mapped);
    }
    res.json(pipeline);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.get('/api/leads/:id', auth, async (req: any, res) => {
  try {
    const { data: lead, error } = await supabase.from('leads').select(`
      *, contacts!leads_contact_id_fkey(name, email, phone)
    `).eq('id', req.params.id).single();
    if (error || !lead) return res.status(404).json({ error: 'Lead not found' });
    const { role, employeeId } = await getRoleForUser(req.userId);
    if (role === 'employee' && lead.assigned_to !== employeeId) return res.status(404).json({ error: 'Lead not found' });
    res.json({ ...lead, contact_name: lead.contacts?.name, contact_email: lead.contacts?.email, contact_phone: lead.contacts?.phone, contacts: undefined });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.post('/api/leads', auth, async (req: any, res) => {
  try {
    const b = req.body;
    if (!b.contact_id) return res.status(400).json({ error: 'contact_id is required' });
    // Leads created by an employee are auto-assigned to them so they stay visible
    const { role, employeeId } = await getRoleForUser(req.userId);
    const assignedTo = role === 'employee' ? (b.assigned_to || employeeId) : (b.assigned_to || null);
    const { data, error } = await supabase.from('leads').insert({
      contact_id: b.contact_id, status: b.status || 'Warm', source: b.source || null,
      notes: b.notes || null, assigned_to: assignedTo, budget: b.budget || null,
      project_lead_for: b.project_lead_for || null, suggested_projects: b.suggested_projects || null,
      location_looking: b.location_looking || null, remarks: b.remarks || null,
      next_call_date: b.next_call_date || null, next_call_time: b.next_call_time || null,
      site_visit_plan: b.site_visit_plan || 'None', site_visit_date: b.site_visit_date || null,
      lead_assign_date: b.lead_assign_date || null, assigned_by: b.assigned_by || null,
      buyer_purpose: b.buyer_purpose || 'Self Use', final_meeting_date: b.final_meeting_date || null,
      final_meeting_notes: b.final_meeting_notes || null, pattern: b.pattern || 'Call',
      followup_date: b.followup_date || null, followup_time: b.followup_time || null,
      created_by: req.userId
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.put('/api/leads/:id', auth, async (req: any, res) => {
  try {
    const b = req.body;
    const { data: existing, error: fetchErr } = await supabase.from('leads').select('*').eq('id', req.params.id).single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Lead not found' });
    const { role, employeeId } = await getRoleForUser(req.userId);
    if (role === 'employee' && existing.assigned_to !== employeeId) return res.status(403).json({ error: 'You can only update leads assigned to you' });
    const v = (key: string) => b[key] !== undefined ? (b[key] || null) : existing[key];
    const { data, error } = await supabase.from('leads').update({
      status: b.status ?? existing.status, source: v('source'), notes: v('notes'),
      assigned_to: b.assigned_to !== undefined ? (b.assigned_to || null) : existing.assigned_to,
      budget: v('budget'), project_lead_for: v('project_lead_for'), suggested_projects: v('suggested_projects'),
      location_looking: v('location_looking'), remarks: v('remarks'), next_call_date: v('next_call_date'),
      next_call_time: v('next_call_time'), site_visit_plan: v('site_visit_plan'), site_visit_date: v('site_visit_date'),
      lead_assign_date: v('lead_assign_date'), assigned_by: v('assigned_by'), buyer_purpose: v('buyer_purpose'),
      final_meeting_date: v('final_meeting_date'), final_meeting_notes: v('final_meeting_notes'),
      pattern: v('pattern'), followup_date: v('followup_date'), followup_time: v('followup_time'),
      updated_at: new Date().toISOString()
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.delete('/api/leads/:id', auth, async (req: any, res) => {
  try {
    const { role } = await getRoleForUser(req.userId);
    if (role === 'employee') return res.status(403).json({ error: 'Only admins can delete leads' });
    const { data, error } = await supabase.from('leads').delete().eq('id', req.params.id).select();
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: 'Lead not found' });
    res.json({ message: 'Lead deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

// ── Contacts ──
app.get('/api/contacts', auth, async (req: any, res) => {
  try {
    const { search, limit } = req.query;
    let query = supabase.from('contacts').select('*', { count: 'exact' }).order('updated_at', { ascending: false });
    if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    if (limit) query = query.limit(Number(limit));
    const { data, count, error } = await query;
    if (error) throw error;
    res.json({ contacts: data || [], total: count || 0 });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.post('/api/contacts', auth, async (req: any, res) => {
  try {
    const { name, email, phone, address, city, state, zip, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const { data, error } = await supabase.from('contacts').insert({
      name, email: email || null, phone: phone || null, address: address || null,
      city: city || null, state: state || null, zip: zip || null, notes: notes || null,
      created_by: req.userId
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.put('/api/contacts/:id', auth, async (req: any, res) => {
  try {
    const b = req.body;
    const { data, error } = await supabase.from('contacts').update({
      name: b.name, email: b.email || null, phone: b.phone || null, address: b.address || null,
      city: b.city || null, state: b.state || null, zip: b.zip || null, notes: b.notes || null,
      updated_at: new Date().toISOString()
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.delete('/api/contacts/:id', auth, async (req: any, res) => {
  try {
    const { data, error } = await supabase.from('contacts').delete().eq('id', req.params.id).select();
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: 'Contact not found' });
    res.json({ message: 'Contact deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

// ── Properties ──
app.get('/api/properties', auth, async (req: any, res) => {
  try {
    const { search, limit } = req.query;
    let query = supabase.from('properties').select('*', { count: 'exact' }).order('updated_at', { ascending: false });
    if (search) query = query.or(`address.ilike.%${search}%,city.ilike.%${search}%`);
    if (limit) query = query.limit(Number(limit));
    const { data, count, error } = await query;
    if (error) throw error;
    res.json({ properties: data || [], total: count || 0 });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.post('/api/properties', auth, async (req: any, res) => {
  try {
    const b = req.body;
    const { data, error } = await supabase.from('properties').insert({
      address: b.address, city: b.city || null, state: b.state || null, zip: b.zip || null,
      price: b.price || null, bedrooms: b.bedrooms || null, bathrooms: b.bathrooms || null,
      sqft: b.sqft || null, photo_url: b.photo_url || null, status: b.status || 'Active',
      description: b.description || null, created_by: req.userId
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.put('/api/properties/:id', auth, async (req: any, res) => {
  try {
    const b = req.body;
    const { data, error } = await supabase.from('properties').update({
      address: b.address, city: b.city || null, state: b.state || null, zip: b.zip || null,
      price: b.price || null, bedrooms: b.bedrooms || null, bathrooms: b.bathrooms || null,
      sqft: b.sqft || null, photo_url: b.photo_url || null, status: b.status || 'Active',
      description: b.description || null, updated_at: new Date().toISOString()
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.delete('/api/properties/:id', auth, async (req: any, res) => {
  try {
    const { data, error } = await supabase.from('properties').delete().eq('id', req.params.id).select();
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Property deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

// ── Employees ──
// Creates/updates the employee's login (users row) when a password is given.
async function upsertEmployeeLogin(name: string, email: string, password: string) {
  const hash = await bcrypt.hash(password, 10);
  const { data: existing } = await supabase.from('users').select('id').ilike('email', email).limit(1);
  if (existing?.length) {
    await supabase.from('users').update({ name, password_hash: hash }).eq('id', existing[0].id);
  } else {
    await supabase.from('users').insert({ name, email, password_hash: hash });
  }
}

app.get('/api/employees', auth, async (req: any, res) => {
  try {
    const { data, error } = await supabase.from('employees').select('*').order('name');
    if (error) throw error;
    const { data: users } = await supabase.from('users').select('email, password_hash');
    const loginEmails = new Set(
      (users || [])
        .filter((u: any) => u.password_hash && !String(u.password_hash).startsWith('DISABLED'))
        .map((u: any) => (u.email || '').toLowerCase())
    );
    const employees = (data || []).map((e: any) => ({
      ...e, has_login: e.email ? loginEmails.has(e.email.toLowerCase()) : false
    }));
    res.json({ employees });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.post('/api/employees', auth, async (req: any, res) => {
  try {
    const { role: userRole } = await getRoleForUser(req.userId);
    if (userRole === 'employee') return res.status(403).json({ error: 'Only admins can manage employees' });
    const { name, email, phone, role, password } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (password && !email) return res.status(400).json({ error: 'Email is required to create a login' });
    if (password && password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    // Guard: adding the admin's own email as an employee would lock them out of admin
    const { data: me } = await supabase.from('users').select('email').eq('id', req.userId).single();
    if (email && me?.email && email.toLowerCase() === me.email.toLowerCase()) {
      return res.status(400).json({ error: 'You cannot add your own admin email as an employee' });
    }
    const colors = ['#0284c7','#7c3aed','#db2777','#d97706','#059669','#2563eb','#dc2626','#0d9488'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const { data, error } = await supabase.from('employees').insert({
      name, email: email || null, phone: phone || null, role: role || 'Agent',
      avatar_color: color, created_by: req.userId
    }).select().single();
    if (error) throw error;
    if (password && email) await upsertEmployeeLogin(name, email, password);
    res.status(201).json(data);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.put('/api/employees/:id', auth, async (req: any, res) => {
  try {
    const { role: userRole } = await getRoleForUser(req.userId);
    if (userRole === 'employee') return res.status(403).json({ error: 'Only admins can manage employees' });
    const { name, email, phone, role, password } = req.body;
    if (password && !email) return res.status(400).json({ error: 'Email is required to create a login' });
    if (password && password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const { data: me } = await supabase.from('users').select('email').eq('id', req.userId).single();
    if (email && me?.email && email.toLowerCase() === me.email.toLowerCase()) {
      return res.status(400).json({ error: 'You cannot use your own admin email for an employee' });
    }
    const { data: existing } = await supabase.from('employees').select('*').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { data, error } = await supabase.from('employees').update({
      name, email: email || null, phone: phone || null, role: role || 'Agent'
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    // Keep the login account in sync when the email stays the same
    if (email && existing.email && email.toLowerCase() === existing.email.toLowerCase()) {
      await supabase.from('users').update({ name }).ilike('email', email);
    }
    if (password && email) await upsertEmployeeLogin(name, email, password);
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.delete('/api/employees/:id', auth, async (req: any, res) => {
  try {
    const { role: userRole } = await getRoleForUser(req.userId);
    if (userRole === 'employee') return res.status(403).json({ error: 'Only admins can manage employees' });
    const { data: emp } = await supabase.from('employees').select('email').eq('id', req.params.id).single();
    await supabase.from('leads').update({ assigned_to: null }).eq('assigned_to', req.params.id);
    const { data, error } = await supabase.from('employees').delete().eq('id', req.params.id).select();
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: 'Not found' });
    // Revoke the login so a removed employee can't sign in (or fall back to admin)
    if (emp?.email) {
      await supabase.from('users').update({ password_hash: `DISABLED-${Date.now()}` }).ilike('email', emp.email);
    }
    res.json({ message: 'Employee deleted' });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

// ── Integrations ──
app.get('/api/integrations', auth, async (req: any, res) => {
  try {
    const { data, error } = await supabase.from('integrations').select('*').eq('user_id', req.userId);
    if (error) throw error;
    const meta = (data || []).find((i: any) => i.platform === 'meta') || null;
    const google = (data || []).find((i: any) => i.platform === 'google') || null;
    res.json({ meta, google });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

// ── Calls ──
app.get('/api/calls/logs', auth, async (req: any, res) => {
  try {
    const { data, count, error } = await supabase.from('call_logs').select(`
      *, contacts!call_logs_contact_id_fkey(name, phone)
    `, { count: 'exact' }).eq('user_id', req.userId).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    const mapped = (data || []).map((c: any) => ({
      ...c, contact_name: c.contacts?.name, contact_phone: c.contacts?.phone, contacts: undefined
    }));
    res.json({ logs: mapped, total: count || 0 });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

app.get('/api/calls/settings', auth, async (req: any, res) => {
  try {
    const { data, error } = await supabase.from('twilio_settings').select('*').eq('user_id', req.userId).single();
    if (error && error.code !== 'PGRST116') throw error;
    res.json({ settings: data || null });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Server error' }); }
});

// ── Health ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', db: 'supabase', timestamp: new Date().toISOString() });
});

export default app;
