import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { CallButton } from './Calls';

interface FollowupItem {
  lead_id: number;
  contact_id: number;
  contact_name: string;
  contact_phone: string | null;
  status: string;
  type: string;
  date: string;
  time: string | null;
  assigned_name: string | null;
  assigned_color: string | null;
  bucket: 'overdue' | 'today' | 'week' | 'upcoming';
  diff: number;
}

const STATUS_CLASSES: Record<string, string> = {
  Hot: 'badge-hot', Warm: 'badge-warm', Cold: 'badge-cold', Closed: 'badge-closed', 'Follow-up Needed': 'badge-followup',
};
const TYPE_ICON: Record<string, string> = { 'Follow-up': '🔔', 'Call': '📞', 'Site Visit': '🏠', 'Final Meeting': '🤝' };

const BUCKETS: { key: FollowupItem['bucket']; label: string; accent: string }[] = [
  { key: 'overdue', label: 'Overdue', accent: '#dc2626' },
  { key: 'today', label: 'Today', accent: '#d97706' },
  { key: 'week', label: 'This Week', accent: '#2563eb' },
  { key: 'upcoming', label: 'Upcoming', accent: '#64748b' },
];

export default function Followups() {
  const [items, setItems] = useState<FollowupItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = () => {
    api.get<{ items: FollowupItem[] }>('/followups').then(d => { setItems(d?.items || []); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(() => { fetchItems(); }, []);

  const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
  const relative = (it: FollowupItem) => {
    if (it.diff < 0) return `${Math.abs(it.diff)} day${Math.abs(it.diff) > 1 ? 's' : ''} ago`;
    if (it.diff === 0) return 'Today';
    if (it.diff === 1) return 'Tomorrow';
    return `in ${it.diff} days`;
  };

  const grouped = BUCKETS.map(b => ({ ...b, list: items.filter(i => i.bucket === b.key) }));
  const initials = (n: string) => (n || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Follow-ups</h1>
          <p className="subtitle">{items.length} scheduled task{items.length !== 1 ? 's' : ''} across your leads</p>
        </div>
        <Link to="/leads" className="btn btn-primary">Go to Leads</Link>
      </div>

      {loading ? (
        <div className="card"><div className="empty-state"><div className="empty-icon">⏳</div><h3>Loading follow-ups…</h3></div></div>
      ) : items.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <h3>No follow-ups scheduled</h3>
            <p>Add follow-up dates, call dates, or site visits to your leads and they'll show up here automatically.</p>
          </div>
        </div>
      ) : (
        <div className="fu-columns">
          {grouped.map(col => (
            <div key={col.key} className="fu-column">
              <div className="fu-column-header" style={{ borderColor: col.accent }}>
                <span style={{ color: col.accent }}>{col.label}</span>
                <span className="fu-count" style={{ background: `${col.accent}18`, color: col.accent }}>{col.list.length}</span>
              </div>
              {col.list.length === 0 ? (
                <div className="fu-empty">Nothing here</div>
              ) : col.list.map((it, idx) => (
                <div key={it.lead_id + it.type + idx} className="fu-card" style={{ borderLeftColor: col.accent }}>
                  <div className="fu-card-top">
                    <span className="fu-type">{TYPE_ICON[it.type] || '📌'} {it.type}</span>
                    <span className={`badge ${STATUS_CLASSES[it.status] || 'badge-active'}`}>{it.status}</span>
                  </div>
                  <div className="fu-card-name">{it.contact_name || 'Unknown contact'}</div>
                  <div className="fu-card-meta">
                    <span className="fu-when" style={{ color: col.accent }}>{fmt(it.date)}{it.time ? ` · ${it.time}` : ''}</span>
                    <span className="fu-rel">{relative(it)}</span>
                  </div>
                  <div className="fu-card-actions">
                    {it.assigned_name && (
                      <span className="fu-agent"><span className="emp-avatar-sm" style={{ background: it.assigned_color || '#64748b' }}>{initials(it.assigned_name)}</span>{it.assigned_name}</span>
                    )}
                    <div style={{ flex: 1 }} />
                    <CallButton phone={it.contact_phone || ''} contactId={it.contact_id} leadId={it.lead_id} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
