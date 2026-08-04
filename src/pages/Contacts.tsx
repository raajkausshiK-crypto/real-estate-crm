import { useState, useEffect, FormEvent } from 'react';
import { api } from '../utils/api';
import { Contact } from '../types';
import Modal from '../components/Modal';
import { CallButton } from './Calls';

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', city: '', state: '', zip: '', notes: '' });

  const fetchContacts = () => {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    api.get<{ contacts: Contact[]; total: number }>(`/contacts${params}`).then(d => {
      setContacts(d?.contacts || []);
      setTotal(d?.total || 0);
    }).catch(() => {});
  };

  useEffect(() => { fetchContacts(); }, [search]);

  const openAdd = () => {
    setForm({ name: '', email: '', phone: '', address: '', city: '', state: '', zip: '', notes: '' });
    setEditingId(null); setError(''); setShowForm(true);
  };

  const openEdit = (c: Contact) => {
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', address: c.address || '', city: c.city || '', state: c.state || '', zip: c.zip || '', notes: c.notes || '' });
    setEditingId(c.id); setError(''); setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) await api.put(`/contacts/${editingId}`, form);
      else await api.post('/contacts', form);
      setShowForm(false);
      fetchContacts();
    } catch (err: any) { setError(err.message); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this contact and all associated leads?')) return;
    await api.delete(`/contacts/${id}`);
    fetchContacts();
  };

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Contacts</h1>
          <p className="subtitle">{total} contacts in your database</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Contact</button>
      </div>

      <div className="search-bar">
        <input placeholder="Search by name, email, or phone..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {contacts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <h3>No contacts found</h3>
            <p>{search ? 'Try a different search term' : 'Add contacts to start tracking leads'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Location</th><th>Actions</th></tr></thead>
              <tbody>
                {contacts.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong></td>
                    <td>{c.email || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td>{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                    <td className="actions">
                      <CallButton phone={c.phone} contactId={c.id} />
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(c)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(c.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(false)}>
          <h2>{editingId ? 'Edit Contact' : 'New Contact'}</h2>
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group"><label>Name *</label><input value={form.name} onChange={e => set('name', e.target.value)} required placeholder="Full name" /></div>
              <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Phone</label><input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98765 00000" /></div>
              <div className="form-group"><label>Address</label><input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street address" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>City</label><input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Mumbai" /></div>
              <div className="form-group"><label>State</label><input value={form.state} onChange={e => set('state', e.target.value)} placeholder="MH" /></div>
            </div>
            <div className="form-group"><label>Notes</label><textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any notes about this contact..." /></div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Save Changes' : 'Add Contact'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
