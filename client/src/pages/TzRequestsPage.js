import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';

const FORMATS = [
  { value: 'reels', label: 'Рилс' },
  { value: 'stories', label: 'Сторис' },
  { value: 'tiktok', label: 'TikTok' },
];

const TZ_STATUSES = [
  { value: 'requested', label: 'Сделан запрос', color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  { value: 'in_work', label: 'Взято в работу', color: '#1e40af', bg: '#dbeafe', border: '#bfdbfe' },
  { value: 'done', label: 'Готово', color: '#15803d', bg: '#dcfce7', border: '#bbf7d0' },
];

const emptyVideo = { url: '' };

function TzModal({ tz, onClose, onSave }) {
  const isEdit = !!tz;
  const [form, setForm] = useState({
    nick: tz?.nick || '',
    instagram_url: tz?.instagram_url || '',
    tiktok_url: tz?.tiktok_url || '',
    product: tz?.product || '',
    videos: tz?.videos?.length ? tz.videos : [{ ...emptyVideo }, { ...emptyVideo }, { ...emptyVideo }],
    format: tz?.format || 'reels',
    status: tz?.status || 'requested',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setVideo = (i, k, v) => {
    const videos = [...form.videos];
    videos[i] = { ...videos[i], [k]: v };
    setForm(f => ({ ...f, videos }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nick) { setError('Укажите ник'); return; }
    setSaving(true);
    const videos = form.videos.filter(v => v.url.trim());
    const res = await apiFetch(isEdit ? `/api/tz-requests/${tz.id}` : '/api/tz-requests', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify({ ...form, videos, status: form.status, format: form.format }),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error); setSaving(false); return; }
    onSave();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'Редактировать запрос ТЗ' : 'Новый запрос ТЗ'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="section-divider">Блогер</div>
          <div className="form-row">
            <div className="field"><label>Ник *</label><input required value={form.nick} onChange={e => set('nick', e.target.value)} placeholder="@blogger" /></div>
            <div className="field"><label>Товар</label><input value={form.product} onChange={e => set('product', e.target.value)} placeholder="Название товара" /></div>
          </div>
          <div className="form-row">
            <div className="field"><label>Ссылка Instagram</label><input value={form.instagram_url} onChange={e => set('instagram_url', e.target.value)} placeholder="https://instagram.com/..." /></div>
            <div className="field"><label>Ссылка TikTok</label><input value={form.tiktok_url} onChange={e => set('tiktok_url', e.target.value)} placeholder="https://tiktok.com/@..." /></div>
          </div>

          <div className="field"><label>Формат ТЗ</label><select value={form.format} onChange={e => set('format', e.target.value)}>{FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
          <div className="section-divider">Залетевшие видео (до 3)</div>
          {form.videos.map((v, i) => (
            <div key={i} className="field" style={{ marginBottom: 8 }}>
              <label>Ссылка на видео {i + 1}</label>
              <input value={v.url} onChange={e => setVideo(i, 'url', e.target.value)} placeholder="https://..." />
            </div>
          ))}

          <div className="field" style={{marginTop:8}}>
            <label>Статус</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              {TZ_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Сохраняем...' : isEdit ? 'Сохранить' : 'Создать'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TzRequestsPage({ currentUser }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTz, setEditTz] = useState(null);
  const [search, setSearch] = useState('');

  const fetchRequests = async () => {
    setLoading(true);
    const res = await apiFetch('/api/tz-requests');
    setRequests(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить запрос?')) return;
    await apiFetch(`/api/tz-requests/${id}`, { method: 'DELETE' });
    fetchRequests();
  };

  const filtered = requests.filter(r =>
    r.nick.toLowerCase().includes(search.toLowerCase()) ||
    (r.product || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📝 Запросы ТЗ</div>
          <div className="page-subtitle">{requests.length} запросов</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditTz(null); setShowForm(true); }}>+ Новый запрос</button>
      </div>

      <div className="toolbar">
        <input className="search-input" placeholder="🔍 Поиск по нику или товару..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Дата</th>
              {currentUser.role === 'admin' && <th>Менеджер</th>}
              <th>Ник</th>
              <th>Ссылки</th>
              <th>Товар</th>
              <th>Формат</th>
              <th>Статус</th>
              <th>Видео 1</th>
              <th>Видео 2</th>
              <th>Видео 3</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#9ba3be' }}>Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9}><div className="empty-state"><div style={{ fontSize: 36 }}>📝</div><p>Запросов пока нет</p></div></td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => { setEditTz(r); setShowForm(true); }}>
                <td style={{ fontSize: 11, color: '#9ba3be', whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}</td>
                {currentUser.role === 'admin' && <td><span className="tag">{r.username || '—'}</span></td>}
                <td style={{ fontWeight: 500 }}>{r.nick}</td>
                <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                  {r.instagram_url && <a href={r.instagram_url} target="_blank" rel="noreferrer" className="td-link">📸</a>}
                  {r.tiktok_url && <a href={r.tiktok_url} target="_blank" rel="noreferrer" className="td-link">🎵</a>}
                  {!r.instagram_url && !r.tiktok_url && <span style={{ color: '#9ba3be', fontSize: 11 }}>—</span>}
                </td>
                <td style={{ fontSize: 12, fontWeight: 500 }}>{r.product || '—'}</td>
                <td style={{fontSize:12}}>{FORMATS.find(f=>f.value===r.format)?.label||r.format||'—'}</td>
                <td onClick={e => e.stopPropagation()}>
                  {(() => { const s = TZ_STATUSES.find(x => x.value === r.status) || TZ_STATUSES[0]; return <span style={{display:'inline-block',padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:500,color:s.color,background:s.bg,border:'1px solid '+s.border}}>{s.label}</span>; })()}
                </td>
                {[0, 1, 2].map(i => {
                  const v = r.videos?.[i];
                  return (
                    <td key={i} onClick={e => e.stopPropagation()}>
                      {v?.url ? (
                        <a href={v.url} target="_blank" rel="noreferrer" style={{ color: '#4f6ef7', fontSize: 11, textDecoration: 'none' }}>🎬 Открыть</a>
                      ) : <span style={{ color: '#9ba3be', fontSize: 11 }}>—</span>}
                    </td>
                  );
                })}
                <td onClick={e => e.stopPropagation()}>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <TzModal
          tz={editTz}
          onClose={() => { setShowForm(false); setEditTz(null); }}
          onSave={() => { setShowForm(false); setEditTz(null); fetchRequests(); }}
        />
      )}
    </div>
  );
}
