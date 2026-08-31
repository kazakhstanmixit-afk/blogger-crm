import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';

const PAYMENT_STATUS = {
  pending: { label: 'К оплате', color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  submitted: { label: 'Подано', color: '#1e40af', bg: '#dbeafe', border: '#bfdbfe' },
  paid: { label: 'Оплачено', color: '#15803d', bg: '#dcfce7', border: '#bbf7d0' },
  rejected: { label: 'Отклонено', color: '#991b1b', bg: '#fee2e2', border: '#fecaca' },
};

function StatusBadge({ status }) {
  const s = PAYMENT_STATUS[status] || { label: status, color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  );
}

export default function PaymentsPage({ currentUser }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');

  const fetchPayments = async () => {
    setLoading(true);
    setError('');
    try {
      const p = new URLSearchParams();
      if (statusFilter) p.set('status', statusFilter);
      const res = await apiFetch('/api/payments?' + p);
      if (!res.ok) {
        setError('Ошибка загрузки: ' + res.status);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setPayments(Array.isArray(data) ? data : []);
    } catch (e) {
      setError('Ошибка соединения');
    }
    setLoading(false);
  };

  useEffect(() => { fetchPayments(); }, [statusFilter]);

  const handleStatusChange = async (id, status) => {
    const res = await apiFetch(`/api/payments/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    if (res.ok) fetchPayments();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить заявку?')) return;
    await apiFetch(`/api/payments/${id}`, { method: 'DELETE' });
    fetchPayments();
  };

  const handleExport = async () => {
    const token = localStorage.getItem('token');
    const p = new URLSearchParams();
    if (statusFilter) p.set('status', statusFilter);
    const res = await fetch((process.env.REACT_APP_API_URL || '') + '/api/payments/export?' + p, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'payments.xlsx';
    a.click();
  };

  const stats = {
    pending: payments.filter(p => p.status === 'pending').length,
    submitted: payments.filter(p => p.status === 'submitted').length,
    paid: payments.filter(p => p.status === 'paid').length,
    paidAmount: payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0),
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Заявки на оплату</div>
          <div className="page-subtitle">{payments.length} заявок</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {currentUser.role === 'admin' && (
            <button className="btn btn-secondary btn-sm" onClick={handleExport}>📊 Excel</button>
          )}
        </div>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

      {currentUser.role === 'admin' && (
        <div className="stats-grid" style={{ marginBottom: 16 }}>
          <div className="stat-card"><div className="stat-value stat-yellow">{stats.pending}</div><div className="stat-label">К оплате</div></div>
          <div className="stat-card"><div className="stat-value" style={{ color: '#1e40af' }}>{stats.submitted}</div><div className="stat-label">Подано</div></div>
          <div className="stat-card"><div className="stat-value stat-green">{stats.paid}</div><div className="stat-label">Оплачено</div></div>
          <div className="stat-card"><div className="stat-value" style={{ fontSize: 18 }}>{stats.paidAmount.toLocaleString('ru')} ₸</div><div className="stat-label">Выплачено</div></div>
        </div>
      )}

      <div className="toolbar">
        <select className="select-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(PAYMENT_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
        </select>
      </div>

      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Дата</th>
              {currentUser.role === 'admin' && <th>Менеджер</th>}
              <th>Блогер</th>
              <th>ФИО получателя</th>
              <th>ИИН</th>
              <th>ФИО при пополнении</th>
              <th>Каспи</th>
              <th>Сумма</th>
              <th>Статус</th>
              <th>Заметки</th>
              {currentUser.role === 'admin' && <th>Действия</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: '#9ba3be' }}>Загрузка...</td></tr>
            ) : payments.length === 0 ? (
              <tr><td colSpan={11}><div className="empty-state"><div style={{ fontSize: 36 }}>💳</div><p>Заявок пока нет</p></div></td></tr>
            ) : payments.map(p => (
              <tr key={p.id} style={{ background: p.status === 'paid' ? '#f0fdf4' : p.status === 'rejected' ? '#fff5f5' : undefined }}>
                <td style={{ fontSize: 11, color: '#9ba3be', whiteSpace: 'nowrap' }}>{new Date(p.created_at).toLocaleDateString('ru')}</td>
                {currentUser.role === 'admin' && <td><span className="tag">{p.manager_name || '—'}</span></td>}
                <td style={{ fontWeight: 500 }}>{p.blogger_name || '—'}</td>
                <td>{p.recipient_name}</td>
                <td style={{ fontFamily: 'monospace', letterSpacing: 1, fontSize: 12 }}>{p.iin}</td>
                <td>{p.payment_name || '—'}</td>
                <td style={{ fontSize: 12 }}>{p.kaspi || '—'}</td>
                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{(p.amount || 0).toLocaleString('ru')} ₸</td>
                <td><StatusBadge status={p.status} /></td>
                <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: '#9ba3be' }} title={p.notes || ''}>{p.notes || '—'}</td>
                {currentUser.role === 'admin' && (
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {p.status === 'pending' && <>
                        <button className="btn btn-sm" style={{ background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' }} onClick={() => handleStatusChange(p.id, 'submitted')}>Подано</button>
                        <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }} onClick={() => handleStatusChange(p.id, 'rejected')}>Отклонить</button>
                      </>}
                      {p.status === 'submitted' && (
                        <button className="btn btn-sm" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }} onClick={() => handleStatusChange(p.id, 'paid')}>Оплачено</button>
                      )}
                      {p.status === 'rejected' && (
                        <button className="btn btn-sm" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }} onClick={() => handleStatusChange(p.id, 'pending')}>Вернуть</button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>🗑</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
