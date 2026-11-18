import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../App';

// Поиск блогеров через Apify: хэштеги → рилсы → профили авторов → новые блогеры в базе.
const STATUS = { pending:'в очереди', starting:'запуск', running:'идёт', done:'готово', failed:'ошибка', uncertain:'проверить в Apify', cancelled:'отменён' };
const STAGE = { reels:'1/2 · ищем рилсы по хэштегам', profiles:'2/2 · собираем профили авторов', done:'' };
const fmt = n => Number(n||0).toLocaleString('ru-RU');

export default function ScoutPage({ currentUser }) {
  const isAdmin = currentUser.role === 'admin';
  const [data, setData] = useState({ jobs: [] });
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ hashtags:'', perTag:30, maxProfiles:50, minFollowers:3000, maxFollowers:300000, maxUsd:1, managerIds:[] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const load = useCallback(() => apiFetch('/api/scout/jobs').then(r=>r.ok?r.json():{jobs:[]}).then(setData).catch(()=>{}), []);
  useEffect(() => { load(); apiFetch('/api/users').then(r=>r.ok?r.json():[]).then(d=>setUsers(Array.isArray(d)?d.filter(u=>u.role==='manager'):[])); }, [load]);
  useEffect(() => { const active = (data.jobs||[]).some(j=>['pending','starting','running'].includes(j.status)); if(!active) return; const t = setInterval(load, 8000); return () => clearInterval(t); }, [data, load]);

  const run = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await apiFetch('/api/scout/jobs', { method:'POST', body: JSON.stringify(form) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Ошибка');
      setMsg('Запущено: результаты появятся через 2–6 минут'); load();
    } catch (e) { setMsg('⚠ ' + e.message); }
    setBusy(false);
  };
  const cancel = async id => { await apiFetch(`/api/scout/jobs/${id}/cancel`, { method:'POST' }); load(); };
  const toggleManager = id => set('managerIds', form.managerIds.includes(id) ? form.managerIds.filter(x=>x!==id) : [...form.managerIds, id]);
  const box = { background:'#fff', border:'1px solid #e2e6ef', borderRadius:12, padding:16, marginBottom:16 };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🔎 Поиск блогеров</div>
          <div className="page-subtitle">Apify: рилсы по хэштегам → профили авторов → новые блогеры в базе с подписчиками, средними просмотрами и ER</div>
        </div>
      </div>

      {!data.configured && (
        <div style={{...box, background:'#fff7e6', borderColor:'#f5d69a', color:'#7a4a00', fontSize:13}}>
          Apify ещё не подключён. Администратор вставляет в Render (сервис CRM → Environment) <b>APIFY_TOKEN</b> — токен из Apify (Settings → API &amp; Integrations), и <b>APIFY_SCOUT_ENABLED=1</b>.
          {data.hasToken ? ' Токен уже есть — осталось APIFY_SCOUT_ENABLED=1.' : ''}
        </div>
      )}

      {isAdmin && (
        <div style={box}>
          <div className="field"><label>Хэштеги (через запятую или с новой строки, до 10)</label>
            <textarea rows={2} value={form.hashtags} onChange={e=>set('hashtags', e.target.value)} placeholder="бьютиалматы, косметикаказахстан, уходзакожей, астанабьюти" /></div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12}}>
            <div className="field"><label>Рилсов на хэштег</label><input type="number" min={5} max={100} value={form.perTag} onChange={e=>set('perTag', e.target.value)} /></div>
            <div className="field"><label>Профилей максимум</label><input type="number" min={5} max={200} value={form.maxProfiles} onChange={e=>set('maxProfiles', e.target.value)} /></div>
            <div className="field"><label>Подписчиков от</label><input type="number" min={0} value={form.minFollowers} onChange={e=>set('minFollowers', e.target.value)} /></div>
            <div className="field"><label>Подписчиков до</label><input type="number" min={0} value={form.maxFollowers} onChange={e=>set('maxFollowers', e.target.value)} /></div>
            <div className="field"><label>Потолок, $ (до {data.runLimit||1})</label><input type="number" step="0.1" min={0.1} max={data.runLimit||1} value={form.maxUsd} onChange={e=>set('maxUsd', e.target.value)} /></div>
          </div>
          {users.length > 0 && <div className="field"><label>Сразу раздать менеджерам (необязательно — иначе блогеры попадут в базу как «новые»)</label>
            <div style={{display:'flex', flexWrap:'wrap', gap:8}}>{users.map(u => (
              <label key={u.id} style={{display:'flex', gap:4, alignItems:'center', fontWeight:400, fontSize:13, padding:'3px 8px', border:'1px solid #e2e6ef', borderRadius:8, cursor:'pointer'}}>
                <input type="checkbox" checked={form.managerIds.includes(u.id)} onChange={()=>toggleManager(u.id)} /> {u.username}</label>))}</div></div>}
          <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
            <button className="btn btn-primary" disabled={busy || !data.configured} onClick={run}>{busy ? 'Запускаю…' : 'Найти блогеров'}</button>
            <span style={{fontSize:12, color: msg.startsWith('⚠') ? '#c0392b' : '#1f8a4c'}}>{msg}</span>
            <span style={{fontSize:12, color:'#8a90a6'}}>Примерно $0.25 за 100 рилсов + $0.25 за 100 профилей. Дневной лимит {data.dayLimit||3} $.</span>
          </div>
        </div>
      )}

      {(data.jobs||[]).length === 0 ? <div className="empty-state"><div style={{fontSize:36}}>🔎</div><p>Запусков пока не было</p></div> :
        (data.jobs||[]).map(j => (
          <div key={j.id} style={box}>
            <div style={{display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
              <div><b>#{(j.hashtags||[]).join(' #')}</b>
                <div style={{fontSize:12, color:'#8a90a6'}}>{new Date(j.createdAt).toLocaleString('ru-RU')} · {j.createdByName} · подписчики {fmt(j.minFollowers)}–{j.maxFollowers ? fmt(j.maxFollowers) : '∞'} · потолок {j.maxUsd} ${j.spentUsd ? ` · потрачено ${j.spentUsd} $` : ''}</div></div>
              <div style={{textAlign:'right', fontSize:13}}>
                <span style={{padding:'2px 8px', borderRadius:8, background: j.status==='done' ? '#e8f7ee' : j.status==='failed' || j.status==='uncertain' ? '#fde8ee' : '#eef2ff'}}>{STATUS[j.status]||j.status}</span>
                {['pending','running'].includes(j.status) && <div style={{fontSize:12, color:'#8a90a6', marginTop:4}}>{STAGE[j.stage]} {isAdmin && <button className="btn btn-secondary btn-sm" onClick={()=>cancel(j.id)}>Отменить</button>}</div>}
              </div>
            </div>
            {j.lastError && <div style={{fontSize:12, color:'#c0392b', marginTop:6}}>{j.lastError}</div>}
            {j.reelsFound != null && <div style={{fontSize:13, marginTop:8}}>Рилсов: {fmt(j.reelsFound)} · авторов: {fmt(j.authorsFound)} · уже в базе: {fmt(j.alreadyInCrm)}</div>}
            {j.result && <div style={{fontSize:13, marginTop:4}}><b>Добавлено в базу: {fmt(j.result.created)}</b>{j.result.skipped ? ` · пропущено: закрытые ${j.result.skipped.private||0}, не подошли по подписчикам ${j.result.skipped.followers||0}, дубли ${j.result.skipped.duplicate||0}` : ''}</div>}
            {j.result && (j.result.sample||[]).length > 0 && (
              <div className="table-wrap" style={{overflowX:'auto', marginTop:8}}><table style={{minWidth:520}}>
                <thead><tr><th>Блогер</th><th>Подписчики</th><th>Ср. просмотры</th><th>ER, %</th></tr></thead>
                <tbody>{j.result.sample.map(b => (<tr key={b.id}><td><a href={`https://www.instagram.com/${b.username}/`} target="_blank" rel="noreferrer">@{b.username}</a></td><td>{fmt(b.followers)}</td><td>{fmt(b.reach)}</td><td>{b.er || '—'}</td></tr>))}</tbody>
              </table></div>)}
          </div>
        ))}
    </div>
  );
}
