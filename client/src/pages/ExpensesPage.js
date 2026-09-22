import React, { useState, useEffect } from 'react';
import { apiFetch } from '../App';
import Toast from '../components/Toast';

const CATEGORIES = [
  { value: 'subscription', label: '📱 Подписка' },
  { value: 'phone', label: '📞 Номер/связь' },
  { value: 'software', label: '💻 Программное обеспечение' },
  { value: 'ads', label: '📢 Реклама' },
  { value: 'other', label: '💡 Другое' },
];

function ReceiptCell({ expense, onUpdate }) {
  const [uploading, setUploading] = useState(false);
  const receipts = expense.receipts || [];

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const token = localStorage.getItem('token');
    const fd = new FormData();
    fd.append('file', file);
    await fetch((process.env.REACT_APP_API_URL||'') + `/api/expenses/${expense.id}/receipt`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: fd,
    });
    setUploading(false);
    onUpdate();
    e.target.value = '';
  };

  const handleDelete = async (public_id) => {
    if (!window.confirm('Удалить чек?')) return;
    const token = localStorage.getItem('token');
    await fetch((process.env.REACT_APP_API_URL||'') + `/api/expenses/${expense.id}/receipt`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_id }),
    });
    onUpdate();
  };

  return (
    <div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center'}}>
      {receipts.map((r,i) => (
        <div key={i} style={{position:'relative',display:'inline-block'}}>
          <a href={r.url} target="_blank" rel="noreferrer">
            <img src={r.url} alt="чек" style={{width:44,height:44,objectFit:'cover',borderRadius:4,border:'1px solid #e2e6ef',cursor:'pointer'}} />
          </a>
          <span onClick={()=>handleDelete(r.public_id)}
            style={{position:'absolute',top:-4,right:-4,background:'#dc2626',color:'#fff',borderRadius:'50%',width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,cursor:'pointer'}}>
            ×
          </span>
        </div>
      ))}
      <label style={{cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',width:44,height:44,borderRadius:4,border:'2px dashed #c7d2fe',background:'#eef1fe',color:'#4f6ef7',fontSize:18,flexShrink:0}}>
        {uploading ? '⏳' : '+'}
        <input type="file" accept="image/*" style={{display:'none'}} onChange={handleUpload} />
      </label>
    </div>
  );
}

function ExpenseModal({ expense, onClose, onSave }) {
  const isEdit = !!expense;
  const [form, setForm] = useState({
    category: expense?.category || 'subscription',
    amount: expense?.amount || '',
    comment: expense?.comment || '',
    goal: expense?.goal || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount) { setError('Укажите сумму'); return; }
    setSaving(true);
    const res = await apiFetch(isEdit ? `/api/expenses/${expense.id}` : '/api/expenses', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(form),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error); setSaving(false); return; }
    onSave();
  };

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:480}}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'Редактировать расход' : 'Добавить расход'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Категория *</label>
            <select value={form.category} onChange={e=>set('category',e.target.value)}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Сумма (₸) *</label>
            <input type="number" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="5000" required />
          </div>
          <div className="field">
            <label>Цель / назначение</label>
            <input value={form.goal} onChange={e=>set('goal',e.target.value)} placeholder="Напр: подписка Canva для команды" />
          </div>
          <div className="field">
            <label>Комментарий</label>
            <textarea value={form.comment} onChange={e=>set('comment',e.target.value)} placeholder="Дополнительная информация..." />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Сохраняем...':isEdit?'Сохранить':'Добавить'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ExpensesPage({ currentUser }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editExpense, setEditExpense] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [toast, setToast] = useState(null);

  const fetchExpenses = async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (categoryFilter) p.set('category', categoryFilter);
    const res = await apiFetch('/api/expenses?' + p);
    setExpenses(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchExpenses(); }, [categoryFilter]);

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить расход?')) return;
    await apiFetch(`/api/expenses/${id}`, { method: 'DELETE' });
    setToast('Расход удалён');
    fetchExpenses();
  };

  const totalAmount = expenses.reduce((s,e) => s+(e.amount||0), 0);

  return (
    <div className="page">
      {toast && <Toast message={toast} type="success" onClose={()=>setToast(null)} />}

      <div className="page-header">
        <div>
          <div className="page-title">Доп. расходы</div>
          <div className="page-subtitle">{expenses.length} записей · Итого: {totalAmount.toLocaleString('ru')} ₸</div>
        </div>
        <button className="btn btn-primary" onClick={()=>{setEditExpense(null);setShowForm(true);}}>+ Добавить расход</button>
      </div>

      <div className="toolbar">
        <select className="select-filter" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}>
          <option value="">Все категории</option>
          {CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      <div className="stats-grid" style={{marginBottom:16}}>
        {CATEGORIES.map(cat => {
          const sum = expenses.filter(e=>e.category===cat.value).reduce((s,e)=>s+(e.amount||0),0);
          return sum > 0 ? (
            <div key={cat.value} className="stat-card">
              <div style={{fontSize:11,color:'#9ba3be',marginBottom:4}}>{cat.label}</div>
              <div style={{fontSize:16,fontWeight:700,color:'#1a1d2e'}}>{sum.toLocaleString('ru')} ₸</div>
            </div>
          ) : null;
        })}
      </div>

      <div className="table-wrap" style={{overflowX:'auto'}}>
        <table style={{minWidth:800}}>
          <thead>
            <tr>
              <th>Дата</th>
              {currentUser.role==='admin' && <th>Кто добавил</th>}
              <th>Категория</th>
              <th>Цель</th>
              <th>Сумма</th>
              <th>Комментарий</th>
              <th>Статус</th>
              <th>Чек</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'#9ba3be'}}>Загрузка...</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={8}><div className="empty-state"><div style={{fontSize:36}}>💸</div><p>Расходов пока нет</p></div></td></tr>
            ) : expenses.map(e => (
              <tr key={e.id} style={{cursor:'pointer'}} onClick={()=>{setEditExpense(e);setShowForm(true);}}>
                <td style={{fontSize:11,color:'#9ba3be',whiteSpace:'nowrap'}}>{new Date(e.created_at).toLocaleDateString('ru',{day:'numeric',month:'short'})}</td>
                {currentUser.role==='admin' && <td><span className="tag">{e.username||'—'}</span></td>}
                <td>{CATEGORIES.find(c=>c.value===e.category)?.label||e.category}</td>
                <td style={{fontWeight:500}}>{e.goal||'—'}</td>
                <td style={{fontWeight:700,color:'#dc2626',whiteSpace:'nowrap'}}>{(e.amount||0).toLocaleString('ru')} ₸</td>
                <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12,color:'#9ba3be'}} title={e.comment||''}>{e.comment||'—'}</td>
                <td onClick={ev=>ev.stopPropagation()}>
                  <span onClick={async()=>{await apiFetch(`/api/expenses/${e.id}`,{method:'PUT',body:JSON.stringify({paid:!e.paid})});fetchExpenses();}}
                    style={{cursor:'pointer',display:'inline-block',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:500,
                      background:e.paid?'#dcfce7':'#fee2e2',color:e.paid?'#15803d':'#dc2626',
                      border:e.paid?'1px solid #bbf7d0':'1px solid #fecaca'}}>
                    {e.paid ? '✓ Оплачено' : '✗ Не оплачено'}
                  </span>
                </td>
                <td onClick={ev=>ev.stopPropagation()}><ReceiptCell expense={e} onUpdate={fetchExpenses} /></td>
                <td onClick={ev=>ev.stopPropagation()}>
                  <button className="btn btn-danger btn-sm" onClick={()=>handleDelete(e.id)}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ExpenseModal
          expense={editExpense}
          onClose={()=>{setShowForm(false);setEditExpense(null);}}
          onSave={()=>{setShowForm(false);setEditExpense(null);fetchExpenses();setToast(editExpense?'Обновлено!':'Расход добавлен!');}}
        />
      )}
    </div>
  );
}
