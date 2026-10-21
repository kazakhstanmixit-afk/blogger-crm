import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';

const emptyTz = { label: '', url: '' };

function TzList({ tzList, onChange, readOnly }) {
  const add = () => onChange([...tzList, { ...emptyTz }]);
  const remove = (i) => onChange(tzList.filter((_, idx) => idx !== i));
  const update = (i, k, v) => {
    const next = [...tzList];
    next[i] = { ...next[i], [k]: v };
    onChange(next);
  };

  return (
    <div>
      {tzList.map((tz, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <input
            value={tz.label}
            onChange={e => update(i, 'label', e.target.value)}
            placeholder="Название (напр. Рилс)"
            style={{ width: 130, flexShrink: 0 }}
            readOnly={readOnly}
          />
          <input
            value={tz.url}
            onChange={e => update(i, 'url', e.target.value)}
            placeholder="https://docs.google.com/..."
            style={{ flex: 1 }}
            readOnly={readOnly}
          />
          {!readOnly && (
            <button type="button" onClick={() => remove(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>×</button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button type="button" onClick={add}
          style={{ fontSize: 12, color: '#4f6ef7', background: 'none', border: '1px dashed #c7d0e8', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', marginTop: 2 }}>
          + Добавить ТЗ
        </button>
      )}
    </div>
  );
}

function ProductModal({ product, onClose, onSave }) {
  const isEdit = !!product;
  const [form, setForm] = useState({
    article: product?.article || '',
    name: product?.name || '',
    tz_list: product?.tz_list?.length ? product.tz_list : [],
    notes: product?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const body = {
      ...form,
      tz_list: form.tz_list.filter(t => t.url.trim()),
    };
    const res = await apiFetch(isEdit ? `/api/products/${product.id}` : '/api/products', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setSaving(false); return; }
    onSave();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'Редактировать товар' : 'Добавить товар'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="field">
              <label>Артикул *</label>
              <input required value={form.article} onChange={e => set('article', e.target.value)} placeholder="148551914" style={{ fontFamily: 'monospace' }} />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label>Название товара *</label>
              <input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Крем для лица SPF 50" />
            </div>
          </div>
          <div className="field">
            <label>Технические задания</label>
            <TzList tzList={form.tz_list} onChange={v => set('tz_list', v)} />
          </div>
          <div className="field">
            <label>Заметки</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Дополнительная информация..." rows={2} />
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
          <div className="page-title">📦 Товары и ТЗ</div>
          <div className="page-subtitle">{products.length} товаров</div>
        </div>
        {currentUser.role === 'admin' && (
          <button className="btn btn-primary" onClick={() => { setEditProduct(null); setShowForm(true); }}>+ Добавить товар</button>
        )}
      </div>

      <div className="toolbar">
        <input className="search-input" placeholder="🔍 Поиск по артикулу или названию..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ba3be' }}>Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><div style={{ fontSize: 36 }}>📦</div><p>Товаров пока нет</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, padding: '4px 0 24px' }}>
          {filtered.map(p => {
            const tzList = p.tz_list || [];
            return (
              <div key={p.id} style={{
                background: '#fff',
                border: '1px solid #e8ecf4',
                borderRadius: 14,
                padding: '18px 20px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                transition: 'box-shadow 0.15s',
                cursor: currentUser.role === 'admin' ? 'pointer' : 'default',
              }}
                onClick={() => { if (currentUser.role === 'admin') { setEditProduct(p); setShowForm(true); } }}
                onMouseEnter={e => { if (currentUser.role === 'admin') e.currentTarget.style.boxShadow = '0 4px 16px rgba(79,110,247,0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1e2640', lineHeight: 1.3, marginBottom: 4 }}>{p.name}</div>
                    <div style={{
                      display: 'inline-block',
                      fontFamily: 'monospace',
                      fontSize: 11,
                      fontWeight: 600,
                      background: '#f0f3ff',
                      color: '#4f6ef7',
                      padding: '2px 8px',
                      borderRadius: 5,
                      border: '1px solid #dde3fb',
                    }}>{p.article}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: '#b0b8d0' }}>
                      {new Date(p.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                    </span>
                    {currentUser.role === 'admin' && (
                      <button className="btn btn-danger btn-sm"
                        onClick={e => { e.stopPropagation(); handleDelete(p.id); }}
                        style={{ padding: '2px 7px', fontSize: 12 }}>🗑</button>
                    )}
                  </div>
                </div>

                {/* TZ list */}
                {tzList.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }} onClick={e => e.stopPropagation()}>
                    {tzList.map((tz, i) => (
                      <a key={i} href={tz.url} target="_blank" rel="noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 10px',
                          background: '#f7f9ff',
                          border: '1px solid #e2e8f8',
                          borderRadius: 8,
                          textDecoration: 'none',
                          color: '#4f6ef7',
                          fontSize: 12,
                          fontWeight: 500,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#eef1ff'}
                        onMouseLeave={e => e.currentTarget.style.background = '#f7f9ff'}
                      >
                        <span style={{ fontSize: 14 }}>📄</span>
                        <span>{tz.label || `ТЗ ${i + 1}`}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#a0a8c0' }}>Открыть →</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#b0b8d0', fontStyle: 'italic' }}>ТЗ не добавлены</div>
                )}

                {/* Notes */}
                {p.notes && (
                  <div style={{ fontSize: 12, color: '#6b7494', background: '#fafbfd', borderRadius: 7, padding: '7px 10px', borderLeft: '3px solid #e2e6ef' }}>
                    {p.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
