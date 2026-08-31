import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';

export default function DuplicatesModal({ onClose, onDeleted }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(new Set());

  const fetch = async () => {
    setLoading(true);
    const res = await apiFetch('/api/bloggers/duplicates');
    setData(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const handleDelete = async (id) => {
    setDeleting(prev => new Set(prev).add(id));
    await apiFetch(`/api/bloggers/${id}`, { method: 'DELETE' });
    await fetch();
    onDeleted();
  };

  const totalGroups = data?.groups?.length || 0;
  const totalDupes = data?.total_duplicates || 0;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 700, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">🔍 Дубли в базе</div>
            {!loading && <div style={{ fontSize: 12, color: '#9ba3be', marginTop: 2 }}>
              {totalGroups > 0 ? `${totalGroups} групп дублей · ${totalDupes} блогеров` : 'Дублей не найдено'}
            </div>}
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ba3be' }}>Ищем дубли...</div>
          ) : totalGroups === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 36 }}>✅</div>
              <div style={{ color: '#16a34a', fontWeight: 500, marginTop: 8 }}>Дублей не найдено!</div>
              <div style={{ color: '#9ba3be', fontSize: 12, marginTop: 4 }}>База в порядке</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 0 16px' }}>
              {data.groups.map((group, gi) => (
                <div key={gi} style={{ border: '1px solid #fde68a', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ background: '#fffbeb', padding: '8px 14px', fontSize: 11, fontWeight: 600, color: '#92400e', borderBottom: '1px solid #fde68a' }}>
                    Группа {gi + 1} · {group.length} совпадения
                  </div>
                  {group.map((b, bi) => (
                    <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: bi < group.length - 1 ? '1px solid #f0f2f7' : 'none', background: '#fff' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{b.name}</div>
                        <div style={{ fontSize: 11, color: '#9ba3be', marginTop: 2 }}>
                          {b.instagram_url && <span style={{ marginRight: 8 }}>📸 {b.instagram_url}</span>}
                          {b.tiktok_url && <span>🎵 {b.tiktok_url}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ba3be', marginTop: 2 }}>
                          Добавлен: {new Date(b.created_at).toLocaleDateString('ru')}
                          {b.manager_name && ` · Менеджер: ${b.manager_name}`}
                          {b.status !== 'new' && ` · ${b.status}`}
                        </div>
                      </div>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={deleting.has(b.id)}
                        onClick={() => handleDelete(b.id)}
                        style={{ flexShrink: 0 }}
                      >
                        {deleting.has(b.id) ? '...' : '🗑 Удалить'}
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid #e2e6ef' }}>
          <button className="btn btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
