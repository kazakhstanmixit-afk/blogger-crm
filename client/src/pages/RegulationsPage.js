import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';

function RegulationModal({ regulation, onClose, onSave }) {
  const isEdit = !!regulation;
  const [form, setForm] = useState({
    title: regulation?.title || '',
    url: regulation?.url || '',
    drive_url: regulation?.drive_url || '',
    description: regulation?.description || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title) { setError('Укажите название'); return; }
    setSaving(true);
    const res = await apiFetch(isEdit ? `/api/regulations/${regulation.id}` : '/api/regulations', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(form),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error); setSaving(false); return; }
    onSave();
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:520}}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'Редактировать регламент' : 'Добавить регламент'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Название *</label>
            <input required value={form.title} onChange={e=>set('title',e.target.value)} placeholder="Напр: Регламент работы с блогерами" />
          </div>
          <div className="field">
            <label>Ссылка для просмотра</label>
            <input value={form.url} onChange={e=>set('url',e.target.value)} placeholder="https://..." />
            <div style={{fontSize:11,color:'#9ba3be',marginTop:3}}>HTML страница, Notion, Confluence и т.д.</div>
          </div>
          <div className="field">
            <label>Ссылка на Google Drive / Яндекс Диск</label>
            <input value={form.drive_url} onChange={e=>set('drive_url',e.target.value)} placeholder="https://drive.google.com/..." />
          </div>
          <div className="field">
            <label>Описание</label>
            <textarea value={form.description} onChange={e=>set('description',e.target.value)} placeholder="Краткое описание что в регламенте..." />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Сохраняем...':isEdit?'Сохранить':'Добавить'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RegulationsPage({ currentUser }) {
  const [regulations, setRegulations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editReg, setEditReg] = useState(null);

  const fetchRegulations = async () => {
    setLoading(true);
    const res = await apiFetch('/api/regulations');
    setRegulations(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchRegulations(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить регламент?')) return;
    await apiFetch(`/api/regulations/${id}`, { method: 'DELETE' });
    fetchRegulations();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📋 Регламенты</div>
          <div className="page-subtitle">{regulations.length} документов</div>
        </div>
        {currentUser.role === 'admin' && (
          <button className="btn btn-primary" onClick={()=>{setEditReg(null);setShowForm(true);}}>+ Добавить</button>
        )}
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:40,color:'#9ba3be'}}>Загрузка...</div>
      ) : regulations.length === 0 ? (
        <div className="empty-state"><div style={{fontSize:36}}>📋</div><p>Регламентов пока нет</p></div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:16}}>
          {regulations.map(r => (
            <div key={r.id} style={{background:'#fff',border:'1px solid #e2e6ef',borderRadius:12,padding:'20px',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
                <div style={{fontSize:15,fontWeight:600,color:'#1a1d2e',flex:1,marginRight:8}}>{r.title}</div>
                {currentUser.role === 'admin' && (
                  <div style={{display:'flex',gap:6,flexShrink:0}}>
                    <button className="btn btn-secondary btn-sm" onClick={()=>{setEditReg(r);setShowForm(true);}}>✏️</button>
                    <button className="btn btn-danger btn-sm" onClick={()=>handleDelete(r.id)}>🗑</button>
                  </div>
                )}
              </div>

              {r.description && (
                <div style={{fontSize:12,color:'#9ba3be',marginBottom:12,lineHeight:1.5}}>{r.description}</div>
              )}

              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {r.url && (
                  <a href={r.url} target="_blank" rel="noreferrer"
                    style={{display:'inline-flex',alignItems:'center',gap:5,padding:'7px 14px',background:'#4f6ef7',color:'#fff',borderRadius:8,fontSize:12,fontWeight:500,textDecoration:'none'}}>
                    👁 Открыть
                  </a>
                )}
                {r.drive_url && (
                  <a href={r.drive_url} target="_blank" rel="noreferrer"
                    style={{display:'inline-flex',alignItems:'center',gap:5,padding:'7px 14px',background:'#f8f9fb',color:'#5a6380',border:'1px solid #e2e6ef',borderRadius:8,fontSize:12,fontWeight:500,textDecoration:'none'}}>
                    📁 Диск
                  </a>
                )}
              </div>

              <div style={{fontSize:10,color:'#c8cfe0',marginTop:12}}>
                Добавлен {new Date(r.created_at).toLocaleDateString('ru',{day:'numeric',month:'long',year:'numeric'})}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <RegulationModal
          regulation={editReg}
          onClose={()=>{setShowForm(false);setEditReg(null);}}
          onSave={()=>{setShowForm(false);setEditReg(null);fetchRegulations();}}
        />
      )}
    </div>
  );
}
