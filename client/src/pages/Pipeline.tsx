import { useState, useEffect, DragEvent } from 'react';
import { api } from '../utils/api';
import { Lead, LeadStatus } from '../types';

const COLUMNS: LeadStatus[] = ['Hot', 'Warm', 'Cold', 'Follow-up Needed', 'Closed'];
const COLUMN_COLORS: Record<string, string> = {
  Hot: 'var(--hot)', Warm: 'var(--warm)', Cold: 'var(--cold)',
  'Follow-up Needed': 'var(--followup)', Closed: 'var(--closed)',
};

export default function Pipeline() {
  const [pipeline, setPipeline] = useState<Record<string, Lead[]>>({});
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const fetchPipeline = () => {
    api.get<Record<string, Lead[]>>('/leads/pipeline').then(setPipeline);
  };

  useEffect(() => { fetchPipeline(); }, []);

  const handleDragStart = (e: DragEvent, leadId: number) => {
    setDragging(leadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (status: LeadStatus) => {
    if (dragging === null) return;
    setDragOverCol(null);
    await api.put(`/leads/${dragging}`, { status });
    setDragging(null);
    fetchPipeline();
  };

  const totalLeads = Object.values(pipeline).reduce((sum, arr) => sum + (arr?.length || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Pipeline</h1>
          <p className="subtitle">{totalLeads} leads across {COLUMNS.length} stages</p>
        </div>
      </div>

      <div className="kanban">
        {COLUMNS.map(col => (
          <div
            key={col}
            className={`kanban-column ${dragOverCol === col ? 'drag-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOverCol(col); }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={() => handleDrop(col)}
          >
            <div className="kanban-column-header">
              <span style={{ color: COLUMN_COLORS[col] }}>{col}</span>
              <span className="kanban-count">{pipeline[col]?.length || 0}</span>
            </div>
            {(pipeline[col] || []).map(lead => (
              <div
                key={lead.id}
                className={`kanban-card ${dragging === lead.id ? 'dragging' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, lead.id)}
                onDragEnd={() => { setDragging(null); setDragOverCol(null); }}
              >
                <h4>{lead.contact_name}</h4>
                <p>{lead.contact_email || 'No email'}</p>
                {(lead.source || lead.contact_phone) && (
                  <div className="card-meta">
                    {lead.source && <span className="card-tag">{lead.source}</span>}
                    {lead.contact_phone && <span className="card-tag">{lead.contact_phone}</span>}
                  </div>
                )}
              </div>
            ))}
            {(pipeline[col] || []).length === 0 && (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No leads
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
