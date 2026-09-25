import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';

const PAYMENT_TYPES = [
  { value: '', label: '— Не выбрано —' },
  { value: 'cash', label: 'Наличные' },
  { value: 'ip', label: 'ИП' },
  { value: 'selfemployed', label: 'Самозанятость' },
];

function EditableNum({ value, onSave, prefix, suffix }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || '');
  const save = () => { setEditing(false); onSave(val); };
  if (editing) return (
    <input type="number" value={val} onChange={e => setVal(e.target.value)} autoFocus
      onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
      style={{ width: 80, padding: '2px 6px', fontSize: 12, border: '1px solid #4f6ef7', borderRadius: 4, outline: 'none' }} />
  );
  return (
    <span onClick={() => setEditing(true)} style={{ cursor: 'text', borderBottom: '1px dashed #c8cfe0', paddingBottom: 1, fontSize: 12 }}>
      {value ? `${prefix || ''}${Number(value).toLocaleString('ru')}${suffix || ''}` : <span style={{ color: '#9ba3be' }}>— добавить</span>}
    </span>
  );
}

function EditableText({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || '');
  const save = () => { setEditing(false); onSave(val); };
  if (editing) return (
    <textarea value={val} onChange={e => setVal(e.target.value)} autoFocus onBlur={save}
      style={{ width: '100%', minHeight: 60, padding: '4px 8px', fontSize: 12, border: '1px solid #4f6ef7', borderRadius: 4, outline: 'none', resize: 'vertical' }} />
  );
  return (
    <div onClick={() => setEditing(true)} style={{ cursor: 'text', fontSize: 12, color: value ? '#1a1d2e' : '#9ba3be', borderBottom: '1px dashed #c8cfe0', paddingBottom: 1, minHeight: 20, whiteSpace: 'pre-wrap' }}>
      {value || '— добавить условия'}
    </div>
  );
}

export default function ExclusivePage() {
  const [bloggers, setBloggers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchExclusive = async () => {
    setLoading(true);
    const res = await apiFetch('/api/exclusive');
    setBloggers(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchExclusive(); }, []);

  const updateExclusive = async (bloggerId, updates) => {
    const current = bloggers.find(b => b.id === bloggerId);
    await apiFetch(`/api/exclusive/${bloggerId}`, {
      method: 'PUT',
      body: JSON.stringify({
        payment_type: current.payment_type || null,
        video_qty: current.video_qty || 0,
        video_price: current.video_price || 0,
        conditions: current.conditions || null,
        ...updates,
      }),
    });
    fetchExclusive();
  };

  const totalMonthly = bloggers.reduce((s, b) => s + (b.total_monthly || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">⭐ Кандидаты на эксклюзив</div>
          <div className="page-subtitle">{bloggers.length} блогеров · Итого в месяц: {totalMonthly.toLocaleString('ru')} ₸</div>
        </div>
      </div>

      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <th>Ник</th>
              <th>Instagram</th>
              <th>TikTok</th>
              <th>Охват Инст</th>
              <th>Охват ТТ</th>
              <th>Тип оплаты</th>
              <th>Кол-во видео</th>
              <th>Оплата за видео</th>
              <th>Итого/мес</th>
              <th>Условия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: '#9ba3be' }}>Загрузка...</td></tr>
            ) : bloggers.length === 0 ? (
              <tr><td colSpan={10}>
                <div className="empty-state">
                  <div style={{ fontSize: 36 }}>⭐</div>
                  <p>Нет кандидатов. Отметь галочку ⭐ у блогеров в разделе "Блогеры"</p>
                </div>
              </td></tr>
            ) : bloggers.map(b => (
              <tr key={b.id}>
                <td style={{ fontWeight: 600, fontSize: 13 }}>{b.name}</td>
                <td>
                  {b.instagram_url
                    ? <a href={b.instagram_url} target="_blank" rel="noreferrer" style={{ color: '#4f6ef7', fontSize: 11 }}>📸 Профиль</a>
                    : <span style={{ color: '#9ba3be', fontSize: 11 }}>—</span>}
                </td>
                <td>
                  {b.tiktok_url
                    ? <a href={b.tiktok_url} target="_blank" rel="noreferrer" style={{ color: '#4f6ef7', fontSize: 11 }}>🎵 Профиль</a>
                    : <span style={{ color: '#9ba3be', fontSize: 11 }}>—</span>}
                </td>
                <td style={{ fontSize: 12 }}>{b.instagram_avg_reach ? b.instagram_avg_reach.toLocaleString('ru') : '—'}</td>
                <td style={{ fontSize: 12 }}>{b.tiktok_avg_reach ? b.tiktok_avg_reach.toLocaleString('ru') : '—'}</td>
                <td>
                  <select value={b.payment_type || ''}
                    onChange={e => updateExclusive(b.id, { payment_type: e.target.value || null })}
                    style={{ fontSize: 12, padding: '3px 6px', border: '1px solid #e2e6ef', borderRadius: 6, outline: 'none' }}>
                    {PAYMENT_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </td>
                <td>
                  <EditableNum value={b.video_qty} suffix=" шт"
                    onSave={v => updateExclusive(b.id, { video_qty: Number(v) || 0 })} />
                </td>
                <td>
                  <EditableNum value={b.video_price} suffix=" ₸"
                    onSave={v => updateExclusive(b.id, { video_price: Number(v) || 0 })} />
                </td>
                <td style={{ fontWeight: 700, color: b.total_monthly > 0 ? '#15803d' : '#9ba3be', whiteSpace: 'nowrap' }}>
                  {b.total_monthly > 0 ? `${b.total_monthly.toLocaleString('ru')} ₸` : '—'}
                </td>
                <td style={{ minWidth: 200 }}>
                  <EditableText value={b.conditions}
                    onSave={v => updateExclusive(b.id, { conditions: v || null })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
