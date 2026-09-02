import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';

export default function ProductsPage({ currentUser }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);

  const fetchProducts = async () => {
    setLoading(true);
    const res = await apiFetch('/api/products');
    setProducts(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchProducts(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить товар?')) return;
    await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
    fetchProducts();
  };

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.article.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Товары и ТЗ</div>
          <div className="page-subtitle">{products.length} товаров</div>
        </div>
        {currentUser.role === 'admin' && (
          <button className="btn btn-primary" onClick={() => { setEditProduct(null); setShowForm(true); }}>+ Добавить товар</button>
        )}
      </div>

      <div className="toolbar">
        <input className="search-input" placeholder="🔍 Поиск по артикулу или названию..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="table-wrap">
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Артикул</th>
              <th>Название товара</th>
              <th>Ссылка на ТЗ</th>
              <th>Заметки</th>
              <th>Добавлен</th>
              {currentUser.role === 'admin' && <th></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#9ba3be' }}>Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6}><div className="empty-state"><div style={{ fontSize: 36 }}>📦</div><p>Товаров пока нет</p></div></td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} onClick={() => { if (currentUser.role === 'admin') { setEditProduct(p); setShowForm(true); } }} style={{ cursor: currentUser.role === 'admin' ? 'pointer' : 'default' }}>
                <td>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, background: '#f8f9fb', padding: '2px 8px', borderRadius: 4, border: '1px solid #e2e6ef' }}>
                    {p.article}
                  </span>
                </td>
                <td style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</td>
                <td onClick={e => e.stopPropagation()}>
                  {p.tz_url ? (
                    <a href={p.tz_url} target="_blank" rel="noreferrer"
                      style={{ color: '#4f6ef7', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                      📄 Открыть ТЗ
                    </a>
                  ) : <span style={{ color: '#9ba3be', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ fontSize: 12, color: '#9ba3be', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.notes || ''}>
                  {p.notes || '—'}
                </td>
                <td style={{ fontSize: 11, color: '#9ba3be', whiteSpace: 'nowrap' }}>
                  {new Date(p.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                </td>
                {currentUser.role === 'admin' && (
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>🗑</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ProductModal
          product={editProduct}
          onClose={() => { setShowForm(false); setEditProduct(null); }}
          onSave={() => { setShowForm(false); setEditProduct(null); fetchProducts(); }}
        />
      )}
    </div>
  );
}

function ProductModal({ product, onClose, onSave }) {
  const isEdit = !!product;
  const [form, setForm] = useState({
    article: product?.article || '',
    name: product?.name || '',
    tz_url: product?.tz_url || '',
    notes: product?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const res = await apiFetch(isEdit ? `/api/products/${product.id}` : '/api/products', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setSaving(false); return; }
    onSave();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'Редактировать товар' : 'Добавить товар'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Артикул *</label>
            <input required value={form.article} onChange={e => set('article', e.target.value)} placeholder="ABC-12345" style={{ fontFamily: 'monospace' }} />
          </div>
          <div className="field">
            <label>Название товара *</label>
            <input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Крем для лица SPF 50" />
          </div>
          <div className="field">
            <label>Ссылка на ТЗ</label>
            <input value={form.tz_url} onChange={e => set('tz_url', e.target.value)} placeholder="https://docs.google.com/..." />
          </div>
          <div className="field">
            <label>Заметки</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Дополнительная информация..." />
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
