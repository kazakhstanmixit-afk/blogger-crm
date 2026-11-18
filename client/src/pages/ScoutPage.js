import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../App';

// Поиск блогеров через Apify: источники → профили → оценка «Казахстан» и качества → новые блогеры в базе.
const STATUS = { pending:'в очереди', starting:'запуск', running:'идёт', done:'готово', failed:'ошибка', uncertain:'проверить в Apify', cancelled:'отменён' };
const STAGE = { collect:'1/2 · собираем посты', seeds:'1/2 · профили стартовых блогеров', profiles:'2/2 · профили кандидатов', done:'' };
const SOURCES = [
  ['brands', 'Отметки брендов', 'Кто отмечал KZ-бренды, магазины и салоны — обычно уже работают с брендами. Самый сильный источник.'],
  ['hashtags', 'Хэштеги', 'Рилсы по казахстанским хэштегам: город + тема, казахские, Kaspi.'],
  ['similar', 'Похожие на блогеров', 'Берём 20–30 наших лучших блогеров и собираем похожих — находит тех, кто без хэштегов.'],
  ['places', 'Места', 'Посты с геотегами ТРЦ, салонов, кафе Алматы и Астаны — авторы почти наверняка местные.'],
  ['mentions', 'Упоминают бренд (IG)', 'Посты, где бренд назван текстом в подписи, без отметки аккаунта (например, «bidalli»).'],
  ['tiktok', 'TikTok', 'TikTok: видео по хэштегам и по упоминанию брендов (поиск по словам). Страна видео (KZ) — самый надёжный гео-фильтр.'],
];
// Списки аккаунтов (из базы рыночного сбора; у остальных KZ-брендов Instagram пока не заполнен).
const LISTS = {
  kz: ['premore_official_kz','sensulu.cosmeticss','alatau.organic','zere_purebeauty','blssm.beauty','sugarlife_shugaring','herra.cis','adinova.kz','pom7.cis'],
  global: ['bidallibeauty','anua.global','bioderma','celimax_official','dr.althea_official','estel_official','rorobell_official','tashe.professional'],
};
// Названия брендов для поиска видео в TikTok (там ищем по словам, а не по аккаунтам).
const BRAND_WORDS = 'bidalli, premore, sensulu, alatau organic, zere, blssm, sugarlife, herra, adinova, pom7, axora, dry dry, amennisa, ellay';
const TAGS = {
  'Бьюти × города': 'бьютиалматы, бьютиастана, макияжалматы, макияжастана, визажисталматы, визажистастана, косметикаалматы, косметикаастана, бьютишымкент, макияжшымкент',
  'Казахоязычные': 'беткүтімі, сұлулық, макияжқазақша, косметикақазақша, қазақаруы, qazaqaruy, күтім, бетмаска',
  'Kaspi': 'каспишоп, kaspikz, каспиартикул, находкиkaspi, kaspiнаходки, обзоркаспи',
  'Уход': 'уходзалицомкз, корейскаякосметикакз, корейскаякосметикаалматы, уходзаволосамиалматы, бьютиблогеркз, бьютиблогералматы',
  'Мамы и лайфстайл': 'мамаалматы, мамаастана, блогералматы, блогерастана, лайфстайлкз',
};
const NICHES = [['beauty','бьюти'],['care','уход'],['lifestyle','лайфстайл'],['mom','мама']];
const LANGS = [['ru','русский'],['kk','казахский'],['kk+ru','оба']];
const BASE = { source:'brands', target:'', hashtags:'', queries:'', accounts:'', competitors:'', perTag:50, maxProfiles:50, minFollowers:3000, maxFollowers:150000, periodDays:30, kzOnly:true, minKz:3, minViews:1000, minViewsPct:5, activeOnly:true, maxAdShare:40, niches:['beauty','care'], langs:[], excludeExisting:true, maxUsd:1, managerIds:[] };
const PRESETS = [
  ['Бьюти КЗ — по отметкам брендов', { source:'brands', accounts:LISTS.kz.join('\n'), periodDays:30, perTag:30, minFollowers:3000, maxFollowers:150000, minViews:1000, minViewsPct:5, niches:['beauty','care'], langs:[], maxAdShare:40, kzOnly:true, minKz:3 }],
  ['Казахоязычные', { source:'hashtags', hashtags:TAGS['Казахоязычные'], perTag:30, minFollowers:3000, maxFollowers:300000, minViews:1000, minViewsPct:5, niches:['beauty','lifestyle'], langs:['kk','kk+ru'], maxAdShare:40, kzOnly:true, minKz:3 }],
  ['Продают через Kaspi', { source:'hashtags', hashtags:TAGS['Kaspi'], perTag:30, minFollowers:5000, maxFollowers:300000, minViews:2000, minViewsPct:5, niches:[], langs:[], maxAdShare:60, kzOnly:true, minKz:3 }],
  ['TikTok КЗ — бренды и бьюти', { source:'tiktok', queries:BRAND_WORDS, hashtags:'бьютиалматы, макияжалматы, макияжастана, беткүтімі, каспиартикул', perTag:15, maxProfiles:50, minFollowers:3000, maxFollowers:300000, minViews:1000, minViewsPct:5, niches:[], langs:[], maxAdShare:40, kzOnly:true, minKz:3 }],
  ['Мамы и лайфстайл', { source:'hashtags', hashtags:TAGS['Мамы и лайфстайл'], perTag:30, minFollowers:5000, maxFollowers:200000, minViews:1000, minViewsPct:5, niches:['lifestyle','mom'], langs:[], maxAdShare:40, kzOnly:true, minKz:3 }],
];
const PRICE = 0.0027; // $ за результат (пост или профиль), бесплатный/стартовый тариф Apify
const fmt = n => Number(n||0).toLocaleString('ru-RU');
const nickOf = v => { let s = String(v||'').trim().toLowerCase(); if (s.includes('instagram.com/')) s = s.split('instagram.com/')[1].split(/[/?#]/)[0]; if (s.includes('tiktok.com/')) s = s.split('tiktok.com/')[1].split(/[/?#]/)[0]; s = s.replace(/^@/,''); return /^[a-z0-9._]{1,30}$/.test(s) ? s : ''; };
function cleanAccounts(text, source) {
  const parts = String(text||'').split(/[\s,;]+/).filter(Boolean);
  const out = parts.map(x => source==='places' ? (/^\d{3,20}$/.test(x) ? x : ((x.match(/locations\/(\d{3,20})/)||[])[1]||'')) : nickOf(x)).filter(Boolean);
  return [...new Set(out)];
}

function Chips({ options, value, onChange }) {
  return <div style={{display:'flex', flexWrap:'wrap', gap:6}}>{options.map(([id, label]) => {
    const on = value.includes(id);
    return <button key={id} type="button" onClick={()=>onChange(on ? value.filter(x=>x!==id) : [...value, id])}
      style={{padding:'4px 10px', borderRadius:16, fontSize:12.5, cursor:'pointer', border:'1px solid '+(on?'#6d5dfc':'#d9deea'), background:on?'#efedff':'#fff', color:on?'#4b3fd6':'#41475a'}}>{label}</button>;
  })}</div>;
}
const Hint = ({ children }) => <div style={{fontSize:11.5, color:'#8a90a6', marginTop:3, lineHeight:1.35}}>{children}</div>;

export default function ScoutPage({ currentUser }) {
  const isAdmin = currentUser.role === 'admin';
  const [data, setData] = useState({ jobs: [] });
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(BASE);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const load = useCallback(() => apiFetch('/api/scout/jobs').then(r=>r.ok?r.json():{jobs:[]}).then(setData).catch(()=>{}), []);
  useEffect(() => { load(); apiFetch('/api/users').then(r=>r.ok?r.json():[]).then(d=>setUsers(Array.isArray(d)?d.filter(u=>u.role==='manager'):[])); }, [load]);
  useEffect(() => { const active = (data.jobs||[]).some(j=>['pending','starting','running'].includes(j.status)); if(!active) return; const t = setInterval(load, 8000); return () => clearInterval(t); }, [data, load]);

  const accounts = cleanAccounts(form.accounts, form.source);
  const tags = String(form.hashtags||'').split(/[\s,;]+/).map(t=>t.replace(/^#/,'')).filter(Boolean);
  const queries = ['tiktok','mentions'].includes(form.source) ? String(form.queries||'').split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean) : [];
  const usesTags = ['hashtags','tiktok'].includes(form.source);
  const per = Number(form.perTag)||0, maxP = Number(form.maxProfiles)||0;
  const units = usesTags ? tags.length + queries.length : form.source==='mentions' ? queries.length : accounts.length;
  const firstItems = usesTags || form.source==='mentions' ? units * per : form.source==='similar' ? accounts.length : accounts.length * per;
  const est = Math.round((firstItems + (form.source==='tiktok' ? 0 : maxP)) * PRICE * 100) / 100;
  const estText = form.source==='mentions' ? `${queries.length} слов × ${per} постов` : usesTags ? `${tags.length + queries.length} тег./слов × ${per} ${form.source==='tiktok'?'видео':'постов'}` : form.source==='similar' ? `${accounts.length} стартовых` : `${accounts.length} акк. × ${per} отметок`;

  // Цель «нужно N блогеров»: доля прошедших фильтры — по прошлым запускам (иначе ~12%), на 1 пост ≈ 0.5 нового автора.
  const passRate = (() => { const done = (data.jobs||[]).filter(j=>j.result && j.result.checked > 0); const c = done.reduce((a,j)=>a+j.result.created,0), k = done.reduce((a,j)=>a+j.result.checked,0); return k >= 30 ? Math.min(0.5, Math.max(0.05, c/k)) : 0.12; })();
  const planForTarget = () => {
    const t = Number(form.target)||0; if (!t) { setMsg('⚠ Укажите, сколько блогеров нужно'); return; }
    const profiles = Math.min(3000, Math.ceil(t / passRate));
    const perUnit = form.source==='similar' ? per : Math.min(1000, Math.max(5, Math.ceil(profiles / 0.5 / Math.max(1, units))));
    const first = form.source==='similar' ? accounts.length : Math.max(1, units) * perUnit;
    const cost = Math.ceil((first + (form.source==='tiktok' ? 0 : profiles)) * PRICE * 10) / 10;
    setForm(f=>({...f, maxProfiles: form.source==='tiktok' ? Math.min(3000, Math.ceil(t / passRate)) : profiles, perTag: perUnit, maxUsd: Math.min(cost, data.runLimit||1)}));
    setMsg(cost > (data.runLimit||1) ? `⚠ Для ${t} блогеров нужно ≈ $${cost} (проверить ≈ ${profiles} профилей), а потолок одного запуска $${data.runLimit||1}. Поднимите лимит или запускайте частями.` : `Рассчитано под ${t} блогеров: ≈ ${profiles} профилей, ≈ $${cost}`);
  };
  const addAccounts = list => set('accounts', [...new Set([...cleanAccounts(form.accounts, form.source), ...list])].join('\n'));
  const addTags = t => set('hashtags', [...new Set([...tags, ...t.split(/,\s*/)])].join(', '));
  const bestBloggers = async () => { try { const r = await apiFetch('/api/scout/best-bloggers?limit=30'); const d = await r.json(); if (!r.ok) throw new Error(d.error||'Ошибка'); if (!d.accounts.length) throw new Error('В базе нет блогеров с оплаченными интеграциями'); addAccounts(d.accounts); } catch(e) { setMsg('⚠ '+e.message); } };
  const run = async () => {
    setBusy(true); setMsg('');
    try {
      const body = { ...form, accounts: accounts.join('\n'), firstShare: firstItems + maxP ? Math.round(firstItems / (firstItems + (form.source==='tiktok' ? 0 : maxP)) * 100) / 100 : 0.5 };
      const r = await apiFetch('/api/scout/jobs', { method:'POST', body: JSON.stringify(body) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Ошибка');
      setMsg('Запущено: результаты появятся через 3–8 минут'); load();
    } catch (e) { setMsg('⚠ ' + e.message); }
    setBusy(false);
  };
  const cancel = async id => { await apiFetch(`/api/scout/jobs/${id}/cancel`, { method:'POST' }); load(); };
  const toggleManager = id => set('managerIds', form.managerIds.includes(id) ? form.managerIds.filter(x=>x!==id) : [...form.managerIds, id]);
  const box = { background:'#fff', border:'1px solid #e2e6ef', borderRadius:12, padding:16, marginBottom:16 };
  const sub = { border:'1px solid #eef0f6', borderRadius:10, padding:12, background:'#fafbfe' };
  const grid = { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:12 };
  const src = SOURCES.find(s=>s[0]===form.source) || SOURCES[0];
  const srcName = id => (SOURCES.find(s=>s[0]===id)||[])[1] || id || 'Хэштеги';
  const small = 'btn btn-secondary btn-sm';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🔎 Поиск блогеров</div>
          <div className="page-subtitle" style={{maxWidth:900}}>Ищем блогеров Казахстана: кто отмечает бренды и магазины КЗ, кто ставит казахстанские хэштеги, кто похож на наших лучших блогеров. Каждому даём балл «Казахстан» (город, номер +7 7xx, казахский язык, Kaspi, геометка) и проверяем качество: медиана просмотров, доля рекламы, активность.</div>
        </div>
      </div>

      {!data.configured && (
        <div style={{...box, background:'#fff7e6', borderColor:'#f5d69a', color:'#7a4a00', fontSize:13}}>
          Apify не подключён: в Render (сервис CRM → Environment) нужны <b>APIFY_TOKEN</b> и <b>APIFY_SCOUT_ENABLED=1</b>.
        </div>
      )}

      {isAdmin && (
        <div style={box}>
          <div style={{fontSize:12, color:'#8a90a6', marginBottom:6}}>Готовые шаблоны — заполняют всю форму:</div>
          <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:14}}>
            {PRESETS.map(([label, p]) => <button key={label} type="button" className={small} onClick={()=>setForm(f=>({...BASE, managerIds:f.managerIds, competitors:f.competitors, ...p}))}>⚡ {label}</button>)}
          </div>

          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(380px,1fr))', gap:12}}>
            <div style={sub}>
              <div style={{fontWeight:600, marginBottom:8}}>Откуда брать</div>
              <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:6}}>
                {SOURCES.map(([id, label]) => <button key={id} type="button" className={`btn btn-sm ${form.source===id?'btn-primary':'btn-secondary'}`} onClick={()=>set('source', id)}>{label}</button>)}
              </div>
              <Hint>{src[2]}</Hint>
              {usesTags ? (
                <div className="field" style={{marginTop:10}}><label>Хэштеги</label>
                  <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:6}}>{Object.keys(TAGS).map(k => <button key={k} type="button" className={small} onClick={()=>addTags(TAGS[k])}>+ {k}</button>)}
                    {tags.length > 0 && <button type="button" className={small} onClick={()=>set('hashtags','')}>очистить</button>}</div>
                  <textarea rows={3} value={form.hashtags} onChange={e=>set('hashtags', e.target.value)} placeholder="макияжалматы, беткүтімі, каспиартикул" />
                  <Hint>Без #, через запятую. Лучше 5–10 узких тегов (город + тема), чем общие #makeup — там весь мир. Сейчас тегов: {tags.length}.</Hint>
                  {form.source==='tiktok' && <div style={{marginTop:10}}><label>Поиск видео по словам — названия брендов (через запятую)</label>
                    <div style={{display:'flex', flexWrap:'wrap', gap:6, margin:'4px 0 6px'}}><button type="button" className={small} onClick={()=>set('queries', [...new Set([...queries.map(x=>x.toLowerCase()), ...BRAND_WORDS.split(/,\s*/)])].join(', '))}>+ Бренды КЗ</button>{queries.length > 0 && <button type="button" className={small} onClick={()=>set('queries','')}>очистить</button>}</div>
                    <textarea rows={2} value={form.queries} onChange={e=>set('queries', e.target.value)} placeholder="bidalli, premore, pom7" />
                    <Hint>В TikTok бренды редко отмечают аккаунтом — ищем видео, где бренд назван. Можно только слова, только хэштеги или вместе. Слов: {queries.length}.</Hint></div>}</div>
              ) : (
                form.source==='mentions' ? (
                <div className="field" style={{marginTop:10}}><label>Слова в подписи — названия брендов (через запятую)</label>
                  <div style={{display:'flex', flexWrap:'wrap', gap:6, margin:'4px 0 6px'}}><button type="button" className={small} onClick={()=>set('queries', [...new Set([...queries.map(x=>x.toLowerCase()), ...BRAND_WORDS.split(/,\s*/)])].join(', '))}>+ Бренды КЗ</button>{queries.length > 0 && <button type="button" className={small} onClick={()=>set('queries','')}>очистить</button>}</div>
                  <textarea rows={2} value={form.queries} onChange={e=>set('queries', e.target.value)} placeholder="bidalli, premore, pom7" />
                  <Hint>Находит посты, где бренд просто написан словом. Глобальные бренды (bidalli) — только с «Только Казахстан». Слов: {queries.length}.</Hint></div>
                ) : (
                <div className="field" style={{marginTop:10}}><label>{form.source==='places' ? 'Места' : form.source==='similar' ? 'Стартовые блогеры' : 'Аккаунты брендов, магазинов, салонов'}</label>
                  <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:6}}>
                    {form.source==='brands' && <><button type="button" className={small} onClick={()=>addAccounts(LISTS.kz)}>+ Бренды КЗ ({LISTS.kz.length})</button><button type="button" className={small} onClick={()=>addAccounts(LISTS.global)}>+ Глобальные бренды ({LISTS.global.length})</button></>}
                    {form.source==='similar' && <button type="button" className={small} onClick={bestBloggers}>+ Наши лучшие блогеры (по оплатам)</button>}
                    {accounts.length > 0 && <button type="button" className={small} onClick={()=>set('accounts','')}>очистить</button>}
                  </div>
                  <textarea rows={4} value={form.accounts} onChange={e=>set('accounts', e.target.value)} onBlur={()=>set('accounts', cleanAccounts(form.accounts, form.source).join('\n'))} placeholder={form.source==='places' ? 'https://www.instagram.com/explore/locations/318767455/' : '@brand_kz\nhttps://www.instagram.com/salon_almaty/'} />
                  <Hint>{form.source==='places' ? 'Ссылки на места instagram.com/explore/locations/… или их номера.' : 'Ник или ссылка, по одному в строке — можно вставлять что угодно, ссылки превратятся в ники, дубли уберутся. '}{form.source==='brands' ? 'Лучше всего работают локальные КЗ-аккаунты брендов, магазинов и салонов — их отмечают почти только казахстанские блогеры. Глобальные бренды — только с фильтром «Только Казахстан».' : ''} Распознано: {accounts.length}.</Hint></div>
              ))}
              <div style={grid}>
                <div className="field"><label>Период</label><select value={form.periodDays} onChange={e=>set('periodDays', Number(e.target.value))}><option value={30}>30 дней</option><option value={60}>60 дней</option><option value={90}>90 дней</option></select></div>
                {form.source !== 'similar' && <div className="field"><label>{form.source==='tiktok' ? 'Видео с каждого тега/слова' : form.source==='mentions' ? 'Постов с каждого слова' : usesTags ? 'Постов с каждого тега' : form.source==='places' ? 'Постов с каждого места' : 'Отметок с каждого аккаунта'}</label><input type="number" min={5} max={1000} value={form.perTag} onChange={e=>set('perTag', e.target.value)} />
                  {form.source==='brands' && <Hint>У крупного бренда 30 отметок — это 1–2 недели. Для 30 дней ставьте 50–100.</Hint>}</div>}
                <div className="field"><label>Профилей проверить, макс.</label><input type="number" min={5} max={3000} value={form.maxProfiles} onChange={e=>set('maxProfiles', e.target.value)} /></div>
              </div>
            </div>

            <div style={sub}>
              <div style={{fontWeight:600, marginBottom:8}}>Кого оставить</div>
              <div style={{display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', fontSize:13, marginBottom:4}}>
                <label style={{display:'flex', gap:6, alignItems:'center'}}><input type="checkbox" checked={form.kzOnly} onChange={e=>set('kzOnly', e.target.checked)} /> <b>Только Казахстан</b>, балл от</label>
                <input type="number" min={1} max={10} value={form.minKz} onChange={e=>set('minKz', e.target.value)} style={{width:56}} />
              </div>
              <Hint>Порог: 2 — мягко, 3 — строго. Город/KZ в профиле +2, номер +7 7xx / WhatsApp 77… +2, казахские буквы +2, геотеги KZ +2, отметка KZ-бренда +2, KZ-место +2, Kaspi +1, городской хэштег +1, TikTok из KZ +3. Одного признака мало, два-три — надёжно.</Hint>
              <div style={{...grid, marginTop:10}}>
                <div className="field"><label>Подписчиков от</label><input type="number" min={0} value={form.minFollowers} onChange={e=>set('minFollowers', e.target.value)} /></div>
                <div className="field"><label>Подписчиков до</label><input type="number" min={0} value={form.maxFollowers} onChange={e=>set('maxFollowers', e.target.value)} /></div>
                <div className="field"><label>Медиана просмотров от</label><input type="number" min={0} value={form.minViews} onChange={e=>set('minViews', e.target.value)} /></div>
                <div className="field"><label>и не меньше, % от подписчиков</label><input type="number" min={0} max={100} value={form.minViewsPct} onChange={e=>set('minViewsPct', e.target.value)} /></div>
              </div>
              <Hint>Медиана просмотров последних рилсов. Вместе с порогом «% от подписчиков» (5–10%) отсекает накрученные аккаунты.</Hint>
              <div className="field" style={{marginTop:10}}><label>Ниша (любая из отмеченных; ничего не отмечено — любая)</label><Chips options={NICHES} value={form.niches} onChange={v=>set('niches', v)} /></div>
              <div className="field"><label>Язык (ничего не отмечено — любой)</label><Chips options={LANGS} value={form.langs} onChange={v=>set('langs', v)} /></div>
              <div style={grid}>
                <div className="field"><label>Реклама не больше, %</label><input type="number" min={0} max={100} value={form.maxAdShare} onChange={e=>set('maxAdShare', e.target.value)} /></div>
              </div>
              <Hint>Доля постов с меткой «Оплачено» (paid partnership), словами «реклама», промокодом или артикулом Kaspi. Выше 40–50% — аудитория устала от рекламы.</Hint>
              <div style={{display:'flex', gap:16, flexWrap:'wrap', fontSize:13, margin:'10px 0 4px'}}>
                <label style={{display:'flex', gap:6, alignItems:'center'}}><input type="checkbox" checked={form.activeOnly} onChange={e=>set('activeOnly', e.target.checked)} /> Есть посты за период</label>
                <label style={{display:'flex', gap:6, alignItems:'center'}}><input type="checkbox" checked={form.excludeExisting} onChange={e=>set('excludeExisting', e.target.checked)} /> Исключить тех, кто уже в базе</label>
              </div>
              <div className="field" style={{marginTop:6}}><label>Блогеры конкурентов — не выкидываем, а помечаем ⚠</label>
                <input value={form.competitors} onChange={e=>set('competitors', e.target.value)} placeholder="@brand1, @brand2" /></div>
            </div>
          </div>

          {users.length > 0 && <div className="field" style={{marginTop:12}}><label>Сразу раздать менеджерам (необязательно)</label>
            <div style={{display:'flex', flexWrap:'wrap', gap:8}}>{users.map(u => (
              <label key={u.id} style={{display:'flex', gap:4, alignItems:'center', fontWeight:400, fontSize:13, padding:'3px 8px', border:'1px solid #e2e6ef', borderRadius:8, cursor:'pointer'}}>
                <input type="checkbox" checked={form.managerIds.includes(u.id)} onChange={()=>toggleManager(u.id)} /> {u.username}</label>))}</div></div>}

          <div style={{display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap', marginTop:12, padding:'10px 12px', borderRadius:10, background:'#f5f3ff'}}>
            <div className="field" style={{margin:0, width:170}}><label>Сколько блогеров нужно</label><input type="number" min={1} max={5000} value={form.target} onChange={e=>set('target', e.target.value)} placeholder="например, 100" /></div>
            <button type="button" className="btn btn-secondary" onClick={planForTarget}>Рассчитать под цель</button>
            <div style={{fontSize:12, color:'#5b6378', maxWidth:560, lineHeight:1.35}}>Подберёт «постов с тега/аккаунта» и «профилей проверить» так, чтобы после фильтров осталось нужное число. Сейчас фильтры пропускают ≈ {Math.round(passRate*100)}% проверенных профилей{(data.jobs||[]).some(j=>j.result && j.result.checked) ? ' (по вашим запускам)' : ' (оценка)'}. Поиск остановится, когда цель набрана.</div>
          </div>
          <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginTop:12}}>
            <div className="field" style={{margin:0, width:150}}><label>Потолок, $ (до {data.runLimit||1})</label><input type="number" step="0.1" min={0.1} max={data.runLimit||1} value={form.maxUsd} onChange={e=>set('maxUsd', e.target.value)} /></div>
            <div style={{fontSize:13, padding:'8px 12px', borderRadius:10, background: est > Number(form.maxUsd) ? '#fde8ee' : '#eef7f0', color: est > Number(form.maxUsd) ? '#9b1c3c' : '#1f6b40'}}>
              ≈ {estText}{form.source!=='tiktok' ? ` + ${maxP} профилей` : ''} ≈ <b>${est}</b>{est > Number(form.maxUsd) ? ' — больше потолка: Apify остановится на потолке, часть не соберётся' : ' — укладывается'}</div>
            <button className="btn btn-primary" disabled={busy || !data.configured} onClick={run}>{busy ? 'Запускаю…' : 'Найти блогеров'}</button>
            <span style={{fontSize:12, color: msg.startsWith('⚠') ? '#c0392b' : '#1f8a4c'}}>{msg}</span>
          </div>
          <Hint>Дневной лимит {data.dayLimit||3} $. Цена ориентировочная (тариф Apify ≈ $2.7 за 1000 результатов).</Hint>
        </div>
      )}

      {(data.jobs||[]).length === 0 ? <div className="empty-state"><div style={{fontSize:36}}>🔎</div><p>Запусков пока не было</p></div> :
        (data.jobs||[]).map(j => (
          <div key={j.id} style={box}>
            <div style={{display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
              <div><b>{srcName(j.source)}:</b> {(j.queries||[]).length ? '«'+j.queries.join('», «')+'» ' : ''}{(j.hashtags||[]).length ? '#'+j.hashtags.join(' #') : (j.accounts||[]).map(a=>/^\d+$/.test(a)?a:'@'+a).join(', ')}
                <div style={{fontSize:12, color:'#8a90a6'}}>{new Date(j.createdAt).toLocaleString('ru-RU')} · {j.createdByName} · {j.periodDays||60} дн. · подписчики {fmt(j.minFollowers)}–{j.maxFollowers ? fmt(j.maxFollowers) : '∞'}{j.kzOnly ? ` · KZ от ${j.minKz}` : ''} · потолок {j.maxUsd} ${j.spentUsd ? ` · потрачено ${j.spentUsd} $` : ''}</div></div>
              <div style={{textAlign:'right', fontSize:13}}>
                <span style={{padding:'2px 8px', borderRadius:8, background: j.status==='done' ? '#e8f7ee' : j.status==='failed' || j.status==='uncertain' ? '#fde8ee' : '#eef2ff'}}>{STATUS[j.status]||j.status}</span>
                {['pending','running'].includes(j.status) && <div style={{fontSize:12, color:'#8a90a6', marginTop:4}}>{STAGE[j.stage]||''} {isAdmin && <button className="btn btn-secondary btn-sm" onClick={()=>cancel(j.id)}>Отменить</button>}</div>}
              </div>
            </div>
            {j.lastError && <div style={{fontSize:12, color:'#c0392b', marginTop:6}}>{j.lastError}</div>}
            {j.authorsFound != null && <div style={{fontSize:13, marginTop:8}}>{j.postsFound != null ? `Постов: ${fmt(j.postsFound)} · ` : ''}авторов: {fmt(j.authorsFound)} · уже в базе: {fmt(j.alreadyInCrm)}</div>}
            {j.result && <div style={{fontSize:13, marginTop:4}}><b>Добавлено в базу: {fmt(j.result.created)}{j.target ? ` из ${fmt(j.target)}` : ''}</b>{j.result.checked ? ` · проверено профилей: ${fmt(j.result.checked)}` : ''}{j.result.existing ? ` · уже были в базе (показаны): ${j.result.existing}` : ''}{j.result.skipped ? ' · отсеяно: ' + [['не KZ', j.result.skipped.notKz], ['подписчики', j.result.skipped.followers], ['просмотры', j.result.skipped.views], ['неактивны', j.result.skipped.inactive], ['много рекламы', j.result.skipped.ads], ['не та ниша', j.result.skipped.niche], ['язык', j.result.skipped.lang], ['закрытые', j.result.skipped.private], ['дубли', j.result.skipped.duplicate], ['сверх цели', j.result.skipped.overTarget]].filter(x=>x[1]).map(x=>x[0]+' '+x[1]).join(', ') : ''}</div>}
            {j.result && j.result.byAccount && Object.keys(j.result.byAccount).length > 0 && (
              <div style={{fontSize:12.5, marginTop:6}}>Какие аккаунты приводят блогеров: {Object.entries(j.result.byAccount).sort((a,b)=>b[1].added-a[1].added).map(([a, r]) => <span key={a} style={{display:'inline-block', margin:'2px 6px 2px 0', padding:'1px 8px', borderRadius:8, background:'#f3f4f9'}}>@{a}: {r.added} · KZ {r.avgKz} · медиана {fmt(r.avgViews)}</span>)}</div>)}
            {j.result && (j.result.sample||[]).length > 0 && (
              <div className="table-wrap" style={{overflowX:'auto', marginTop:8}}><table style={{minWidth:900}}>
                <thead><tr><th>Блогер</th><th>Откуда (чья отметка)</th><th>KZ и почему</th><th>Подписчики</th><th>Медиана просмотров</th><th>Просм./подп.</th><th>Реклама</th><th>Отметки</th></tr></thead>
                <tbody>{j.result.sample.map(b => (<tr key={b.id} style={b.existing?{opacity:.6}:null}>
                  <td><a href={b.platform==='tt' ? `https://www.tiktok.com/@${b.username}` : `https://www.instagram.com/${b.username}/`} target="_blank" rel="noreferrer">{b.platform==='tt'?'TikTok ':''}@{b.username}</a>{b.existing && <div style={{fontSize:11, color:'#8a90a6'}}>уже в базе</div>}</td>
                  <td style={{fontSize:12}}>{b.via}</td>
                  <td style={{fontSize:12}}><b style={{fontSize:13}}>{b.kz}</b> <span style={{color:'#8a90a6'}}>{b.kzWhy}</span></td>
                  <td>{fmt(b.followers)}</td><td>{fmt(b.reach)}</td><td>{b.viewsRatio}%</td><td>{b.adShare != null ? b.adShare + '%' : '—'}</td>
                  <td style={{fontSize:12, color:'#9b1c3c'}}>{b.flags}</td></tr>))}</tbody>
              </table></div>)}
          </div>
        ))}
    </div>
  );
}
