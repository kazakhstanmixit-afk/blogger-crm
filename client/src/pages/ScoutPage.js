import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../App';

// Поиск блогеров через Apify: источники → профили → оценка «Казахстан» и качества → новые блогеры в базе.
const STATUS = { pending:'в очереди', starting:'запуск', running:'идёт', done:'готово', failed:'ошибка', uncertain:'проверить в Apify', cancelled:'отменён' };
const STAGE = { collect:'1/2 · собираем посты', seeds:'1/2 · профили стартовых блогеров', profiles:'2/2 · профили кандидатов', done:'' };
const SOURCES = [
  ['brands', 'Отметки брендов', 'Кто отмечал KZ-бренды, магазины, салоны и конкурентов — обычно уже работают с брендами. Самый сильный источник.'],
  ['hashtags', 'Хэштеги', 'Рилсы по хэштегам: городские (макияжалматы), казахские (беткүтімі), Kaspi (каспиартикул).'],
  ['similar', 'Похожие на блогеров', 'Берём 20–30 хороших блогеров и собираем похожих — находит тех, кто без хэштегов.'],
  ['places', 'Места', 'Посты с геотегами ТРЦ, салонов, кафе Алматы и Астаны — авторы почти наверняка местные.'],
  ['tiktok', 'TikTok по хэштегам', 'TikTok с фильтром по стране видео (KZ) — самый надёжный гео-фильтр.'],
];
const PRESET_TAGS = 'макияжалматы, макияжастана, бьютиалматы, бьютиастана, косметикаалматы, уходзакожей, беткүтімі, макияжшымкент, каспиартикул, каспикосметика';
const fmt = n => Number(n||0).toLocaleString('ru-RU');

