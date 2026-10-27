import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, API } from '../App';

const fmt = n => n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + ' млн' : n >= 1e3 ? Math.round(n / 1e3) + ' тыс.' : String(n);
const fmtDate = iso => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const usd = n => '$' + (Number(n) || 0).toFixed(2);
const CAT = { viral: ['Вирусный', '#fee2e2', '#991b1b'], rising: ['Растёт', '#dcfce7', '#15803d'] };
const STATUS_TABS = [
  ['active', 'Подборка'], ['new', 'Новые'], ['tz', 'ТЗ готово'], ['assigned', 'Назначены'],
  ['skipped', 'Пропущенные'], ['rejected', 'Отсеянные'], ['pool', 'Вся база'],
];
const STEP = { start: 'старт', queries: 'запросы', collect: 'сбор роликов', filter: 'отбор', prescreen: 'предпроверка', analyze: 'разбор видео', done: 'готово', error: 'ошибка', waiting_confirm: 'ждёт подтверждения' };
const DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

async function downloadDocx(videoId, v) {
  const res = await fetch(`${API}/api/trends/${encodeURIComponent(videoId)}/tz/${v}/docx`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
  if (!res.ok) { alert('Не удалось скачать ТЗ'); return; }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = m ? decodeURIComponent(m[1]) : `TZ_v${v}.docx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const Badge = ({ bg, color, children, title }) => (
  <span title={title} style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: bg, color, whiteSpace: 'nowrap' }}>{children}</span>
);

function AssignModal({ video, onClose, onDone }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [v, setV] = useState((video.tz || []).slice(-1)[0]?.v || '');
  const [err, setErr] = useState('');
  useEffect(() => {
    const t = setTimeout(() => { apiFetch('/api/trends/bloggers?q=' + encodeURIComponent(q)).then(r => r.json()).then(setList).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const pick = async b => {
    const res = await apiFetch(`/api/trends/${encodeURIComponent(video.id)}/assign`, { method: 'POST', body: JSON.stringify({ blogger_id: b.id, v }) });
    const d = await res.json(); if (!res.ok) { setErr(d.error); return; }
    onDone();
  };
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header"><div className="modal-title">Назначить блогеру</div><button className="modal-close" onClick={onClose}>×</button></div>
        {(video.tz || []).length > 1 && (
          <div className="field"><label>Версия ТЗ</label>
            <select value={v} onChange={e => setV(e.target.value)}>{video.tz.map(t => <option key={t.v} value={t.v}>v{t.v} · {fmtDate(t.created_at)}</option>)}</select>
          </div>)}
        <div className="field"><label>Блогер</label><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="ник или ссылка" /></div>
        <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 7 }}>
          {list.map(b => (
            <div key={b.id} onClick={() => pick(b)} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-1)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
              {b.name} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{b.status}</span>
            </div>))}
          {!list.length && <div style={{ padding: 12, color: 'var(--text-muted)' }}>Никого не нашлось</div>}
        </div>
        {err && <div className="error-msg">{err}</div>}
      </div>
    </div>
  );
}

function TrendCard({ v, products, isAdmin, canEdit, onChange }) {
  const [busy, setBusy] = useState('');
  const [assign, setAssign] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [err, setErr] = useState('');
  const a = v.analysis || {};
  const pid = v.product_id || (v.product_ids || [])[0] || '';
  const lastTz = (v.tz || []).slice(-1)[0];
  const cat = CAT[v.category];

  const call = async (label, path, body, method = 'POST') => {
    setBusy(label); setErr('');
    try {
      const res = await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Ошибка');
      await onChange();
      return d;
    } catch (e) { setErr(e.message); return null; } finally { setBusy(''); }
  };
  const makeTz = async () => {
    const d = await call('tz', `/api/trends/${encodeURIComponent(v.id)}/tz`, { product_id: pid });
    if (d && d.v) downloadDocx(v.id, d.v);
  };
  const fixTz = async () => {
    const instruction = window.prompt('Что поправить в ТЗ? Например: «сделай для сторис 15 сек», «без речи», «замени на стик контур»');
    if (!instruction) return;
    const d = await call('tz', `/api/trends/${encodeURIComponent(v.id)}/tz`, { product_id: pid, instruction, base_version: lastTz?.v });
    if (d && d.v) downloadDocx(v.id, d.v);
  };

  return (
    <div style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <a href={v.url} target="_blank" rel="noreferrer" style={{ flexShrink: 0, width: 84, height: 112, borderRadius: 7, background: 'var(--surface-2)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 22, textDecoration: 'none' }}>
          {v.cover ? <img src={v.cover} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} /> : '▶'}
        </a>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
            {cat && <Badge bg={cat[1]} color={cat[2]}>{cat[0]}</Badge>}
            <Badge bg="var(--surface-2)" color="var(--text-secondary)">{v.platform === 'tiktok' ? 'TikTok' : 'Instagram'}</Badge>
            {v.analysis_status !== 'full' && <Badge bg="#fef3c7" color="#92400e" title={v.analysis_error || ''}>без просмотра видео</Badge>}
          </div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{fmt(v.plays)}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.6 }}>
            {v.followers != null ? <>автор {fmt(v.followers)} · вирусность ×{v.virality}<br /></> : null}
            {v.age_days != null && <>{Math.round(v.age_days)} дн. назад · {fmt(v.per_day)}/день</>}
            {(v.history || []).length > 1 && <><br />было {fmt(v.history[v.history.length - 2].plays)}</>}
          </div>
        </div>
      </div>

      <select value={pid} disabled={!canEdit} onChange={e => call('product', `/api/trends/${encodeURIComponent(v.id)}/product`, { product_id: e.target.value }, 'PUT')}
        style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, background: 'var(--surface-0)' }}>
        <option value="">— товар —</option>
        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <div style={{ fontSize: 13, fontWeight: 500 }}>{a.summary || v.caption.slice(0, 120) || 'Без описания'}</div>
      {a.hook && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}><b>Хук:</b> {a.hook}</div>}
      {(a.techniques || []).length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{a.techniques.slice(0, 5).map(t => <Badge key={t} bg="var(--bg-accent)" color="var(--text-accent)">{t}</Badge>)}</div>}
      {showMore && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(a.structure || []).length > 0 && <div><b>Структура:</b> {a.structure.join(' → ')}</div>}
          {a.adaptation && <div><b>Как адаптировать:</b> {a.adaptation}</div>}
          {(a.why_works || []).length > 0 && <div><b>Почему мог сработать (гипотеза):</b> {a.why_works.join('; ')}</div>}
          <div><b>Подпись:</b> {v.caption || '—'}</div>
          <div><b>Запрос:</b> {v.query} · лайки {fmt(v.likes)} · сохранения {fmt(v.saves)} · репосты {fmt(v.shares)}</div>
          {v.analysis_error && <div style={{ color: '#92400e' }}>{v.analysis_error}</div>}
        </div>)}
      <button onClick={() => setShowMore(s => !s)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text-accent)', cursor: 'pointer', fontSize: 12, padding: 0 }}>{showMore ? 'Свернуть' : 'Подробнее'}</button>

      {(v.tz || []).length > 0 && (
        <div style={{ background: 'var(--surface-1)', borderRadius: 7, padding: '6px 8px', fontSize: 12 }}>
          {v.tz.slice().reverse().map(t => (
            <div key={t.v} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center', padding: '2px 0' }}>
              <span>ТЗ v{t.v}{t.instruction ? ` · «${t.instruction.slice(0, 30)}»` : ''}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => downloadDocx(v.id, t.v)}>⬇ .docx</button>
            </div>))}
          {(lastTz?.warnings || []).map(w => <div key={w} style={{ color: '#92400e' }}>⚠ {w}</div>)}
        </div>)}
      {(v.assigned || []).length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-success)' }}>
          Назначено: {v.assigned.map(x => (
            <span key={x.blogger_id} style={{ marginRight: 6 }}>{x.blogger_name}{x.tz_v ? ` (v${x.tz_v})` : ''}
              {canEdit && <button title="Убрать" onClick={() => call('unassign', `/api/trends/${encodeURIComponent(v.id)}/assign/${x.blogger_id}`, null, 'DELETE')} style={{ border: 'none', background: 'none', color: 'var(--red)', cursor: 'pointer' }}>×</button>}
            </span>))}
        </div>)}

      {err && <div className="error-msg">{err}</div>}
      {canEdit && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
          {!(v.tz || []).length
            ? <button className="btn btn-primary btn-sm" disabled={!!busy || !pid} onClick={makeTz}>{busy === 'tz' ? 'Пишем ТЗ… ~30 сек' : 'Сделать ТЗ'}</button>
            : <>
                <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={fixTz}>{busy === 'tz' ? 'Правим… ~30 сек' : 'Поправить'}</button>
                <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => setAssign(true)}>Назначить блогеру</button>
              </>}
          {isAdmin && v.analysis_status !== 'full' && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => call('analyze', `/api/trends/${encodeURIComponent(v.id)}/analyze`)}>{busy === 'analyze' ? 'Смотрим видео…' : 'Разобрать видео'}</button>}
          {['new', 'tz'].includes(v.status) && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => call('skip', `/api/trends/${encodeURIComponent(v.id)}/skip`)}>Пропустить</button>}
          {['skipped', 'rejected', 'pool'].includes(v.status) && <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => call('skip', `/api/trends/${encodeURIComponent(v.id)}/skip`, { restore: true })}>Вернуть в подборку</button>}
        </div>)}
      {assign && <AssignModal video={v} onClose={() => setAssign(false)} onDone={() => { setAssign(false); onChange(); }} />}
    </div>
  );
}

function ProductsTab({ isAdmin }) {
  const [list, setList] = useState([]);
  const [edit, setEdit] = useState({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(() => apiFetch('/api/trends/products').then(r => r.json()).then(setList), []);
  useEffect(() => { load(); }, [load]);
  const val = (p, k) => (edit[p.id] && k in edit[p.id]) ? edit[p.id][k] : (k === 'queries' ? p.cfg.queries.join('\n') : k === 'ig_hashtags' ? p.cfg.ig_hashtags.join(', ') : p.cfg[k]);
  const set = (p, k, x) => setEdit(e => ({ ...e, [p.id]: { ...(e[p.id] || {}), [k]: x } }));
  const save = async (p, extra) => {
    setBusy(p.id); setMsg('');
    const res = await apiFetch('/api/trends/products/' + p.id, { method: 'PUT', body: JSON.stringify({ ...(edit[p.id] || {}), ...(extra || {}) }) });
    const d = await res.json(); setBusy('');
    if (!res.ok) { setMsg(d.error); return; }
    setEdit(e => { const n = { ...e }; delete n[p.id]; return n; }); load();
  };
  const gen = async p => {
    setBusy(p.id); setMsg('');
    const res = await apiFetch(`/api/trends/products/${p.id}/gen-queries`, { method: 'POST' });
    const d = await res.json(); setBusy('');
    if (!res.ok) { setMsg(d.error); return; }
    load();
  };
  if (!list.length) return <div className="empty-state">Товаров пока нет. Добавьте их во вкладке «Товары и ТЗ».</div>;
  return (
    <div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 10 }}>
        Товары берутся из «Товары и ТЗ». Здесь — что про каждый искать и что говорить в ТЗ. Если запросов нет, при сборе их сгенерирует ИИ.
      </div>
      {msg && <div className="error-msg" style={{ marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
        {list.map(p => (
          <div key={p.id} style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, opacity: val(p, 'active') ? 1 : .6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div><div style={{ fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>арт. {p.article} · в подборке {p.counts.active}</div></div>
              <label className="filter-check"><input type="checkbox" disabled={!isAdmin} checked={!!val(p, 'active')} onChange={e => save(p, { active: e.target.checked })} /> искать</label>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
              <label className="filter-check"><input type="checkbox" disabled={!isAdmin} checked={!!val(p, 'priority')} onChange={e => save(p, { priority: e.target.checked })} /> приоритет</label>
              <label className="filter-check"><input type="checkbox" disabled={!isAdmin} checked={!!val(p, 'on_limit')} onChange={e => save(p, { on_limit: e.target.checked })} /> на лимите</label>
            </div>
            {val(p, 'on_limit') && <div className="field"><label>Что с остатками</label><input disabled={!isAdmin} value={val(p, 'limit_note') || ''} onChange={e => set(p, 'limit_note', e.target.value)} placeholder="02 на лимите — ставить 01" /></div>}
            <div className="field"><label>Что раскрыть в ТЗ</label><input disabled={!isAdmin} value={val(p, 'props') || ''} onChange={e => set(p, 'props', e.target.value)} placeholder="объём, удлиняет, подходит коротким, не отпечатывается" /></div>
            <div className="field"><label>Запреты по товару</label><input disabled={!isAdmin} value={val(p, 'banned') || ''} onChange={e => set(p, 'banned', e.target.value)} placeholder="не сравнивать с Chanel" /></div>
            <div className="field"><label>Поисковые запросы (по одному в строке)</label><textarea disabled={!isAdmin} value={val(p, 'queries') || ''} onChange={e => set(p, 'queries', e.target.value)} placeholder={'тушь для ресниц\nmascara hack\n마스카라'} /></div>
            <div className="field"><label>Хэштеги Instagram</label><input disabled={!isAdmin} value={val(p, 'ig_hashtags') || ''} onChange={e => set(p, 'ig_hashtags', e.target.value)} placeholder="тушь, mascara" /></div>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary btn-sm" disabled={busy === p.id || !edit[p.id]} onClick={() => save(p)}>Сохранить</button>
                <button className="btn btn-secondary btn-sm" disabled={busy === p.id} onClick={() => gen(p)}>{busy === p.id ? '…' : 'Сгенерировать запросы ИИ'}</button>
              </div>)}
          </div>))}
      </div>
    </div>
  );
}

function RunsTab() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(null);
  useEffect(() => { apiFetch('/api/trends/runs').then(r => r.json()).then(setList); }, []);
  if (!list.length) return <div className="empty-state">Запусков ещё не было.</div>;
  return (
    <div className="table-wrap" style={{ overflowX: 'auto' }}>
      <table style={{ minWidth: 900, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={{ background: 'var(--surface-1)', textAlign: 'left' }}>
          {['Начало', 'Как', 'Статус', 'Запросов', 'Собрано', 'Уникальных', 'Новых', 'Предпроверка / отсеяно', 'Разборов видео', 'ТЗ', 'Apify', 'Gemini', 'Итого', ''].map(h => <th key={h} style={{ padding: '8px 10px', fontWeight: 500, color: 'var(--text-secondary)' }}>{h}</th>)}
        </tr></thead>
        <tbody>{list.map(r => {
          const c = r.counts || {}, $ = r.cost || {};
          return (<React.Fragment key={r.id}>
            <tr style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '7px 10px' }}>{fmtDate(r.started_at)}</td>
              <td style={{ padding: '7px 10px' }}>{r.trigger === 'schedule' ? 'по расписанию' : (r.by || 'вручную')}</td>
              <td style={{ padding: '7px 10px', color: r.status === 'error' ? 'var(--red)' : r.status === 'done' ? 'var(--green)' : 'var(--yellow)' }}>{STEP[r.status] || STEP[r.step] || r.status}</td>
              <td style={{ padding: '7px 10px' }}>{c.queries}</td><td style={{ padding: '7px 10px' }}>{c.apify_items}</td><td style={{ padding: '7px 10px' }}>{c.unique}</td>
              <td style={{ padding: '7px 10px' }}>{c.new_candidates}</td><td style={{ padding: '7px 10px' }}>{c.prescreened} / {c.rejected}</td>
              <td style={{ padding: '7px 10px' }}>{c.full_analyzed}{c.full_failed ? ` (+${c.full_failed} не удалось)` : ''}</td><td style={{ padding: '7px 10px' }}>{c.tz_created || 0}</td>
              <td style={{ padding: '7px 10px' }}>{usd($.apify_usd)}</td><td style={{ padding: '7px 10px' }}>{usd($.gemini_usd)}</td>
              <td style={{ padding: '7px 10px', fontWeight: 600 }}>{usd(($.apify_usd || 0) + ($.gemini_usd || 0))}</td>
              <td style={{ padding: '7px 10px' }}><button className="btn btn-secondary btn-sm" onClick={() => setOpen(open === r.id ? null : r.id)}>лог</button></td>
            </tr>
            {open === r.id && <tr><td colSpan={14} style={{ padding: '8px 10px', background: 'var(--surface-1)', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>
              {(r.errors || []).map(e => <div key={e} style={{ color: 'var(--red)' }}>{e}</div>)}{(r.log || []).join('\n') || 'Пусто'}
            </td></tr>}
          </React.Fragment>);
        })}</tbody>
      </table>
    </div>
  );
}

function SettingsTab({ status, onSaved }) {
  const [f, setF] = useState(status.settings);
  const [msg, setMsg] = useState('');
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const save = async () => {
    const res = await apiFetch('/api/trends/settings', { method: 'PUT', body: JSON.stringify(f) });
    const d = await res.json(); setMsg(res.ok ? 'Сохранено' : d.error); if (res.ok) onSaved();
  };
  const num = (k, label, hint) => (
    <div className="field" style={{ marginBottom: 10 }}><label>{label}</label>
      <input type="number" min="0" step="any" value={f[k]} onChange={e => set(k, e.target.value)} />
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{hint}</div>}
    </div>);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
      <div style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Расписание</div>
        <div className="field"><label>Дни</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{DAYS.map((d, i) => (
            <label key={i} className="filter-check"><input type="checkbox" checked={f.schedule_days.map(Number).includes(i)}
              onChange={e => set('schedule_days', e.target.checked ? [...f.schedule_days, i] : f.schedule_days.filter(x => Number(x) !== i))} />{d}</label>))}</div>
        </div>
        {num('schedule_hour', 'Час запуска (время КЗ)', 'Если сервер в это время спал, сбор догонит в течение 4 часов')}
        <label className="filter-check" style={{ marginBottom: 10 }}><input type="checkbox" checked={!!f.instagram_enabled} onChange={e => set('instagram_enabled', e.target.checked)} /> Собирать и Instagram (по хэштегам)</label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Пилот 27.10: Instagram по хэштегам отдаёт в основном старые посты, основной источник — TikTok.</div>
      </div>
      <div style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Лимиты и расходы</div>
        {num('results_per_query', 'Результатов на запрос')}
        {num('max_queries_per_product', 'Запросов на товар')}
        {num('max_total_results', 'Общий лимит сбора за запуск')}
        {num('max_apify_usd_per_run', 'Потолок Apify за запуск, $', 'Apify сам остановит сбор при достижении')}
        {num('max_prescreen', 'Предпроверок по подписи за запуск')}
        {num('max_full', 'Полных разборов видео за запуск')}
        {num('min_per_product', 'Минимум разборов на товар')}
        <div className="field"><label>При достижении лимита разборов</label>
          <select value={f.on_limit} onChange={e => set('on_limit', e.target.value)}><option value="stop">Остановиться</option><option value="ask">Спросить (кнопка «Продолжить»)</option></select>
        </div>
      </div>
      <div style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Отбор</div>
        {num('max_age_days', 'Не старше, дней')}
        {num('min_plays_viral', 'Вирусный: от просмотров')}
        {num('rising_max_age_days', 'Растущий: не старше, дней')}
        {num('rising_min_per_day', 'Растущий: от просмотров в день')}
        <div className="field"><label>Модель Gemini</label><input value={f.gemini_model} onChange={e => set('gemini_model', e.target.value)} /></div>
        {num('gemini_price_in', 'Цена Gemini, $ за 1 млн входных токенов')}
        {num('gemini_price_out', 'Цена Gemini, $ за 1 млн выходных токенов')}
      </div>
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={save}>Сохранить настройки</button>{msg && <span style={{ color: 'var(--text-secondary)' }}>{msg}</span>}
      </div>
    </div>
  );
}

export default function TrendsPage({ currentUser }) {
  const isAdmin = currentUser.role === 'admin';
  const canEdit = !['viewer', 'operator'].includes(currentUser.role);
  const [tab, setTab] = useState('feed');
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState({ status: 'active', product: '', cat: '' });
  const [msg, setMsg] = useState('');

  const loadStatus = useCallback(() => apiFetch('/api/trends/status').then(r => r.json()).then(setStatus).catch(() => {}), []);
  const loadItems = useCallback(() => {
    const qs = new URLSearchParams({ status: filter.status, ...(filter.product ? { product: filter.product } : {}) });
    return apiFetch('/api/trends?' + qs).then(r => r.json()).then(d => { setItems(d.items || []); setCounts(d.counts || {}); });
  }, [filter.status, filter.product]);
  useEffect(() => { loadStatus(); apiFetch('/api/products').then(r => r.json()).then(setProducts).catch(() => {}); }, [loadStatus]);
  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => {
    if (!status?.running) return;
    const t = setInterval(() => { loadStatus(); loadItems(); }, 5000);
    return () => clearInterval(t);
  }, [status?.running, loadStatus, loadItems]);

  const runNow = async () => {
    setMsg('');
    const res = await apiFetch('/api/trends/run', { method: 'POST' });
    const d = await res.json(); if (!res.ok) setMsg(d.error);
    loadStatus();
  };
  const cont = async () => {
    const res = await apiFetch(`/api/trends/runs/${status.last_run.id}/continue`, { method: 'POST' });
    const d = await res.json(); if (!res.ok) setMsg(d.error); loadStatus();
  };

  if (!status) return <div className="page"><div className="empty-state">Загрузка…</div></div>;
  const last = status.last_run;
  const shown = items.filter(v => !filter.cat || v.category === filter.cat);
  const perProduct = {};
  items.forEach(v => { const p = v.product_id || (v.product_ids || [])[0]; if (p) perProduct[p] = (perProduct[p] || 0) + 1; });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🔥 Тренды</div>
          <div className="page-subtitle">
            Подборка {status.settings.schedule_days.map(d => DAYS[d]).join('/')} в {status.settings.schedule_hour}:00 · следующая: {status.next_run || '—'}
            {last && <> · последний сбор {fmtDate(last.started_at)}: {status.running ? `идёт (${STEP[last.step] || last.step})` : (STEP[last.status] || last.status)}, {usd((last.cost?.apify_usd || 0) + (last.cost?.gemini_usd || 0))}</>}
          </div>
        </div>
        {isAdmin && <button className="btn btn-primary" disabled={status.running || !status.keys.apify} onClick={runNow}>{status.running ? 'Сбор идёт…' : 'Собрать сейчас'}</button>}
      </div>

      {(!status.keys.apify || !status.keys.gemini) && (
        <div style={{ background: 'var(--bg-danger)', border: '1px solid var(--border-danger)', borderRadius: 7, padding: '10px 14px', marginBottom: 12, fontSize: 12 }}>
          Для работы добавьте в Render → Environment: {!status.keys.apify && <b>APIFY_TOKEN </b>}{!status.keys.gemini && <b>GEMINI_API_KEY</b>}
          {!status.keys.gemini && status.keys.apify && ' — без него ролики собираются, но не разбираются и ТЗ не создаются.'}
        </div>)}
      {last && last.status === 'waiting_confirm' && !status.running && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 7, padding: '10px 14px', marginBottom: 12, fontSize: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          Лимит разборов достигнут, ещё {(last.pending || []).length} роликов ждут полного разбора.
          {isAdmin && <button className="btn btn-secondary btn-sm" onClick={cont}>Продолжить разбор (до {status.settings.max_full})</button>}
        </div>)}
      {last && last.status === 'error' && (last.errors || []).length > 0 && (
        <div style={{ background: 'var(--bg-danger)', border: '1px solid var(--border-danger)', borderRadius: 7, padding: '10px 14px', marginBottom: 12, fontSize: 12 }}>Последний сбор с ошибкой: {last.errors.slice(-1)[0]}</div>)}
      {msg && <div className="error-msg" style={{ marginBottom: 10 }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
        {[['feed', 'Подборка'], ['products', 'Товары'], ['runs', 'Запуски и расходы'], ...(isAdmin ? [['settings', 'Настройки']] : [])].map(([id, label]) => (
          <div key={id} onClick={() => setTab(id)} style={{ padding: '8px 14px', cursor: 'pointer', fontWeight: tab === id ? 600 : 400, color: tab === id ? 'var(--text-accent)' : 'var(--text-secondary)', borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1 }}>{label}</div>))}
      </div>

      {tab === 'feed' && (<>
        <div className="toolbar">
          <select className="filter-input" style={{ width: 170 }} value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
            {STATUS_TABS.map(([id, l]) => <option key={id} value={id}>{l}{id !== 'active' && counts[id] != null ? ` (${counts[id]})` : ''}</option>)}
          </select>
          <select className="filter-input" style={{ width: 130 }} value={filter.cat} onChange={e => setFilter(f => ({ ...f, cat: e.target.value }))}>
            <option value="">Все</option><option value="viral">Вирусные</option><option value="rising">Растущие</option>
          </select>
          <span onClick={() => setFilter(f => ({ ...f, product: '' }))} style={{ cursor: 'pointer', padding: '4px 10px', borderRadius: 20, fontSize: 12, background: !filter.product ? 'var(--bg-accent)' : 'var(--surface-0)', color: !filter.product ? 'var(--text-accent)' : 'var(--text-secondary)', border: '1px solid var(--border)' }}>Все товары</span>
          {products.filter(p => perProduct[p.id] || filter.product === p.id).map(p => (
            <span key={p.id} onClick={() => setFilter(f => ({ ...f, product: p.id }))} style={{ cursor: 'pointer', padding: '4px 10px', borderRadius: 20, fontSize: 12, background: filter.product === p.id ? 'var(--bg-accent)' : 'var(--surface-0)', color: filter.product === p.id ? 'var(--text-accent)' : 'var(--text-secondary)', border: '1px solid var(--border)' }}>{p.name} · {perProduct[p.id] || 0}</span>))}
        </div>
        {shown.length === 0
          ? <div className="empty-state">Пока пусто.{isAdmin && status.keys.apify ? ' Нажмите «Собрать сейчас» или дождитесь сбора по расписанию.' : ''}<p>Настройте товары во вкладке «Товары»: что раскрыть и (по желанию) поисковые запросы.</p></div>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {shown.map(v => <TrendCard key={v.id} v={v} products={products} isAdmin={isAdmin} canEdit={canEdit} onChange={loadItems} />)}
            </div>}
      </>)}
      {tab === 'products' && <ProductsTab isAdmin={isAdmin} />}
      {tab === 'runs' && <RunsTab />}
      {tab === 'settings' && isAdmin && <SettingsTab status={status} onSaved={loadStatus} />}
    </div>
  );
}
