import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../App';
import BloggerModal from '../components/BloggerModal';
import ImportModal from '../components/ImportModal';

const STATUS_OPTIONS = [
  { value: 'new', label: 'Новый', color: '#64748b' },
  { value: 'contacted', label: 'Написали', color: '#92400e' },
  { value: 'replied', label: 'Ответили', color: '#5b21b6' },
  { value: 'transferred', label: 'Передано в работу', color: '#0369a1' },
  { value: 'in_work', label: 'В работе', color: '#15803d' },
  { value: 'declined', label: 'Отказ (контент)', color: '#991b1b' },
  { value: 'declined_bad', label: 'Отказ (чёрный список)', color: '#7f1d1d' },
  { value: 'declined_reach', label: 'Отказ (низкие просмотры)', color: '#b45309' },
  { value: 'declined_shop', label: 'Отказ (магазин)', color: '#6b21a8' },
  { value: 'payment_pending', label: 'К оплате', color: '#92400e' },
  { value: 'payment_submitted', label: 'Оплата подана', color: '#1e40af' },
  { value: 'paid', label: 'Оплачено', color: '#15803d' },
];

const ALL_COLUMNS = [
  { key: 'status', label: 'Статус', default: true },
  { key: 'comment', label: 'Комментарий', default: true },
  { key: 'manager', label: 'Менеджер', default: true },
  { key: 'links', label: 'Ссылки', default: true },
  { key: 'inst_followers', label: 'Подп. Инст', default: true },
  { key: 'inst_reach', label: 'Охват Инст', default: true },
  { key: 'tt_followers', label: 'Подп. ТТ', default: true },
  { key: 'tt_reach', label: 'Охват ТТ', default: true },
  { key: 'price_reels', label: 'Рилс', default: true },
  { key: 'cpv_reels', label: 'CPV Рилс', default: true },
  { key: 'price_tt', label: 'ТТ', default: true },
  { key: 'cpv_tt', label: 'CPV ТТ', default: true },
  { key: 'price_both', label: 'Рилс+ТТ', default: true },
  { key: 'cpv_both', label: 'CPV Р+ТТ', default: true },
  { key: 'price_stories', label: 'Сторис', default: false },
  { key: 'cpv_stories', label: 'CPV Сторис', default: false },
  { key: 'added', label: 'Добавлен', default: true },
];

const PAGE_SIZE = 50;

function cpvClass(v) { if(!v) return 'cpv-none'; if(v<=10) return 'cpv-great'; if(v<=30) return 'cpv-good'; return 'cpv-bad'; }
function daysSince(iso) { if(!iso) return null; return Math.floor((Date.now()-new Date(iso))/(86400000)); }
function fmtDate(iso) { if(!iso) return '—'; return new Date(iso).toLocaleDateString('ru',{day:'numeric',month:'short'}); }
function fmtNum(n) { return n ? Number(n).toLocaleString('ru') : '—'; }
function isNew(iso) { return iso && daysSince(iso) <= 3; }

function StatusDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const current = STATUS_OPTIONS.find(s => s.value === value) || STATUS_OPTIONS[0];
  useEffect(() => {
    const h = e => { if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} style={{position:'relative',display:'inline-block'}}>
      <span className={`status-badge status-${value}`} onClick={e=>{e.stopPropagation();setOpen(!open);}} style={{cursor:'pointer',userSelect:'none'}}>{current.label} ▾</span>
      {open && (
        <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,zIndex:9999,background:'#fff',border:'1px solid #e2e6ef',borderRadius:8,boxShadow:'0 4px 20px rgba(0,0,0,0.15)',minWidth:180,maxHeight:280,overflowY:'auto'}}>
          {STATUS_OPTIONS.map(s => (
            <div key={s.value} onClick={e=>{e.stopPropagation();onChange(s.value);setOpen(false);}}
              style={{padding:'7px 12px',cursor:'pointer',fontSize:11,color:s.color,fontWeight:500,borderBottom:'1px solid #f0f2f7',whiteSpace:'nowrap'}}
              onMouseOver={e=>e.currentTarget.style.background='#f8f9fb'}
              onMouseOut={e=>e.currentTarget.style.background='transparent'}>
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditableCell({ value, onSave, type='text', suffix='' }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value||'');
  const [saved, setSaved] = useState(false);
  const inputRef = useRef();
  useEffect(() => { setVal(value||''); }, [value]);
  useEffect(() => { if(editing && inputRef.current) inputRef.current.focus(); }, [editing]);
  const handleSave = async () => {
    setEditing(false);
    if (String(val) !== String(value||'')) { await onSave(val); setSaved(true); setTimeout(() => setSaved(false), 2000); }
  };
  if (editing) return (
    <input ref={inputRef} type={type} value={val} onChange={e=>setVal(e.target.value)}
      onBlur={handleSave} onKeyDown={e=>{ if(e.key==='Enter') handleSave(); if(e.key==='Escape') setEditing(false); }}
      style={{width:90,padding:'2px 6px',fontSize:12,border:'1px solid #4f6ef7',borderRadius:4,background:'#fff',color:'#1a1d2e',outline:'none'}}
      onClick={e=>e.stopPropagation()} />
  );
  return (
    <span onClick={e=>{e.stopPropagation();setEditing(true);}} style={{cursor:'text',borderBottom:'1px dashed #c8cfe0',paddingBottom:1,fontSize:12,whiteSpace:'nowrap'}}>
      {saved && <span style={{color:'#16a34a',marginRight:3}}>✓</span>}
      {value ? <>{fmtNum(value)}{suffix}</> : <span style={{color:'#9ba3be'}}>—</span>}
    </span>
  );
}

function CommentCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value||'');
  const [saved, setSaved] = useState(false);
  const inputRef = useRef();
  useEffect(() => { setVal(value||''); }, [value]);
  useEffect(() => { if(editing && inputRef.current) inputRef.current.focus(); }, [editing]);
  const handleSave = async () => {
    setEditing(false);
    if (val !== (value||'')) { await onSave(val); setSaved(true); setTimeout(()=>setSaved(false),2000); }
  };
  if (editing) return (
    <input ref={inputRef} value={val} onChange={e=>setVal(e.target.value)}
      onBlur={handleSave} onKeyDown={e=>{if(e.key==='Enter')handleSave();if(e.key==='Escape')setEditing(false);}}
      style={{width:160,padding:'2px 6px',fontSize:12,border:'1px solid #4f6ef7',borderRadius:4,background:'#fff',color:'#1a1d2e',outline:'none'}}
      onClick={e=>e.stopPropagation()} placeholder="Добавить комментарий..." />
  );
  return (
    <span onClick={e=>{e.stopPropagation();setEditing(true);}} title={value||''}
      style={{cursor:'text',borderBottom:'1px dashed #c8cfe0',paddingBottom:1,maxWidth:160,display:'inline-block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12,color:value?'#1a1d2e':'#9ba3be'}}>
      {saved && <span style={{color:'#16a34a',marginRight:3}}>✓</span>}
      {value || 'добавить...'}
    </span>
  );
}

function ColumnToggle({ columns, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const h = e => { if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} style={{position:'relative'}}>
      <button className="btn btn-secondary btn-sm" onClick={()=>setOpen(!open)}>⚙️ Колонки</button>
      {open && (
        <div style={{position:'absolute',top:'100%',right:0,zIndex:999,background:'#fff',border:'1px solid #e2e6ef',borderRadius:8,boxShadow:'0 4px 20px rgba(0,0,0,0.12)',padding:'8px 0',minWidth:200,marginTop:4}}>
          <div style={{padding:'4px 14px 8px',fontSize:10,fontWeight:600,color:'#9ba3be',textTransform:'uppercase',letterSpacing:'.06em'}}>Показывать колонки</div>
          {ALL_COLUMNS.map(col => (
            <label key={col.key} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 14px',cursor:'pointer',fontSize:12}}
              onMouseOver={e=>e.currentTarget.style.background='#f8f9fb'}
              onMouseOut={e=>e.currentTarget.style.background='transparent'}>
              <input type="checkbox" checked={columns.has(col.key)} onChange={()=>onChange(col.key)} style={{accentColor:'#4f6ef7'}} />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Pagination({ page, pages, total, limit, onChange }) {
  if (pages <= 1) return null;
  const from = (page-1)*limit+1;
  const to = Math.min(page*limit, total);
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',marginTop:8}}>
      <span style={{fontSize:12,color:'#9ba3be'}}>Показано {from}–{to} из {total}</span>
      <div style={{display:'flex',gap:4,alignItems:'center'}}>
        <button className="btn btn-secondary btn-sm" disabled={page<=1} onClick={()=>onChange(1)}>«</button>
        <button className="btn btn-secondary btn-sm" disabled={page<=1} onClick={()=>onChange(page-1)}>‹</button>
        {Array.from({length:Math.min(7,pages)},(_,i)=>{
          let p;
          if(pages<=7) p=i+1;
          else if(page<=4) p=i+1;
          else if(page>=pages-3) p=pages-6+i;
          else p=page-3+i;
          return (
            <button key={p} className="btn btn-sm" onClick={()=>onChange(p)}
              style={{minWidth:32,background:p===page?'#4f6ef7':'#fff',color:p===page?'#fff':'#1a1d2e',border:'1px solid',borderColor:p===page?'#4f6ef7':'#e2e6ef'}}>
              {p}
            </button>
          );
        })}
        <button className="btn btn-secondary btn-sm" disabled={page>=pages} onClick={()=>onChange(page+1)}>›</button>
        <button className="btn btn-secondary btn-sm" disabled={page>=pages} onClick={()=>onChange(pages)}>»</button>
      </div>
    </div>
  );
}

export default function BloggerList({ currentUser }) {
  const [bloggers, setBloggers] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [cpvMin, setCpvMin] = useState('');
  const [cpvMax, setCpvMax] = useState('');
  const [reachMin, setReachMin] = useState('');
  const [followersMin, setFollowersMin] = useState('');
  const [followersMax, setFollowersMax] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [inWorkOnly, setInWorkOnly] = useState(false);
  const [excludeDeclined, setExcludeDeclined] = useState(false);
  const [excludeInWork, setExcludeInWork] = useState(false);
  const [excludeTransferred, setExcludeTransferred] = useState(false);
  const [sort, setSort] = useState('default');
  const [showFilters, setShowFilters] = useState(false);
  const [editBlogger, setEditBlogger] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [pendingBlogger, setPendingBlogger] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [showDistribute, setShowDistribute] = useState(false);
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [visibleCols, setVisibleCols] = useState(new Set(ALL_COLUMNS.filter(c=>c.default).map(c=>c.key)));
  const timer = useRef(null);

  const show = (key) => visibleCols.has(key);
  const toggleCol = (key) => setVisibleCols(prev => { const n=new Set(prev); n.has(key)?n.delete(key):n.add(key); return n; });

  const doFetch = useCallback(async (p) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (managerFilter) params.set('manager', managerFilter);
    if (inWorkOnly) params.set('in_work', '1');
    if (sort !== 'default') params.set('sort', sort);
    if (platformFilter) params.set('platform', platformFilter);
    if (cpvMin) params.set('cpv_min', cpvMin);
    if (cpvMax) params.set('cpv_max', cpvMax);
    if (reachMin) params.set('reach_min', reachMin);
    if (followersMin) params.set('followers_min', followersMin);
    if (followersMax) params.set('followers_max', followersMax);
    if (batchFilter) params.set('batch_id', batchFilter);
    if (excludeDeclined) params.set('exclude_declined', '1');
    if (excludeInWork) params.set('exclude_in_work', '1');
    if (excludeTransferred) params.set('exclude_transferred', '1');
    params.set('page', p);
    params.set('limit', PAGE_SIZE);
    const res = await apiFetch('/api/bloggers?' + params);
        if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.reload();
      return;
    }
    const json = await res.json();
    setBloggers(json.data || []);
    setTotal(json.total || 0);
    setPages(json.pages || 1);
    setLoading(false);
  }, [search, statusFilter, managerFilter, inWorkOnly, sort, platformFilter, cpvMin, cpvMax, reachMin, followersMin, followersMax, batchFilter, excludeDeclined, excludeInWork, excludeTransferred]);

  useEffect(() => { apiFetch('/api/users').then(r=>r.json()).then(setUsers); apiFetch('/api/batches').then(r=>r.json()).then(setBatches); }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setPage(1); doFetch(1); }, 300);
  }, [search, statusFilter, managerFilter, inWorkOnly, sort, platformFilter, cpvMin, cpvMax, reachMin, followersMin, followersMax, batchFilter, excludeDeclined, excludeInWork, excludeTransferred]);

  useEffect(() => { doFetch(page); }, [page]);

  const patch = async (id, fields) => {
    const res = await apiFetch(`/api/bloggers/${id}`, { method: 'PATCH', body: JSON.stringify(fields) });
    const updated = await res.json();
    setBloggers(prev => prev.map(b => b.id === id ? updated : b));
    return updated;
  };

  const handleSave = async (data) => {
    const isEdit = !!data.id;
    await apiFetch(isEdit ? `/api/bloggers/${data.id}` : '/api/bloggers', { method: isEdit?'PUT':'POST', body: JSON.stringify(data) });
    setEditBlogger(null); setShowAdd(false); doFetch(page);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить?')) return;
    await apiFetch(`/api/bloggers/${id}`, { method:'DELETE' }); doFetch(page);
  };

  const handleExport = async () => {
    const token = localStorage.getItem('token');
    const p = new URLSearchParams();
    if (statusFilter) p.set('status', statusFilter);
    if (managerFilter) p.set('manager', managerFilter);
    if (platformFilter) p.set('platform', platformFilter);
    if (batchFilter) p.set('batch_id', batchFilter);
    if (cpvMin) p.set('cpv_min', cpvMin);
    if (cpvMax) p.set('cpv_max', cpvMax);
    if (reachMin) p.set('reach_min', reachMin);
    if (followersMin) p.set('followers_min', followersMin);
    if (followersMax) p.set('followers_max', followersMax);
    if (inWorkOnly) p.set('in_work', '1');
    if (excludeDeclined) p.set('exclude_declined', '1');
    if (excludeInWork) p.set('exclude_in_work', '1');
    if (excludeTransferred) p.set('exclude_transferred', '1');
    const res = await fetch((process.env.REACT_APP_API_URL||'') + '/api/export?' + p, { headers:{ Authorization:`Bearer ${token}` } });
    const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bloggers_export.xlsx'; a.click();
  };

  const handleTemplate = async () => {
    const token = localStorage.getItem('token');
    const res = await fetch((process.env.REACT_APP_API_URL||'') + '/api/template', { headers:{ Authorization:`Bearer ${token}` } });
    const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'blogger_template.xlsx'; a.click();
  };

  const handleClearAll = async () => {
    if (!window.confirm('Удалить ВСЕХ блогеров? Это нельзя отменить!')) return;
    const token = localStorage.getItem('token');
    await fetch((process.env.REACT_APP_API_URL||'')+'/api/bloggers/all',{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});
    setPage(1); doFetch(1); apiFetch('/api/batches').then(r=>r.json()).then(setBatches);
  };

  const handleDistribute = async (managerIds) => {
    const ids = Array.from(selected);
    await apiFetch('/api/bloggers/distribute', { method:'POST', body: JSON.stringify({ blogger_ids: ids, manager_ids: managerIds }) });
    setSelected(new Set()); setShowDistribute(false); doFetch(page);
  };

  const handleBulkStatus = async (status) => {
    const ids = Array.from(selected);
    await apiFetch('/api/bloggers/bulk-status', { method:'POST', body: JSON.stringify({ blogger_ids: ids, status }) });
    setSelected(new Set()); setShowBulkStatus(false); doFetch(page);
  };

  const resetFilters = () => {
    setStatusFilter(''); setManagerFilter(''); setPlatformFilter('');
    setCpvMin(''); setCpvMax(''); setReachMin(''); setFollowersMin(''); setFollowersMax('');
    setBatchFilter(''); setInWorkOnly(false); setExcludeDeclined(false); setExcludeInWork(false);
    setPage(1);
  };

  const toggleSelect = (id) => setSelected(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleSelectAll = () => { if(selected.size===bloggers.length) setSelected(new Set()); else setSelected(new Set(bloggers.map(b=>b.id))); };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Блогеры</div>
          <div className="page-subtitle">{total} в базе</div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <ColumnToggle columns={visibleCols} onChange={toggleCol} />
          {currentUser.role==='admin' && <button className="btn btn-danger btn-sm" onClick={handleClearAll}>🗑 Очистить</button>}
          {currentUser.role==='admin' && <button className="btn btn-secondary btn-sm" onClick={handleTemplate}>📋 Шаблон</button>}
          {currentUser.role==='admin' && <button className="btn btn-secondary btn-sm" onClick={handleExport}>📊 Excel</button>}
          <button className="btn btn-secondary btn-sm" onClick={()=>setShowImport(true)}>📥 Импорт</button>
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}>+ Добавить</button>
        </div>
      </div>

      <div className="toolbar">
        <input className="search-input" placeholder="🔍 Поиск..." value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="select-filter" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1);}}>
          <option value="">Все статусы</option>
          {STATUS_OPTIONS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="select-filter" value={managerFilter} onChange={e=>{setManagerFilter(e.target.value);setPage(1);}}>
          <option value="">Все менеджеры</option>
          {users.map(u=><option key={u.id} value={u.id}>{u.username}</option>)}
        </select>
        <select className="select-filter" value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}}>
          <option value="default">Новые цены сверху</option>
          <option value="created_desc">Дата добавления ↓</option>
          <option value="cpv_asc">CPV: дешевле</option>
          <option value="cpv_desc">CPV: дороже</option>
        </select>
        {batches.length > 0 && (
          <select className="select-filter" value={batchFilter} onChange={e=>{setBatchFilter(e.target.value);setPage(1);}}>
            <option value="">Все партии</option>
            {batches.map(b=><option key={b.id} value={b.id}>{fmtDate(b.created_at)} · {b.count} шт.</option>)}
          </select>
        )}
        <button className="btn btn-secondary btn-sm" onClick={()=>setShowFilters(!showFilters)}>{showFilters?'▲':'▼'} Фильтры</button>
      </div>

      {showFilters && (
        <div className="filters-panel">
          <div className="filter-row">
            <label>Платформа</label>
            <select className="select-filter" value={platformFilter} onChange={e=>{setPlatformFilter(e.target.value);setPage(1);}}>
              <option value="">Любая</option>
              <option value="instagram">Только Инст</option>
              <option value="tiktok">Только ТТ</option>
              <option value="both">Инст + ТТ</option>
            </select>
          </div>
          <div className="filter-row">
            <label>CPV от (₸)</label>
            <input className="filter-input" type="number" placeholder="напр. 5" value={cpvMin} onChange={e=>{setCpvMin(e.target.value);setPage(1);}} />
          </div>
          <div className="filter-row">
            <label>CPV до (₸)</label>
            <input className="filter-input" type="number" placeholder="напр. 30" value={cpvMax} onChange={e=>{setCpvMax(e.target.value);setPage(1);}} />
          </div>
          <div className="filter-row">
            <label>Охват от</label>
            <input className="filter-input" type="number" placeholder="напр. 20000" value={reachMin} onChange={e=>{setReachMin(e.target.value);setPage(1);}} />
          </div>
          <div className="filter-row">
            <label>Подписчики от</label>
            <input className="filter-input" type="number" placeholder="напр. 10000" value={followersMin} onChange={e=>{setFollowersMin(e.target.value);setPage(1);}} />
          </div>
          <div className="filter-row">
            <label>Подписчики до</label>
            <input className="filter-input" type="number" placeholder="напр. 100000" value={followersMax} onChange={e=>{setFollowersMax(e.target.value);setPage(1);}} />
          </div>
          <label className="filter-check"><input type="checkbox" checked={inWorkOnly} onChange={e=>{setInWorkOnly(e.target.checked);setPage(1);}} /> Только в работе</label>
          <label className="filter-check"><input type="checkbox" checked={excludeInWork} onChange={e=>{setExcludeInWork(e.target.checked);setPage(1);}} /> Исключить в работе</label>
          <label className="filter-check"><input type="checkbox" checked={excludeTransferred} onChange={e=>{setExcludeTransferred(e.target.checked);setPage(1);}} /> Исключить "Передано в работу"</label>
          <label className="filter-check"><input type="checkbox" checked={excludeDeclined} onChange={e=>{setExcludeDeclined(e.target.checked);setPage(1);}} /> Исключить отказы</label>
          <button className="btn btn-secondary btn-sm" onClick={resetFilters}>Сбросить</button>
        </div>
      )}

      {selected.size > 0 && currentUser.role === 'admin' && (
        <div style={{background:'#eef1fe',border:'1px solid #c7d2fe',borderRadius:8,padding:'10px 16px',marginBottom:10,display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontSize:13,fontWeight:500,color:'#3730a3'}}>Выбрано: {selected.size}</span>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowDistribute(true)}>👥 Распределить по менеджерам</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>setShowBulkStatus(true)}>🔄 Сменить статус</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>setSelected(new Set())}>Снять выделение</button>
        </div>
      )}

      <div className="table-wrap" style={{overflowX:'auto'}}>
        <table style={{minWidth:600}}>
          <thead>
            <tr>
              {currentUser.role==='admin' && <th style={{width:32}}><input type="checkbox" className="in-work-check" checked={selected.size===bloggers.length&&bloggers.length>0} onChange={toggleSelectAll} /></th>}
              <th>Ник</th>
              {show('status') && <th>Статус</th>}
              {show('comment') && <th>Комментарий</th>}
              {show('manager') && <th>Менеджер</th>}
              {show('links') && <th>Ссылки</th>}
              {show('inst_followers') && <th>Подп. Инст</th>}
              {show('inst_reach') && <th>Охват Инст</th>}
              {show('tt_followers') && <th>Подп. ТТ</th>}
              {show('tt_reach') && <th>Охват ТТ</th>}
              {show('price_reels') && <th>Рилс</th>}
              {show('cpv_reels') && <th>CPV Рилс</th>}
              {show('price_tt') && <th>ТТ</th>}
              {show('cpv_tt') && <th>CPV ТТ</th>}
              {show('price_both') && <th>Рилс+ТТ</th>}
              {show('cpv_both') && <th>CPV Р+ТТ</th>}
              {show('price_stories') && <th>Сторис</th>}
              {show('cpv_stories') && <th>CPV Сторис</th>}
              {show('added') && <th>Добавлен</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={20} style={{textAlign:'center',padding:40,color:'#9ba3be'}}>Загрузка...</td></tr>
            ) : bloggers.length === 0 ? (
              <tr><td colSpan={20}><div className="empty-state"><div style={{fontSize:36}}>👥</div><p>Пусто.</p></div></td></tr>
            ) : bloggers.map(b => {
              const isWaiting = b.status==='contacted' && b.contacted_at && daysSince(b.contacted_at) >= 3;
              const isFresh = isNew(b.created_at);
              const isSelected = selected.has(b.id);
              return (
                <tr key={b.id}
                  className={b.in_work?'in-work-row':isWaiting?'warning-row':isFresh?'new-batch-row':''}
                  style={{background:isSelected?'#eef1fe':undefined,cursor:'pointer'}}
                  onClick={e=>{ if(!e.target.closest('input')&&!e.target.closest('a')&&!e.target.closest('button')&&!e.target.closest('[data-dropdown]')) setEditBlogger(b); }}>
                  {currentUser.role==='admin' && (
                    <td onClick={e=>e.stopPropagation()}><input type="checkbox" className="in-work-check" checked={isSelected} onChange={()=>toggleSelect(b.id)} /></td>
                  )}
                  <td style={{fontWeight:500,whiteSpace:'nowrap'}}>{b.name}{isFresh && <span className="badge-new">new</span>}</td>
                  {show('status') && <td data-dropdown="true" onClick={e=>e.stopPropagation()}>
                    <StatusDropdown value={b.status} onChange={v=>patch(b.id,{status:v,in_work:v==='in_work'||v==='transferred',decline_reason:v.startsWith('declined')?v.replace('declined_',''):null})} />
                  </td>}
                  {show('comment') && <td onClick={e=>e.stopPropagation()}><CommentCell value={b.last_comment} onSave={v=>patch(b.id,{last_comment:v})} /></td>}
                  {show('manager') && <td>{b.manager_name?<span className="tag">{b.manager_name}</span>:<span style={{color:'#9ba3be',fontSize:11}}>—</span>}</td>}
                  {show('links') && <td style={{whiteSpace:'nowrap'}} onClick={e=>e.stopPropagation()}>
                    {b.instagram_url && <a href={b.instagram_url} target="_blank" rel="noreferrer" className="td-link">📸</a>}
                    {b.tiktok_url && <a href={b.tiktok_url} target="_blank" rel="noreferrer" className="td-link">🎵</a>}
                  </td>}
                  {show('inst_followers') && <td onClick={e=>e.stopPropagation()}><EditableCell value={b.instagram_followers} type="number" onSave={v=>patch(b.id,{instagram_followers:Number(v)})} /></td>}
                  {show('inst_reach') && <td onClick={e=>e.stopPropagation()}><EditableCell value={b.instagram_avg_reach} type="number" onSave={v=>patch(b.id,{instagram_avg_reach:Number(v)})} /></td>}
                  {show('tt_followers') && <td onClick={e=>e.stopPropagation()}><EditableCell value={b.tiktok_followers} type="number" onSave={v=>patch(b.id,{tiktok_followers:Number(v)})} /></td>}
                  {show('tt_reach') && <td onClick={e=>e.stopPropagation()}><EditableCell value={b.tiktok_avg_reach} type="number" onSave={v=>patch(b.id,{tiktok_avg_reach:Number(v)})} /></td>}
                  {show('price_reels') && <td onClick={e=>e.stopPropagation()}><EditableCell value={b.price_reels} type="number" suffix="₸" onSave={v=>patch(b.id,{price_reels:Number(v)})} /></td>}
                  {show('cpv_reels') && <td><span className={`cpv-badge ${cpvClass(b.cpv_reels)}`}>{b.cpv_reels?b.cpv_reels+'₸':'—'}</span></td>}
                  {show('price_tt') && <td onClick={e=>e.stopPropagation()}><EditableCell value={b.price_tiktok} type="number" suffix="₸" onSave={v=>patch(b.id,{price_tiktok:Number(v)})} /></td>}
                  {show('cpv_tt') && <td><span className={`cpv-badge ${cpvClass(b.cpv_tiktok)}`}>{b.cpv_tiktok?b.cpv_tiktok+'₸':'—'}</span></td>}
                  {show('price_both') && <td onClick={e=>e.stopPropagation()}><EditableCell value={b.price_both} type="number" suffix="₸" onSave={v=>patch(b.id,{price_both:Number(v)})} /></td>}
                  {show('cpv_both') && <td><span className={`cpv-badge ${cpvClass(b.cpv_both)}`}>{b.cpv_both?b.cpv_both+'₸':'—'}</span></td>}
                  {show('price_stories') && <td onClick={e=>e.stopPropagation()}><EditableCell value={b.price_stories} type="number" suffix="₸" onSave={v=>patch(b.id,{price_stories:Number(v)})} /></td>}
                  {show('cpv_stories') && <td><span className={`cpv-badge ${cpvClass(b.cpv_stories)}`}>{b.cpv_stories?b.cpv_stories+'₸':'—'}</span></td>}
                  {show('added') && <td style={{fontSize:11,color:isFresh?'#4f6ef7':'#9ba3be',whiteSpace:'nowrap'}}>{fmtDate(b.created_at)}</td>}
                  <td onClick={e=>e.stopPropagation()}><button className="btn btn-danger btn-sm" onClick={()=>handleDelete(b.id)}>🗑</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onChange={p=>{setPage(p);window.scrollTo(0,0);}} />

      {(showAdd||editBlogger) && <BloggerModal blogger={editBlogger} users={users} currentUser={currentUser} onSave={handleSave} onClose={()=>{setShowAdd(false);setEditBlogger(null);}} />}
      {showImport && <ImportModal onClose={()=>{setShowImport(false);doFetch(1);apiFetch('/api/batches').then(r=>r.json()).then(setBatches);}} />}

      {pendingBlogger && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setPendingBlogger(null)}>
          <div className="modal" style={{maxWidth:400}}>
            <div className="modal-header"><div className="modal-title">Взять в работу?</div><button className="modal-close" onClick={()=>setPendingBlogger(null)}>×</button></div>
            <p style={{color:'#5a6380',fontSize:13,marginBottom:16}}><strong>{pendingBlogger.name}</strong> — выбери менеджера</p>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
              {users.map(u=>(
                <div key={u.id} onClick={async()=>{await patch(pendingBlogger.id,{in_work:true,assigned_manager_id:u.id,status:'in_work'});setPendingBlogger(null);}}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',border:'1px solid #e2e6ef',borderRadius:8,cursor:'pointer'}}
                  onMouseOver={e=>e.currentTarget.style.background='#f8f9fb'}
                  onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{width:32,height:32,borderRadius:'50%',background:'#eef1fe',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600,color:'#4f6ef7'}}>{u.username.slice(0,2).toUpperCase()}</div>
                  <span style={{fontSize:13,fontWeight:500}}>{u.username}</span>
                </div>
              ))}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end'}}><button className="btn btn-secondary" onClick={()=>setPendingBlogger(null)}>Отмена</button></div>
          </div>
        </div>
      )}

      {showBulkStatus && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowBulkStatus(false)}>
          <div className="modal" style={{maxWidth:400}}>
            <div className="modal-header">
              <div className="modal-title">Сменить статус — {selected.size} блогеров</div>
              <button className="modal-close" onClick={()=>setShowBulkStatus(false)}>×</button>
            </div>
            <p style={{color:'#5a6380',fontSize:13,marginBottom:16}}>Выбери новый статус для всех выбранных блогеров</p>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
              {STATUS_OPTIONS.map(s=>(
                <div key={s.value} onClick={()=>handleBulkStatus(s.value)}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',border:'1px solid #e2e6ef',borderRadius:8,cursor:'pointer'}}
                  onMouseOver={e=>e.currentTarget.style.background='#f8f9fb'}
                  onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                  <span className={`status-badge status-${s.value}`}>{s.label}</span>
                </div>
              ))}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <button className="btn btn-secondary" onClick={()=>setShowBulkStatus(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {showDistribute && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowDistribute(false)}>
          <div className="modal" style={{maxWidth:440}}>
            <div className="modal-header"><div className="modal-title">Распределить {selected.size} блогеров</div><button className="modal-close" onClick={()=>setShowDistribute(false)}>×</button></div>
            <p style={{color:'#5a6380',fontSize:13,marginBottom:16}}>Выбери менеджеров — блогеры раздадутся поровну и получат статус "В работе"</p>
            <DistributeForm users={users} count={selected.size} onDistribute={handleDistribute} onClose={()=>setShowDistribute(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function DistributeForm({ users, count, onDistribute, onClose }) {
  const [selectedManagers, setSelectedManagers] = useState(new Set());
  const toggle = (id) => { setSelectedManagers(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; }); };
  const perManager = selectedManagers.size > 0 ? Math.ceil(count / selectedManagers.size) : 0;
  return (
    <>
      <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
        {users.map(u=>(
          <div key={u.id} onClick={()=>toggle(u.id)}
            style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',border:`1px solid ${selectedManagers.has(u.id)?'#4f6ef7':'#e2e6ef'}`,borderRadius:8,cursor:'pointer',background:selectedManagers.has(u.id)?'#eef1fe':'transparent'}}>
            <input type="checkbox" checked={selectedManagers.has(u.id)} onChange={()=>{}} style={{accentColor:'#4f6ef7'}} />
            <div style={{width:32,height:32,borderRadius:'50%',background:'#eef1fe',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600,color:'#4f6ef7'}}>{u.username.slice(0,2).toUpperCase()}</div>
            <span style={{fontSize:13,fontWeight:500,flex:1}}>{u.username}</span>
            {selectedManagers.has(u.id) && <span style={{fontSize:11,color:'#4f6ef7'}}>~{perManager} блогеров</span>}
          </div>
        ))}
      </div>
      {selectedManagers.size > 0 && (
        <div style={{background:'#f8f9fb',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:12,color:'#5a6380'}}>
          {count} блогеров → {selectedManagers.size} менеджер(а) = ~{perManager} каждому
        </div>
      )}
      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
        <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" disabled={selectedManagers.size===0} onClick={()=>onDistribute(Array.from(selectedManagers))}>Распределить</button>
      </div>
    </>
  );
}
