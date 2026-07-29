import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import db from '../config/database';

const router = Router();

function findIntegration(webhookToken: string, platform: string) {
  return db.prepare(
    'SELECT * FROM integrations WHERE webhook_token = ? AND platform = ? AND enabled = 1'
  ).get(webhookToken, platform) as any;
}

function createLeadFromWebhook(userId: number, platform: string, data: { name: string; email?: string; phone?: string; notes?: string; adName?: string }) {
  const existing = data.email
    ? db.prepare('SELECT id FROM contacts WHERE email = ? AND created_by = ?').get(data.email, userId) as any
    : null;

  let contactId: number;
  if (existing) {
    contactId = existing.id;
  } else {
    const result = db.prepare(
      'INSERT INTO contacts (name, email, phone, notes, created_by) VALUES (?,?,?,?,?)'
    ).run(data.name, data.email || null, data.phone || null, null, userId);
    contactId = result.lastInsertRowid as number;
  }

  const leadNotes = [
    data.notes,
    data.adName ? `Ad: ${data.adName}` : null,
    `Source: ${platform === 'meta' ? 'Meta/Facebook Ads' : 'Google Ads'}`,
  ].filter(Boolean).join('\n');

  const leadResult = db.prepare(
    'INSERT INTO leads (contact_id, status, source, notes, created_by) VALUES (?,?,?,?,?)'
  ).run(contactId, 'Hot', `${platform}-ads`, leadNotes, userId);

  return leadResult.lastInsertRowid as number;
}

function logWebhook(platform: string, userId: number | null, payload: any, status: string, error?: string, leadId?: number) {
  db.prepare(
    'INSERT INTO webhook_logs (platform, user_id, payload, status, error, lead_id) VALUES (?,?,?,?,?,?)'
  ).run(platform, userId, JSON.stringify(payload), status, error || null, leadId || null);
}

// ─── Meta (Facebook) Lead Ads ───

// Webhook verification (Facebook sends GET to verify)
router.get('/meta/:token', (req: Request, res: Response) => {
  const { token } = req.params;
  const mode = req.query['hub.mode'];
  const verifyToken = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const integration = findIntegration(token, 'meta');
  if (!integration) {
    return res.status(404).send('Not found');
  }

  const config = JSON.parse(integration.config);

  if (mode === 'subscribe' && verifyToken === config.verify_token) {
    console.log('Meta webhook verified for user', integration.user_id);
    return res.status(200).send(challenge);
  }

  res.status(403).send('Forbidden');
});

// Receive leads from Meta
router.post('/meta/:token', (req: Request, res: Response) => {
  const { token } = req.params;
  const integration = findIntegration(token, 'meta');

  if (!integration) {
    return res.status(404).json({ error: 'Not found' });
  }

  const config = JSON.parse(integration.config);

  // Verify signature if app_secret is configured
  if (config.app_secret && req.headers['x-hub-signature-256']) {
    const sig = req.headers['x-hub-signature-256'] as string;
    const expected = 'sha256=' + crypto.createHmac('sha256', config.app_secret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (sig !== expected) {
      logWebhook('meta', integration.user_id, req.body, 'error', 'Invalid signature');
      return res.status(403).json({ error: 'Invalid signature' });
    }
  }

  try {
    const body = req.body;

    if (body.object === 'page' && body.entry) {
      for (const entry of body.entry) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field === 'leadgen') {
            const leadData = change.value;
            // For real integration, you'd call the Facebook Graph API
            // to fetch lead details using leadData.leadgen_id
            // For now, we store what we get and mark for processing
            logWebhook('meta', integration.user_id, leadData, 'received_leadgen');

            // If lead data includes field_data (from test leads or direct webhook)
            if (leadData.field_data) {
              const fields: Record<string, string> = {};
              for (const f of leadData.field_data) {
                fields[f.name] = Array.isArray(f.values) ? f.values[0] : f.values;
              }

              const leadId = createLeadFromWebhook(integration.user_id, 'meta', {
                name: fields.full_name || fields.first_name || 'Meta Lead',
                email: fields.email,
                phone: fields.phone_number || fields.phone,
                adName: leadData.ad_name || leadData.campaign_name,
              });

              logWebhook('meta', integration.user_id, leadData, 'processed', undefined, leadId);
            }
          }
        }
      }
    }

    // Meta also supports direct lead data format (from CRM integration)
    if (body.lead_id && body.field_data) {
      const fields: Record<string, string> = {};
      for (const f of body.field_data) {
        fields[f.name] = Array.isArray(f.values) ? f.values[0] : f.values;
      }

      const leadId = createLeadFromWebhook(integration.user_id, 'meta', {
        name: fields.full_name || fields.first_name || 'Meta Lead',
        email: fields.email,
        phone: fields.phone_number || fields.phone,
        adName: body.ad_name,
      });

      logWebhook('meta', integration.user_id, body, 'processed', undefined, leadId);
    }

    res.status(200).json({ status: 'ok' });
  } catch (err: any) {
    logWebhook('meta', integration.user_id, req.body, 'error', err.message);
    res.status(500).json({ error: 'Processing failed' });
  }
});

