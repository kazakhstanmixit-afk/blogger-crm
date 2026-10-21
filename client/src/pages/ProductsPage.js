import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';

const emptyTz = { label: '', url: '' };

function TzList({ tzList, onChange }) {
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
          <input value={tz.label} onChange={e => update(i, 'label', e.target.value)}
            placeholder="Название (Рилс, Сторис...)" style={{ width: 150, flexShrink: 0 }} />
          <input value={tz.url} onChange={e => update(i, 'url', e.target.value)}
            placeholder="https://docs.google.com/..." style={{ flex: 1 }} />
          <button type="button" onClick={() => remove(i)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>×</button>
        </div>
      ))}
      <button type="button" onClick={add}
        style={{ fontSize: 12, color: '#4f6ef7', background: 'none', border: '1px dashed #c7d0e8', borderRadius: 6, padding: '4px 14px', cursor: 'pointer', marginTop: 2 }}>
        + Добавить вариант ТЗ
      </button>
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
    const res = await apiFetch(isEdit ? `/api/products/${product.id}` : '/api/products', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify({ ...form, tz_list: form.tz_list.filter(t => t.url.trim()) }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setSaving(false); return; }
    onSave();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'Редактировать товар' : 'Добавить товар'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="field" style={{ flex: 2 }}>
              <label>Название товара *</label>
              <input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Тональный флюид" />
            </div>
            <div className="field">
              <label>Артикул *</label>
              <input required value={form.article} onChange={e => set('article', e.target.value)} placeholder="148551914" style={{ fontFamily: 'monospace' }} />
            </div>
          </div>
          <div className="field">
            <label>Варианты ТЗ</label>
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

function ProductRow({ p, isAdmin, onEdit, onDelete }) {
  const tzList = p.tz_list || [];
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #eaeef6',
      borderRadius: 10,
      marginBottom: 8,
      overflow: 'hidden',
    }}>
      {/* Main row */}
      <div
        onClick={() => isAdmin && onEdit(p)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px',
          cursor: isAdmin ? 'pointer' : 'default',
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { if (isAdmin) e.currentTarget.style.background = '#f7f9ff'; }}
        onMouseLeave={e => { e.currentTarget.style.background = ''; }}
      >
        <span style={{ fontSize: 16 }}>📦</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#1e2640' }}>{p.name}</span>
          {p.notes && (
            <span style={{ fontSize: 11, color: '#9ba3be', marginLeft: 8 }}>{p.notes}</span>
          )}
        </div>
        <span style={{
          fontFamily: 'monospace', fontSize: 11, fontWeight: 600,
          background: '#f0f3ff', color: '#4f6ef7',
          padding: '2px 8px', borderRadius: 5, border: '1px solid #dde3fb',
          flexShrink: 0,
        }}>{p.article}</span>
        <span style={{ fontSize: 11, color: '#c0c7d8', flexShrink: 0 }}>
          {new Date(p.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
        </span>
        {isAdmin && (
          <button className="btn btn-danger btn-sm"
            onClick={e => { e.stopPropagation(); onDelete(p.id); }}
            style={{ padding: '2px 7px', fontSize: 11, flexShrink: 0 }}>🗑</button>
        )}
      </div>

      {/* TZ variants */}
      {tzList.length > 0 && (
        <div style={{
          borderTop: '1px solid #f0f2f8',
          padding: '8px 16px 10px 44px',
          display: 'flex', flexWrap: 'wrap', gap: 6,
        }}
          onClick={e => e.stopPropagation()}
        >
          {tzList.map((tz, i) => (
            <a key={i} href={tz.url} target="_blank" rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 12px',
                background: '#f5f7ff', border: '1px solid #dde3fb',
                borderRadius: 20, textDecoration: 'none',
                color: '#4f6ef7', fontSize: 12, fontWeight: 500,
                transition: 'background 0.1s, border-color 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#eaedff'; e.currentTarget.style.borderColor = '#b8c3f7'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f5f7ff'; e.currentTarget.style.borderColor = '#dde3fb'; }}
            >
              📄 {tz.label || `ТЗ ${i + 1}`}
            </a>
          ))}
        </div>
      )}
      {tzList.length === 0 && (
        <div style={{ borderTop: '1px solid #f0f2f8', padding: '6px 16px 8px 44px' }}>
          <span style={{ fontSize: 12, color: '#c8cedf', fontStyle: 'italic' }}>ТЗ не добавлены</span>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage({ currentUser }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const isAdmin = currentUser.role === 'admin';

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
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => { setEditProduct(null); setShowForm(true); }}>+ Добавить товар</button>
        )}
      </div>

      <div className="toolbar">
        <input className="search-input" placeholder="🔍 Поиск по артикулу или названию..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div style={{ marginTop: 8 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ba3be' }}>Загрузка...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><div style={{ fontSize: 36 }}>📦</div><p>Товаров пока нет</p></div>
        ) : filtered.map(p => (
          <ProductRow key={p.id} p={p} isAdmin={isAdmin}
            onEdit={prod => { setEditProduct(prod); setShowForm(true); }}
            onDelete={handleDelete}
          />
        ))}
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
