import { Router, Response } from 'express';
import db from '../config/database';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const { search, page = '1', limit = '20' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE created_by = ?';
    const params: any[] = [req.userId];

    if (search) {
      where += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const total = (db.prepare(`SELECT COUNT(*) as count FROM contacts ${where}`).get(...params) as any).count;
    const contacts = db.prepare(`SELECT * FROM contacts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), offset);

    res.json({ contacts, total });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND created_by = ?').get(req.params.id, req.userId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const interests = db.prepare(
      `SELECT cpi.*, p.address, p.city, p.price, p.bedrooms, p.bathrooms
       FROM contact_property_interest cpi JOIN properties p ON cpi.property_id = p.id
       WHERE cpi.contact_id = ?`
    ).all(req.params.id);

    res.json({ ...(contact as any), property_interests: interests });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, address, city, state, zip, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    if (email) {
      const dup = db.prepare('SELECT id, name FROM contacts WHERE email = ? AND created_by = ?').get(email, req.userId);
      if (dup) return res.status(409).json({ error: 'Possible duplicate', existing: dup });
    }

    const result = db.prepare(
      'INSERT INTO contacts (name, email, phone, address, city, state, zip, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(name, email || null, phone || null, address || null, city || null, state || null, zip || null, notes || null, req.userId);

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(contact);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, address, city, state, zip, notes } = req.body;
    const existing = db.prepare('SELECT * FROM contacts WHERE id = ? AND created_by = ?').get(req.params.id, req.userId) as any;
    if (!existing) return res.status(404).json({ error: 'Contact not found' });

    db.prepare(
      `UPDATE contacts SET name=?, email=?, phone=?, address=?, city=?, state=?, zip=?, notes=?, updated_at=datetime('now')
       WHERE id = ? AND created_by = ?`
    ).run(
      name ?? existing.name, email ?? existing.email, phone ?? existing.phone,
      address ?? existing.address, city ?? existing.city, state ?? existing.state,
      zip ?? existing.zip, notes ?? existing.notes, req.params.id, req.userId
    );

    const updated = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM contacts WHERE id = ? AND created_by = ?').run(req.params.id, req.userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json({ message: 'Contact deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
