import { useState, useEffect, FormEvent } from 'react';
import { api } from '../utils/api';
import { Employee } from '../types';
import Modal from '../components/Modal';

const ROLES = ['Agent', 'Senior Agent', 'Team Lead', 'Manager', 'Admin'];

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'Agent' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const fetchEmployees = () => {
    api.get<{ employees: Employee[] }>('/employees').then(d => setEmployees(d?.employees || [])).catch(() => {});
  };

  useEffect(() => { fetchEmployees(); }, []);

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setForm({ name: '', email: '', phone: '', role: 'Agent' });
    setEditingId(null);
    setShowAdd(true);
  };

  const openEdit = (emp: Employee) => {
    setForm({ name: emp.name, email: emp.email || '', phone: emp.phone || '', role: emp.role });
    setEditingId(emp.id);
    setShowAdd(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await api.put(`/employees/${editingId}`, form);
    } else {
      await api.post('/employees', form);
    }
    setShowAdd(false);
    fetchEmployees();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this employee? Their lead assignments will be cleared.')) return;
    await api.delete(`/employees/${id}`);
    fetchEmployees();
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Employees</h1>
          <p className="subtitle">{employees.length} team members</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Employee</button>
      </div>

      <div className="search-bar">
        <input placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <h3>No employees found</h3>
            <p>{search ? 'Try adjusting your search' : 'Add your first team member to start assigning leads'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Employee</th><th>Email</th><th>Phone</th><th>Role</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map(emp => (
                  <tr key={emp.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="emp-avatar" style={{ background: emp.avatar_color }}>{getInitials(emp.name)}</div>
                        <strong>{emp.name}</strong>
                      </div>
                    </td>
                    <td>{emp.email || '—'}</td>
                    <td>{emp.phone || '—'}</td>
                    <td><span className="badge badge-active">{emp.role}</span></td>
                    <td className="actions">
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(emp)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(emp.id)}>Delete</button>
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
          <h2>{editingId ? 'Edit Employee' : 'New Employee'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="employee@company.com" />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
              </div>
            </div>
            <div className="form-group">
              <label>Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Save Changes' : 'Add Employee'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
