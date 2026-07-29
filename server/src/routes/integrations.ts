import { Router, Response } from 'express';
import crypto from 'crypto';
import db from '../config/database';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM integrations WHERE user_id = ?').all(req.userId);
    const integrations: Record<string, any> = { meta: null, google: null };

    for (const row of rows as any[]) {
      integrations[row.platform] = {
        ...row,
        config: JSON.parse(row.config),
        enabled: !!row.enabled,
      };
    }

    res.json(integrations);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:platform', (req: AuthRequest, res: Response) => {
  try {
    const { platform } = req.params;
    if (!['meta', 'google'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    const { config, enabled } = req.body;
    const existing = db.prepare(
      'SELECT * FROM integrations WHERE user_id = ? AND platform = ?'
    ).get(req.userId, platform) as any;

    if (existing) {
      db.prepare(
        `UPDATE integrations SET config = ?, enabled = ?, updated_at = datetime('now')
         WHERE user_id = ? AND platform = ?`
      ).run(JSON.stringify(config), enabled ? 1 : 0, req.userId, platform);
    } else {
      const webhookToken = crypto.randomBytes(24).toString('hex');
      db.prepare(
        'INSERT INTO integrations (user_id, platform, config, enabled, webhook_token) VALUES (?,?,?,?,?)'
      ).run(req.userId, platform, JSON.stringify(config), enabled ? 1 : 0, webhookToken);
    }

    const updated = db.prepare(
      'SELECT * FROM integrations WHERE user_id = ? AND platform = ?'
    ).get(req.userId, platform) as any;

    res.json({
      ...updated,
      config: JSON.parse(updated.config),
      enabled: !!updated.enabled,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:platform/regenerate-token', (req: AuthRequest, res: Response) => {
  try {
    const { platform } = req.params;
    const webhookToken = crypto.randomBytes(24).toString('hex');

    const result = db.prepare(
      `UPDATE integrations SET webhook_token = ?, updated_at = datetime('now')
       WHERE user_id = ? AND platform = ?`
    ).run(webhookToken, req.userId, platform);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Integration not found. Save settings first.' });
    }

    res.json({ webhook_token: webhookToken });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/webhook-logs', (req: AuthRequest, res: Response) => {
  try {
    const { platform, limit = '50' } = req.query;
    let query = 'SELECT * FROM webhook_logs WHERE user_id = ?';
    const params: any[] = [req.userId];

    if (platform) {
      query += ' AND platform = ?';
      params.push(platform);
    }

    const logs = db.prepare(query + ' ORDER BY created_at DESC LIMIT ?').all(...params, Number(limit));
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