export default function ScoutPage({ currentUser }) {
  const isAdmin = currentUser.role === 'admin';
  const [data, setData] = useState({ jobs: [] });
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ source:'brands', hashtags:'', accounts:'', competitors:'', perTag:30, maxProfiles:50, minFollowers:3000, maxFollowers:300000, periodDays:60, kzOnly:true, minKz:3, minViews:1000, activeOnly:true, maxAdShare:70, niche:'beauty', lang:'any', maxUsd:1, managerIds:[] });
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
      setMsg('Запущено: результаты появятся через 3–8 минут'); load();
    } catch (e) { setMsg('⚠ ' + e.message); }
    setBusy(false);
  };
  const cancel = async id => { await apiFetch(`/api/scout/jobs/${id}/cancel`, { method:'POST' }); load(); };
  const toggleManager = id => set('managerIds', form.managerIds.includes(id) ? form.managerIds.filter(x=>x!==id) : [...form.managerIds, id]);
  const box = { background:'#fff', border:'1px solid #e2e6ef', borderRadius:12, padding:16, marginBottom:16 };
  const grid = { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 };
  const src = SOURCES.find(s=>s[0]===form.source) || SOURCES[0];
  const usesTags = ['hashtags','tiktok'].includes(form.source);
  const srcName = id => (SOURCES.find(s=>s[0]===id)||[])[1] || id || 'Хэштеги';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🔎 Поиск блогеров</div>
          <div className="page-subtitle">Apify → профили → оценка «Казахстан» и качества → новые блогеры в базе (кто уже в базе — пропускается)</div>
        </div>
      </div>

      {!data.configured && (
        <div style={{...box, background:'#fff7e6', borderColor:'#f5d69a', color:'#7a4a00', fontSize:13}}>
          Apify не подключён: в Render (сервис CRM → Environment) нужны <b>APIFY_TOKEN</b> и <b>APIFY_SCOUT_ENABLED=1</b>.
        </div>
      )}

      {isAdmin && (
        <div style={box}>
          <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:8}}>
            {SOURCES.map(([id, label]) => (
              <button key={id} type="button" className={`btn btn-sm ${form.source===id?'btn-primary':'btn-secondary'}`} onClick={()=>set('source', id)}>{label}</button>
            ))}
          </div>
          <div style={{fontSize:12.5, color:'#5b6378', marginBottom:10}}>{src[2]}</div>

          {usesTags ? (
            <div className="field"><label>Хэштеги (через запятую, до 15) · <button type="button" className="btn btn-secondary btn-sm" onClick={()=>set('hashtags', PRESET_TAGS)}>подставить набор KZ</button></label>
              <textarea rows={2} value={form.hashtags} onChange={e=>set('hashtags', e.target.value)} placeholder={PRESET_TAGS} /></div>
          ) : (
            <div className="field"><label>{form.source==='brands' ? 'Аккаунты брендов / магазинов / салонов / конкурентов (ник или ссылка, по одному в строке)' : form.source==='places' ? 'Места: ссылки instagram.com/explore/locations/… или номера мест' : 'Стартовые блогеры (20–30 хороших, ник или ссылка)'}</label>
              <textarea rows={3} value={form.accounts} onChange={e=>set('accounts', e.target.value)} placeholder={form.source==='places' ? 'https://www.instagram.com/explore/locations/318767455/' : '@brand_kz\n@salon_almaty'} /></div>
          )}

          <div style={grid}>
            <div className="field"><label>Период</label><select value={form.periodDays} onChange={e=>set('periodDays', Number(e.target.value))}><option value={30}>30 дней</option><option value={60}>60 дней</option><option value={90}>90 дней</option></select></div>
            <div className="field"><label>{usesTags ? 'Постов на хэштег' : 'Постов на аккаунт/место'}</label><input type="number" min={5} max={100} value={form.perTag} onChange={e=>set('perTag', e.target.value)} /></div>
            <div className="field"><label>Профилей максимум</label><input type="number" min={5} max={200} value={form.maxProfiles} onChange={e=>set('maxProfiles', e.target.value)} /></div>
            <div className="field"><label>Подписчиков от</label><input type="number" min={0} value={form.minFollowers} onChange={e=>set('minFollowers', e.target.value)} /></div>
            <div className="field"><label>Подписчиков до</label><input type="number" min={0} value={form.maxFollowers} onChange={e=>set('maxFollowers', e.target.value)} /></div>
            <div className="field"><label>Медиана просмотров от</label><input type="number" min={0} value={form.minViews} onChange={e=>set('minViews', e.target.value)} /></div>
            <div className="field"><label>Ниша</label><select value={form.niche} onChange={e=>set('niche', e.target.value)}><option value="beauty">Бьюти</option><option value="lifestyle">Лайфстайл</option><option value="mom">Мамы</option><option value="">Любая</option></select></div>
            <div className="field"><label>Язык</label><select value={form.lang} onChange={e=>set('lang', e.target.value)}><option value="any">Любой</option><option value="ru">Русский</option><option value="kk">Казахский</option><option value="kk+ru">Каз + рус</option></select></div>
            <div className="field"><label>Реклама не больше, %</label><input type="number" min={0} max={100} value={form.maxAdShare} onChange={e=>set('maxAdShare', e.target.value)} /></div>
            <div className="field"><label>Потолок, $ (до {data.runLimit||1})</label><input type="number" step="0.1" min={0.1} max={data.runLimit||1} value={form.maxUsd} onChange={e=>set('maxUsd', e.target.value)} /></div>
          </div>
          <div style={{display:'flex', gap:16, flexWrap:'wrap', alignItems:'center', fontSize:13, margin:'4px 0 10px'}}>
            <label style={{display:'flex', gap:6, alignItems:'center'}}><input type="checkbox" checked={form.kzOnly} onChange={e=>set('kzOnly', e.target.checked)} /> Только Казахстан, балл от</label>
            <input type="number" min={1} max={10} value={form.minKz} onChange={e=>set('minKz', e.target.value)} style={{width:60}} />
            <label style={{display:'flex', gap:6, alignItems:'center'}}><input type="checkbox" checked={form.activeOnly} onChange={e=>set('activeOnly', e.target.checked)} /> Есть посты за период</label>
          </div>
          <div className="field"><label>Конкуренты (необязательно) — отметим, кто с ними работает</label>
            <input value={form.competitors} onChange={e=>set('competitors', e.target.value)} placeholder="@brand1, @brand2" /></div>
          {users.length > 0 && <div className="field"><label>Сразу раздать менеджерам (необязательно)</label>
            <div style={{display:'flex', flexWrap:'wrap', gap:8}}>{users.map(u => (
              <label key={u.id} style={{display:'flex', gap:4, alignItems:'center', fontWeight:400, fontSize:13, padding:'3px 8px', border:'1px solid #e2e6ef', borderRadius:8, cursor:'pointer'}}>
                <input type="checkbox" checked={form.managerIds.includes(u.id)} onChange={()=>toggleManager(u.id)} /> {u.username}</label>))}</div></div>}
          <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
            <button className="btn btn-primary" disabled={busy || !data.configured} onClick={run}>{busy ? 'Запускаю…' : 'Найти блогеров'}</button>
            <span style={{fontSize:12, color: msg.startsWith('⚠') ? '#c0392b' : '#1f8a4c'}}>{msg}</span>
            <span style={{fontSize:12, color:'#8a90a6'}}>≈ $0.2–0.3 за 100 постов + столько же за 100 профилей. Дневной лимит {data.dayLimit||3} $.</span>
          </div>
          <div style={{fontSize:12, color:'#8a90a6', marginTop:8}}>Балл «Казахстан»: город/KZ в профиле +2, номер +7 7xx / WhatsApp 77… +2, казахские буквы +2, геотеги KZ +2, отметка KZ-бренда +2, пост в KZ-месте +2, Kaspi +1, городской хэштег +1, TikTok-видео из KZ +3.</div>
        </div>
      )}

      {(data.jobs||[]).length === 0 ? <div className="empty-state"><div style={{fontSize:36}}>🔎</div><p>Запусков пока не было</p></div> :
        (data.jobs||[]).map(j => (
          <div key={j.id} style={box}>
            <div style={{display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
              <div><b>{srcName(j.source)}:</b> {(j.hashtags||[]).length ? '#'+j.hashtags.join(' #') : (j.accounts||[]).map(a=>/^\d+$/.test(a)?a:'@'+a).join(', ')}
                <div style={{fontSize:12, color:'#8a90a6'}}>{new Date(j.createdAt).toLocaleString('ru-RU')} · {j.createdByName} · {j.periodDays||60} дн. · подписчики {fmt(j.minFollowers)}–{j.maxFollowers ? fmt(j.maxFollowers) : '∞'}{j.kzOnly ? ` · KZ от ${j.minKz}` : ''} · потолок {j.maxUsd} ${j.spentUsd ? ` · потрачено ${j.spentUsd} $` : ''}</div></div>
              <div style={{textAlign:'right', fontSize:13}}>
                <span style={{padding:'2px 8px', borderRadius:8, background: j.status==='done' ? '#e8f7ee' : j.status==='failed' || j.status==='uncertain' ? '#fde8ee' : '#eef2ff'}}>{STATUS[j.status]||j.status}</span>
                {['pending','running'].includes(j.status) && <div style={{fontSize:12, color:'#8a90a6', marginTop:4}}>{STAGE[j.stage]||''} {isAdmin && <button className="btn btn-secondary btn-sm" onClick={()=>cancel(j.id)}>Отменить</button>}</div>}
              </div>
            </div>
            {j.lastError && <div style={{fontSize:12, color:'#c0392b', marginTop:6}}>{j.lastError}</div>}
            {j.authorsFound != null && <div style={{fontSize:13, marginTop:8}}>{j.postsFound != null ? `Постов: ${fmt(j.postsFound)} · ` : ''}авторов: {fmt(j.authorsFound)} · уже в базе: {fmt(j.alreadyInCrm)}</div>}
            {j.result && <div style={{fontSize:13, marginTop:4}}><b>Добавлено в базу: {fmt(j.result.created)}</b>{j.result.skipped ? ' · отсеяно: ' + [['не KZ', j.result.skipped.notKz], ['подписчики', j.result.skipped.followers], ['мало просмотров', j.result.skipped.views], ['неактивны', j.result.skipped.inactive], ['много рекламы', j.result.skipped.ads], ['не та ниша', j.result.skipped.niche], ['язык', j.result.skipped.lang], ['закрытые', j.result.skipped.private], ['дубли', j.result.skipped.duplicate]].filter(x=>x[1]).map(x=>x[0]+' '+x[1]).join(', ') : ''}</div>}
            {j.result && (j.result.sample||[]).length > 0 && (
              <div className="table-wrap" style={{overflowX:'auto', marginTop:8}}><table style={{minWidth:760}}>
                <thead><tr><th>Блогер</th><th>KZ</th><th>Подписчики</th><th>Медиана просмотров</th><th>Просм./подп.</th><th>Откуда</th><th>Отметки</th></tr></thead>
                <tbody>{j.result.sample.map(b => (<tr key={b.id}>
                  <td><a href={b.platform==='tt' ? `https://www.tiktok.com/@${b.username}` : `https://www.instagram.com/${b.username}/`} target="_blank" rel="noreferrer">{b.platform==='tt'?'TikTok ':''}@{b.username}</a></td>
                  <td title={b.kzWhy}><b>{b.kz}</b></td><td>{fmt(b.followers)}</td><td>{fmt(b.reach)}</td><td>{b.viewsRatio}%</td>
                  <td style={{fontSize:12}}>{b.via}</td><td style={{fontSize:12, color:'#9b1c3c'}}>{b.flags}</td></tr>))}</tbody>
              </table><div style={{fontSize:11.5, color:'#8a90a6', marginTop:4}}>Наведите на балл KZ — видно, за что он. Причины сохранены и в карточке блогера (заметка).</div></div>)}
          </div>
        ))}
    </div>
  );
}
