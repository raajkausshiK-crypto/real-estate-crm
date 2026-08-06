import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  payload: any;
  created_at: string;
}

export default function Integrations() {
  const [google, setGoogle] = useState<Integration | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [sheetUrl, setSheetUrl] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const fetchData = () => {
    api.get<{ google: Integration | null }>('/integrations').then(data => {
      setGoogle(data.google);
      if (data.google) {
        setSheetUrl(data.google.config.sheet_url || '');
        setEnabled(data.google.enabled);
      }
    }).catch(() => {});
    api.get<WebhookLog[]>('/integrations/webhook-logs').then(d => setLogs(Array.isArray(d) ? d : [])).catch(() => {});
  };

  useEffect(() => { fetchData(); }, []);

  const save = async () => {
    setSaving(true); setError(''); setResult('');
    try {
      await api.put('/integrations/google', { config: { sheet_url: sheetUrl.trim() }, enabled });
      fetchData();
    } catch (err: any) { setError(err.message); }
    setSaving(false);
  };

  const fetchNow = async (silent = false) => {
    if (!silent) { setFetching(true); setError(''); setResult(''); }
    try {
      const res = await api.post<{ message: string; imported: number }>('/integrations/google-sheet/fetch', { sheet_url: sheetUrl.trim() });
      if (!silent || res.imported > 0) setResult(res.message);
      fetchData();
    } catch (err: any) { if (!silent) setError(err.message); }
    if (!silent) setFetching(false);
  };

  // Auto-sync on page open when enabled (throttled to once every 10 min)
  useEffect(() => {
    if (!google?.enabled || !google?.config?.sheet_url) return;
    const last = Number(localStorage.getItem('sheetSyncAt') || 0);
    if (Date.now() - last < 10 * 60 * 1000) return;
    localStorage.setItem('sheetSyncAt', String(Date.now()));
    fetchNow(true);
  }, [google?.enabled, google?.config?.sheet_url]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Google Sheets Lead Import</h1>
          <p className="subtitle">Auto-fetch leads from a Google Sheet straight into your CRM</p>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}
      {result && <div className="success-msg">{result}</div>}

      <div className="card">
        <div className="card-header">
          <h3><span style={{ fontSize: 18, marginRight: 8 }}>📗</span>Connected Google Sheet</h3>
          <div className="toggle-wrap">
            <label className="toggle">
              <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
              <span className="slider" />
            </label>
            <span style={{ fontSize: 13, fontWeight: 600, color: enabled ? 'var(--success)' : 'var(--text-muted)' }}>
              {enabled ? 'Auto-sync ON' : 'Auto-sync OFF'}
            </span>
          </div>
        </div>
        <div className="card-body">
          <div className="form-group">
            <label>Google Sheet URL</label>
            <input
              value={sheetUrl}
              onChange={e => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit"
            />
            <p className="hint">Paste the link to your sheet. When auto-sync is ON, new rows are pulled in automatically once a day and each time you open this page. Use Fetch Now anytime for an instant pull.</p>
          </div>

          <div className="flex gap-2" style={{ marginTop: 20 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button className="btn btn-outline" onClick={fetchNow} disabled={fetching || !sheetUrl.trim()}>
              {fetching ? 'Fetching…' : '⬇ Fetch Now'}
            </button>
            {google?.config?.sheet_url && (
              <a className="btn btn-ghost" href={google.config.sheet_url} target="_blank" rel="noreferrer">Open Sheet ↗</a>
            )}
          </div>

          <div className="setup-instructions">
            <h4>How to connect your sheet</h4>
            <ol>
              <li>Open your Google Sheet of leads</li>
              <li>Click <strong>Share</strong> → General access → <strong>Anyone with the link → Viewer</strong></li>
              <li>Copy the link and paste it above, then click <strong>Save</strong></li>
              <li>Turn on <strong>Auto-sync</strong>, or click <strong>Fetch Now</strong> to import immediately</li>
            </ol>
            <h4 style={{ marginTop: 18 }}>Column headers we recognise</h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.9 }}>
              <strong>Name</strong> (full name / lead name) · <strong>Email</strong> · <strong>Phone</strong> (phone / mobile / whatsapp) ·
              <strong> City</strong> · <strong>State</strong> · <strong>Budget</strong> · <strong>Source</strong> · <strong>Location / Looking for</strong>.
              Any other columns are saved into the lead's notes. Duplicates (same email or phone) are skipped automatically.
            </p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <h3>Recent Import Activity</h3>
          <span className="text-muted text-sm">{logs.length} events</span>
        </div>
        {logs.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <div className="empty-icon">📥</div>
            <h3>No imports yet</h3>
            <p>Save your sheet URL and click Fetch Now — imported leads will appear in <Link to="/leads">Leads</Link>.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Status</th><th>Result</th></tr></thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: 13 }}>{new Date(log.created_at + 'Z').toLocaleString()}</td>
                    <td><span className={`badge ${log.status === 'processed' ? 'badge-success' : log.status === 'error' ? 'badge-hot' : 'badge-followup'}`}>{log.status}</span></td>
                    <td style={{ fontSize: 13 }}>
                      {log.error
                        ? <span style={{ color: 'var(--danger)' }}>{log.error}</span>
                        : log.payload && typeof log.payload === 'object' && 'imported' in log.payload
                          ? `Imported ${log.payload.imported}, skipped ${log.payload.skipped}`
                          : '—'}
                    </td>
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
