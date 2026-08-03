import { Router, Response } from 'express';
import db from '../config/database';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const employees = db.prepare(
      'SELECT * FROM employees WHERE created_by = ? ORDER BY name'
    ).all(req.userId);
    res.json({ employees });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, role } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];
    const avatar_color = colors[Math.floor(Math.random() * colors.length)];

    const result = db.prepare(
      'INSERT INTO employees (name, email, phone, role, avatar_color, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, email || null, phone || null, role || 'Agent', avatar_color, req.userId);

    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(employee);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, role } = req.body;
    const existing = db.prepare('SELECT * FROM employees WHERE id = ? AND created_by = ?').get(req.params.id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Employee not found' });

    db.prepare(
      'UPDATE employees SET name = ?, email = ?, phone = ?, role = ? WHERE id = ? AND created_by = ?'
    ).run(name, email || null, phone || null, role || 'Agent', req.params.id, req.userId);

    const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    db.prepare('UPDATE leads SET assigned_to = NULL WHERE assigned_to = ? AND created_by = ?').run(req.params.id, req.userId);
    const result = db.prepare('DELETE FROM employees WHERE id = ? AND created_by = ?').run(req.params.id, req.userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: 'Employee deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
