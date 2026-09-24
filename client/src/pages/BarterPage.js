import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';

const STATUSES = [
  { value: 'transferred', label: 'Передано в работу', color: '#1e40af', bg: '#dbeafe', border: '#bfdbfe' },
  { value: 'delivered', label: 'Доставлено', color: '#15803d', bg: '#dcfce7', border: '#bbf7d0' },
];

function StatusBadge({ status, onClick }) {
  const s = STATUSES.find(x => x.value === status) || STATUSES[0];
  return (
    <span onClick={onClick} style={{cursor: onClick ? 'pointer' : 'default', display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:500, color:s.color, background:s.bg, border:`1px solid ${s.border}`}}>
      {s.label} {onClick ? '▾' : ''}
    </span>
  );
}

function BarterModal({ barter, onClose, onSave }) {
  const isEdit = !!barter;
  const [form, setForm] = useState({
    nick: barter?.nick || '',
    url: barter?.url || '',
    city: barter?.city || '',
    address: barter?.address || '',
    phone: barter?.phone || '',
    product: barter?.product || '',
    notes: barter?.notes || '',
    status: barter?.status || 'transferred',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nick) { setError('Укажите ник'); return; }
    setSaving(true);
    const res = await apiFetch(isEdit ? `/api/barters/${barter.id}` : '/api/barters', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(form),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error); setSaving(false); return; }
    onSave();
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:500}}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'Редактировать' : 'Добавить бартер'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="field"><label>Ник *</label><input required value={form.nick} onChange={e=>set('nick',e.target.value)} placeholder="@blogger" /></div>
            <div className="field"><label>Ссылка</label><input value={form.url} onChange={e=>set('url',e.target.value)} placeholder="https://instagram.com/..." /></div>
          </div>
          <div className="form-row">
            <div className="field"><label>Город</label><input value={form.city} onChange={e=>set('city',e.target.value)} placeholder="Алматы" /></div>
            <div className="field"><label>Адрес доставки</label><input value={form.address} onChange={e=>set('address',e.target.value)} placeholder="Город, улица, дом..." /></div>
          <div className="form-row">
            <div className="field"><label>Номер для связи</label><input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+7 700 000 0000" /></div>
            <div className="field"><label>Товар</label><input value={form.product} onChange={e=>set('product',e.target.value)} placeholder="Название товара" /></div>
          </div>
          <div className="field">
            <label>Статус</label>
            <select value={form.status} onChange={e=>set('status',e.target.value)}>
              {STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="field"><label>Заметки</label><textarea value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Дополнительная информация..." /></div>
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

export default function BarterPage({ currentUser }) {
  const [barters, setBarters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editBarter, setEditBarter] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const fetchBarters = async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (statusFilter) p.set('status', statusFilter);
    const res = await apiFetch('/api/barters?' + p);
    setBarters(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchBarters(); }, [statusFilter]);

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить запись?')) return;
    await apiFetch(`/api/barters/${id}`, { method: 'DELETE' });
    fetchBarters();
  };

  const handleStatusToggle = async (b) => {
    const newStatus = b.status === 'transferred' ? 'delivered' : 'transferred';
    await apiFetch(`/api/barters/${b.id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
    fetchBarters();
  };

  const filtered = barters.filter(b =>
    b.nick.toLowerCase().includes(search.toLowerCase()) ||
    (b.product||'').toLowerCase().includes(search.toLowerCase()) ||
    (b.address||'').toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    transferred: barters.filter(b=>b.status==='transferred').length,
    delivered: barters.filter(b=>b.status==='delivered').length,
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🎁 Бартер</div>
          <div className="page-subtitle">{barters.length} записей</div>
        </div>
        <button className="btn btn-primary" onClick={()=>{setEditBarter(null);setShowForm(true);}}>+ Добавить</button>
      </div>

      <div className="stats-grid" style={{marginBottom:16}}>
        <div className="stat-card">
          <div className="stat-value" style={{color:'#1e40af'}}>{stats.transferred}</div>
          <div className="stat-label">Передано в работу</div>
        </div>
        <div className="stat-card">
          <div className="stat-value stat-green">{stats.delivered}</div>
          <div className="stat-label">Доставлено</div>
        </div>
      </div>

      <div className="toolbar">
        <input className="search-input" placeholder="🔍 Поиск по нику, товару, адресу..." value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="select-filter" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">Все статусы</option>
          {STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="table-wrap" style={{overflowX:'auto'}}>
        <table style={{minWidth:800}}>
          <thead>
            <tr>
              <th>Дата</th>
              {currentUser.role==='admin' && <th>Менеджер</th>}
              <th>Ник</th>
              <th>Ссылка</th>
              <th>Город</th>
              <th>Адрес</th>
              <th>Номер</th>
              <th>Товар</th>
              <th>Статус</th>
              <th>Заметки</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{textAlign:'center',padding:40,color:'#9ba3be'}}>Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10}><div className="empty-state"><div style={{fontSize:36}}>🎁</div><p>Бартеров пока нет</p></div></td></tr>
            ) : filtered.map(b => (
              <tr key={b.id} style={{cursor:'pointer'}} onClick={()=>{setEditBarter(b);setShowForm(true);}}>
                <td style={{fontSize:11,color:'#9ba3be',whiteSpace:'nowrap'}}>{new Date(b.created_at).toLocaleDateString('ru',{day:'numeric',month:'short'})}</td>
                {currentUser.role==='admin' && <td><span className="tag">{b.username||'—'}</span></td>}
                <td style={{fontWeight:500}}>{b.nick}</td>
                <td onClick={e=>e.stopPropagation()}>
                  {b.url ? <a href={b.url} target="_blank" rel="noreferrer" className="td-link">🔗 Профиль</a> : <span style={{color:'#9ba3be',fontSize:11}}>—</span>}
                </td>
                <td style={{fontSize:12,fontWeight:500}}>{b.city||'—'}</td>
                <td style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12}} title={b.address||''}>{b.address||'—'}</td>
                <td style={{fontSize:12,fontFamily:'monospace'}}>{b.phone||'—'}</td>
                <td style={{fontSize:12,fontWeight:500}}>{b.product||'—'}</td>
                <td onClick={e=>e.stopPropagation()}>
                  <StatusBadge status={b.status} onClick={()=>handleStatusToggle(b)} />
                </td>
                <td style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11,color:'#9ba3be'}} title={b.notes||''}>{b.notes||'—'}</td>
                <td onClick={e=>e.stopPropagation()}>
                  <button className="btn btn-danger btn-sm" onClick={()=>handleDelete(b.id)}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <BarterModal
          barter={editBarter}
          onClose={()=>{setShowForm(false);setEditBarter(null);}}
          onSave={()=>{setShowForm(false);setEditBarter(null);fetchBarters();}}
        />
      )}
    </div>
  );
}
