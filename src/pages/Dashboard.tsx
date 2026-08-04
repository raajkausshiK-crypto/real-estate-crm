import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Lead } from '../types';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ leads: 0, contacts: 0, properties: 0, hot: 0 });
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<{ total: number }>('/leads?limit=1'),
      api.get<{ total: number }>('/contacts?limit=1'),
      api.get<{ total: number }>('/properties?limit=1'),
      api.get<{ total: number }>('/leads?status=Hot&limit=1'),
      api.get<{ leads: Lead[] }>('/leads?limit=5'),
    ]).then(([l, c, p, h, recent]) => {
      setStats({ leads: l?.total || 0, contacts: c?.total || 0, properties: p?.total || 0, hot: h?.total || 0 });
      setRecentLeads(recent?.leads || []);
    }).catch(() => {});
  }, []);

  const STATUS_CLASSES: Record<string, string> = {
    Hot: 'badge-hot', Warm: 'badge-warm', Cold: 'badge-cold',
    Closed: 'badge-closed', 'Follow-up Needed': 'badge-followup',
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Welcome back, {user?.name?.split(' ')[0]}</h1>
          <p className="subtitle">Here's what's happening with your leads today</p>
        </div>
        <Link to="/leads" className="btn btn-primary">+ New Lead</Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">🎯</div>
          <div className="stat-value">{stats.leads}</div>
          <div className="stat-label">Total Leads</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🔥</div>
          <div className="stat-value" style={{ color: 'var(--hot)' }}>{stats.hot}</div>
          <div className="stat-label">Hot Leads</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-value">{stats.contacts}</div>
          <div className="stat-label">Contacts</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏠</div>
          <div className="stat-value">{stats.properties}</div>
          <div className="stat-label">Properties</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Recent Leads</h3>
          <Link to="/leads" className="btn btn-ghost btn-sm">View all →</Link>
        </div>
        {recentLeads.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎯</div>
            <h3>No leads yet</h3>
            <p>Start by adding your first lead or import from CSV</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Status</th><th>Source</th></tr>
              </thead>
              <tbody>
                {recentLeads.map(l => (
                  <tr key={l.id}>
                    <td><strong>{l.contact_name}</strong></td>
                    <td>{l.contact_email || '—'}</td>
                    <td><span className={`badge ${STATUS_CLASSES[l.status]}`}>{l.status}</span></td>
                    <td>{l.source || '—'}</td>
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
