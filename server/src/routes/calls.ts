import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import db from '../config/database';
import twilio from 'twilio';

const router = Router();

// ── Settings CRUD ──

router.get('/settings', authenticate, (req: AuthRequest, res: Response) => {
  const row = db.prepare('SELECT * FROM twilio_settings WHERE user_id = ?').get(req.userId);
  if (!row) return res.json({ settings: null });
  const s = row as any;
  res.json({
    settings: {
      account_sid: s.account_sid ? '***' + s.account_sid.slice(-4) : '',
      auth_token: s.auth_token ? '***' + s.auth_token.slice(-4) : '',
      twiml_app_sid: s.twiml_app_sid ? '***' + s.twiml_app_sid.slice(-4) : '',
      api_key: s.api_key ? '***' + s.api_key.slice(-4) : '',
      api_secret: s.api_secret ? '***' + s.api_secret.slice(-4) : '',
      twilio_number: s.twilio_number,
      enabled: !!s.enabled,
    },
  });
});

router.put('/settings', authenticate, (req: AuthRequest, res: Response) => {
  const { account_sid, auth_token, twilio_number, twiml_app_sid, api_key, api_secret, enabled } = req.body;
  if (!account_sid || !auth_token || !twilio_number) {
    return res.status(400).json({ error: 'account_sid, auth_token, and twilio_number are required' });
  }

  const existing = db.prepare('SELECT * FROM twilio_settings WHERE user_id = ?').get(req.userId) as any;

  const resolve = (val: string, field: string) => val?.startsWith('***') && existing ? existing[field] : val;

  const data = {
    account_sid: resolve(account_sid, 'account_sid'),
    auth_token: resolve(auth_token, 'auth_token'),
    twiml_app_sid: resolve(twiml_app_sid, 'twiml_app_sid') || '',
    api_key: resolve(api_key, 'api_key') || '',
    api_secret: resolve(api_secret, 'api_secret') || '',
    twilio_number,
    enabled: enabled ? 1 : 0,
  };

  if (existing) {
    db.prepare(
      `UPDATE twilio_settings SET account_sid=?, auth_token=?, twiml_app_sid=?, api_key=?, api_secret=?, twilio_number=?, enabled=?, updated_at=datetime('now') WHERE user_id=?`
    ).run(data.account_sid, data.auth_token, data.twiml_app_sid, data.api_key, data.api_secret, data.twilio_number, data.enabled, req.userId);
  } else {
    db.prepare(
      `INSERT INTO twilio_settings (user_id, account_sid, auth_token, twiml_app_sid, api_key, api_secret, twilio_number, enabled) VALUES (?,?,?,?,?,?,?,?)`
    ).run(req.userId, data.account_sid, data.auth_token, data.twiml_app_sid, data.api_key, data.api_secret, data.twilio_number, data.enabled);
  }
  res.json({ message: 'Twilio settings saved' });
});

// ── Access Token for browser SDK ──

router.get('/token', authenticate, (req: AuthRequest, res: Response) => {
  const settings = db.prepare('SELECT * FROM twilio_settings WHERE user_id = ? AND enabled = 1').get(req.userId) as any;
  if (!settings) return res.status(400).json({ error: 'Twilio not configured' });

  if (!settings.api_key || !settings.api_secret || !settings.twiml_app_sid) {
    return res.status(400).json({ error: 'API Key, API Secret, and TwiML App SID are required for browser calling' });
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(
    settings.account_sid,
    settings.api_key,
    settings.api_secret,
    { identity: `user_${req.userId}` }
  );

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: settings.twiml_app_sid,
    incomingAllow: true,
  });

  token.addGrant(voiceGrant);

  res.json({ token: token.toJwt(), identity: `user_${req.userId}` });
});

// ── TwiML voice endpoint (called by Twilio when browser SDK makes a call) ──

router.post('/voice', (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const to = req.body.To;
  const callerId = req.body.callerId || req.body.From;

  if (to) {
    const dial = twiml.dial({ callerId, record: 'record-from-answer-dual', timeout: 30 });
    if (to.startsWith('client:')) {
      dial.client(to.replace('client:', ''));
    } else {
      const number = to.startsWith('+') ? to : `+91${to.replace(/\D/g, '')}`;
      dial.number(number);
    }
  } else {
    twiml.say('No destination number specified.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ── Call initiation (REST fallback + logging) ──

router.post('/initiate', authenticate, async (req: AuthRequest, res: Response) => {
  const { to_number, contact_id, lead_id } = req.body;
  if (!to_number) return res.status(400).json({ error: 'to_number is required' });

  const result = db.prepare(
    `INSERT INTO call_logs (user_id, contact_id, lead_id, from_number, to_number, direction, status) VALUES (?, ?, ?, 'browser', ?, 'outbound', 'initiated')`
  ).run(req.userId, contact_id || null, lead_id || null, to_number);

  res.json({ message: 'Call logged', call_log_id: result.lastInsertRowid });
});

// ── Update call status from frontend ──

router.put('/log/:id', authenticate, (req: AuthRequest, res: Response) => {
  const { status, duration, twilio_sid, notes } = req.body;
  const updates: string[] = [];
  const params: any[] = [];

  if (status) { updates.push('status = ?'); params.push(status); }
  if (duration !== undefined) { updates.push('duration = ?'); params.push(duration); }
  if (twilio_sid) { updates.push('twilio_sid = ?'); params.push(twilio_sid); }
  if (notes) { updates.push('notes = ?'); params.push(notes); }

  if (updates.length > 0) {
    params.push(req.params.id, req.userId);
    db.prepare(`UPDATE call_logs SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
  }
  res.json({ message: 'Call log updated' });
});

// ── Twilio status callback ──

router.post('/status', (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  if (CallSid) {
    db.prepare(
      `UPDATE call_logs SET status = ?, duration = COALESCE(?, duration) WHERE twilio_sid = ?`
    ).run(CallStatus || 'unknown', CallDuration ? parseInt(CallDuration) : null, CallSid);
  }
  res.status(200).send('OK');
});

// ── Call logs ──

router.get('/logs', authenticate, (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = 25;
  const offset = (page - 1) * limit;
  const contactFilter = req.query.contact_id;

  let where = 'WHERE cl.user_id = ?';
  const params: any[] = [req.userId];

  if (contactFilter) {
    where += ' AND cl.contact_id = ?';
    params.push(contactFilter);
  }

  const total = (db.prepare(`SELECT COUNT(*) as count FROM call_logs cl ${where}`).get(...params) as any).count;

  const logs = db.prepare(`
    SELECT cl.*, c.name as contact_name, c.phone as contact_phone
    FROM call_logs cl
    LEFT JOIN contacts c ON c.id = cl.contact_id
    ${where}
    ORDER BY cl.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ logs, total, page, pages: Math.ceil(total / limit) });
});

router.delete('/logs/:id', authenticate, (req: AuthRequest, res: Response) => {
  db.prepare('DELETE FROM call_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ message: 'Call log deleted' });
});

export default router;
