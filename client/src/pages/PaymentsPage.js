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

function ApprovalCell({ payment, isAdmin, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(payment.approval_url || '');

  const handleSave = async () => {
    await apiFetch(`/api/payments/${payment.id}`, { method: 'PUT', body: JSON.stringify({ approval_url: val || null }) });
    setEditing(false);
    onSave();
  };

  if (editing) {
    return (
      <div style={{display:'flex',gap:4,alignItems:'center'}}>
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setVal(payment.approval_url||''); setEditing(false); } }}
          placeholder="https://..."
          style={{width:160,fontSize:11,padding:'3px 6px',border:'1px solid #4f6ef7',borderRadius:4,outline:'none'}}
        />
        <button className="btn btn-primary btn-sm" onClick={handleSave}>✓</button>
        <button className="btn btn-secondary btn-sm" onClick={() => { setVal(payment.approval_url||''); setEditing(false); }}>×</button>
      </div>
    );
  }

  if (payment.approval_url) {
    return (
      <div style={{display:'flex',alignItems:'center',gap:4}}>
        <a href={payment.approval_url} target="_blank" rel="noreferrer" style={{color:'#4f6ef7',fontSize:11}}>🔗 Открыть</a>
        {isAdmin && <span onClick={() => setEditing(true)} style={{cursor:'pointer',color:'#9ba3be',fontSize:10,borderBottom:'1px dashed #c8cfe0'}}>изм.</span>}
      </div>
    );
  }

  if (isAdmin) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="btn btn-sm"
        style={{fontSize:11,padding:'3px 10px',background:'#eef1fe',color:'#4f6ef7',border:'1px solid #c7d2fe'}}>
        + Добавить
      </button>
    );
  }

  return <span style={{color:'#9ba3be',fontSize:11}}>—</span>;
}