// ─── Google Ads Lead Form Webhook ───

router.post('/google/:token', (req: Request, res: Response) => {
  const { token } = req.params;
  const integration = findIntegration(token, 'google');

  if (!integration) {
    return res.status(404).json({ error: 'Not found' });
  }

  const config = JSON.parse(integration.config);

  // Verify Google webhook key if configured
  if (config.webhook_key && req.headers['x-goog-channel-token'] !== config.webhook_key) {
    logWebhook('google', integration.user_id, req.body, 'error', 'Invalid webhook key');
    return res.status(403).json({ error: 'Invalid key' });
  }

  try {
    const body = req.body;

    // Google Ads lead form extension format
    if (body.lead_form_submission_id || body.user_column_data) {
      const columns: Record<string, string> = {};
      for (const col of (body.user_column_data || [])) {
        columns[col.column_id?.toLowerCase()] = col.string_value;
      }

      const leadId = createLeadFromWebhook(integration.user_id, 'google', {
        name: columns.full_name || columns.name || `${columns.first_name || ''} ${columns.last_name || ''}`.trim() || 'Google Lead',
        email: columns.email,
        phone: columns.phone_number || columns.phone,
        adName: body.campaign_name || body.ad_group_name,
        notes: columns.comments || columns.message,
      });

      logWebhook('google', integration.user_id, body, 'processed', undefined, leadId);
    }

    // Also support simple JSON format for Zapier / custom integrations
    if (body.name || body.email) {
      const leadId = createLeadFromWebhook(integration.user_id, 'google', {
        name: body.name || body.full_name || 'Google Lead',
        email: body.email,
        phone: body.phone,
        adName: body.campaign || body.ad_name,
        notes: body.notes || body.message,
      });

      logWebhook('google', integration.user_id, body, 'processed', undefined, leadId);
    }

    res.status(200).json({ status: 'ok' });
  } catch (err: any) {
    logWebhook('google', integration.user_id, req.body, 'error', err.message);
    res.status(500).json({ error: 'Processing failed' });
  }
});

// ─── Test endpoint (to simulate a lead coming in) ───

router.post('/test/:platform/:token', (req: Request, res: Response) => {
  const { platform, token } = req.params;
  const integration = findIntegration(token, platform);

  if (!integration) {
    return res.status(404).json({ error: 'Integration not found or disabled' });
  }

  try {
    const leadId = createLeadFromWebhook(integration.user_id, platform, {
      name: 'Test Lead - ' + new Date().toLocaleTimeString(),
      email: 'testlead@example.com',
      phone: '9876500000',
      adName: 'Test Campaign',
      notes: 'This is a test lead from the integration test button',
    });

    logWebhook(platform, integration.user_id, { test: true }, 'processed', undefined, leadId);

    res.json({ status: 'ok', lead_id: leadId, message: 'Test lead created successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
