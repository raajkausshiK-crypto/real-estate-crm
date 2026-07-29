import { Router, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import db from '../config/database';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/import/contacts', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'CSV file is required' });

    const records = parse(req.file.buffer.toString(), { columns: true, skip_empty_lines: true, trim: true });
    let imported = 0, skipped = 0;

    const insert = db.prepare(
      'INSERT INTO contacts (name, email, phone, address, city, state, zip, created_by) VALUES (?,?,?,?,?,?,?,?)'
    );

    for (const row of records) {
      const name = row.name || row.Name;
      if (!name) { skipped++; continue; }
      try {
        insert.run(name, row.email||row.Email||null, row.phone||row.Phone||null,
          row.address||row.Address||null, row.city||row.City||null,
          row.state||row.State||null, row.zip||row.Zip||null, req.userId);
        imported++;
      } catch { skipped++; }
    }

    res.json({ imported, skipped, total: records.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse CSV' });
  }
});

router.post('/import/properties', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'CSV file is required' });

    const records = parse(req.file.buffer.toString(), { columns: true, skip_empty_lines: true, trim: true });
    let imported = 0, skipped = 0;

    const insert = db.prepare(
      'INSERT INTO properties (address, city, state, zip, price, bedrooms, bathrooms, sqft, status, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)'
    );

    for (const row of records) {
      const address = row.address || row.Address;
      if (!address) { skipped++; continue; }
      try {
        insert.run(address, row.city||row.City||null, row.state||row.State||null, row.zip||row.Zip||null,
          Number(row.price||row.Price)||null, Number(row.bedrooms||row.Bedrooms)||null,
          Number(row.bathrooms||row.Bathrooms)||null, Number(row.sqft||row.Sqft)||null,
          row.status||row.Status||'Active', req.userId);
        imported++;
      } catch { skipped++; }
    }

    res.json({ imported, skipped, total: records.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse CSV' });
  }
});

router.get('/export/contacts', (req: AuthRequest, res: Response) => {
  try {
    const rows = db.prepare(
      'SELECT name, email, phone, address, city, state, zip FROM contacts WHERE created_by = ? ORDER BY name'
    ).all(req.userId);
    const csv = stringify(rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/export/leads', (req: AuthRequest, res: Response) => {
  try {
    const rows = db.prepare(
      `SELECT c.name, c.email, c.phone, l.status, l.source, l.notes, l.created_at
       FROM leads l JOIN contacts c ON l.contact_id = c.id
       WHERE l.created_by = ? ORDER BY l.created_at DESC`
    ).all(req.userId);
    const csv = stringify(rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
