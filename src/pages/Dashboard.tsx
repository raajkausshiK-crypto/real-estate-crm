import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

interface Analytics {
  totals: { leads: number; contacts: number; properties: number; employees: number; hot: number; closed: number };
  conversionRate: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  byPurpose: Record<string, number>;
  byPattern: Record<string, number>;
  agentLeaderboard: { name: string; color: string; total: number; closed: number }[];
  trend: { month: string; count: number }[];
  followups: { overdue: number; today: number; week: number };
}

const STATUS_COLORS: Record<string, string> = {
  Hot: '#dc2626', Warm: '#d97706', Cold: '#2563eb', 'Follow-up Needed': '#7c3aed', Closed: '#059669',
};

export default function Dashboard() {
  const { user } = useAuth();
  const [a, setA] = useState<Analytics | null>(null);

  useEffect(() => {
    api.get<Analytics>('/analytics').then(setA).catch(() => {});
  }, []);

  const totals = a?.totals || { leads: 0, contacts: 0, properties: 0, employees: 0, hot: 0, closed: 0 };
  const fu = a?.followups || { overdue: 0, today: 0, week: 0 };

  const kpis = [
    { icon: '🎯', label: 'Total Leads', value: totals.leads, color: 'var(--primary)' },
    { icon: '🔥', label: 'Hot Leads', value: totals.hot, color: '#dc2626' },
    { icon: '✅', label: 'Conversion Rate', value: `${a?.conversionRate ?? 0}%`, color: '#059669' },
    { icon: '🏆', label: 'Deals Closed', value: totals.closed, color: '#7c3aed' },
    { icon: '👥', label: 'Contacts', value: totals.contacts, color: '#0ea5e9' },
    { icon: '🏠', label: 'Properties', value: totals.properties, color: '#d97706' },
  ];

  const statusEntries = Object.entries(a?.byStatus || {});
  const statusMax = Math.max(1, ...statusEntries.map(([, v]) => v));
  const sourceEntries = Object.entries(a?.bySource || {}).sort((x, y) => y[1] - x[1]).slice(0, 8);
  const sourceMax = Math.max(1, ...sourceEntries.map(([, v]) => v));
  const trend = a?.trend || [];
  const trendMax = Math.max(1, ...trend.map(t => t.count));
  const agents = a?.agentLeaderboard || [];
  const agentMax = Math.max(1, ...agents.map(x => x.total));

  const purpose = a?.byPurpose || {};
  const selfUse = purpose['Self Use'] || 0;
  const investor = purpose['Investor'] || 0;
  const purposeTotal = selfUse + investor || 1;
  const investorPct = Math.round((investor / purposeTotal) * 100);

  const initials = (n: string) => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Welcome back, {user?.name?.split(' ')[0]}</h1>
          <p className="subtitle">Your real estate business at a glance</p>
        </div>
        <Link to="/leads" className="btn btn-primary">+ New Lead</Link>
      </div>

      {/* Follow-up alert banner */}
      {(fu.overdue > 0 || fu.today > 0) && (
        <Link to="/followups" className="fu-banner">
          <div className="fu-banner-icon">🔔</div>
          <div className="fu-banner-text">
            <strong>{fu.overdue > 0 ? `${fu.overdue} overdue` : ''}{fu.overdue > 0 && fu.today > 0 ? ' · ' : ''}{fu.today > 0 ? `${fu.today} due today` : ''}</strong>
            <span>You have follow-ups that need attention</span>
          </div>
          <span className="fu-banner-cta">View Follow-ups →</span>
        </Link>
      )}

      {/* KPI row */}
      <div className="stats-grid">
        {kpis.map(k => (
          <div key={k.label} className="stat-card">
            <div className="stat-icon" style={{ background: `${k.color}14` }}>{k.icon}</div>
            <div className="stat-value" style={{ color: k.color }}>{k.value}</div>
            <div className="stat-label">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="analytics-grid">
        <div className="card chart-card">
          <div className="card-header"><h3>Lead Status Funnel</h3></div>
          <div className="card-body">
            {statusEntries.every(([, v]) => v === 0) ? (
              <div className="chart-empty">No lead data yet</div>
            ) : statusEntries.map(([status, count]) => (
              <div key={status} className="hbar-row">
                <div className="hbar-label">{status}</div>
                <div className="hbar-track">
                  <div className="hbar-fill" style={{ width: `${(count / statusMax) * 100}%`, background: STATUS_COLORS[status] || 'var(--primary)' }} />
                </div>
                <div className="hbar-value">{count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card chart-card">
          <div className="card-header"><h3>Buyer Purpose</h3></div>
          <div className="card-body donut-body">
            <div className="donut" style={{ background: `conic-gradient(#2563eb 0% ${100 - investorPct}%, #d97706 ${100 - investorPct}% 100%)` }}>
              <div className="donut-hole">
                <span className="donut-total">{selfUse + investor}</span>
                <span className="donut-sub">leads</span>
              </div>
            </div>
            <div className="donut-legend">
              <div className="legend-item"><span className="legend-dot" style={{ background: '#2563eb' }} /> Self Use <strong>{selfUse}</strong></div>
              <div className="legend-item"><span className="legend-dot" style={{ background: '#d97706' }} /> Investor <strong>{investor}</strong></div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="analytics-grid">
        <div className="card chart-card">
          <div className="card-header"><h3>Leads by Source</h3></div>
          <div className="card-body">
            {sourceEntries.length === 0 ? (
              <div className="chart-empty">No source data yet</div>
            ) : sourceEntries.map(([source, count]) => (
              <div key={source} className="hbar-row">
                <div className="hbar-label">{source}</div>
                <div className="hbar-track">
                  <div className="hbar-fill" style={{ width: `${(count / sourceMax) * 100}%` }} />
                </div>
                <div className="hbar-value">{count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card chart-card">
          <div className="card-header"><h3>New Leads — Last 6 Months</h3></div>
          <div className="card-body">
            <div className="trend-chart">
              {trend.map(t => (
                <div key={t.month} className="trend-col">
                  <div className="trend-bar-wrap">
                    <div className="trend-value">{t.count || ''}</div>
                    <div className="trend-bar" style={{ height: `${Math.max(4, (t.count / trendMax) * 100)}%` }} />
                  </div>
                  <div className="trend-month">{t.month}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Agent leaderboard */}
      <div className="card chart-card">
        <div className="card-header">
          <h3>Agent Leaderboard</h3>
          <Link to="/employees" className="btn btn-ghost btn-sm">Manage team →</Link>
        </div>
        <div className="card-body">
          {agents.length === 0 ? (
            <div className="chart-empty">No leads assigned to agents yet</div>
          ) : agents.map((ag, i) => (
            <div key={ag.name + i} className="agent-row">
              <div className="agent-rank">{i + 1}</div>
              <div className="emp-avatar-sm" style={{ background: ag.color }}>{initials(ag.name)}</div>
              <div className="agent-name">{ag.name}</div>
              <div className="hbar-track" style={{ flex: 1 }}>
                <div className="hbar-fill" style={{ width: `${(ag.total / agentMax) * 100}%` }} />
              </div>
              <div className="agent-stats">
                <span>{ag.total} leads</span>
                <span className="agent-closed">{ag.closed} closed</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
