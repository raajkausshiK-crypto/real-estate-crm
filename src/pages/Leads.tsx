import { useState, useEffect, FormEvent } from 'react';
import { api } from '../utils/api';
import { Lead, Contact, Employee } from '../types';
import Modal from '../components/Modal';
import { CallButton } from './Calls';
import { useAuth } from '../context/AuthContext';

const STATUS_OPTIONS = ['Hot', 'Warm', 'Cold', 'Follow-up Needed', 'Closed'] as const;
const STATUS_CLASSES: Record<string, string> = {
  Hot: 'badge-hot', Warm: 'badge-warm', Cold: 'badge-cold',
  Closed: 'badge-closed', 'Follow-up Needed': 'badge-followup',
};
const SOURCES = ['Website', 'Referral', 'Walk-in', 'Cold Calling', 'Meta Ads', 'Google Ads', 'MagicBricks', '99acres', 'Housing.com', 'JustDial', 'Other'];
const PURPOSES = ['Self Use', 'Investor'];
const VISIT_PLANS = ['None', 'To Be Done', 'Visit Done'];
const PATTERNS = ['Call', 'Visit', 'Closure'];

const EMPTY_FORM = {
  contact_id: '', status: 'Warm', source: '', notes: '', assigned_to: '',
  budget: '', project_lead_for: '', suggested_projects: '', location_looking: '', remarks: '',
  next_call_date: '', next_call_time: '', site_visit_plan: 'None', site_visit_date: '',
  lead_assign_date: '', assigned_by: '', buyer_purpose: 'Self Use',
  final_meeting_date: '', final_meeting_notes: '', pattern: 'Call',
  followup_date: '', followup_time: '',
};