function ReceiptCell({ payment, type, onUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const fileRef = React.useRef();
  const key = type === 'video' ? 'receipts_video' : type === 'product' ? 'receipts_product' : 'receipts';
  const receipts = payment[key] || [];

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const token = localStorage.getItem('token');
    const fd = new FormData();
    fd.append('file', file);
    const receiptType = type || 'general';
    const res = await fetch((process.env.REACT_APP_API_URL||'') + `/api/payments/${payment.id}/receipt?receipt_type=${receiptType}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: fd,
    });
    setUploading(false);
    if (res.ok) onUpdate();
    e.target.value = '';
  };

  const handleDelete = async (public_id) => {
    if (!window.confirm('Удалить чек?')) return;
    setDeleting(public_id);
    const token = localStorage.getItem('token');
    await fetch((process.env.REACT_APP_API_URL||'') + `/api/payments/${payment.id}/receipt`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_id, receipt_type: type }),
    });
    setDeleting(null);
    onUpdate();
  };

  return (
    <div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center'}}>
      {receipts.map((r,i) => (
        <div key={i} style={{position:'relative',display:'inline-block'}}>
          <a href={r.url} target="_blank" rel="noreferrer">
            <img src={r.url} alt="чек" style={{width:44,height:44,objectFit:'cover',borderRadius:4,border:'1px solid #e2e6ef',cursor:'pointer',opacity:deleting===r.public_id?0.5:1}} />
          </a>
          <span onClick={()=>handleDelete(r.public_id)}
            style={{position:'absolute',top:-4,right:-4,background:'#dc2626',color:'#fff',borderRadius:'50%',width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,cursor:'pointer',lineHeight:1}}>
            ×
          </span>
        </div>
      ))}
      <label style={{cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',width:44,height:44,borderRadius:4,border:'2px dashed #c7d2fe',background:'#eef1fe',color:'#4f6ef7',fontSize:18,flexShrink:0}}>
        {uploading ? '⏳' : '+'}
        <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleUpload} />
      </label>
    </div>
  );
}

function KaspiCell({ payment, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(payment.kaspi || '');

  const handleSave = async () => {
    setEditing(false);
    await apiFetch(`/api/payments/${payment.id}`, {
      method: 'PUT',
      body: JSON.stringify({ kaspi: val || null }),
    });
    onUpdate();
  };

  if (editing) return (
    <div style={{display:'flex',gap:4,alignItems:'center'}}>
      <input value={val} onChange={e=>setVal(e.target.value.replace(/\D/g,'').slice(0,11))}
        autoFocus onBlur={handleSave} onKeyDown={e=>{if(e.key==='Enter')handleSave();if(e.key==='Escape')setEditing(false);}}
        placeholder="77001234567" style={{width:110,padding:'2px 6px',fontSize:12,border:'1px solid #4f6ef7',borderRadius:4,outline:'none',fontFamily:'monospace'}} />
    </div>
  );
  return (
    <span onClick={()=>setEditing(true)}
      style={{cursor:'text',borderBottom:'1px dashed #c8cfe0',paddingBottom:1,fontSize:12,fontFamily:'monospace',color:val?'#1a1d2e':'#9ba3be'}}>
      {val || '+ добавить'}
    </span>
  );
}

export default function PaymentsPage({ currentUser }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('');
  const [approvalExistsFilter, setApprovalExistsFilter] = useState(''); // 'yes' | 'no' | ''
  const [groupColors, setGroupColors] = useState(() => {
    try { return JSON.parse(localStorage.getItem('approvalGroupColors') || '{}'); } catch { return {}; }
  });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
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

  const handlePDFReport = () => {
    const filtered = statusFilter ? payments.filter(p => p.status === statusFilter) : payments;
    const LABELS = { pending:'К оплате', submitted:'Подано', paid:'Оплачено', rejected:'Отклонено' };
    const date = new Date().toLocaleDateString('ru');

    const rows = filtered.map((p, i) => {
      const allReceipts = [...(p.receipts_video || []), ...(p.receipts_product || []), ...(p.receipts || [])];
      const receiptImgs = allReceipts.map(r =>
        `<img src="${r.url}" style="width:72px;height:72px;object-fit:cover;border-radius:4px;border:1px solid #ddd;margin:2px;" crossorigin="anonymous" />`
      ).join('');
      return `<tr>
        <td style="text-align:center">${i+1}</td>
        <td><strong>${p.blogger_name||'—'}</strong><br/><span style="color:#666;font-size:10px">${p.manager_name||''}</span></td>
        <td>${p.recipient_name}<br/><span style="font-family:monospace;font-size:10px">${p.iin}</span></td>
        <td>${p.kaspi||'—'}</td>
        <td style="text-align:right">${p.amount_video ? (p.amount_video).toLocaleString('ru')+' ₸' : '—'}</td>
        <td style="text-align:right">${p.amount_product ? (p.amount_product).toLocaleString('ru')+' ₸' : '—'}</td>
        <td style="text-align:right;font-weight:700">${(p.amount||0).toLocaleString('ru')} ₸</td>
        <td>${p.approval_url ? `<a href="${p.approval_url}" style="color:#4f6ef7;font-size:10px">🔗 ссылка</a>` : '—'}</td>
        <td>${receiptImgs || '<span style="color:#999;font-size:10px">нет</span>'}</td>
        <td>${LABELS[p.status]||p.status}</td>
      </tr>`;
    }).join('');

    const totalAmount = filtered.reduce((s,p) => s+(p.amount||0), 0);
    const totalVideo = filtered.reduce((s,p) => s+(p.amount_video||0), 0);
    const totalProduct = filtered.reduce((s,p) => s+(p.amount_product||0), 0);

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Отчёт по оплатам</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 15px; }
  h2 { font-size: 15px; margin-bottom: 4px; }
  .meta { color: #666; margin-bottom: 12px; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f0f2f7; padding: 6px 7px; text-align: left; font-size: 9px; text-transform: uppercase; border: 1px solid #ddd; }
  td { padding: 6px 7px; border: 1px solid #e2e6ef; vertical-align: middle; }
  tr:nth-child(even) { background: #f8f9fb; }
  .totals { margin-top: 12px; display: flex; gap: 20px; border-top: 2px solid #e2e6ef; padding-top: 10px; }
  .total-item .label { font-size: 9px; text-transform: uppercase; color: #999; }
  .total-item .value { font-size: 14px; font-weight: 700; }
  @media print { body { margin: 8px; } }
</style>
</head>
<body>
<h2>Отчёт по оплатам для бухгалтерии</h2>
<div class="meta">Дата: ${date} · Записей: ${filtered.length}${statusFilter ? ' · ' + LABELS[statusFilter] : ''}</div>
<table>
  <thead>
    <tr>
      <th>#</th><th>Блогер / Менеджер</th><th>ФИО / ИИН</th><th>Каспи</th>
      <th>Видео ₸</th><th>Товар ₸</th><th>Итого ₸</th><th>Согласование</th><th>Чеки</th><th>Статус</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="totals">
  <div class="total-item"><div class="label">Видео</div><div class="value" style="color:#1e40af">${totalVideo.toLocaleString('ru')} ₸</div></div>
  <div class="total-item"><div class="label">Товары</div><div class="value" style="color:#6d28d9">${totalProduct.toLocaleString('ru')} ₸</div></div>
  <div class="total-item"><div class="label">Итого</div><div class="value" style="color:#15803d">${totalAmount.toLocaleString('ru')} ₸</div></div>
</div>
</body>
</html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    // Ждём загрузки всех изображений перед печатью
    w.addEventListener('load', () => {
      const imgs = w.document.images;
      if (imgs.length === 0) { setTimeout(() => w.print(), 300); return; }
      let loaded = 0;
      const tryPrint = () => { loaded++; if (loaded >= imgs.length) setTimeout(() => w.print(), 300); };
      for (let i = 0; i < imgs.length; i++) {
        if (imgs[i].complete) tryPrint();
        else { imgs[i].onload = tryPrint; imgs[i].onerror = tryPrint; }
      }
    });
  };

  const handleExportSelected = async () => {
    const token = localStorage.getItem('token');
    const selectedPayments = payments.filter(p => selected.has(p.id));
    const total = selectedPayments.reduce((s,p) => s+(p.amount||0), 0);
    const LABELS = { pending:'К оплате', submitted:'Подано', paid:'Оплачено', rejected:'Отклонено' };
    const rows = selectedPayments.map((p,i) => ({
      '№': i+1,
      'Дата': new Date(p.created_at).toLocaleDateString('ru'),
      'Менеджер': p.manager_name||'',
      'Блогер': p.blogger_name||'',
      'ФИО получателя': p.recipient_name,
      'ИИН': p.iin,
      'ФИО при пополнении': p.payment_name||'',
      'Номер Каспи': p.kaspi||'',
      'Сумма (₸)': p.amount||0,
      'Статус': LABELS[p.status]||p.status,
      'Заметки': p.notes||'',
    }));
    rows.push({});
    rows.push({'№':'ИТОГО', 'Сумма (₸)': total});

    const res = await fetch((process.env.REACT_APP_API_URL||'') + '/api/payments/export-selected', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'selected_payments.xlsx'; a.click();
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

  // Группы по ссылке на согласование
  const approvalGroups = React.useMemo(() => {
    const groups = {};
    payments.forEach(p => {
      if (p.approval_url) {
        if (!groups[p.approval_url]) groups[p.approval_url] = { url: p.approval_url, payments: [], total: 0, date: p.created_at };
        groups[p.approval_url].payments.push(p);
        groups[p.approval_url].total += p.amount || 0;
        if (p.created_at < groups[p.approval_url].date) groups[p.approval_url].date = p.created_at;
      }
    });
    return Object.values(groups).sort((a,b) => new Date(b.date) - new Date(a.date));
  }, [payments]);

  const filteredPayments = React.useMemo(() => {
    let list = payments;
    if (approvalFilter) list = list.filter(p => p.approval_url === approvalFilter);
    if (approvalExistsFilter === 'yes') list = list.filter(p => !!p.approval_url);
    if (approvalExistsFilter === 'no') list = list.filter(p => !p.approval_url);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        (p.blogger_name || '').toLowerCase().includes(q) ||
        (p.recipient_name || '').toLowerCase().includes(q) ||
        (p.iin || '').includes(q) ||
        String(p.amount || '').includes(q) ||
        (p.manager_name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [payments, approvalFilter, approvalExistsFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE));
  const pagedPayments = filteredPayments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Сбрасываем страницу при изменении фильтров/поиска
  React.useEffect(() => { setPage(1); }, [statusFilter, approvalFilter, approvalExistsFilter, search]);

  const setGroupColor = (url, color) => {
    const next = { ...groupColors, [url]: color };
    setGroupColors(next);
    localStorage.setItem('approvalGroupColors', JSON.stringify(next));
  };

  const toggleSelect = (id) => setSelected(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleAll = () => {
    if (selected.size === filteredPayments.length && filteredPayments.every(p => selected.has(p.id))) setSelected(new Set());
    else setSelected(new Set(filteredPayments.map(p => p.id)));
  };

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
          {currentUser.role==='admin' && <button className="btn btn-secondary btn-sm" onClick={handlePDFReport}>📄 Отчёт PDF</button>}
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
        <input
          className="search-input"
          placeholder="🔍 Блогер, ФИО, ИИН, сумма..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{minWidth:220}}
        />
        <select className="select-filter" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(PAYMENT_STATUS).map(([v,s])=><option key={v} value={v}>{s.label}</option>)}
        </select>
        <select className="select-filter" value={approvalExistsFilter} onChange={e=>{ setApprovalExistsFilter(e.target.value); setApprovalFilter(''); }}>
          <option value="">Все (с/без согласования)</option>
          <option value="yes">✅ Есть ссылка на согласование</option>
          <option value="no">❌ Без ссылки на согласование</option>
        </select>
        {(approvalFilter || approvalExistsFilter) && (
          <button className="btn btn-secondary btn-sm" onClick={()=>{ setApprovalFilter(''); setApprovalExistsFilter(''); }}>✕ Сбросить фильтр</button>
        )}
      </div>

      {currentUser.role==='admin' && approvalGroups.length > 0 && (
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:600,color:'#9ba3be',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>Группы по согласованию</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {approvalGroups.map((g, i) => {
              const isActive = approvalFilter === g.url;
              const label = g.url.replace(/https?:\/\//,'').replace(/\?.*/,'');
              const shortLabel = label.length > 40 ? label.slice(0,40)+'…' : label;
              const color = groupColors[g.url] || '';
              const C = color === 'green'
                ? {bg:'#dcfce7',border:'#86efac',text:'#15803d',accent:'#16a34a'}
                : color === 'red'
                ? {bg:'#fee2e2',border:'#fca5a5',text:'#991b1b',accent:'#dc2626'}
                : color === 'blue'
                ? {bg:'#dbeafe',border:'#93c5fd',text:'#1e40af',accent:'#2563eb'}
                : {bg:'#f8f9fb',border:'#e2e6ef',text:'#3a3f5a',accent:'#4f6ef7'};
              const GROUP_LABELS = { green: '', red: '', blue: 'Счёт на оплату / ИП' };
              return (
                <div key={i}
                  onClick={() => setApprovalFilter(isActive ? '' : g.url)}
                  style={{
                    cursor:'pointer',padding:'8px 14px',borderRadius:8,
                    border:isActive?`2px solid ${C.accent}`:`1px solid ${C.border}`,
                    background:C.bg,
                    boxShadow:isActive?`0 0 0 3px ${C.border}60`:'0 1px 3px rgba(0,0,0,.06)',
                    display:'flex',flexDirection:'column',gap:3,minWidth:180,maxWidth:280,
                    transform:isActive?'scale(1.02)':'scale(1)',
                    transition:'all .15s',
                  }}>
                  <div style={{fontSize:10,color:C.text,opacity:.7}}>{new Date(g.date).toLocaleDateString('ru',{day:'numeric',month:'short'})} · {g.payments.length} заявок</div>
                  {GROUP_LABELS[color] && <div style={{fontSize:10,fontWeight:700,color:C.accent,textTransform:'uppercase',letterSpacing:'.04em'}}>{GROUP_LABELS[color]}</div>}
                  <div style={{fontSize:11,color:C.text,fontWeight:500,wordBreak:'break-all'}} title={g.url}>{shortLabel}</div>
                  <div style={{fontSize:13,fontWeight:700,color:C.accent}}>{g.total.toLocaleString('ru')} ₸</div>
                  <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:5,marginTop:2}}>
                    <button onClick={()=>setGroupColor(g.url, color==='green'?'':'green')}
                      style={{width:22,height:22,borderRadius:'50%',border:color==='green'?'3px solid #15803d':'2px solid #86efac',background:'#dcfce7',cursor:'pointer',padding:0,boxShadow:color==='green'?'0 0 0 2px #15803d40':'none'}} />
                    <button onClick={()=>setGroupColor(g.url, color==='red'?'':'red')}
                      style={{width:22,height:22,borderRadius:'50%',border:color==='red'?'3px solid #991b1b':'2px solid #fca5a5',background:'#fee2e2',cursor:'pointer',padding:0,boxShadow:color==='red'?'0 0 0 2px #991b1b40':'none'}} />
                    <button onClick={()=>setGroupColor(g.url, color==='blue'?'':'blue')}
                      style={{width:22,height:22,borderRadius:'50%',border:color==='blue'?'3px solid #1e40af':'2px solid #93c5fd',background:'#dbeafe',cursor:'pointer',padding:0,boxShadow:color==='blue'?'0 0 0 2px #1e40af40':'none'}} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div style={{background:'#eef1fe',border:'1px solid #c7d2fe',borderRadius:8,padding:'12px 16px',marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <span style={{fontSize:13,fontWeight:500,color:'#3730a3'}}>Выбрано: {selected.size}</span>
            <span style={{fontSize:14,fontWeight:700,color:'#3730a3'}}>
              Σ {payments.filter(p=>selected.has(p.id)).reduce((s,p)=>s+(p.amount||0),0).toLocaleString('ru')} ₸
            </span>
            <button className="btn btn-secondary btn-sm" onClick={handleExportSelected}>📊 Excel выбранных</button>
            {currentUser.role==='admin' && <>
              <button className="btn btn-sm" style={{background:'#dbeafe',color:'#1e40af',border:'1px solid #bfdbfe'}} onClick={()=>handleBulkStatus('submitted')}>Подано</button>
              <button className="btn btn-sm" style={{background:'#dcfce7',color:'#15803d',border:'1px solid #bbf7d0'}} onClick={()=>handleBulkStatus('paid')}>Оплачено</button>
              <button className="btn btn-sm" style={{background:'#fee2e2',color:'#991b1b',border:'1px solid #fecaca'}} onClick={()=>handleBulkStatus('rejected')}>Отклонить</button>
              <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>🗑 Удалить</button>
            </>}
            <button className="btn btn-secondary btn-sm" onClick={()=>setSelected(new Set())}>Снять выделение</button>
          </div>
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
              <th>Видео ₸</th>
              <th>Товар ₸</th>
              <th>Сумма</th>
              <th>Статус</th>
              <th>Ссылка на согласование</th>
              <th>Чек видео</th>
              <th>Чек товара</th>
              {currentUser.role==='admin' && <th>Действия</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={{textAlign:'center',padding:40,color:'#9ba3be'}}>Загрузка...</td></tr>
            ) : filteredPayments.length===0 ? (
              <tr><td colSpan={12}><div className="empty-state"><div style={{fontSize:36}}>💳</div><p>Заявок пока нет</p></div></td></tr>
            ) : pagedPayments.map(p=>(
              <tr key={p.id} style={{background:selected.has(p.id)?'#eef1fe':p.status==='paid'?'#f0fdf4':p.status==='rejected'?'#fff5f5':undefined}}>
                {currentUser.role==='admin' && <td onClick={e=>e.stopPropagation()}><input type="checkbox" className="in-work-check" checked={selected.has(p.id)} onChange={()=>toggleSelect(p.id)} /></td>}
                <td style={{fontSize:11,color:'#9ba3be',whiteSpace:'nowrap'}}>{new Date(p.created_at).toLocaleDateString('ru')}</td>
                {currentUser.role==='admin' && <td><span className="tag">{p.manager_name||'—'}</span></td>}
                <td style={{fontWeight:500}}>{p.blogger_name||'—'}</td>
                <td>{p.recipient_name}</td>
                <td style={{fontFamily:'monospace',letterSpacing:1,fontSize:12}}>{p.iin}</td>
                <td>{p.payment_name||'—'}</td>
                <td onClick={e=>e.stopPropagation()}><KaspiCell payment={p} onUpdate={fetchPayments} /></td>
                <td style={{fontSize:12}}>{p.amount_video ? (p.amount_video).toLocaleString('ru')+' ₸' : '—'}</td>
                <td style={{fontSize:12}}>{p.amount_product ? (p.amount_product).toLocaleString('ru')+' ₸' : '—'}</td>
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
                <td onClick={e=>e.stopPropagation()}><ApprovalCell payment={p} isAdmin={currentUser.role==='admin'} onSave={fetchPayments} /></td>
                <td onClick={e=>e.stopPropagation()}><ReceiptCell payment={p} type="video" onUpdate={fetchPayments} /></td>
                <td onClick={e=>e.stopPropagation()}><ReceiptCell payment={p} type="product" onUpdate={fetchPayments} /></td>
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

      {totalPages > 1 && (
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,marginTop:16,flexWrap:'wrap'}}>
          <button className="btn btn-secondary btn-sm" onClick={()=>setPage(1)} disabled={page===1}>«</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>‹</button>
          {Array.from({length:totalPages},(_,i)=>i+1).filter(n=>n===1||n===totalPages||Math.abs(n-page)<=2).reduce((acc,n,i,arr)=>{
            if(i>0&&n-arr[i-1]>1)acc.push(<span key={'e'+n} style={{color:'#9ba3be',padding:'0 4px'}}>…</span>);
            acc.push(
              <button key={n} className={`btn btn-sm${page===n?' btn-primary':' btn-secondary'}`}
                onClick={()=>setPage(n)} style={{minWidth:32}}>
                {n}
              </button>
            );
            return acc;
          },[])}
          <button className="btn btn-secondary btn-sm" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>›</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>setPage(totalPages)} disabled={page===totalPages}>»</button>
          <span style={{fontSize:11,color:'#9ba3be',marginLeft:4}}>
            {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,filteredPayments.length)} из {filteredPayments.length}
          </span>
        </div>
      )}
    </div>
  );
}
