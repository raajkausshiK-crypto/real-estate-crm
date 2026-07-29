import { Router, Response } from 'express';
import db from '../config/database';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const { search, min_price, max_price, bedrooms, city, page = '1', limit = '20' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE created_by = ?';
    const params: any[] = [req.userId];

    if (search) { where += ' AND (address LIKE ? OR city LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (min_price) { where += ' AND price >= ?'; params.push(Number(min_price)); }
    if (max_price) { where += ' AND price <= ?'; params.push(Number(max_price)); }
    if (bedrooms) { where += ' AND bedrooms >= ?'; params.push(Number(bedrooms)); }
    if (city) { where += ' AND city LIKE ?'; params.push(`%${city}%`); }

    const total = (db.prepare(`SELECT COUNT(*) as count FROM properties ${where}`).get(...params) as any).count;
    const properties = db.prepare(`SELECT * FROM properties ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), offset);

    res.json({ properties, total });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const property = db.prepare('SELECT * FROM properties WHERE id = ? AND created_by = ?').get(req.params.id, req.userId);
    if (!property) return res.status(404).json({ error: 'Property not found' });

    const interests = db.prepare(
      `SELECT cpi.*, c.name as contact_name, c.email as contact_email
       FROM contact_property_interest cpi JOIN contacts c ON cpi.contact_id = c.id
       WHERE cpi.property_id = ?`
    ).all(req.params.id);

    res.json({ ...(property as any), interested_contacts: interests });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { address, city, state, zip, price, bedrooms, bathrooms, sqft, photo_url, status, description } = req.body;
    if (!address) return res.status(400).json({ error: 'Address is required' });

    const result = db.prepare(
      'INSERT INTO properties (address, city, state, zip, price, bedrooms, bathrooms, sqft, photo_url, status, description, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    ).run(address, city||null, state||null, zip||null, price||null, bedrooms||null, bathrooms||null, sqft||null, photo_url||null, status||'Active', description||null, req.userId);

    const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(prop);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { address, city, state, zip, price, bedrooms, bathrooms, sqft, photo_url, status, description } = req.body;
    const existing = db.prepare('SELECT * FROM properties WHERE id = ? AND created_by = ?').get(req.params.id, req.userId) as any;
    if (!existing) return res.status(404).json({ error: 'Property not found' });

    db.prepare(
      `UPDATE properties SET address=?, city=?, state=?, zip=?, price=?, bedrooms=?, bathrooms=?, sqft=?, photo_url=?, status=?, description=?, updated_at=datetime('now')
       WHERE id = ? AND created_by = ?`
    ).run(
      address??existing.address, city??existing.city, state??existing.state, zip??existing.zip,
      price??existing.price, bedrooms??existing.bedrooms, bathrooms??existing.bathrooms, sqft??existing.sqft,
      photo_url??existing.photo_url, status??existing.status, description??existing.description,
      req.params.id, req.userId
    );

    const updated = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM properties WHERE id = ? AND created_by = ?').run(req.params.id, req.userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Property not found' });
    res.json({ message: 'Property deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/interest', (req: AuthRequest, res: Response) => {
  try {
    const { contact_id, interest_level = 'Medium', notes } = req.body;
    if (!contact_id) return res.status(400).json({ error: 'contact_id is required' });

    db.prepare(
      `INSERT INTO contact_property_interest (contact_id, property_id, interest_level, notes)
       VALUES (?, ?, ?, ?) ON CONFLICT(contact_id, property_id)
       DO UPDATE SET interest_level = excluded.interest_level, notes = excluded.notes`
    ).run(contact_id, req.params.id, interest_level, notes || null);

    const row = db.prepare(
      'SELECT * FROM contact_property_interest WHERE contact_id = ? AND property_id = ?'
    ).get(contact_id, req.params.id);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