export default function Leads() {
  const { user } = useAuth();
  const isEmployee = user?.role === 'employee';
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [viewLead, setViewLead] = useState<Lead | null>(null);

  const fetchLeads = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    api.get<{ leads: Lead[]; total: number }>(`/leads?${params}`).then(d => {
      setLeads(d?.leads || []);
      setTotal(d?.total || 0);
    }).catch(() => {});
  };

  useEffect(() => { fetchLeads(); }, [search, statusFilter]);
  useEffect(() => { api.get<{ employees: Employee[] }>('/employees').then(d => setEmployees(d?.employees || [])).catch(() => {}); }, []);

  const openAdd = () => {
    api.get<{ contacts: Contact[] }>('/contacts?limit=200').then(d => setContacts(d?.contacts || [])).catch(() => {});
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setShowAdd(true);
  };

  const openEdit = (lead: Lead) => {
    api.get<{ contacts: Contact[] }>('/contacts?limit=200').then(d => setContacts(d?.contacts || [])).catch(() => {});
    setForm({
      contact_id: String(lead.contact_id), status: lead.status, source: lead.source || '',
      notes: lead.notes || '', assigned_to: lead.assigned_to ? String(lead.assigned_to) : '',
      budget: lead.budget || '', project_lead_for: lead.project_lead_for || '',
      suggested_projects: lead.suggested_projects || '', location_looking: lead.location_looking || '',
      remarks: lead.remarks || '', next_call_date: lead.next_call_date || '', next_call_time: lead.next_call_time || '',
      site_visit_plan: lead.site_visit_plan || 'None', site_visit_date: lead.site_visit_date || '',
      lead_assign_date: lead.lead_assign_date || '', assigned_by: lead.assigned_by || '',
      buyer_purpose: lead.buyer_purpose || 'Self Use', final_meeting_date: lead.final_meeting_date || '',
      final_meeting_notes: lead.final_meeting_notes || '', pattern: lead.pattern || 'Call',
      followup_date: lead.followup_date || '', followup_time: lead.followup_time || '',
    });
    setEditingId(lead.id);
    setShowAdd(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { ...form, contact_id: Number(form.contact_id), assigned_to: form.assigned_to ? Number(form.assigned_to) : null };
    if (editingId) {
      await api.put(`/leads/${editingId}`, body);
    } else {
      await api.post('/leads', body);
    }
    setShowAdd(false);
    fetchLeads();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this lead?')) return;
    await api.delete(`/leads/${id}`);
    fetchLeads();
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{isEmployee ? 'My Leads' : 'Leads'}</h1>
          <p className="subtitle">{isEmployee ? `${total} leads assigned to you` : `${total} total leads in your pipeline`}</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Lead</button>
      </div>

      <div className="search-bar">
        <input placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="card">
        {leads.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎯</div>
            <h3>No leads found</h3>
            <p>{search || statusFilter ? 'Try adjusting your filters' : 'Add your first lead to get started'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Phone</th><th>Budget</th><th>Source</th><th>Status</th>
                  <th>Assigned To</th><th>Purpose</th><th>Pattern</th><th>Follow-up</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map(l => (
                  <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => setViewLead(l)}>
                    <td><strong>{l.contact_name}</strong></td>
                    <td>{l.contact_phone || '—'}</td>
                    <td>{l.budget || '—'}</td>
                    <td><span className="badge badge-active">{l.source || '—'}</span></td>
                    <td className="status-pills" onClick={e => e.stopPropagation()}>
                      {STATUS_OPTIONS.map(s => (
                        <span
                          key={s}
                          className={`badge ${STATUS_CLASSES[s]} ${l.status !== s ? 'badge-muted' : ''}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => l.status !== s && api.put(`/leads/${l.id}`, { status: s }).then(fetchLeads)}
                        >{s}</span>
                      ))}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      {isEmployee ? (
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{l.assigned_name || 'Unassigned'}</span>
                      ) : (
                        <select
                          className="assign-select"
                          value={l.assigned_to || ''}
                          onChange={e => api.put(`/leads/${l.id}`, { assigned_to: e.target.value ? Number(e.target.value) : null }).then(fetchLeads)}
                        >
                          <option value="">Unassigned</option>
                          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td><span className={`badge ${l.buyer_purpose === 'Investor' ? 'badge-warm' : 'badge-cold'}`}>{l.buyer_purpose || 'Self Use'}</span></td>
                    <td><span className={`badge ${l.pattern === 'Closure' ? 'badge-success' : l.pattern === 'Visit' ? 'badge-followup' : 'badge-active'}`}>{l.pattern || 'Call'}</span></td>
                    <td style={{ fontSize: 12 }}>
                      {l.followup_date ? <>{fmt(l.followup_date)} {l.followup_time || ''}</> : '—'}
                    </td>
                    <td className="actions" onClick={e => e.stopPropagation()}>
                      <CallButton phone={l.contact_phone} contactId={l.contact_id} leadId={l.id} />
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(l)}>Edit</button>
                      {!isEmployee && (
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(l.id)}>Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Lead Detail View ── */}
      {viewLead && (
        <Modal onClose={() => setViewLead(null)}>
          <div className="lead-detail">
            <div className="lead-detail-header">
              <h2>{viewLead.contact_name}</h2>
              <div className="lead-detail-badges">
                <span className={`badge ${STATUS_CLASSES[viewLead.status]}`}>{viewLead.status}</span>
                <span className={`badge ${viewLead.buyer_purpose === 'Investor' ? 'badge-warm' : 'badge-cold'}`}>{viewLead.buyer_purpose || 'Self Use'}</span>
                <span className={`badge ${viewLead.pattern === 'Closure' ? 'badge-success' : 'badge-active'}`}>{viewLead.pattern || 'Call'}</span>
              </div>
            </div>
            <div className="lead-detail-grid">
              <div className="lead-detail-item"><label>Phone</label><span>{viewLead.contact_phone || '—'}</span></div>
              <div className="lead-detail-item"><label>Email</label><span>{viewLead.contact_email || '—'}</span></div>
              <div className="lead-detail-item"><label>Source</label><span>{viewLead.source || '—'}</span></div>
              <div className="lead-detail-item"><label>Budget</label><span>{viewLead.budget || '—'}</span></div>
              <div className="lead-detail-item"><label>Project Lead For</label><span>{viewLead.project_lead_for || '—'}</span></div>
              <div className="lead-detail-item"><label>Suggested Projects</label><span>{viewLead.suggested_projects || '—'}</span></div>
              <div className="lead-detail-item"><label>Location Looking</label><span>{viewLead.location_looking || '—'}</span></div>
              <div className="lead-detail-item"><label>Buyer Purpose</label><span>{viewLead.buyer_purpose || 'Self Use'}</span></div>
              <div className="lead-detail-item"><label>Assigned To</label><span>{viewLead.assigned_name || 'Unassigned'}</span></div>
              <div className="lead-detail-item"><label>Assigned By</label><span>{viewLead.assigned_by || '—'}</span></div>
              <div className="lead-detail-item"><label>Assign Date</label><span>{fmt(viewLead.lead_assign_date)}</span></div>
              <div className="lead-detail-item"><label>Pattern</label><span>{viewLead.pattern || 'Call'}</span></div>
              <div className="lead-detail-item"><label>Follow-up Date</label><span>{fmt(viewLead.followup_date)} {viewLead.followup_time || ''}</span></div>
              <div className="lead-detail-item"><label>Next Call</label><span>{fmt(viewLead.next_call_date)} {viewLead.next_call_time || ''}</span></div>
              <div className="lead-detail-item"><label>Site Visit</label><span>{viewLead.site_visit_plan || 'None'} {viewLead.site_visit_date ? `· ${fmt(viewLead.site_visit_date)}` : ''}</span></div>
              <div className="lead-detail-item"><label>Final Meeting</label><span>{fmt(viewLead.final_meeting_date)}</span></div>
            </div>
            {viewLead.remarks && <div className="lead-detail-section"><label>Remarks</label><p>{viewLead.remarks}</p></div>}
            {viewLead.notes && <div className="lead-detail-section"><label>Notes</label><p>{viewLead.notes}</p></div>}
            {viewLead.final_meeting_notes && <div className="lead-detail-section"><label>Final Meeting Notes</label><p>{viewLead.final_meeting_notes}</p></div>}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => { setViewLead(null); openEdit(viewLead); }}>Edit Lead</button>
              <button className="btn btn-primary" onClick={() => setViewLead(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Add/Edit Modal ── */}
      {showAdd && (
        <Modal onClose={() => setShowAdd(false)}>
          <h2>{editingId ? 'Edit Lead' : 'New Lead'}</h2>
          <form onSubmit={handleSubmit} className="lead-form">
            {!editingId && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Contact *</label>
                <select value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))} required>
                  <option value="">Select a contact...</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name} {c.email ? `(${c.email})` : ''}</option>)}
                </select>
                <p className="hint">Don't see the contact? Add them in the Contacts page first.</p>
              </div>
            )}

            <fieldset className="lead-fieldset"><legend>Basic Info</legend>
              <div className="form-row">
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Source</label>
                  <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                    <option value="">Select source...</option>
                    {SOURCES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Client Budget</label>
                  <input value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} placeholder="e.g. ₹50L - ₹1Cr" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Buyer Purpose</label>
                  <select value={form.buyer_purpose} onChange={e => setForm(f => ({ ...f, buyer_purpose: e.target.value }))}>
                    {PURPOSES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Pattern</label>
                  <select value={form.pattern} onChange={e => setForm(f => ({ ...f, pattern: e.target.value }))}>
                    {PATTERNS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </fieldset>

            <fieldset className="lead-fieldset"><legend>Project Details</legend>
              <div className="form-row">
                <div className="form-group">
                  <label>Project Lead For</label>
                  <input value={form.project_lead_for} onChange={e => setForm(f => ({ ...f, project_lead_for: e.target.value }))} placeholder="e.g. DLF Privana North" />
                </div>
                <div className="form-group">
                  <label>Suggested Projects</label>
                  <input value={form.suggested_projects} onChange={e => setForm(f => ({ ...f, suggested_projects: e.target.value }))} placeholder="e.g. Godrej Aristocrat, M3M" />
                </div>
              </div>
              <div className="form-group">
                <label>Location Looking For</label>
                <input value={form.location_looking} onChange={e => setForm(f => ({ ...f, location_looking: e.target.value }))} placeholder="e.g. Sector 65, Golf Course Road" />
              </div>
            </fieldset>

            {!isEmployee && (
              <fieldset className="lead-fieldset"><legend>Assignment</legend>
                <div className="form-row">
                  <div className="form-group">
                    <label>Assign To</label>
                    <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                      <option value="">Unassigned</option>
                      {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} — {emp.role}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Assigned By</label>
                    <input value={form.assigned_by} onChange={e => setForm(f => ({ ...f, assigned_by: e.target.value }))} placeholder="Manager name" />
                  </div>
                  <div className="form-group">
                    <label>Assign Date & Time</label>
                    <input type="datetime-local" value={form.lead_assign_date} onChange={e => setForm(f => ({ ...f, lead_assign_date: e.target.value }))} />
                  </div>
                </div>
              </fieldset>
            )}

            <fieldset className="lead-fieldset"><legend>Follow-up & Calls</legend>
              <div className="form-row">
                <div className="form-group">
                  <label>Follow-up Date</label>
                  <input type="date" value={form.followup_date} onChange={e => setForm(f => ({ ...f, followup_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Follow-up Time</label>
                  <input type="time" value={form.followup_time} onChange={e => setForm(f => ({ ...f, followup_time: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Next Call Date</label>
                  <input type="date" value={form.next_call_date} onChange={e => setForm(f => ({ ...f, next_call_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Next Call Time</label>
                  <input type="time" value={form.next_call_time} onChange={e => setForm(f => ({ ...f, next_call_time: e.target.value }))} />
                </div>
              </div>
            </fieldset>

            <fieldset className="lead-fieldset"><legend>Site Visit</legend>
              <div className="form-row">
                <div className="form-group">
                  <label>Site Visit Plan</label>
                  <select value={form.site_visit_plan} onChange={e => setForm(f => ({ ...f, site_visit_plan: e.target.value }))}>
                    {VISIT_PLANS.map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Site Visit Date</label>
                  <input type="date" value={form.site_visit_date} onChange={e => setForm(f => ({ ...f, site_visit_date: e.target.value }))} />
                </div>
              </div>
            </fieldset>

            <fieldset className="lead-fieldset"><legend>Final Meeting</legend>
              <div className="form-group">
                <label>Final Meeting Date</label>
                <input type="date" value={form.final_meeting_date} onChange={e => setForm(f => ({ ...f, final_meeting_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Final Meeting Notes</label>
                <textarea rows={2} value={form.final_meeting_notes} onChange={e => setForm(f => ({ ...f, final_meeting_notes: e.target.value }))} placeholder="Meeting outcome, next steps..." />
              </div>
            </fieldset>

            <fieldset className="lead-fieldset"><legend>Notes & Remarks</legend>
              <div className="form-group">
                <label>Remarks</label>
                <textarea rows={2} value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Quick remarks about this lead..." />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Detailed notes..." />
              </div>
            </fieldset>

            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Save Changes' : 'Create Lead'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
