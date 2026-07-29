import { useState, useEffect, FormEvent } from 'react';
import { api } from '../utils/api';
import { Lead, Contact } from '../types';
import Modal from '../components/Modal';
import { CallButton } from './Calls';

const STATUS_CLASSES: Record<string, string> = {
  Hot: 'badge-hot', Warm: 'badge-warm', Cold: 'badge-cold',
  Closed: 'badge-closed', 'Follow-up Needed': 'badge-followup',
};

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState({ contact_id: '', status: 'Warm', source: '', notes: '' });
  const [editingId, setEditingId] = useState<number | null>(null);

  const fetchLeads = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    api.get<{ leads: Lead[]; total: number }>(`/leads?${params}`).then(d => {
      setLeads(d.leads);
      setTotal(d.total);
    });
  };

  useEffect(() => { fetchLeads(); }, [search, statusFilter]);

  const openAdd = () => {
    api.get<{ contacts: Contact[] }>('/contacts?limit=200').then(d => setContacts(d.contacts));
    setForm({ contact_id: '', status: 'Warm', source: '', notes: '' });
    setEditingId(null);
    setShowAdd(true);
  };

  const openEdit = (lead: Lead) => {
    api.get<{ contacts: Contact[] }>('/contacts?limit=200').then(d => setContacts(d.contacts));
    setForm({ contact_id: String(lead.contact_id), status: lead.status, source: lead.source || '', notes: lead.notes || '' });
    setEditingId(lead.id);
    setShowAdd(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { ...form, contact_id: Number(form.contact_id) };
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Leads</h1>
          <p className="subtitle">{total} total leads in your pipeline</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Lead</button>
      </div>

      <div className="search-bar">
        <input placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option>Hot</option><option>Warm</option><option>Cold</option>
          <option>Follow-up Needed</option><option>Closed</option>
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
                <tr><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Source</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {leads.map(l => (
                  <tr key={l.id}>
                    <td><strong>{l.contact_name}</strong></td>
                    <td>{l.contact_email || '—'}</td>
                    <td>{l.contact_phone || '—'}</td>
                    <td><span className={`badge ${STATUS_CLASSES[l.status]}`}>{l.status}</span></td>
                    <td>{l.source || '—'}</td>
                    <td className="actions">
                      <CallButton phone={l.contact_phone} contactId={l.contact_id} leadId={l.id} />
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(l)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(l.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <Modal onClose={() => setShowAdd(false)}>
          <h2>{editingId ? 'Edit Lead' : 'New Lead'}</h2>
          <form onSubmit={handleSubmit}>
            {!editingId && (
              <div className="form-group">
                <label>Contact *</label>
                <select value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))} required>
                  <option value="">Select a contact...</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name} {c.email ? `(${c.email})` : ''}</option>)}
                </select>
                <p className="hint">Don't see the contact? Add them in the Contacts page first.</p>
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option>Hot</option><option>Warm</option><option>Cold</option>
                  <option>Follow-up Needed</option><option>Closed</option>
                </select>
              </div>
              <div className="form-group">
                <label>Source</label>
                <input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="Website, Referral, Walk-in..." />
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any relevant details about this lead..." />
            </div>
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
