import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../App';
import BloggerModal from '../components/BloggerModal';
import ImportModal from '../components/ImportModal';

const STATUS_OPTIONS = [
  { value: 'new', label: 'Новый', color: '#94a3b8' },
  { value: 'contacted', label: 'Написали', color: '#f59e0b' },
  { value: 'replied', label: 'Ответили', color: '#a78bfa' },
  { value: 'in_work', label: 'В работе', color: '#22c55e' },
  { value: 'declined', label: 'Отказ (контент)', color: '#ef4444' },
  { value: 'declined_bad', label: 'Отказ (чёрный список)', color: '#7f1d1d' },
];

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
    const handler = e => { if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  return (
    <div ref={ref} style={{position:'relative',display:'inline-block'}}>
      <span className={`status-badge status-${value}`} onClick={e=>{e.stopPropagation();setOpen(!open)}} style={{cursor:'pointer',userSelect:'none'}}>
        {current.label} ▾
      </span>
      {open && (
        <div style={{position:'absolute',top:'100%',left:0,zIndex:100,background:'var(--surface-1)',border:'1px solid var(--border)',borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,0.15)',minWidth:180,marginTop:4}}>
          {STATUS_OPTIONS.map(s => (
            <div key={s.value} onClick={e=>{e.stopPropagation();onChange(s.value);setOpen(false);}}
              style={{padding:'8px 14px',cursor:'pointer',fontSize:12,color:s.color,fontWeight:500}}
              onMouseOver={e=>e.currentTarget.style.background='var(--surface-2)'}
              onMouseOut={e=>e.currentTarget.style.background='transparent'}>
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditableCell({ value, onSave, type='text', prefix='', suffix='' }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value||'');
  const [saved, setSaved] = useState(false);
  const inputRef = useRef();

  useEffect(() => { setVal(value||''); }, [value]);
  useEffect(() => { if(editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const handleSave = async () => {
    setEditing(false);
    if (val != value) {
      await onSave(val);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  if (editing) return (
    <input ref={inputRef} type={type} value={val}
      onChange={e=>setVal(e.target.value)}
      onBlur={handleSave}
      onKeyDown={e=>{ if(e.key==='Enter') handleSave(); if(e.key==='Escape') setEditing(false); }}
      style={{width:90,padding:'2px 6px',fontSize:12,border:'1px solid var(--border-accent)',borderRadius:4,background:'var(--surface-1)',color:'var(--text-primary)'}}
      onClick={e=>e.stopPropagation()}
    />
  );
  return (
    <span onClick={e=>{e.stopPropagation();setEditing(true);}} style={{cursor:'text',borderBottom:'1px dashed var(--border)',paddingBottom:1}}>
      {saved && <span style={{color:'#22c55e',marginRight:4}}>✓</span>}
      {prefix}{value ? fmtNum(value) : <span style={{color:'var(--text-muted)'}}>—</span>}{suffix}
    </span>
  );
}

function CommentCell({ value, bloggerId, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value||'');
  const [saved, setSaved] = useState(false);
  const inputRef = useRef();
  useEffect(() => { setVal(value||''); }, [value]);
  useEffect(() => { if(editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const handleSave = async () => {
    setEditing(false);
    if (val !== value) { await onSave(val); setSaved(true); setTimeout(()=>setSaved(false),2000); }
  };

  if (editing) return (
    <input ref={inputRef} value={val} onChange={e=>setVal(e.target.value)}
      onBlur={handleSave} onKeyDown={e=>{if(e.key==='Enter')handleSave();if(e.key==='Escape')setEditing(false);}}
      style={{width:160,padding:'2px 6px',fontSize:12,border:'1px solid var(--border-accent)',borderRadius:4,background:'var(--surface-1)',color:'var(--text-primary)'}}
      onClick={e=>e.stopPropagation()} placeholder="Добавить комментарий..."
    />
  );
  return (
    <span onClick={e=>{e.stopPropagation();setEditing(true);}} title={value||''}
      style={{cursor:'text',borderBottom:'1px dashed var(--border)',paddingBottom:1,maxWidth:160,display:'inline-block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12,color:value?'var(--text-primary)':'var(--text-muted)'}}>
      {saved && <span style={{color:'#22c55e',marginRight:4}}>✓</span>}
      {value || 'добавить...'}
    </span>
  );
}

export default function BloggerList({ currentUser }) {
  const [bloggers, setBloggers] = useState([]);
  const [users, setUsers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [cpvMax, setCpvMax] = useState('');
  const [reachMin, setReachMin] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [inWorkOnly, setInWorkOnly] = useState(false);
  const [excludeDeclined, setExcludeDeclined] = useState(false);
  const [sort, setSort] = useState('default');
  const [showFilters, setShowFilters] = useState(false);
  const [editBlogger, setEditBlogger] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [pendingBlogger, setPendingBlogger] = useState(null);
  const timer = useRef(null);

  const fetchBloggers = useCallback(async () => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (statusFilter) p.set('status', statusFilter);
    if (managerFilter) p.set('manager', managerFilter);
    if (inWorkOnly) p.set('in_work', '1');
    if (sort !== 'default') p.set('sort', sort);
    if (platformFilter) p.set('platform', platformFilter);
    if (cpvMax) p.set('cpv_max', cpvMax);
    if (reachMin) p.set('reach_min', reachMin);
    if (batchFilter) p.set('batch_id', batchFilter);
    if (excludeDeclined) p.set('exclude_declined', '1');
    const res = await apiFetch('/api/bloggers?' + p);
    setBloggers(await res.json());
    setLoading(false);
  }, [search, statusFilter, managerFilter, inWorkOnly, sort, platformFilter, cpvMax, reachMin, batchFilter, excludeDeclined]);

  useEffect(() => { apiFetch('/api/users').then(r=>r.json()).then(setUsers); apiFetch('/api/batches').then(r=>r.json()).then(setBatches); }, []);
  useEffect(() => { clearTimeout(timer.current); timer.current = setTimeout(fetchBloggers, 300); }, [fetchBloggers]);

  const patch = async (id, fields) => {
    const res = await apiFetch(`/api/bloggers/${id}`, { method: 'PATCH', body: JSON.stringify(fields) });
    const updated = await res.json();
    setBloggers(prev => prev.map(b => b.id === id ? updated : b));
    return updated;
  };

  const handleSave = async (data) => {
    const isEdit = !!data.id;
    await apiFetch(isEdit ? `/api/bloggers/${data.id}` : '/api/bloggers', { method: isEdit?'PUT':'POST', body: JSON.stringify(data) });
    setEditBlogger(null); setShowAdd(false); fetchBloggers();
  };
  const handleDelete = async (id) => {
    if (!window.confirm('Удалить?')) return;
    await apiFetch(`/api/bloggers/${id}`, { method:'DELETE' }); fetchBloggers();
  };
  const handleExport = async () => {
    const token = localStorage.getItem('token');
    const p = new URLSearchParams();
    if (statusFilter) p.set('status', statusFilter);
    if (managerFilter) p.set('manager', managerFilter);
    if (platformFilter) p.set('platform', platformFilter);
    if (batchFilter) p.set('batch_id', batchFilter);
    if (cpvMax) p.set('cpv_max', cpvMax);
    if (reachMin) p.set('reach_min', reachMin);
    if (inWorkOnly) p.set('in_work', '1');
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
    fetchBloggers(); apiFetch('/api/batches').then(r=>r.json()).then(setBatches);
  };

  const waiting = bloggers.filter(b => b.status==='contacted' && b.contacted_at && daysSince(b.contacted_at) >= 3);
  const newOnes = bloggers.filter(b => isNew(b.created_at) && !b.in_work);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Блогеры</div>
          <div className="page-subtitle">{bloggers.length} в базе · {bloggers.filter(b=>b.in_work===true).length} в работе</div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {currentUser.role==='admin' && <button className="btn btn-danger btn-sm" onClick={handleClearAll}>🗑 Очистить базу</button>}
          {currentUser.role==='admin' && <button className="btn btn-secondary btn-sm" onClick={handleTemplate}>📋 Шаблон</button>}
          {currentUser.role==='admin' && <button className="btn btn-secondary btn-sm" onClick={handleExport}>📊 Excel</button>}
          <button className="btn btn-secondary btn-sm" onClick={()=>setShowImport(true)}>📥 Импорт</button>
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}>+ Добавить</button>
        </div>
      </div>

      {waiting.length > 0 && (
        <div className="alert-panel warning">
          <strong>⏰ Ждут ответа {waiting.length} блогеров (3+ дня)</strong>
          <div style={{marginTop:6,display:'flex',flexWrap:'wrap',gap:6}}>
            {waiting.slice(0,8).map(b=>(
              <span key={b.id} className="alert-tag" onClick={()=>setEditBlogger(b)} style={{cursor:'pointer'}}>
                {b.name} · {daysSince(b.contacted_at)} дн.
              </span>
            ))}
          </div>
        </div>
      )}
      {newOnes.length > 0 && (
        <div className="alert-panel info">
          <strong>🆕 Новые за 3 дня — {newOnes.length} без расценок</strong>
        </div>
      )}

      <div className="toolbar">
        <input className="search-input" placeholder="🔍 Поиск..." value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="select-filter" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">Все статусы</option>
          {STATUS_OPTIONS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="select-filter" value={managerFilter} onChange={e=>setManagerFilter(e.target.value)}>
          <option value="">Все менеджеры</option>
          {users.map(u=><option key={u.id} value={u.id}>{u.username}</option>)}
        </select>
        <select className="select-filter" value={sort} onChange={e=>setSort(e.target.value)}>
          <option value="default">Новые цены сверху</option>
          <option value="created_desc">Дата добавления ↓</option>
          <option value="cpv_asc">CPV: дешевле</option>
          <option value="cpv_desc">CPV: дороже</option>
        </select>
        {batches.length > 0 && (
          <select className="select-filter" value={batchFilter} onChange={e=>setBatchFilter(e.target.value)}>
            <option value="">Все партии</option>
            {batches.map(b=><option key={b.id} value={b.id}>{fmtDate(b.created_at)} · {b.count} шт.</option>)}
          </select>
        )}
        <button className="btn btn-secondary btn-sm" onClick={()=>setShowFilters(!showFilters)}>
          {showFilters?'▲':'▼'} Фильтры
        </button>
      </div>

      {showFilters && (
        <div className="filters-panel">
          <div className="filter-row">
            <label>Платформа</label>
            <select className="select-filter" value={platformFilter} onChange={e=>setPlatformFilter(e.target.value)}>
              <option value="">Любая</option><option value="instagram">Только Инст</option>
              <option value="tiktok">Только ТТ</option><option value="both">Инст + ТТ</option>
            </select>
          </div>
          <div className="filter-row">
            <label>CPV не более (₸)</label>
            <input className="filter-input" type="number" placeholder="напр. 30" value={cpvMax} onChange={e=>setCpvMax(e.target.value)} />
          </div>
          <div className="filter-row">
            <label>Охват от</label>
            <input className="filter-input" type="number" placeholder="напр. 20000" value={reachMin} onChange={e=>setReachMin(e.target.value)} />
          </div>
          <label className="filter-check"><input type="checkbox" checked={inWorkOnly} onChange={e=>setInWorkOnly(e.target.checked)} /> Только в работе</label>
          <label className="filter-check"><input type="checkbox" checked={excludeDeclined} onChange={e=>setExcludeDeclined(e.target.checked)} /> Исключить отказы</label>
          <button className="btn btn-secondary btn-sm" onClick={()=>{ setStatusFilter('');setManagerFilter('');setPlatformFilter('');setCpvMax('');setReachMin('');setBatchFilter('');setInWorkOnly(false);setExcludeDeclined(false); }}>Сбросить</button>
        </div>
      )}

      <div className="table-wrap" style={{overflowX:'auto'}}>
        <table style={{minWidth:1400}}>
          <thead>
            <tr>
              {currentUser.role==='admin' && <th style={{width:28}}>✓</th>}
              <th style={{position:'sticky',left:0,background:'var(--surface-1)',zIndex:2}}>Ник</th>
              <th style={{position:'sticky',left:140,background:'var(--surface-1)',zIndex:2}}>Статус</th>
              <th>Комментарий</th>
              <th>Менеджер</th>
              <th>Ссылки</th>
              <th>Подп. Инст</th>
              <th>Охват Инст</th>
              <th>Подп. ТТ</th>
              <th>Охват ТТ</th>
              <th>Рилс</th>
              <th>CPV Рилс</th>
              <th>ТТ</th>
              <th>CPV ТТ</th>
              <th>Рилс+ТТ</th>
              <th>CPV Р+ТТ</th>
              <th>Сторис</th>
              <th>CPV Сторис</th>
              <th>Добавлен</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={20} style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>Загрузка...</td></tr>
            ) : bloggers.length === 0 ? (
              <tr><td colSpan={20}><div className="empty-state"><div style={{fontSize:36}}>👥</div><p>Пусто. Добавьте или импортируйте блогеров.</p></div></td></tr>
            ) : bloggers.map(b => {
              const isWaiting = b.status==='contacted' && b.contacted_at && daysSince(b.contacted_at) >= 3;
              const isFresh = isNew(b.created_at);
              return (
                <tr key={b.id}
                  className={b.in_work?'in-work-row':isWaiting?'warning-row':isFresh?'new-batch-row':''}
                  onClick={e=>{ if(!e.target.closest('input')&&!e.target.closest('a')&&!e.target.closest('button')&&!e.target.closest('.status-dropdown')) setEditBlogger(b); }}
                  style={{cursor:'pointer'}}>
                  {currentUser.role==='admin' && (
                    <td onClick={e=>e.stopPropagation()}>
                      <input type="checkbox" className="in-work-check" checked={!!b.in_work}
                        onChange={()=>{ if(!b.in_work) setPendingBlogger(b); else patch(b.id,{in_work:false,status:'replied'}); }}
                      />
                    </td>
                  )}
                  <td style={{position:'sticky',left:0,background:b.in_work?'#0d2016':isWaiting?'#2a1a00':isFresh?'#0d1a2e':'var(--surface-2)',zIndex:1,fontWeight:500,whiteSpace:'nowrap'}}>
                    {b.name}
                    {isFresh && <span className="badge-new">new</span>}
                  </td>
                  <td style={{position:'sticky',left:140,background:b.in_work?'#0d2016':isWaiting?'#2a1a00':isFresh?'#0d1a2e':'var(--surface-2)',zIndex:1}} onClick={e=>e.stopPropagation()}>
                    <StatusDropdown value={b.status} onChange={v=>patch(b.id,{status:v,in_work:v==='in_work',decline_reason:v.startsWith('declined')?v.replace('declined_',''):null})} />
                  </td>
                  <td onClick={e=>e.stopPropagation()}>
                    <CommentCell value={b.last_comment} bloggerId={b.id} onSave={v=>patch(b.id,{last_comment:v})} />
                  </td>
                  <td>{b.manager_name?<span className="tag">{b.manager_name}</span>:<span style={{color:'var(--text-muted)',fontSize:11}}>—</span>}</td>
                  <td style={{whiteSpace:'nowrap'}} onClick={e=>e.stopPropagation()}>
                    {b.instagram_url && <a href={b.instagram_url} target="_blank" rel="noreferrer" className="td-link">📸</a>}
                    {b.tiktok_url && <a href={b.tiktok_url} target="_blank" rel="noreferrer" className="td-link">🎵</a>}
                  </td>
                  <td onClick={e=>e.stopPropagation()}><EditableCell value={b.instagram_followers} type="number" onSave={v=>patch(b.id,{instagram_followers:Number(v)})} /></td>
                  <td onClick={e=>e.stopPropagation()}><EditableCell value={b.instagram_avg_reach} type="number" onSave={v=>patch(b.id,{instagram_avg_reach:Number(v)})} /></td>
                  <td onClick={e=>e.stopPropagation()}><EditableCell value={b.tiktok_followers} type="number" onSave={v=>patch(b.id,{tiktok_followers:Number(v)})} /></td>
                  <td onClick={e=>e.stopPropagation()}><EditableCell value={b.tiktok_avg_reach} type="number" onSave={v=>patch(b.id,{tiktok_avg_reach:Number(v)})} /></td>
                  <td onClick={e=>e.stopPropagation()}><EditableCell value={b.price_reels} type="number" suffix="₸" onSave={v=>patch(b.id,{price_reels:Number(v)})} /></td>
                  <td><span className={`cpv-badge ${cpvClass(b.cpv_reels)}`}>{b.cpv_reels?b.cpv_reels+'₸':'—'}</span></td>
                  <td onClick={e=>e.stopPropagation()}><EditableCell value={b.price_tiktok} type="number" suffix="₸" onSave={v=>patch(b.id,{price_tiktok:Number(v)})} /></td>
                  <td><span className={`cpv-badge ${cpvClass(b.cpv_tiktok)}`}>{b.cpv_tiktok?b.cpv_tiktok+'₸':'—'}</span></td>
                  <td onClick={e=>e.stopPropagation()}><EditableCell value={b.price_both} type="number" suffix="₸" onSave={v=>patch(b.id,{price_both:Number(v)})} /></td>
                  <td><span className={`cpv-badge ${cpvClass(b.cpv_both)}`}>{b.cpv_both?b.cpv_both+'₸':'—'}</span></td>
                  <td onClick={e=>e.stopPropagation()}><EditableCell value={b.price_stories} type="number" suffix="₸" onSave={v=>patch(b.id,{price_stories:Number(v)})} /></td>
                  <td><span className={`cpv-badge ${cpvClass(b.cpv_stories)}`}>{b.cpv_stories?b.cpv_stories+'₸':'—'}</span></td>
                  <td style={{fontSize:11,color:isFresh?'var(--text-success)':'var(--text-muted)',whiteSpace:'nowrap'}}>{fmtDate(b.created_at)}</td>
                  <td onClick={e=>e.stopPropagation()}>
                    <div className="actions-cell">
                      <button className="btn btn-danger btn-sm" onClick={()=>handleDelete(b.id)}>🗑</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(showAdd||editBlogger) && <BloggerModal blogger={editBlogger} users={users} currentUser={currentUser} onSave={handleSave} onClose={()=>{setShowAdd(false);setEditBlogger(null);}} />}
      {showImport && <ImportModal onClose={()=>{setShowImport(false);fetchBloggers();apiFetch('/api/batches').then(r=>r.json()).then(setBatches);}} />}

      {pendingBlogger && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setPendingBlogger(null)}>
          <div className="modal" style={{maxWidth:400}}>
            <div className="modal-header">
              <div className="modal-title">Взять в работу?</div>
              <button className="modal-close" onClick={()=>setPendingBlogger(null)}>×</button>
            </div>
            <p style={{color:'var(--text-secondary)',fontSize:13,marginBottom:16}}>
              <strong>{pendingBlogger.name}</strong> — выбери ответственного менеджера
            </p>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
              {users.map(u=>(
                <div key={u.id} onClick={async()=>{
                    await patch(pendingBlogger.id,{in_work:true,assigned_manager_id:u.id,status:'in_work'});
                    setPendingBlogger(null);
                  }}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',border:'1px solid var(--border)',borderRadius:8,cursor:'pointer',background:'var(--surface-1)'}}
                  onMouseOver={e=>e.currentTarget.style.borderColor='var(--border-accent)'}
                  onMouseOut={e=>e.currentTarget.style.borderColor='var(--border)'}>
                  <div style={{width:32,height:32,borderRadius:'50%',background:'var(--bg-accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600,color:'var(--text-accent)'}}>
                    {u.username.slice(0,2).toUpperCase()}
                  </div>
                  <span style={{fontSize:13,fontWeight:500}}>{u.username}</span>
                </div>
              ))}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <button className="btn btn-secondary" onClick={()=>setPendingBlogger(null)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
