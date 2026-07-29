import { useState, useEffect, FormEvent } from 'react';
import { api } from '../utils/api';
import { Property } from '../types';
import Modal from '../components/Modal';

export default function Properties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    address: '', city: '', state: '', zip: '', price: '', bedrooms: '', bathrooms: '', sqft: '', photo_url: '', status: 'Active', description: '',
  });

  const fetchProperties = () => {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    api.get<{ properties: Property[]; total: number }>(`/properties${params}`).then(d => {
      setProperties(d.properties); setTotal(d.total);
    });
  };

  useEffect(() => { fetchProperties(); }, [search]);

  const openAdd = () => {
    setForm({ address: '', city: '', state: '', zip: '', price: '', bedrooms: '', bathrooms: '', sqft: '', photo_url: '', status: 'Active', description: '' });
    setEditingId(null); setShowForm(true);
  };

  const openEdit = (p: Property) => {
    setForm({
      address: p.address, city: p.city || '', state: p.state || '', zip: p.zip || '',
      price: p.price?.toString() || '', bedrooms: p.bedrooms?.toString() || '',
      bathrooms: p.bathrooms?.toString() || '', sqft: p.sqft?.toString() || '',
      photo_url: p.photo_url || '', status: p.status || 'Active', description: p.description || '',
    });
    setEditingId(p.id); setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { ...form, price: form.price ? Number(form.price) : null, bedrooms: form.bedrooms ? Number(form.bedrooms) : null, bathrooms: form.bathrooms ? Number(form.bathrooms) : null, sqft: form.sqft ? Number(form.sqft) : null };
    if (editingId) await api.put(`/properties/${editingId}`, body);
    else await api.post('/properties', body);
    setShowForm(false); fetchProperties();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this property?')) return;
    await api.delete(`/properties/${id}`); fetchProperties();
  };

  const fmt = (n: number) => n ? `₹${(n / 100000).toFixed(n >= 10000000 ? 0 : 1)}L` : '—';
  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  const STATUS_BADGE: Record<string, string> = { Active: 'badge-success', Pending: 'badge-warm', Sold: 'badge-hot', 'Off Market': 'badge-closed' };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Properties</h1>
          <p className="subtitle">{total} properties in your database</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Property</button>
      </div>

      <div className="search-bar">
        <input placeholder="Search by address or city..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {properties.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🏠</div>
            <h3>No properties found</h3>
            <p>{search ? 'Try a different search' : 'Add your first listing'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Address</th><th>City</th><th>Price</th><th>Bed</th><th>Bath</th><th>Sqft</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {properties.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.address}</strong></td>
                    <td>{[p.city, p.state].filter(Boolean).join(', ') || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(p.price)}</td>
                    <td>{p.bedrooms ?? '—'}</td>
                    <td>{p.bathrooms ?? '—'}</td>
                    <td>{p.sqft ? p.sqft.toLocaleString() : '—'}</td>
                    <td><span className={`badge ${STATUS_BADGE[p.status] || 'badge-active'}`}>{p.status}</span></td>
                    <td className="actions">
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(p)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(p.id)}>Delete</button>
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
          <h2>{editingId ? 'Edit Property' : 'New Property'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group"><label>Address *</label><input value={form.address} onChange={e => set('address', e.target.value)} required placeholder="Full property address" /></div>
            <div className="form-row">
              <div className="form-group"><label>City</label><input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Mumbai" /></div>
              <div className="form-group"><label>State</label><input value={form.state} onChange={e => set('state', e.target.value)} placeholder="MH" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Price (₹)</label><input type="number" value={form.price} onChange={e => set('price', e.target.value)} placeholder="8500000" /></div>
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={e => set('status', e.target.value)}>
                  <option>Active</option><option>Pending</option><option>Sold</option><option>Off Market</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Bedrooms</label><input type="number" value={form.bedrooms} onChange={e => set('bedrooms', e.target.value)} placeholder="3" /></div>
              <div className="form-group"><label>Bathrooms</label><input type="number" step="0.5" value={form.bathrooms} onChange={e => set('bathrooms', e.target.value)} placeholder="2" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Sqft</label><input type="number" value={form.sqft} onChange={e => set('sqft', e.target.value)} placeholder="1450" /></div>
              <div className="form-group"><label>ZIP</label><input value={form.zip} onChange={e => set('zip', e.target.value)} placeholder="400053" /></div>
            </div>
            <div className="form-group"><label>Description</label><textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Property details..." /></div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Save Changes' : 'Add Property'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
