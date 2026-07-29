import { useState, useEffect } from 'react';
import { api } from '../utils/api';

interface Integration {
  id: number;
  platform: string;
  config: Record<string, string>;
  enabled: boolean;
  webhook_token: string;
}

interface WebhookLog {
  id: number;
  platform: string;
  status: string;
  error: string | null;
  lead_id: number | null;
  created_at: string;
}

export default function Integrations() {
  const [meta, setMeta] = useState<Integration | null>(null);
  const [google, setGoogle] = useState<Integration | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [activeTab, setActiveTab] = useState<'meta' | 'google'>('meta');
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [error, setError] = useState('');

  const [metaForm, setMetaForm] = useState({ page_id: '', app_id: '', app_secret: '', access_token: '', verify_token: '', enabled: false });
  const [googleForm, setGoogleForm] = useState({ customer_id: '', webhook_key: '', enabled: false });

  const fetchData = () => {
    api.get<{ meta: Integration | null; google: Integration | null }>('/integrations').then(data => {
      setMeta(data.meta); setGoogle(data.google);
      if (data.meta) setMetaForm({ page_id: data.meta.config.page_id || '', app_id: data.meta.config.app_id || '', app_secret: data.meta.config.app_secret || '', access_token: data.meta.config.access_token || '', verify_token: data.meta.config.verify_token || '', enabled: data.meta.enabled });
      if (data.google) setGoogleForm({ customer_id: data.google.config.customer_id || '', webhook_key: data.google.config.webhook_key || '', enabled: data.google.enabled });
    });
    api.get<WebhookLog[]>('/integrations/webhook-logs').then(setLogs);
  };

  useEffect(() => { fetchData(); }, []);

  const save = async (platform: 'meta' | 'google') => {
    setSaving(true); setError(''); setTestResult('');
    try {
      const formData = platform === 'meta' ? metaForm : googleForm;
      const { enabled, ...config } = formData;
      await api.put(`/integrations/${platform}`, { config, enabled });
      fetchData();
    } catch (err: any) { setError(err.message); }
    setSaving(false);
  };

  const regenerateToken = async (platform: 'meta' | 'google') => {
    try { await api.post(`/integrations/${platform}/regenerate-token`); fetchData(); } catch (err: any) { setError(err.message); }
  };

  const testWebhook = async (platform: 'meta' | 'google') => {
    setTestResult(''); setError('');
    const token = platform === 'meta' ? meta?.webhook_token : google?.webhook_token;
    if (!token) { setError('Save settings first to generate a webhook token'); return; }
    try {
      const res = await api.post<{ message: string }>(`/webhooks/test/${platform}/${token}`);
      setTestResult(res.message); fetchData();
    } catch (err: any) { setError(err.message); }
  };

  const getWebhookUrl = (platform: string, token?: string) => {
    if (!token) return 'Save settings to generate webhook URL';
    return `${window.location.origin}/api/webhooks/${platform}/${token}`;
  };

  const copy = (text: string) => { navigator.clipboard.writeText(text); };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ad Integrations</h1>
          <p className="subtitle">Connect Meta & Google Ads to capture leads automatically</p>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}
      {testResult && <div className="success-msg">{testResult}</div>}

      <div className="tab-bar">
        <button className={`tab-btn ${activeTab === 'meta' ? 'active' : ''}`} onClick={() => { setActiveTab('meta'); setError(''); setTestResult(''); }}>
          Meta / Facebook
        </button>
        <button className={`tab-btn ${activeTab === 'google' ? 'active' : ''}`} onClick={() => { setActiveTab('google'); setError(''); setTestResult(''); }}>
          Google Ads
        </button>
      </div>

      {activeTab === 'meta' && (
        <div className="card">
          <div className="card-header">
            <h3>Meta (Facebook / Instagram) Lead Ads</h3>
            <div className="toggle-wrap">
              <label className="toggle">
                <input type="checkbox" checked={metaForm.enabled} onChange={e => setMetaForm(f => ({ ...f, enabled: e.target.checked }))} />
                <span className="slider" />
              </label>
              <span style={{ fontSize: 13, fontWeight: 550, color: metaForm.enabled ? 'var(--success)' : 'var(--text-muted)' }}>
                {metaForm.enabled ? 'Active' : 'Disabled'}
              </span>
            </div>
          </div>
          <div className="card-body">
            <div className="webhook-url-box">
              <label>Webhook URL</label>
              <div className="url-display">
                <code>{getWebhookUrl('meta', meta?.webhook_token)}</code>
                {meta?.webhook_token && (
                  <div className="flex gap-2">
                    <button className="btn btn-outline btn-sm" onClick={() => copy(getWebhookUrl('meta', meta.webhook_token))}>Copy</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => regenerateToken('meta')}>Regenerate</button>
                  </div>
                )}
              </div>
              <p className="hint">Paste this URL in Meta Business Suite → Leads Access → CRM → Webhook</p>
            </div>

            <div className="form-row">
              <div className="form-group"><label>Facebook Page ID</label><input value={metaForm.page_id} onChange={e => setMetaForm(f => ({ ...f, page_id: e.target.value }))} placeholder="e.g. 123456789" /></div>
              <div className="form-group"><label>App ID</label><input value={metaForm.app_id} onChange={e => setMetaForm(f => ({ ...f, app_id: e.target.value }))} placeholder="Meta App ID" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>App Secret</label><input type="password" value={metaForm.app_secret} onChange={e => setMetaForm(f => ({ ...f, app_secret: e.target.value }))} placeholder="For signature verification" /></div>
              <div className="form-group">
                <label>Verify Token</label>
                <input value={metaForm.verify_token} onChange={e => setMetaForm(f => ({ ...f, verify_token: e.target.value }))} placeholder="Any string you choose" />
                <p className="hint">Used by Meta to verify your webhook endpoint</p>
              </div>
            </div>
            <div className="form-group"><label>Page Access Token</label><input type="password" value={metaForm.access_token} onChange={e => setMetaForm(f => ({ ...f, access_token: e.target.value }))} placeholder="For fetching lead details from Graph API" /></div>

            <div className="flex gap-2" style={{ marginTop: 24 }}>
              <button className="btn btn-primary" onClick={() => save('meta')} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
              {meta?.webhook_token && <button className="btn btn-outline" onClick={() => testWebhook('meta')}>🧪 Send Test Lead</button>}
            </div>

            <div className="setup-instructions">
              <h4>Setup Instructions</h4>
              <ol>
                <li>Go to <strong>Meta Business Suite</strong> → All Tools → Instant Forms</li>
                <li>Create a Lead Ad form or select an existing one</li>
                <li>Go to <strong>Business Settings</strong> → Integrations → Leads Access</li>
                <li>Select your Page and click <strong>CRM</strong></li>
                <li>Choose <strong>Connect through Webhooks</strong></li>
                <li>Paste the <strong>Webhook URL</strong> from above</li>
                <li>Enter the <strong>Verify Token</strong> you configured</li>
                <li>Click <strong>Verify and Save</strong></li>
                <li>Subscribe to the <strong>leadgen</strong> field</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'google' && (
        <div className="card">
          <div className="card-header">
            <h3>Google Ads Lead Form Extensions</h3>
            <div className="toggle-wrap">
              <label className="toggle">
                <input type="checkbox" checked={googleForm.enabled} onChange={e => setGoogleForm(f => ({ ...f, enabled: e.target.checked }))} />
                <span className="slider" />
              </label>
              <span style={{ fontSize: 13, fontWeight: 550, color: googleForm.enabled ? 'var(--success)' : 'var(--text-muted)' }}>
                {googleForm.enabled ? 'Active' : 'Disabled'}
              </span>
            </div>
          </div>
          <div className="card-body">
            <div className="webhook-url-box">
              <label>Webhook URL</label>
              <div className="url-display">
                <code>{getWebhookUrl('google', google?.webhook_token)}</code>
                {google?.webhook_token && (
                  <div className="flex gap-2">
                    <button className="btn btn-outline btn-sm" onClick={() => copy(getWebhookUrl('google', google.webhook_token))}>Copy</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => regenerateToken('google')}>Regenerate</button>
                  </div>
                )}
              </div>
              <p className="hint">Use in Google Ads Lead Form Extension → Webhook delivery, or connect via Zapier</p>
            </div>

            <div className="form-row">
              <div className="form-group"><label>Google Ads Customer ID</label><input value={googleForm.customer_id} onChange={e => setGoogleForm(f => ({ ...f, customer_id: e.target.value }))} placeholder="e.g. 123-456-7890" /></div>
              <div className="form-group"><label>Webhook Secret Key</label><input type="password" value={googleForm.webhook_key} onChange={e => setGoogleForm(f => ({ ...f, webhook_key: e.target.value }))} placeholder="For request verification" /></div>
            </div>

            <div className="flex gap-2" style={{ marginTop: 24 }}>
              <button className="btn btn-primary" onClick={() => save('google')} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
              {google?.webhook_token && <button className="btn btn-outline" onClick={() => testWebhook('google')}>🧪 Send Test Lead</button>}
            </div>

            <div className="setup-instructions">
              <h4>Setup Instructions</h4>
              <ol>
                <li>Open <strong>Google Ads</strong> → Ads & Assets → Assets</li>
                <li>Create or edit a <strong>Lead Form Extension</strong></li>
                <li>Under <strong>Lead delivery</strong>, select Webhook</li>
                <li>Paste the <strong>Webhook URL</strong> from above</li>
                <li>Set the <strong>Key</strong> to match the Webhook Secret Key</li>
                <li>Click <strong>Test</strong> to verify, then <strong>Save</strong></li>
                <li><em>Alternative:</em> Use Zapier — connect Google Ads to Webhook POST</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <h3>Recent Webhook Activity</h3>
          <span className="text-muted text-sm">{logs.length} events</span>
        </div>
        {logs.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <div className="empty-icon">📡</div>
            <h3>No webhook activity yet</h3>
            <p>Leads from your ad campaigns will appear here</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Platform</th><th>Status</th><th>Lead ID</th><th>Error</th></tr></thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: 13 }}>{new Date(log.created_at + 'Z').toLocaleString()}</td>
                    <td><span className={`badge ${log.platform === 'meta' ? 'badge-cold' : 'badge-warm'}`}>{log.platform === 'meta' ? 'Meta' : 'Google'}</span></td>
                    <td><span className={`badge ${log.status === 'processed' ? 'badge-success' : log.status === 'error' ? 'badge-hot' : 'badge-followup'}`}>{log.status}</span></td>
                    <td>{log.lead_id || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--danger)' }}>{log.error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
