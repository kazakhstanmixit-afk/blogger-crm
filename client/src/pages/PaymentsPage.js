import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';
import Toast from '../components/Toast';

const PAYMENT_STATUS = {
  pending: { label: 'К оплате', color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  submitted: { label: 'Подано', color: '#1e40af', bg: '#dbeafe', border: '#bfdbfe' },
  paid: { label: 'Оплачено', color: '#15803d', bg: '#dcfce7', border: '#bbf7d0' },
  rejected: { label: 'Отклонено', color: '#991b1b', bg: '#fee2e2', border: '#fecaca' },
};

function StatusBadge({ status }) {
  const s = PAYMENT_STATUS[status] || { label: status, color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:500, color:s.color, background:s.bg, border:`1px solid ${s.border}` }}>
      {s.label}
    </span>
  );
}

export default function PaymentsPage({ currentUser }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [editAmount, setEditAmount] = useState('');

  const fetchPayments = async () => {
    setLoading(true);
    setError('');
    try {
      const p = new URLSearchParams();
      if (statusFilter) p.set('status', statusFilter);
      const res = await apiFetch('/api/payments?' + p);
      if (!res.ok) { setError('Ошибка загрузки: ' + res.status); setLoading(false); return; }
      const data = await res.json();
      setPayments(Array.isArray(data) ? data : []);
      setSelected(new Set());
    } catch(e) { setError('Ошибка соединения: ' + e.message); }
    setLoading(false);
  };

  useEffect(() => { fetchPayments(); }, [statusFilter]);

  const handleStatusChange = async (id, status) => {
    await apiFetch(`/api/payments/${id}`, { method:'PUT', body: JSON.stringify({ status }) });
    fetchPayments();
    setToast(`Статус изменён на «${PAYMENT_STATUS[status]?.label}»`);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить заявку?')) return;
    await apiFetch(`/api/payments/${id}`, { method:'DELETE' });
    fetchPayments();
  };

  const handleBulkStatus = async (status) => {
    if (!selected.size) return;
    if (!window.confirm(`Изменить статус у ${selected.size} заявок на «${PAYMENT_STATUS[status]?.label}»?`)) return;
    for (const id of selected) {
      await apiFetch(`/api/payments/${id}`, { method:'PUT', body: JSON.stringify({ status }) });
    }
    setToast(`Обновлено ${selected.size} заявок`);
    fetchPayments();
  };

  const handleBulkDelete = async () => {
    if (!selected.size) return;
    if (!window.confirm(`Удалить ${selected.size} заявок?`)) return;
    for (const id of selected) {
      await apiFetch(`/api/payments/${id}`, { method:'DELETE' });
    }
    setToast(`Удалено ${selected.size} заявок`);
    fetchPayments();
  };

  const handleExport = async () => {
    const token = localStorage.getItem('token');
    const p = new URLSearchParams();
    if (statusFilter) p.set('status', statusFilter);
    const res = await fetch((process.env.REACT_APP_API_URL||'') + '/api/payments/export?' + p, { headers:{ Authorization:`Bearer ${token}` } });
    const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'payments.xlsx'; a.click();
  };

  const handleExportPDF = () => {
    const pending = payments.filter(p => p.status === 'pending');
    const LABELS = { pending:'К оплате', submitted:'Подано', paid:'Оплачено', rejected:'Отклонено' };
    const date = new Date().toLocaleDateString('ru');

    const pendingAmount = payments.filter(p=>p.status==='pending').reduce((s,p)=>s+(p.amount||0),0);
    const submittedAmount = payments.filter(p=>p.status==='submitted').reduce((s,p)=>s+(p.amount||0),0);
    const paidAmount = payments.filter(p=>p.status==='paid').reduce((s,p)=>s+(p.amount||0),0);

    const rows = pending.map((p, i) => `
      <tr>
        <td>${i+1}</td>
        <td>${p.blogger_name||'—'}</td>
        <td>${p.manager_name||'—'}</td>
        <td>${p.recipient_name}</td>
        <td style="font-family:monospace;letter-spacing:1px">${p.iin}</td>
        <td>${p.payment_name||'—'}</td>
        <td>${p.kaspi||'—'}</td>
        <td style="text-align:right;font-weight:600">${(p.amount||0).toLocaleString('ru')} ₸</td>
        <td>${p.notes||'—'}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Счёт на оплату</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
  h2 { font-size: 16px; margin-bottom: 4px; }
  .meta { color: #666; margin-bottom: 16px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f0f2f7; padding: 7px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; border: 1px solid #ddd; }
  td { padding: 6px 8px; border: 1px solid #e2e6ef; vertical-align: top; }
  tr:nth-child(even) { background: #f8f9fb; }
  .summary { display: flex; gap: 24px; margin-top: 16px; border-top: 2px solid #e2e6ef; padding-top: 12px; }
  .summary-item { text-align: center; }
  .summary-item .label { font-size: 10px; text-transform: uppercase; color: #999; margin-bottom: 4px; }
  .summary-item .value { font-size: 15px; font-weight: 700; }
  .pending { color: #d97706; }
  .submitted { color: #1e40af; }
  .paid { color: #15803d; }
  @media print { body { margin: 10px; } }
</style>
</head>
<body>
<h2>Счёт на оплату — К оплате</h2>
<div class="meta">Дата: ${date} · Записей: ${pending.length}</div>
<table>
  <thead>
    <tr>
      <th>#</th><th>Блогер</th><th>Менеджер</th><th>ФИО получателя</th>
      <th>ИИН</th><th>ФИО при пополнении</th><th>Каспи</th>
      <th>Сумма</th><th>Заметки</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="summary">
  <div class="summary-item">
    <div class="label">К оплате (${payments.filter(p=>p.status==='pending').length} заявок)</div>
    <div class="value pending">${pendingAmount.toLocaleString('ru')} ₸</div>
  </div>
  <div class="summary-item">
    <div class="label">Подано (${payments.filter(p=>p.status==='submitted').length} заявок)</div>
    <div class="value submitted">${submittedAmount.toLocaleString('ru')} ₸</div>
  </div>
  <div class="summary-item">
    <div class="label">Оплачено (${payments.filter(p=>p.status==='paid').length} заявок)</div>
    <div class="value paid">${paidAmount.toLocaleString('ru')} ₸</div>
  </div>
</div>
</body>
</html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  const handleSaveAmount = async (id) => {
    if (!editAmount || Number(editAmount) <= 0) { setEditingId(null); return; }
    await apiFetch(`/api/payments/${id}`, { method:'PUT', body: JSON.stringify({ amount: Number(editAmount) }) });
    setEditingId(null);
    setEditAmount('');
    setToast('Сумма обновлена');
    fetchPayments();
  };

  const toggleSelect = (id) => setSelected(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleAll = () => { if(selected.size===payments.length) setSelected(new Set()); else setSelected(new Set(payments.map(p=>p.id))); };

  const stats = {
    pending: payments.filter(p=>p.status==='pending').length,
    submitted: payments.filter(p=>p.status==='submitted').length,
    paid: payments.filter(p=>p.status==='paid').length,
    paidAmount: payments.filter(p=>p.status==='paid').reduce((s,p)=>s+(p.amount||0),0),
    totalAmount: payments.filter(p=>p.status!=='rejected').reduce((s,p)=>s+(p.amount||0),0),
  };

  return (
    <div className="page">
      {toast && <Toast message={toast} type="success" onClose={()=>setToast(null)} />}

      <div className="page-header">
        <div>
          <div className="page-title">Заявки на оплату</div>
          <div className="page-subtitle">{payments.length} заявок</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {currentUser.role==='admin' && <button className="btn btn-secondary btn-sm" onClick={handleExport}>📊 Excel</button>}
          {currentUser.role==='admin' && <button className="btn btn-secondary btn-sm" onClick={handleExportPDF}>📄 PDF</button>}
        </div>
      </div>

      {error && <div className="error-msg" style={{marginBottom:12}}>{error}</div>}

      {currentUser.role==='admin' && (
        <div className="stats-grid" style={{marginBottom:16}}>
          <div className="stat-card"><div className="stat-value stat-yellow">{stats.pending}</div><div className="stat-label">К оплате</div></div>
          <div className="stat-card"><div className="stat-value" style={{color:'#1e40af'}}>{stats.submitted}</div><div className="stat-label">Подано</div></div>
          <div className="stat-card"><div className="stat-value stat-green">{stats.paid}</div><div className="stat-label">Оплачено</div></div>
          <div className="stat-card"><div className="stat-value" style={{fontSize:18}}>{stats.paidAmount.toLocaleString('ru')} ₸</div><div className="stat-label">Выплачено</div></div>
          <div className="stat-card"><div className="stat-value" style={{fontSize:16,color:'#4f6ef7'}}>{stats.totalAmount.toLocaleString('ru')} ₸</div><div className="stat-label">Итого к выплате</div></div>
        </div>
      )}

      <div className="toolbar">
        <select className="select-filter" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(PAYMENT_STATUS).map(([v,s])=><option key={v} value={v}>{s.label}</option>)}
        </select>
      </div>

      {selected.size > 0 && currentUser.role==='admin' && (
        <div style={{background:'#eef1fe',border:'1px solid #c7d2fe',borderRadius:8,padding:'10px 16px',marginBottom:10,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <span style={{fontSize:13,fontWeight:500,color:'#3730a3'}}>Выбрано: {selected.size}</span>
          <button className="btn btn-sm" style={{background:'#dbeafe',color:'#1e40af',border:'1px solid #bfdbfe'}} onClick={()=>handleBulkStatus('submitted')}>Подано</button>
          <button className="btn btn-sm" style={{background:'#dcfce7',color:'#15803d',border:'1px solid #bbf7d0'}} onClick={()=>handleBulkStatus('paid')}>Оплачено</button>
          <button className="btn btn-sm" style={{background:'#fee2e2',color:'#991b1b',border:'1px solid #fecaca'}} onClick={()=>handleBulkStatus('rejected')}>Отклонить</button>
          <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>🗑 Удалить</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>setSelected(new Set())}>Снять выделение</button>
        </div>
      )}

      <div className="table-wrap" style={{overflowX:'auto'}}>
        <table style={{minWidth:900}}>
          <thead>
            <tr>
              {currentUser.role==='admin' && <th style={{width:32}}><input type="checkbox" className="in-work-check" checked={selected.size===payments.length&&payments.length>0} onChange={toggleAll} /></th>}
              <th>Дата</th>
              {currentUser.role==='admin' && <th>Менеджер</th>}
              <th>Блогер</th>
              <th>ФИО получателя</th>
              <th>ИИН</th>
              <th>ФИО при пополнении</th>
              <th>Каспи</th>
              <th>Сумма</th>
              <th>Статус</th>
              <th>Заметки</th>
              {currentUser.role==='admin' && <th>Действия</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={{textAlign:'center',padding:40,color:'#9ba3be'}}>Загрузка...</td></tr>
            ) : payments.length===0 ? (
              <tr><td colSpan={12}><div className="empty-state"><div style={{fontSize:36}}>💳</div><p>Заявок пока нет</p></div></td></tr>
            ) : payments.map(p=>(
              <tr key={p.id} style={{background:selected.has(p.id)?'#eef1fe':p.status==='paid'?'#f0fdf4':p.status==='rejected'?'#fff5f5':undefined}}>
                {currentUser.role==='admin' && <td onClick={e=>e.stopPropagation()}><input type="checkbox" className="in-work-check" checked={selected.has(p.id)} onChange={()=>toggleSelect(p.id)} /></td>}
                <td style={{fontSize:11,color:'#9ba3be',whiteSpace:'nowrap'}}>{new Date(p.created_at).toLocaleDateString('ru')}</td>
                {currentUser.role==='admin' && <td><span className="tag">{p.manager_name||'—'}</span></td>}
                <td style={{fontWeight:500}}>{p.blogger_name||'—'}</td>
                <td>{p.recipient_name}</td>
                <td style={{fontFamily:'monospace',letterSpacing:1,fontSize:12}}>{p.iin}</td>
                <td>{p.payment_name||'—'}</td>
                <td style={{fontSize:12}}>{p.kaspi||'—'}</td>
                <td style={{fontWeight:600,whiteSpace:'nowrap'}}>
                  {editingId===p.id ? (
                    <div style={{display:'flex',gap:4,alignItems:'center'}}>
                      <input type="number" value={editAmount} onChange={e=>setEditAmount(e.target.value)}
                        autoFocus onKeyDown={e=>{if(e.key==='Enter')handleSaveAmount(p.id);if(e.key==='Escape')setEditingId(null);}}
                        style={{width:100,padding:'2px 6px',fontSize:12,border:'1px solid #4f6ef7',borderRadius:4,outline:'none'}} />
                      <button className="btn btn-primary btn-sm" onClick={()=>handleSaveAmount(p.id)}>✓</button>
                      <button className="btn btn-secondary btn-sm" onClick={()=>setEditingId(null)}>×</button>
                    </div>
                  ) : (
                    <span onClick={()=>{if(currentUser.role==='admin'){setEditingId(p.id);setEditAmount(p.amount);}}}
                      style={{cursor:currentUser.role==='admin'?'pointer':'default',borderBottom:currentUser.role==='admin'?'1px dashed #c8cfe0':'none',paddingBottom:1}}>
                      {(p.amount||0).toLocaleString('ru')} ₸
                    </span>
                  )}
                </td>
                <td><StatusBadge status={p.status} /></td>
                <td style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11,color:'#9ba3be'}} title={p.notes||''}>{p.notes||'—'}</td>
                {currentUser.role==='admin' && (
                  <td>
                    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                      {p.status==='pending' && <>
                        <button className="btn btn-sm" style={{background:'#dbeafe',color:'#1e40af',border:'1px solid #bfdbfe'}} onClick={()=>handleStatusChange(p.id,'submitted')}>Подано</button>
                        <button className="btn btn-sm" style={{background:'#fee2e2',color:'#991b1b',border:'1px solid #fecaca'}} onClick={()=>handleStatusChange(p.id,'rejected')}>Отклонить</button>
                      </>}
                      {p.status==='submitted' && <button className="btn btn-sm" style={{background:'#dcfce7',color:'#15803d',border:'1px solid #bbf7d0'}} onClick={()=>handleStatusChange(p.id,'paid')}>Оплачено</button>}
                      {p.status==='rejected' && <button className="btn btn-sm" style={{background:'#fef3c7',color:'#92400e',border:'1px solid #fde68a'}} onClick={()=>handleStatusChange(p.id,'pending')}>Вернуть</button>}
                      <button className="btn btn-danger btn-sm" onClick={()=>handleDelete(p.id)}>🗑</button>
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
