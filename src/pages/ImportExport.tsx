import { useState, useRef } from 'react';
import { api } from '../utils/api';

export default function ImportExport() {
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState('');
  const contactFileRef = useRef<HTMLInputElement>(null);
  const propertyFileRef = useRef<HTMLInputElement>(null);

  const handleImport = async (type: 'contacts' | 'properties', fileRef: React.RefObject<HTMLInputElement | null>) => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(''); setResult(''); setLoading(type);
    try {
      const res = await api.upload<{ imported: number; skipped: number; total: number }>(`/csv/import/${type}`, file);
      setResult(`Successfully imported ${res.imported} of ${res.total} ${type}${res.skipped ? ` (${res.skipped} skipped)` : ''}`);
    } catch { setError(`Failed to import ${type}`); }
    setLoading('');
  };

  const handleExport = async (type: 'contacts' | 'leads') => {
    setError(''); setLoading(type);
    try {
      const csv = await api.get<string>(`/csv/export/${type}`);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${type}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { setError(`Failed to export ${type}`); }
    setLoading('');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Import / Export</h1>
          <p className="subtitle">Bulk manage your data with CSV files</p>
        </div>
      </div>

      {result && <div className="success-msg">{result}</div>}
      {error && <div className="error-msg">{error}</div>}

      <div className="import-export-grid">
        <div className="card">
          <div className="card-header"><h3>📥 Import Data</h3></div>
          <div className="card-body">
            <div className="form-group">
              <label>Import Contacts</label>
              <input type="file" accept=".csv" ref={contactFileRef} style={{ marginBottom: 10 }} />
              <button className="btn btn-primary btn-sm" onClick={() => handleImport('contacts', contactFileRef)} disabled={!!loading}>
                {loading === 'contacts' ? 'Uploading...' : 'Upload Contacts CSV'}
              </button>
            </div>
            <div className="form-group" style={{ marginTop: 24 }}>
              <label>Import Properties</label>
              <input type="file" accept=".csv" ref={propertyFileRef} style={{ marginBottom: 10 }} />
              <button className="btn btn-primary btn-sm" onClick={() => handleImport('properties', propertyFileRef)} disabled={!!loading}>
                {loading === 'properties' ? 'Uploading...' : 'Upload Properties CSV'}
              </button>
            </div>
            <div className="hint" style={{ marginTop: 16 }}>
              CSV headers: name, email, phone, address, city, state, zip
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>📤 Export Data</h3></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <button className="btn btn-outline" onClick={() => handleExport('contacts')} disabled={!!loading}>
              {loading === 'contacts' ? 'Exporting...' : '📋 Download Contacts CSV'}
            </button>
            <button className="btn btn-outline" onClick={() => handleExport('leads')} disabled={!!loading}>
              {loading === 'leads' ? 'Exporting...' : '🎯 Download Leads CSV'}
            </button>
            <p className="hint">Exports include all records for the current user</p>
          </div>
        </div>
      </div>
    </div>
  );
}
