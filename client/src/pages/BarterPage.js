import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';
import Toast from '../components/Toast';

const STATUSES = [
  { value: 'transferred', label: 'Передано в работу', color: '#1e40af', bg: '#dbeafe', border: '#bfdbfe' },
  { value: 'delivered', label: 'Доставлено', color: '#15803d', bg: '#dcfce7', border: '#bbf7d0' },
];

const WAREHOUSES = [
  { value: 'almaty', label: 'Алматы' },
  { value: 'astana', label: 'Астана' },
];

function InventoryManager({ inventory, onUpdate, isAdmin }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: '', qty_almaty: '', qty_astana: '' });

  const handleSave = async () => {
    if (!form.name) return;
    if (editItem) {
      await apiFetch(`/api/inventory/${editItem.id}`, { method: 'PUT', body: JSON.stringify(form) });
    } else {
      await apiFetch('/api/inventory', { method: 'POST', body: JSON.stringify(form) });
    }
    setShowAdd(false);
    setEditItem(null);
    setForm({ name: '', qty_almaty: '', qty_astana: '' });
    onUpdate();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить товар?')) return;
    await apiFetch(`/api/inventory/${id}`, { method: 'DELETE' });
    onUpdate();
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e6ef', borderRadius: 10, padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>📦 Остатки на складах</div>
        {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setEditItem(null); setForm({ name: '', qty_almaty: '', qty_astana: '' }); }}>+ Добавить товар</button>}
      </div>

      {(showAdd || editItem) && (
        <div style={{ background: '#f8f9fb', borderRadius: 8, padding: 12, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ marginBottom: 0, flex: 2, minWidth: 150 }}>
            <label>Название товара</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Крем SPF 50" />
          </div>
          <div className="field" style={{ marginBottom: 0, width: 100 }}>
            <label>Алматы</label>
            <input type="number" value={form.qty_almaty} onChange={e => setForm(f => ({ ...f, qty_almaty: e.target.value }))} placeholder="0" />
          </div>
          <div className="field" style={{ marginBottom: 0, width: 100 }}>
            <label>Астана</label>
            <input type="number" value={form.qty_astana} onChange={e => setForm(f => ({ ...f, qty_astana: e.target.value }))} placeholder="0" />
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleSave}>Сохранить</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setShowAdd(false); setEditItem(null); }}>Отмена</button>
        </div>
      )}

      {inventory.length === 0 ? (
        <div style={{ color: '#9ba3be', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>Товаров пока нет</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {inventory.map(item => (
            <div key={item.id} style={{ padding: '10px 12px', background: '#f8f9fb', borderRadius: 8, border: '1px solid #e2e6ef' }}>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>{item.name}</div>
              <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <span style={{ padding: '2px 8px', background: '#dbeafe', color: '#1e40af', borderRadius: 4 }}>АЛМ: {item.qty_almaty}</span>
                <span style={{ padding: '2px 8px', background: '#dcfce7', color: '#15803d', borderRadius: 4 }}>АСТ: {item.qty_astana}</span>
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  <button className="btn btn-secondary btn-sm" style={{ fontSize: 10, padding: '2px 8px' }}
                    onClick={() => { setEditItem(item); setForm({ name: item.name, qty_almaty: item.qty_almaty, qty_astana: item.qty_astana }); setShowAdd(false); }}>
                    ✏️
                  </button>
                  <button className="btn btn-danger btn-sm" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => handleDelete(item.id)}>🗑</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BarterModal({ barter, inventory, onClose, onSave, isAdmin }) {
  const isEdit = !!barter;
  const [form, setForm] = useState({
    nick: barter?.nick || '',
    url: barter?.url || '',
    city: barter?.city || '',
    address: barter?.address || '',
    phone: barter?.phone || '',
    notes: barter?.notes || '',
    status: barter?.status || 'transferred',
    warehouse: barter?.warehouse || 'almaty',
    items: barter?.items || [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addItem = (invItem) => {
    const existing = form.items.find(i => i.id === invItem.id);
    if (existing) {
      setForm(f => ({ ...f, items: f.items.map(i => i.id === invItem.id ? { ...i, qty: (i.qty || 1) + 1 } : i) }));
    } else {
      setForm(f => ({ ...f, items: [...f.items, { id: invItem.id, name: invItem.name, qty: 1 }] }));
    }
  };

  const removeItem = (id) => setForm(f => ({ ...f, items: f.items.filter(i => i.id !== id) }));
  const setItemQty = (id, qty) => setForm(f => ({ ...f, items: f.items.map(i => i.id === id ? { ...i, qty: Number(qty) || 1 } : i) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nick) { setError('Укажите ник'); return; }
    setSaving(true);
    const res = await apiFetch(isEdit ? `/api/barters/${barter.id}` : '/api/barters', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(form),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error); setSaving(false); return; }

    // Decrease inventory if admin and new barter
    if (!isEdit && isAdmin && form.items.length > 0) {
      await apiFetch('/api/inventory/decrease', {
        method: 'POST',
        body: JSON.stringify({ items: form.items.map(i => ({ id: i.id, warehouse: form.warehouse, qty: i.qty })) }),
      });
    }
    onSave();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'Редактировать' : 'Добавить бартер'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="section-divider">Блогер</div>
          <div className="form-row">
            <div className="field"><label>Ник *</label><input required value={form.nick} onChange={e => set('nick', e.target.value)} placeholder="@blogger" /></div>
            <div className="field"><label>Ссылка</label><input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://instagram.com/..." /></div>
          </div>
          <div className="form-row">
            <div className="field"><label>Город</label><input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Алматы" /></div>
            <div className="field"><label>Адрес</label><input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Улица, дом..." /></div>
          </div>
          <div className="field"><label>Номер для связи</label><input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+7 700 000 0000" /></div>

          <div className="section-divider">Товары</div>
          <div className="field">
            <label>Товары (текстом)</label>
            <textarea value={form.product||''} onChange={e => set('product', e.target.value)} placeholder="Напр: тушь, палетка 3в1 02, флюид 01" />
          </div>

          {isAdmin && (
            <>
              <div style={{fontSize:11,color:'#9ba3be',marginBottom:6,marginTop:4}}>Дополнительно — выбрать из склада (уменьшит остатки):</div>
              <div className="field">
                <label>Склад отправки</label>
                <select value={form.warehouse} onChange={e => set('warehouse', e.target.value)}>
                  {WAREHOUSES.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>
              {inventory.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {inventory.map(item => {
                      const qty = form.warehouse === 'astana' ? item.qty_astana : item.qty_almaty;
                      return (
                        <span key={item.id} onClick={() => qty > 0 && addItem(item)}
                          style={{ cursor: qty > 0 ? 'pointer' : 'not-allowed', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid #e2e6ef', background: qty > 0 ? '#f8f9fb' : '#f1f5f9', color: qty > 0 ? '#1a1d2e' : '#9ba3be' }}>
                          {item.name} <span style={{ color: qty > 3 ? '#16a34a' : qty > 0 ? '#d97706' : '#dc2626' }}>({qty})</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {form.items.length > 0 && (
                <div style={{ background: '#f8f9fb', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#9ba3be', marginBottom: 6 }}>Выбрано из склада:</div>
                  {form.items.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{item.name}</span>
                      <input type="number" value={item.qty} onChange={e => setItemQty(item.id, e.target.value)} min={1}
                        style={{ width: 50, padding: '2px 6px', fontSize: 12, border: '1px solid #e2e6ef', borderRadius: 4, textAlign: 'center' }} />
                      <span style={{ fontSize: 11, color: '#9ba3be' }}>шт</span>
                      <button type="button" onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="field"><label>Заметки</label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Дополнительная информация..." /></div>

          <div className="field">
            <label>Статус</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {error && <div className="error-msg">{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Сохраняем...' : isEdit ? 'Сохранить' : 'Добавить'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BarterPage({ currentUser }) {
  const [barters, setBarters] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editBarter, setEditBarter] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    const [b, inv] = await Promise.all([
      apiFetch('/api/barters').then(r => r.json()),
      apiFetch('/api/inventory').then(r => r.json()),
    ]);
    setBarters(Array.isArray(b) ? b : []);
    setInventory(Array.isArray(inv) ? inv : []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить запись?')) return;
    await apiFetch(`/api/barters/${id}`, { method: 'DELETE' });
    fetchAll();
  };

  const handleStatusToggle = async (b) => {
    const newStatus = b.status === 'transferred' ? 'delivered' : 'transferred';
    await apiFetch(`/api/barters/${b.id}`, { method: 'PUT', body: JSON.stringify({ ...b, status: newStatus }) });
    fetchAll();
  };

  const copyForLogist = (b) => {
    const warehouse = b.warehouse === 'astana' ? 'Астана' : 'Алматы';
    const itemsList = b.items?.length
      ? b.items.map(i => `- ${i.name} x${i.qty}`).join('\n')
      : b.product ? `- ${b.product}` : '—';
    const text = `Получатель: ${b.nick}
${b.city ? `Город: ${b.city}` : ''}
${b.address ? `Адрес: ${b.address}` : ''}
${b.phone ? `Телефон: ${b.phone}` : ''}
Склад: ${warehouse}
Товары:
${itemsList}
${b.notes ? `\nПримечание: ${b.notes}` : ''}`.trim();
    navigator.clipboard.writeText(text);
    setToast('Скопировано для логиста!');
  };

  const filtered = barters.filter(b => {
    const matchStatus = !statusFilter || b.status === statusFilter;
    const matchSearch = !search || b.nick.toLowerCase().includes(search.toLowerCase()) ||
      (b.product || '').toLowerCase().includes(search.toLowerCase()) ||
      (b.city || '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const stats = {
    transferred: barters.filter(b => b.status === 'transferred').length,
    delivered: barters.filter(b => b.status === 'delivered').length,
  };

  return (
    <div className="page">
      {toast && <Toast message={toast} type="success" onClose={() => setToast(null)} />}

      <div className="page-header">
        <div>
          <div className="page-title">🎁 Бартер</div>
          <div className="page-subtitle">{barters.length} записей</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditBarter(null); setShowForm(true); }}>+ Добавить</button>
      </div>

      <InventoryManager inventory={inventory} onUpdate={fetchAll} isAdmin={currentUser.role === 'admin'} />

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-value" style={{ color: '#1e40af' }}>{stats.transferred}</div><div className="stat-label">Передано в работу</div></div>
        <div className="stat-card"><div className="stat-value stat-green">{stats.delivered}</div><div className="stat-label">Доставлено</div></div>
      </div>

      <div className="toolbar">
        <input className="search-input" placeholder="🔍 Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="select-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Все статусы</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Дата</th>
              {currentUser.role === 'admin' && <th>Менеджер</th>}
              <th>Ник</th>
              <th>Город</th>
              <th>Адрес</th>
              <th>Телефон</th>
              <th>Товары</th>
              <th>Склад</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: '#9ba3be' }}>Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10}><div className="empty-state"><div style={{ fontSize: 36 }}>🎁</div><p>Бартеров пока нет</p></div></td></tr>
            ) : filtered.map(b => (
              <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => { setEditBarter(b); setShowForm(true); }}>
                <td style={{ fontSize: 11, color: '#9ba3be', whiteSpace: 'nowrap' }}>{new Date(b.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}</td>
                {currentUser.role === 'admin' && <td><span className="tag">{b.username || '—'}</span></td>}
                <td style={{ fontWeight: 500 }}>
                  {b.url ? <a href={b.url} target="_blank" rel="noreferrer" style={{ color: '#4f6ef7', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>{b.nick}</a> : b.nick}
                </td>
                <td style={{ fontSize: 12 }}>{b.city || '—'}</td>
                <td style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} title={b.address || ''}>{b.address || '—'}</td>
                <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{b.phone || '—'}</td>
                <td style={{ fontSize: 12, maxWidth: 150 }}>
                  {b.items?.length > 0 ? b.items.map(i => `${i.name} x${i.qty}`).join(', ') : b.product || '—'}
                </td>
                <td>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: b.warehouse === 'astana' ? '#dcfce7' : '#dbeafe', color: b.warehouse === 'astana' ? '#15803d' : '#1e40af' }}>
                    {b.warehouse === 'astana' ? 'Астана' : 'Алматы'}
                  </span>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  {(() => { const s = STATUSES.find(x => x.value === b.status) || STATUSES[0]; return (
                    <span onClick={() => handleStatusToggle(b)} style={{ cursor: 'pointer', display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
                      {s.label} ▾
                    </span>
                  ); })()}
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-secondary btn-sm" title="Скопировать для логиста" onClick={() => copyForLogist(b)}>📋</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(b.id)}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <BarterModal
          barter={editBarter}
          inventory={inventory}
          isAdmin={currentUser.role === 'admin'}
          onClose={() => { setShowForm(false); setEditBarter(null); }}
          onSave={() => { setShowForm(false); setEditBarter(null); fetchAll(); }}
        />
      )}
    </div>
  );
}
