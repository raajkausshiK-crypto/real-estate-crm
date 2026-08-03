import { Router, Response } from 'express';
import db from '../config/database';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const { status, search, page = '1', limit = '20' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE l.created_by = ?';
    const params: any[] = [req.userId];

    if (status) { where += ' AND l.status = ?'; params.push(status); }
    if (search) { where += ' AND (c.name LIKE ? OR c.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    const total = (db.prepare(
      `SELECT COUNT(*) as count FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id ${where}`
    ).get(...params) as any).count;

    const leads = db.prepare(
      `SELECT l.*, c.name as contact_name, c.email as contact_email, c.phone as contact_phone,
              e.name as assigned_name, e.avatar_color as assigned_color
       FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id
       LEFT JOIN employees e ON l.assigned_to = e.id ${where}
       ORDER BY l.updated_at DESC LIMIT ? OFFSET ?`
    ).all(...params, Number(limit), offset);

    res.json({ leads, total });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/pipeline', (req: AuthRequest, res: Response) => {
  try {
    const rows = db.prepare(
      `SELECT l.*, c.name as contact_name, c.email as contact_email, c.phone as contact_phone,
              e.name as assigned_name, e.avatar_color as assigned_color
       FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id
       LEFT JOIN employees e ON l.assigned_to = e.id
       WHERE l.created_by = ? ORDER BY l.updated_at DESC`
    ).all(req.userId);

    const pipeline: Record<string, any[]> = {
      'Hot': [], 'Warm': [], 'Cold': [], 'Follow-up Needed': [], 'Closed': []
    };
    for (const lead of rows as any[]) {
      pipeline[lead.status]?.push(lead);
    }
    res.json(pipeline);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const lead = db.prepare(
      `SELECT l.*, c.name as contact_name, c.email as contact_email, c.phone as contact_phone
       FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id
       WHERE l.id = ? AND l.created_by = ?`
    ).get(req.params.id, req.userId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { contact_id, status = 'Warm', source, notes, assigned_to,
      budget, project_lead_for, suggested_projects, location_looking, remarks,
      next_call_date, next_call_time, site_visit_plan, site_visit_date,
      lead_assign_date, assigned_by, buyer_purpose, final_meeting_date, final_meeting_notes,
      pattern, followup_date, followup_time } = req.body;
    if (!contact_id) return res.status(400).json({ error: 'contact_id is required' });

    const result = db.prepare(
      `INSERT INTO leads (contact_id, status, source, notes, assigned_to,
        budget, project_lead_for, suggested_projects, location_looking, remarks,
        next_call_date, next_call_time, site_visit_plan, site_visit_date,
        lead_assign_date, assigned_by, buyer_purpose, final_meeting_date, final_meeting_notes,
        pattern, followup_date, followup_time, created_by)
       VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?,?)`
    ).run(contact_id, status, source || null, notes || null, assigned_to || null,
      budget || null, project_lead_for || null, suggested_projects || null, location_looking || null, remarks || null,
      next_call_date || null, next_call_time || null, site_visit_plan || 'None', site_visit_date || null,
      lead_assign_date || null, assigned_by || null, buyer_purpose || 'Self Use', final_meeting_date || null, final_meeting_notes || null,
      pattern || 'Call', followup_date || null, followup_time || null, req.userId);

    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(lead);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const b = req.body;
    const existing = db.prepare('SELECT * FROM leads WHERE id = ? AND created_by = ?').get(req.params.id, req.userId) as any;
    if (!existing) return res.status(404).json({ error: 'Lead not found' });

    const v = (key: string) => b[key] !== undefined ? (b[key] || null) : existing[key];

    db.prepare(
      `UPDATE leads SET status = ?, source = ?, notes = ?, assigned_to = ?,
        budget = ?, project_lead_for = ?, suggested_projects = ?, location_looking = ?, remarks = ?,
        next_call_date = ?, next_call_time = ?, site_visit_plan = ?, site_visit_date = ?,
        lead_assign_date = ?, assigned_by = ?, buyer_purpose = ?, final_meeting_date = ?, final_meeting_notes = ?,
        pattern = ?, followup_date = ?, followup_time = ?, updated_at = datetime('now')
       WHERE id = ? AND created_by = ?`
    ).run(
      b.status ?? existing.status, v('source'), v('notes'),
      b.assigned_to !== undefined ? (b.assigned_to || null) : existing.assigned_to,
      v('budget'), v('project_lead_for'), v('suggested_projects'), v('location_looking'), v('remarks'),
      v('next_call_date'), v('next_call_time'), v('site_visit_plan'), v('site_visit_date'),
      v('lead_assign_date'), v('assigned_by'), v('buyer_purpose'), v('final_meeting_date'), v('final_meeting_notes'),
      v('pattern'), v('followup_date'), v('followup_time'),
      req.params.id, req.userId
    );

    const updated = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM leads WHERE id = ? AND created_by = ?').run(req.params.id, req.userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Lead not found' });
    res.json({ message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
