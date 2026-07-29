import { useState, useEffect, useRef, useCallback } from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import { api } from '../utils/api';
import { CallLog, Contact } from '../types';

interface TwilioSettings {
  account_sid: string;
  auth_token: string;
  twiml_app_sid: string;
  api_key: string;
  api_secret: string;
  twilio_number: string;
  enabled: boolean;
}

export default function Calls() {
  const [activeTab, setActiveTab] = useState<'logs' | 'dial' | 'settings'>('dial');
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [total, setTotal] = useState(0);
  const [settings, setSettings] = useState<TwilioSettings | null>(null);
  const [form, setForm] = useState({ account_sid: '', auth_token: '', twilio_number: '', twiml_app_sid: '', api_key: '', api_secret: '', enabled: true });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [dialNumber, setDialNumber] = useState('');
  const [dialContact, setDialContact] = useState<number | ''>('');
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Call state
  const [deviceReady, setDeviceReady] = useState(false);
  const [callState, setCallState] = useState<'idle' | 'connecting' | 'ringing' | 'connected' | 'ended'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [activeCallInfo, setActiveCallInfo] = useState<{ number: string; contactName?: string; contactId?: number; leadId?: number } | null>(null);
  const [currentLogId, setCurrentLogId] = useState<number | null>(null);

  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = () => {
    api.get<{ logs: CallLog[]; total: number }>('/calls/logs').then(d => { setLogs(d.logs); setTotal(d.total); }).catch(() => {});
  };

  const fetchSettings = () => {
    api.get<{ settings: TwilioSettings | null }>('/calls/settings').then(d => {
      setSettings(d.settings);
      if (d.settings) setForm({
        account_sid: d.settings.account_sid, auth_token: d.settings.auth_token,
        twilio_number: d.settings.twilio_number, twiml_app_sid: d.settings.twiml_app_sid || '',
        api_key: d.settings.api_key || '', api_secret: d.settings.api_secret || '',
        enabled: d.settings.enabled,
      });
    }).catch(() => {});
  };

  const fetchContacts = () => {
    api.get<{ contacts: Contact[] }>('/contacts').then(d => setContacts(d.contacts.filter(c => c.phone))).catch(() => {});
  };

  useEffect(() => { fetchLogs(); fetchSettings(); fetchContacts(); }, []);

  // Initialize Twilio Device
  const initDevice = useCallback(async () => {
    try {
      const { token } = await api.get<{ token: string }>('/calls/token');
      if (deviceRef.current) {
        deviceRef.current.destroy();
      }
      const device = new Device(token, { edge: 'ashburn', closeProtection: true });

      device.on('registered', () => setDeviceReady(true));
      device.on('error', (err) => {
        console.error('Twilio Device error:', err);
        setError(`Device error: ${err.message}`);
      });
      device.on('tokenWillExpire', async () => {
        const { token: newToken } = await api.get<{ token: string }>('/calls/token');
        device.updateToken(newToken);
      });

      await device.register();
      deviceRef.current = device;
    } catch (err: any) {
      console.error('Failed to init Twilio device:', err);
    }
  }, []);

  useEffect(() => {
    if (settings?.enabled && settings?.api_key && settings?.twiml_app_sid) {
      initDevice();
    }
    return () => {
      deviceRef.current?.destroy();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [settings?.enabled, settings?.api_key, settings?.twiml_app_sid, initDevice]);

  const startTimer = () => {
    setCallDuration(0);
    timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const makeCall = async (toNumber: string, contactId?: number, contactName?: string, leadId?: number) => {
    setError(''); setMsg('');

    if (!deviceRef.current) {
      setError('Twilio device not ready. Check your settings (API Key, API Secret, TwiML App SID required).');
      return;
    }

    const number = toNumber.startsWith('+') ? toNumber : `+91${toNumber.replace(/\D/g, '')}`;

    try {
      // Log call
      const logRes = await api.post<{ call_log_id: number }>('/calls/initiate', { to_number: number, contact_id: contactId, lead_id: leadId });
      setCurrentLogId(logRes.call_log_id);

      setActiveCallInfo({ number, contactName, contactId, leadId });
      setCallState('connecting');
      setActiveTab('dial');

      const call = await deviceRef.current.connect({
        params: { To: number, callerId: settings!.twilio_number },
      });

      activeCallRef.current = call;

      call.on('ringing', () => setCallState('ringing'));
      call.on('accept', () => {
        setCallState('connected');
        startTimer();
      });
      call.on('disconnect', () => endCallCleanup('completed'));
      call.on('cancel', () => endCallCleanup('cancelled'));
      call.on('error', (err) => {
        setError(`Call error: ${err.message}`);
        endCallCleanup('failed');
      });

    } catch (err: any) {
      setError(err.message || 'Failed to make call');
      setCallState('idle');
    }
  };

  const endCallCleanup = (status: string) => {
    stopTimer();
    setCallState('ended');
    setIsMuted(false);
    activeCallRef.current = null;

    if (currentLogId) {
      api.put(`/calls/log/${currentLogId}`, { status, duration: callDuration }).catch(() => {});
    }

    setTimeout(() => {
      setCallState('idle');
      setActiveCallInfo(null);
      setCallDuration(0);
      setCurrentLogId(null);
      fetchLogs();
    }, 2000);
  };

  const hangUp = () => {
    activeCallRef.current?.disconnect();
    endCallCleanup('completed');
  };

  const toggleMute = () => {
    if (activeCallRef.current) {
      const newMuted = !isMuted;
      activeCallRef.current.mute(newMuted);
      setIsMuted(newMuted);
    }
  };

  const sendDtmf = (digit: string) => {
    activeCallRef.current?.sendDigits(digit);
    if (callState === 'idle') setDialNumber(n => n + digit);
  };

  const handleDial = () => {
    const contact = contacts.find(c => c.id === dialContact);
    const number = dialNumber || contact?.phone;
    if (!number) { setError('Enter a number or select a contact'); return; }
    makeCall(number, contact?.id, contact?.name);
  };

  const handleContactSelect = (id: number) => {
    setDialContact(id);
    const c = contacts.find(c => c.id === id);
    if (c?.phone) setDialNumber(c.phone);
  };

  const saveSettings = async () => {
    setSaving(true); setError(''); setMsg('');
    try {
      await api.put('/calls/settings', form);
      setMsg('Twilio settings saved! Reconnecting...');
      fetchSettings();
    } catch (err: any) { setError(err.message); }
    setSaving(false);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'completed': return 'badge-success';
      case 'failed': case 'busy': case 'no-answer': case 'cancelled': return 'badge-hot';
      case 'ringing': case 'in-progress': case 'connected': return 'badge-warm';
      default: return 'badge-followup';
    }
  };

  const fmtDuration = (s: number) => {
    if (!s) return '—';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const configured = settings?.enabled;
  const isInCall = callState !== 'idle' && callState !== 'ended';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Calls</h1>
          <p className="subtitle">
            {total} calls logged
            {configured ? (deviceReady ? ' · Twilio ready' : ' · Connecting...') : ' · Setup required'}
          </p>
        </div>
        {configured && !isInCall && (
          <button className="btn btn-primary" onClick={() => setActiveTab('dial')}>📞 New Call</button>
        )}
      </div>

      {msg && <div className="success-msg">{msg}</div>}
      {error && <div className="error-msg">{error}</div>}

      {/* Active Call Overlay */}
      {isInCall && (
        <div className="call-overlay">
          <div className="call-panel">
            <div className="call-status-indicator">
              <div className={`call-pulse ${callState === 'connected' ? 'active' : ''}`} />
              <span className="call-state-text">
                {callState === 'connecting' && 'Connecting...'}
                {callState === 'ringing' && 'Ringing...'}
                {callState === 'connected' && 'Connected'}
                {callState === 'ended' && 'Call Ended'}
              </span>
            </div>

            <div className="call-contact-info">
              <div className="call-avatar">{activeCallInfo?.contactName?.[0] || '📞'}</div>
              <h2>{activeCallInfo?.contactName || 'Unknown'}</h2>
              <p className="call-number">{activeCallInfo?.number}</p>
              {callState === 'connected' && <p className="call-timer">{fmtDuration(callDuration)}</p>}
            </div>

            {/* In-call Dial Pad */}
            {callState === 'connected' && (
              <div className="call-dialpad-mini">
                {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => (
                  <button key={d} className="dial-btn-mini" onClick={() => sendDtmf(d)}>{d}</button>
                ))}
              </div>
            )}

            <div className="call-controls">
              {callState === 'connected' && (
                <button className={`call-ctrl-btn ${isMuted ? 'active' : ''}`} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                  {isMuted ? '🔇' : '🎤'}
                  <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                </button>
              )}
              <button className="call-ctrl-btn hangup" onClick={hangUp} title="End Call">
                📵
                <span>End</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="tab-bar">
        <button className={`tab-btn ${activeTab === 'dial' ? 'active' : ''}`} onClick={() => { setActiveTab('dial'); setMsg(''); setError(''); }}>
          Quick Dial
        </button>
        <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => { setActiveTab('logs'); setMsg(''); setError(''); fetchLogs(); }}>
          Call Logs
        </button>
        <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => { setActiveTab('settings'); setMsg(''); setError(''); }}>
          Twilio Settings
        </button>
      </div>

      {activeTab === 'dial' && (
        <div className="card">
          <div className="card-header"><h3>Quick Dial</h3></div>
          <div className="card-body">
            {!configured && (
              <div className="error-msg" style={{ marginBottom: 16 }}>Configure Twilio settings first before making calls</div>
            )}
            {configured && !deviceReady && (
              <div className="error-msg" style={{ marginBottom: 16 }}>Twilio device not ready — make sure API Key, API Secret, and TwiML App SID are configured</div>
            )}
            <div className="form-group">
              <label>Select Contact</label>
              <select value={dialContact} onChange={e => handleContactSelect(Number(e.target.value))}>
                <option value="">— Pick a contact —</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Or enter number directly</label>
              <input
                value={dialNumber}
                onChange={e => setDialNumber(e.target.value)}
                placeholder="+91 98765 43210"
                style={{ fontFamily: 'monospace', fontSize: 18, letterSpacing: 1 }}
              />
              <p className="hint">Indian numbers auto-prefixed with +91 if no country code</p>
            </div>
            <div className="dial-pad">
              {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => (
                <button key={d} className="dial-btn" onClick={() => sendDtmf(d)}>{d}</button>
              ))}
            </div>
            <div className="flex gap-2" style={{ marginTop: 20 }}>
              <button className="btn btn-primary btn-call" onClick={handleDial} disabled={!configured || !deviceReady || isInCall}>
                📞 Call Now
              </button>
              {dialNumber && (
                <button className="btn btn-outline" onClick={() => { setDialNumber(''); setDialContact(''); }}>Clear</button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="card">
          <div className="card-header">
            <h3>Recent Calls</h3>
            <span className="text-muted text-sm">{total} total</span>
          </div>
          {logs.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <div className="empty-icon">📞</div>
              <h3>No calls yet</h3>
              <p>{configured ? 'Make your first call using Quick Dial or from a contact' : 'Configure Twilio settings to start calling'}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Contact</th><th>Number</th><th>Status</th><th>Duration</th><th>Time</th></tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td><strong>{log.contact_name || 'Unknown'}</strong></td>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{log.to_number}</td>
                      <td><span className={`badge ${statusColor(log.status)}`}>{log.status}</span></td>
                      <td>{fmtDuration(log.duration)}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{new Date(log.created_at + 'Z').toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="card">
          <div className="card-header">
            <h3>Twilio Configuration</h3>
            <div className="toggle-wrap">
              <label className="toggle">
                <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
                <span className="slider" />
              </label>
              <span style={{ fontSize: 13, fontWeight: 550, color: form.enabled ? 'var(--success)' : 'var(--text-muted)' }}>
                {form.enabled ? 'Active' : 'Disabled'}
              </span>
            </div>
          </div>
          <div className="card-body">
            <h4 style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Account Credentials</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Account SID</label>
                <input value={form.account_sid} onChange={e => setForm(f => ({ ...f, account_sid: e.target.value }))} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
              </div>
              <div className="form-group">
                <label>Auth Token</label>
                <input type="password" value={form.auth_token} onChange={e => setForm(f => ({ ...f, auth_token: e.target.value }))} placeholder="Your Twilio auth token" />
              </div>
            </div>

            <h4 style={{ margin: '24px 0 12px', color: 'var(--text-muted)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Voice SDK (Browser Calling)</h4>
            <div className="form-row">
              <div className="form-group">
                <label>API Key SID</label>
                <input value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                <p className="hint">Create at Twilio Console → API Keys</p>
              </div>
              <div className="form-group">
                <label>API Secret</label>
                <input type="password" value={form.api_secret} onChange={e => setForm(f => ({ ...f, api_secret: e.target.value }))} placeholder="Your API secret" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>TwiML App SID</label>
                <input value={form.twiml_app_sid} onChange={e => setForm(f => ({ ...f, twiml_app_sid: e.target.value }))} placeholder="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                <p className="hint">Create a TwiML App in Twilio Console and set Voice URL to your server's /api/calls/voice endpoint</p>
              </div>
              <div className="form-group">
                <label>Twilio Phone Number</label>
                <input value={form.twilio_number} onChange={e => setForm(f => ({ ...f, twilio_number: e.target.value }))} placeholder="+1234567890" />
                <p className="hint">Your purchased Twilio number with Voice capability</p>
              </div>
            </div>

            <button className="btn btn-primary" onClick={saveSettings} disabled={saving} style={{ marginTop: 20 }}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>

            <div className="setup-instructions">
              <h4>Setup Instructions for Browser Calling</h4>
              <ol>
                <li>Sign up at <strong>twilio.com</strong> and get your <strong>Account SID</strong> and <strong>Auth Token</strong></li>
                <li>Buy a phone number with <strong>Voice</strong> capability</li>
                <li>Go to <strong>Twilio Console → Account → API Keys</strong> and create a new API Key — save the <strong>SID</strong> and <strong>Secret</strong></li>
                <li>Go to <strong>Twilio Console → Voice → TwiML Apps</strong> and create a new TwiML App</li>
                <li>Set the TwiML App's <strong>Voice Request URL</strong> to: <code>{window.location.origin}/api/calls/voice</code>
                  <br /><span className="hint">(Use ngrok for local dev: <code>ngrok http 5050</code> then use the ngrok URL)</span>
                </li>
                <li>Copy the <strong>TwiML App SID</strong> (starts with AP...)</li>
                <li>Enter all values above and click <strong>Save Settings</strong></li>
                <li>The browser will connect to Twilio and you can make calls with <strong>live voice</strong></li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CallButton({ phone, contactId, contactName, leadId, size = 'sm' }: { phone: string; contactId?: number; contactName?: string; leadId?: number; size?: 'sm' | 'md' }) {
  const [calling, setCalling] = useState(false);

  const handleCall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!phone) return;
    setCalling(true);
    try {
      await api.post('/calls/initiate', { to_number: phone, contact_id: contactId, lead_id: leadId });
    } catch { /* silent */ }
    setTimeout(() => setCalling(false), 2000);
  };

  if (!phone) return null;

  return (
    <button
      className={`btn btn-call-inline btn-${size}`}
      onClick={handleCall}
      disabled={calling}
      title={`Call ${phone}`}
    >
      {calling ? '📲' : '📞'}
    </button>
  );
}
