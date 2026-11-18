'use strict';
// Поиск блогеров через Apify (18.11.2026). Источники: хэштеги (рилсы), отметки брендов, места (геотеги),
// похожие на блогера (relatedProfiles), TikTok по хэштегам. Затем профили авторов → оценка «Казахстан» (баллы
// с причинами) и качества (медиана просмотров, активность, доля рекламы, ниша, язык) → новые блогеры в CRM.
// Платно: запускает только администратор; потолок запуска и дневной лимит в USD.
const crypto = require('crypto');
const ACT = { tags: 'apify~instagram-hashtag-scraper', tagged: 'apify~instagram-tagged-scraper', ig: 'apify~instagram-scraper', profile: 'apify~instagram-profile-scraper', tiktok: 'clockworks~tiktok-scraper' };
const SOURCES = { hashtags: 'Хэштеги', brands: 'Отметки брендов', places: 'Места', similar: 'Похожие на блогеров', mentions: 'Упоминания бренда (IG)', tiktok: 'TikTok' };

const nick = v => { let s = String(v || '').trim().toLowerCase(); if (s.includes('instagram.com/')) s = s.split('instagram.com/')[1].split(/[/?#]/)[0]; if (s.includes('tiktok.com/')) s = s.split('tiktok.com/')[1].split(/[/?#]/)[0]; s = s.replace(/^@/, ''); return /^[a-z0-9._]{1,30}$/.test(s) && !['p', 'reel', 'reels', 'explore', 'stories', 'accounts'].includes(s) ? s : null; };
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const median = a => { const s = a.filter(x => x > 0).sort((x, y) => x - y); if (!s.length) return 0; const m = s.length >> 1; return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2); };
const list = v => [...new Set(String(v || '').split(/[\s,;\n]+/).map(x => x.trim()).filter(Boolean))];

const RE_CITY = /(алмат|almaty|астан|astana|нур-?султан|шымкент|shymkent|караганд|karagand|актоб|aktob|актау|aktau|атырау|atyrau|павлодар|pavlodar|костана|kostanay|семей|semey|уральск|орал|тараз|taraz|кызылорд|қызылорд|усть-?каменог|өскемен|туркестан|turkestan|казахстан|қазақстан|kazakhstan|🇰🇿|\bkz\b)/i;
const RE_PHONE = /(\+?7\s?\(?7\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|wa\.me\/77\d{9}|api\.whatsapp\.com\/send\?phone=77)/i;
const RE_KAZ = /[әғқңөұүһі]/i;
const RE_KASPI = /(kaspi|каспи)/i;
const RE_AD = /(#?реклама|#ad\b|#жарнама|промокод|promo ?code|сотрудничеств|коллаб|collab|скидк|розыгрыш|giveaway|#sponsored|партнёрск|партнерск|paid partnership|оплачено|артикул|kaspi\.kz\/shop)/i;
const isAdPost = x => !!(x.isPaidPartnership || x.paidPartnership || x.isSponsored || x.isAd || (x.sponsors && x.sponsors.length) || RE_AD.test(String(x.caption || x.text || '')));
const NICHES = {
  beauty: /(beauty|бьюти|макияж|makeup|визаж|косметик|ногт|nail|бров|ресниц|парфюм|сұлулық|макияж)/i,
  care: /(уход|skin|кожа|лицо|волос|hair|сыворот|крем|маск|spf|бет күтім|күтім|шаш)/i,
  lifestyle: /(lifestyle|лайфстайл|блог|влог|vlog|жизнь|life|daily|мой день|fashion|мода|стиль|outfit)/i,
  mom: /(мама|мамочк|mom|mother|материнств|дети|ребён|ребен|малыш|ана|бала|балапан|декрет)/i,
};

// Оценка «Казахстан»: каждый признак даёт баллы, причины сохраняются для менеджера.
function kzScore(text, extra) {
  const r = [];
  if (RE_CITY.test(text.bio)) r.push(['город/KZ в профиле', 2]);
  if (RE_PHONE.test(text.bio + ' ' + text.links)) r.push(['номер +7 7xx / WhatsApp 77…', 2]);
  if (RE_KAZ.test(text.bio + ' ' + text.captions)) r.push(['казахские буквы', 2]);
  if (RE_KASPI.test(text.bio + ' ' + text.captions)) r.push(['упоминает Kaspi', 1]);
  if (RE_CITY.test(text.places)) r.push(['геотеги в KZ', 2]);
  if (extra.brand) r.push(['отмечает KZ-бренд @' + extra.brand, 2]);
  if (extra.place) r.push(['пост в месте ' + extra.place, 2]);
  if (extra.tiktokKZ) r.push(['TikTok: видео из KZ', 3]);
  if (extra.cityTag) r.push(['городской хэштег', 1]);
  return { score: r.reduce((s, x) => s + x[1], 0), reasons: r.map(x => x[0] + ' +' + x[1]) };
}
function langOf(t) { const kk = RE_KAZ.test(t), ru = /[а-яё]/i.test(t); return kk && ru ? 'kk+ru' : kk ? 'kk' : ru ? 'ru' : /[a-z]/i.test(t) ? 'en' : ''; }

// Профиль Instagram → метрики и сигналы.
function analyze(p, cand, job) {
  const posts = Array.isArray(p.latestPosts) ? p.latestPosts : [];
  const followers = num(p.followersCount);
  const videos = posts.filter(x => /video/i.test(x.type || '') || x.productType === 'clips');
  const reach = median(videos.map(x => num(x.videoViewCount || x.videoPlayCount || x.igPlayCount))) || median((cand.items || []).map(x => num(x.views)));
  const eng = posts.slice(0, 12).map(x => num(x.likesCount) + num(x.commentsCount));
  const er = followers && eng.length ? Math.round(eng.reduce((a, b) => a + b, 0) / eng.length / followers * 1000) / 10 : 0;
  const since = Date.now() - job.periodDays * 86400000;
  const recent = posts.filter(x => Date.parse(x.timestamp) >= since).length;
  const caps = posts.map(x => String(x.caption || ''));
  const adShare = posts.length ? Math.round(posts.filter(isAdPost).length / posts.length * 100) : 0;
  const text = { bio: [p.fullName, p.biography, p.businessCategoryName].join(' '), links: [p.externalUrl, ...(p.externalUrls || []).map(u => u && u.url)].join(' '), captions: caps.concat((cand.items || []).map(x => x.caption || '')).join(' '), places: posts.map(x => x.locationName || (x.location && x.location.name) || '').join(' ') + ' ' + (cand.places || []).join(' ') };
  const kz = kzScore(text, { brand: cand.similar ? '' : (cand.brands || [])[0], place: (cand.places || [])[0], cityTag: (cand.tags || []).some(t => RE_CITY.test(t)) });
  const comp = job.competitors.filter(c => new RegExp('@' + c.replace(/\./g, '\\.') + '\\b', 'i').test(caps.join(' ')) || (posts.some(x => (x.mentions || []).map(String).map(s => s.toLowerCase()).includes(c))));
  return { followers, reach, er, recent, adShare, viewsRatio: followers ? Math.round(reach / followers * 100) : 0, lang: langOf(text.bio + ' ' + text.captions), kz, competitors: comp, nicheText: text.bio + ' ' + caps.join(' '), videos: videos.length };
}
function passes(m, job, skipped) {
  if ((job.minFollowers && m.followers < job.minFollowers) || (job.maxFollowers && m.followers > job.maxFollowers)) { skipped.followers++; return false; }
  if (job.kzOnly && m.kz.score < job.minKz) { skipped.notKz++; return false; }
  if (job.minViews && m.reach < job.minViews) { skipped.views++; return false; }
  if (job.minViewsPct && m.viewsRatio < job.minViewsPct) { skipped.views++; return false; }
  if (job.activeOnly && !m.recent) { skipped.inactive++; return false; }
  if (job.maxAdShare && m.adShare > job.maxAdShare) { skipped.ads++; return false; }
  const niches = (job.niches || (job.niche ? [job.niche] : [])).filter(n => NICHES[n]);
  if (niches.length && !niches.some(n => NICHES[n].test(m.nicheText))) { skipped.niche++; return false; }
  // Язык: ru — русский, kk — казахский, kk+ru — оба. Пусто — любой.
  const langs = job.langs || [];
  if (langs.length && !langs.includes(m.lang) && !(m.lang === 'kk+ru' && (langs.includes('ru') || langs.includes('kk')))) { skipped.lang++; return false; }
  return true;
}

function createScout({ db, makeBlogger, env = process.env, fetchImpl = fetch }) {
  let busy = false;
  const jobs = () => db.getState().apify_scout_jobs || (db.getState().apify_scout_jobs = []);
  const runLimit = () => Math.min(100, Number(env.APIFY_SCOUT_MAX_USD) || 1);
  // Дневной лимит: APIFY_SCOUT_DAILY_USD=0 (или off) — без дневного лимита (решение Нины 18.11).
  const dayLimit = () => { const v = String(env.APIFY_SCOUT_DAILY_USD || '3').trim().toLowerCase(); return v === '0' || v === 'off' ? 0 : Math.min(500, Number(v) || 3); };
  const configured = () => Boolean(env.APIFY_TOKEN) && env.APIFY_SCOUT_ENABLED === '1';
  const knownIg = () => new Set(db.getState().bloggers.map(b => nick(b.instagram_url)).filter(Boolean));
  const knownTt = () => new Set(db.getState().bloggers.map(b => nick(b.tiktok_url)).filter(Boolean));

  async function call(path, body) {
    const r = await fetchImpl('https://api.apify.com/v2/' + path, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Authorization: 'Bearer ' + env.APIFY_TOKEN, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw Error('Apify HTTP ' + r.status);
    return r.json();
  }

  function create(raw, user) {
    const source = SOURCES[raw.source] ? raw.source : 'hashtags';
    const tags = list(raw.hashtags).map(t => t.replace(/^#/, '').toLowerCase()).filter(t => /^[\p{L}\p{N}_]{2,60}$/u.test(t)).slice(0, 15);
    let accounts = [];
    if (source === 'places') accounts = list(raw.accounts).map(x => /^\d{3,20}$/.test(x) ? x : ((x.match(/locations\/(\d{3,20})/) || [])[1] || '')).filter(Boolean).slice(0, 20);
    else accounts = list(raw.accounts).map(nick).filter(Boolean).slice(0, 30);
    const queries = [...new Set(String(raw.queries || '').split(/[,;\n]+/).map(x => x.trim().toLowerCase()).filter(x => x.length >= 2 && x.length <= 60))].slice(0, 15);
    if (source === 'hashtags' && !tags.length) throw Error('Введите хэштеги');
    if (source === 'mentions' && !queries.length) throw Error('Введите слова для поиска в подписях — например, bidalli');
    if (source === 'tiktok' && !tags.length && !queries.length) throw Error('Введите хэштеги или слова для поиска (например, названия брендов)');
    if (['brands', 'similar'].includes(source) && !accounts.length) throw Error('Введите аккаунты (ник или ссылка), по одному в строке');
    if (source === 'places' && !accounts.length) throw Error('Введите ссылки на места вида instagram.com/explore/locations/123456/ или их номера');
    const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || d)));
    const usd = Number(raw.maxUsd) || runLimit();
    if (!(usd > 0 && usd <= runLimit())) throw Error('Потолок запуска — до ' + runLimit() + ' $');
    const today = new Date().toISOString().slice(0, 10);
    const spent = jobs().filter(j => String(j.createdAt).slice(0, 10) === today && j.status !== 'cancelled').reduce((s, j) => s + Number(j.maxUsd || 0), 0);
    if (dayLimit() && spent + usd > dayLimit()) throw Error('Дневной лимит Apify ' + dayLimit() + ' $: сегодня уже заложено ' + Math.round(spent * 100) / 100 + ' $, этот запуск ' + usd + ' $');
    const users = db.get('users').value();
    const j = { id: crypto.randomUUID(), source, hashtags: tags, queries: ['tiktok', 'mentions'].includes(source) ? queries : [], accounts, perSource: n(raw.perTag, 50, 5, 1000), maxProfiles: n(raw.maxProfiles, 50, 5, 3000),
      target: n(raw.target, 0, 0, 5000), firstShare: Math.min(0.9, Math.max(0.1, Number(raw.firstShare) || 0.5)),
      minFollowers: n(raw.minFollowers, 0, 0, 1e9), maxFollowers: n(raw.maxFollowers, 0, 0, 1e9), periodDays: [30, 60, 90].includes(Number(raw.periodDays)) ? Number(raw.periodDays) : 30,
      kzOnly: raw.kzOnly !== false, minKz: n(raw.minKz, 3, 1, 10), minViews: n(raw.minViews, 0, 0, 1e9), minViewsPct: n(raw.minViewsPct, 0, 0, 100), activeOnly: raw.activeOnly !== false, maxAdShare: n(raw.maxAdShare, 40, 0, 100), excludeExisting: raw.excludeExisting !== false,
      niches: (Array.isArray(raw.niches) ? raw.niches : [raw.niche]).filter(x => NICHES[x]), langs: (Array.isArray(raw.langs) ? raw.langs : []).filter(x => ['ru', 'kk', 'kk+ru'].includes(x)), competitors: list(raw.competitors).map(nick).filter(Boolean).slice(0, 50),
      maxUsd: usd, managerIds: [...new Set(raw.managerIds || [])].filter(id => users.some(u => u.id === id && u.role === 'manager')),
      status: 'pending', stage: source === 'similar' ? 'seeds' : 'collect', nextAt: 0, createdBy: user.id, createdByName: user.username, createdAt: new Date().toISOString() };
    jobs().push(j); db.write(); return j;
  }

  function stageInput(job) {
    const since = job.periodDays + ' days';
    if (job.stage === 'seeds') return [ACT.profile, { usernames: job.accounts, includeAboutSection: false }];
    if (job.stage === 'profiles') return [ACT.profile, { usernames: job.candidates.map(c => c.username), includeAboutSection: false }];
    if (job.source === 'hashtags') return [ACT.tags, { hashtags: job.hashtags, resultsType: 'reels', resultsLimit: job.perSource, keywordSearch: false }];
    // Упоминания бренда текстом в подписи (без отметки аккаунта): поиск по словам.
    if (job.source === 'mentions') return [ACT.tags, { hashtags: job.queries, resultsType: 'posts', resultsLimit: job.perSource, keywordSearch: true }];
    if (job.source === 'brands' || job.source === 'similar') return [ACT.tagged, { username: job.accounts, resultsLimit: job.perSource }];
    if (job.source === 'places') return [ACT.ig, { directUrls: job.accounts.map(id => 'https://www.instagram.com/explore/locations/' + id + '/'), resultsType: 'posts', resultsLimit: job.perSource, onlyPostsNewerThan: since }];
    // TikTok: хэштеги и/или поиск видео по словам (названия брендов) — страна видео проверяется по locationCreated.
    if (job.source === 'tiktok') return [ACT.tiktok, { ...(job.hashtags.length ? { hashtags: job.hashtags } : {}), ...((job.queries || []).length ? { searchQueries: job.queries, searchSection: '/video' } : {}), resultsPerPage: job.perSource, oldestPostDateUnified: String(job.periodDays) }];
    throw Error('Неизвестный источник');
  }
  async function start(job) {
    const [actor, input] = stageInput(job);
    const first = job.stage === 'collect' || job.stage === 'seeds';
    const usd = first ? Math.max(0.1, Math.round(job.maxUsd * (job.firstShare || 0.5) * 100) / 100) : Math.max(0.1, Math.round((job.maxUsd - (job.spentUsd || 0)) * 100) / 100);
    job.status = 'starting'; db.write();
    const s = await call('acts/' + actor + '/runs?maxTotalChargeUsd=' + encodeURIComponent(usd) + '&timeout=900', input);
    if (!s.data || !s.data.id) throw Error('Ответ Apify без run ID');
    job.runId = s.data.id; job.status = 'running'; job.nextAt = Date.now() + 20000; db.write();
  }
  async function poll(job) {
    const run = (await call('actor-runs/' + encodeURIComponent(job.runId))).data || {};
    if (run.status === 'SUCCEEDED' || (['TIMED-OUT', 'ABORTED'].includes(run.status) && run.defaultDatasetId)) {
      const rows = await call('datasets/' + encodeURIComponent(run.defaultDatasetId) + '/items?clean=true&format=json&limit=5000');
      if (!Array.isArray(rows)) throw Error('Неверный формат ответа Apify');
      job.spentUsd = Math.round(((job.spentUsd || 0) + num(run.usageTotalUsd)) * 100) / 100;
      delete job.runId; return rows;
    }
    if (['FAILED', 'TIMED-OUT', 'ABORTED'].includes(run.status)) { job.status = 'failed'; job.lastError = 'Apify: ' + run.status; delete job.runId; db.write(); return null; }
    job.nextAt = Date.now() + 20000; db.write(); return null;
  }

  // Посты (хэштеги / отметки / места) → кандидаты-авторы.
  function afterCollect(job, rows) {
    const known = knownIg(), by = {}, since = Date.now() - job.periodDays * 86400000;
    for (const r of rows) {
      if (r.error || r.errorCode) continue;
      if (job.source !== 'hashtags' && r.timestamp && Date.parse(r.timestamp) < since) continue; // период 30/60/90 дней
      const u = nick(r.ownerUsername); if (!u) continue;
      const c = by[u] = by[u] || { username: u, items: [], tags: [], brands: [], places: [], said: [] };
      if (job.source === 'mentions') { const cap = String(r.caption || '').toLowerCase(); for (const q of job.queries) if (cap.includes(q) && !c.said.includes(q)) c.said.push(q); }
      if (c.items.length < 5) c.items.push({ url: r.url, views: r.videoPlayCount || r.igPlayCount || r.videoViewCount, caption: String(r.caption || '').slice(0, 300) });
      const from = String(r.queryTag || r.inputUrl || '');
      if (job.source === 'hashtags') { const t = from.replace(/^.*\/tags\//, '').replace(/\/$/, ''); if (t && !c.tags.includes(t)) c.tags.push(t); }
      if (job.source === 'brands' || job.source === 'similar') { const said = [from, r.caption, ...(r.mentions || []), ...(r.taggedUsers || []).map(t => t && (t.username || t))].join(' ').toLowerCase(); const b = job.accounts.find(a => said.includes(a)) || (job.accounts.length === 1 ? job.accounts[0] : ''); if (b && !c.brands.includes(b)) c.brands.push(b); if (job.source === 'similar') c.similar = true; }
      if (job.source === 'places') { const pl = r.locationName || (r.location && r.location.name) || ((from.match(/locations\/(\d+)/) || [])[1] ? 'место ' + from.match(/locations\/(\d+)/)[1] : 'место из списка'); if (pl && !c.places.includes(pl)) c.places.push(pl); }
    }
    // «Похожие»: добавляем тех, кого нашли в профилях стартовых блогеров (их отметки и соавторы).
    for (const sc of (job.source === 'similar' ? job.seedCands || [] : [])) { const c = by[sc.username] = by[sc.username] || { username: sc.username, items: [], tags: [], brands: [], places: [], said: [] }; c.similar = true; for (const b of sc.seeds) if (!c.brands.includes(b)) c.brands.push(b); }
    const all = Object.values(by).filter(c => !job.accounts.includes(c.username));
    job.postsFound = rows.length; job.authorsFound = all.length;
    const fresh = all.filter(a => job.excludeExisting === false || !known.has(a.username)); job.alreadyInCrm = all.filter(a => known.has(a.username)).length;
    job.candidates = fresh.sort((a, b) => b.items.length - a.items.length).slice(0, job.maxProfiles);
    job.stage = 'profiles'; job.status = job.candidates.length ? 'pending' : 'done'; job.nextAt = 0;
    if (!job.candidates.length) { job.result = { created: 0 }; job.stage = 'done'; }
    db.write();
  }
  // «Похожие»: профили стартовых блогеров → их relatedProfiles + кого они отмечают / с кем снимают коллабы → кандидаты.
  // 18.11.2026: Instagram почти перестал отдавать relatedProfiles (часто пусто) — тогда вторым шагом берём
  // авторов, которые сами отмечают этих блогеров (коллабы, похожая аудитория), как в источнике «Отметки брендов».
  function afterSeeds(job, rows) {
    const known = knownIg(), by = {};
    const add = (u, seed) => { u = nick(u); if (!u || job.accounts.includes(u) || u === seed) return; const c = by[u] = by[u] || { username: u, items: [], seeds: [] }; if (!c.seeds.includes(seed)) c.seeds.push(seed); };
    for (const p of rows) { const seed = nick(p.username);
      for (const r of (Array.isArray(p.relatedProfiles) ? p.relatedProfiles : [])) if (r && !r.is_private) add(r.username, seed);
      for (const post of (Array.isArray(p.latestPosts) ? p.latestPosts : [])) {
        for (const t of (post.taggedUsers || [])) add(t && (t.username || t), seed);
        for (const m of (post.mentions || [])) add(m, seed);
        for (const co of (post.coauthorProducers || [])) add(co && (co.username || co), seed);
      } }
    // брендов и магазинов среди отметок много — их отсекут фильтры подписчиков/KZ на шаге профилей
    if (Object.keys(by).length < 15 && !job.seedsExpanded) {
      job.seedsExpanded = true; job.seedCands = Object.values(by).map(c => ({ username: c.username, seeds: c.seeds }));
      job.stage = 'collect'; job.status = 'pending'; job.nextAt = 0; db.write(); return;
    }
    const all = Object.values(by); job.authorsFound = all.length;
    const fresh = all.filter(a => job.excludeExisting === false || !known.has(a.username)); job.alreadyInCrm = all.filter(a => known.has(a.username)).length;
    job.candidates = fresh.sort((a, b) => b.seeds.length - a.seeds.length).slice(0, job.maxProfiles);
    job.stage = 'profiles'; job.status = job.candidates.length ? 'pending' : 'done'; job.nextAt = 0;
    if (!job.candidates.length) { job.result = { created: 0 }; job.stage = 'done'; }
    db.write();
  }

  function assign(job, b, s, loads) { if (!job.managerIds.length) return; const id = job.managerIds.slice().sort((a, z) => loads[a] - loads[z])[0]; b.assigned_manager_id = id; b.manager_name = (s.users.find(x => x.id === id) || {}).username; b.in_work = true; b.status = 'transferred'; loads[id]++; }
  function finish(job, s, batchId, created, skipped) {
    const added = created.filter(x => !x.existing);
    const byAccount = {}; for (const x of added) for (const a of (x.brands || [])) { const r = byAccount[a] = byAccount[a] || { added: 0, kzSum: 0, viewsSum: 0 }; r.added++; r.kzSum += x.kz; r.viewsSum += x.reach; }
    for (const a of Object.keys(byAccount)) { const r = byAccount[a]; byAccount[a] = { added: r.added, avgKz: Math.round(r.kzSum / r.added * 10) / 10, avgViews: Math.round(r.viewsSum / r.added) }; }
    if (added.length) s.batches.push({ id: batchId, name: 'Apify · ' + SOURCES[job.source] + ': ' + ((job.queries || []).length ? '«' + job.queries.join('», «') + '» ' : '') + (job.hashtags.length ? '#' + job.hashtags.join(' #') : job.accounts.map(a => /^\d+$/.test(a) ? a : '@' + a).join(' ')).slice(0, 120), created_at: new Date().toISOString(), count: added.length });
    created.sort((a, b) => b.kz - a.kz || b.reach - a.reach);
    job.result = { created: added.length, existing: created.length - added.length, checked: job.checked || 0, skipped, byAccount, sample: created.slice(0, 80) };
    job.status = 'done'; job.stage = 'done'; job.finishedAt = new Date().toISOString(); delete job.candidates; db.write();
  }

  function afterProfiles(job, rows) {
    const s = db.getState(), known = knownIg(), cand = Object.fromEntries((job.candidates || []).map(c => [c.username, c]));
    const loads = Object.fromEntries(job.managerIds.map(id => [id, s.bloggers.filter(b => b.assigned_manager_id === id && b.in_work).length]));
    const batchId = crypto.randomUUID(), now = new Date().toISOString(), created = [], skipped = { private: 0, duplicate: 0, followers: 0, notKz: 0, views: 0, inactive: 0, ads: 0, niche: 0, lang: 0 };
    job.checked = rows.length;
    for (const p of rows) {
      const u = nick(p.username); if (!u) continue;
      const exists = known.has(u);
      if (exists && job.excludeExisting !== false) { skipped.duplicate++; continue; }
      if (p.private) { skipped.private++; continue; }
      const c = cand[u] || {}, m = analyze(p, c, job);
      if (!passes(m, job, skipped)) continue;
      if (job.target && created.filter(x => !x.existing).length >= job.target) { skipped.overTarget = (skipped.overTarget || 0) + 1; continue; } // цель набрана
      known.add(u);
      const via = c.said && c.said.length ? 'упоминает «' + c.said.join('», «') + '»' : c.tags && c.tags.length ? '#' + c.tags.join(' #') : c.brands && c.brands.length ? (c.similar ? 'рядом с @' : 'отмечает @') + c.brands.join(', @') : c.places && c.places.length ? 'место: ' + c.places.slice(0, 2).join(', ') : c.seeds ? 'похож на @' + c.seeds.slice(0, 3).join(', @') : '';
      const flags = [m.competitors.length ? '⚠ работает с конкурентом @' + m.competitors.join(', @') : '', m.adShare >= 50 ? 'много рекламы ' + m.adShare + '%' : ''].filter(Boolean);
      const row = { username: u, platform: 'ig', followers: m.followers, reach: m.reach, viewsRatio: m.viewsRatio, er: m.er, adShare: m.adShare, kz: m.kz.score, kzWhy: m.kz.reasons.join('; '), via, brands: c.brands || [], flags: flags.join('; '), lang: m.lang };
      if (exists) { created.push({ ...row, id: 'exists-' + u, existing: true }); continue; }
      const b = { id: crypto.randomUUID(), batch_id: batchId, created_at: now, updated_at: now,
        ...makeBlogger({ name: u, instagram_url: 'https://www.instagram.com/' + u + '/', instagram_followers: m.followers, instagram_avg_reach: m.reach, er: m.er ? String(m.er) : null, category: p.businessCategoryName || null, status: 'new',
          notes: ((p.fullName ? String(p.fullName).slice(0, 80) + ' · ' : '') + 'Apify · ' + SOURCES[job.source] + (via ? ' (' + via + ')' : '') + ' · KZ ' + m.kz.score + ' б.' + (m.kz.reasons.length ? ' (' + m.kz.reasons.join(', ') + ')' : '') + ' · просмотры/подписчики ' + m.viewsRatio + '%' + (flags.length ? ' · ' + flags.join(' · ') : '') + (p.biography ? ' · ' + String(p.biography).replace(/\s+/g, ' ').slice(0, 250) : '')).slice(0, 700) }),
        instagram_platform_id: p.id ? String(p.id) : null, discovery_status: 'unreviewed', discovery_source: 'apify_' + job.source, discovery_search_id: job.id,
        kz_score: m.kz.score, kz_reasons: m.kz.reasons, scout: { source: job.source, via, viewsRatio: m.viewsRatio, recentPosts: m.recent, adShare: m.adShare, lang: m.lang, competitors: m.competitors },
        discovery_evidence: 'KZ: ' + (m.kz.reasons.join('; ') || 'признаков нет'), discovery_context: { biography: String(p.biography || '').slice(0, 1500), captions: (c.items || []).slice(0, 3).map(r => r.caption), posts: (c.items || []).slice(0, 3).map(r => r.url).filter(Boolean), externalUrl: p.externalUrl || null } };
      assign(job, b, s, loads); s.bloggers.push(b);
      created.push({ ...row, id: b.id });
    }
    finish(job, s, batchId, created, skipped);
  }

  // TikTok: всё уже есть в выдаче (автор + видео), профильный шаг не нужен.
  function afterTiktok(job, rows) {
    const s = db.getState(), known = knownTt(), by = {};
    const loads = Object.fromEntries(job.managerIds.map(id => [id, s.bloggers.filter(b => b.assigned_manager_id === id && b.in_work).length]));
    for (const r of rows) { if (r.errorCode || !r.authorMeta) continue; const u = nick(r.authorMeta.name); if (!u) continue; const c = by[u] = by[u] || { username: u, meta: r.authorMeta, vids: [], q: [] }; c.vids.push(r); const q = String(r.searchQuery || '').toLowerCase(); if (q && !c.q.includes(q)) c.q.push(q); }
    const all = Object.values(by); job.postsFound = rows.length; job.authorsFound = all.length;
    const batchId = crypto.randomUUID(), now = new Date().toISOString(), created = [], skipped = { private: 0, duplicate: 0, followers: 0, notKz: 0, views: 0, inactive: 0, ads: 0, niche: 0, lang: 0 };
    for (const c of all.slice(0, job.maxProfiles * 2)) {
      if (known.has(c.username)) { skipped.duplicate++; continue; }
      if (c.meta.privateAccount) { skipped.private++; continue; }
      const followers = num(c.meta.fans), reach = median(c.vids.map(v => num(v.playCount)));
      const caps = c.vids.map(v => String(v.text || '')).join(' ');
      const kz = kzScore({ bio: [c.meta.nickName, c.meta.signature].join(' '), links: String(c.meta.bioLink || ''), captions: caps, places: '' }, { tiktokKZ: c.vids.some(v => String(v.locationCreated || '').toUpperCase() === 'KZ'), cityTag: job.hashtags.some(t => RE_CITY.test(t)) });
      const since = Date.now() - job.periodDays * 86400000;
      const m = { followers, reach, er: 0, recent: c.vids.filter(v => Date.parse(v.createTimeISO) >= since).length, adShare: c.vids.length ? Math.round(c.vids.filter(isAdPost).length / c.vids.length * 100) : 0, viewsRatio: followers ? Math.round(reach / followers * 100) : 0, lang: langOf(caps + ' ' + (c.meta.signature || '')), kz, competitors: [], nicheText: [c.meta.signature, caps].join(' ') };
      if (!passes(m, job, skipped)) continue;
      known.add(c.username);
      const b = { id: crypto.randomUUID(), batch_id: batchId, created_at: now, updated_at: now,
        ...makeBlogger({ name: c.username, tiktok_url: 'https://www.tiktok.com/@' + c.username, tiktok_followers: followers, tiktok_avg_reach: reach, status: 'new',
          notes: ((c.meta.nickName ? String(c.meta.nickName).slice(0, 80) + ' · ' : '') + 'Apify · TikTok (' + (c.q.length ? 'поиск «' + c.q.join('», «') + '»' : '#' + job.hashtags.join(' #')) + ') · KZ ' + kz.score + ' б.' + (kz.reasons.length ? ' (' + kz.reasons.join(', ') + ')' : '') + ' · просмотры/подписчики ' + m.viewsRatio + '%' + (c.meta.signature ? ' · ' + String(c.meta.signature).replace(/\s+/g, ' ').slice(0, 250) : '')).slice(0, 700) }),
        discovery_status: 'unreviewed', discovery_source: 'apify_tiktok', discovery_search_id: job.id, kz_score: kz.score, kz_reasons: kz.reasons,
        scout: { source: 'tiktok', via: c.q.length ? 'поиск «' + c.q.join('», «') + '»' : '#' + job.hashtags.join(' #'), viewsRatio: m.viewsRatio, recentPosts: m.recent, adShare: m.adShare, lang: m.lang }, discovery_evidence: 'KZ: ' + (kz.reasons.join('; ') || 'признаков нет') };
      assign(job, b, s, loads); s.bloggers.push(b);
      created.push({ id: b.id, username: c.username, platform: 'tt', followers, reach, viewsRatio: m.viewsRatio, er: 0, adShare: m.adShare, kz: kz.score, kzWhy: kz.reasons.join('; '), via: 'TikTok' + (c.q.length ? ': упоминает «' + c.q.join('», «') + '»' : ''), flags: m.adShare >= 50 ? 'много рекламы ' + m.adShare + '%' : '', lang: m.lang });
      if (created.length >= job.maxProfiles) break;
    }
    finish(job, s, batchId, created, skipped);
  }

  async function drain() {
    if (busy || !configured()) return; busy = true;
    try {
      for (const job of jobs().filter(j => ['pending', 'running'].includes(j.status) && (j.nextAt || 0) <= Date.now()).slice(0, 2)) {
        try {
          if (job.status === 'pending') { await start(job); continue; }
          const rows = await poll(job); if (!rows) continue;
          if (job.stage === 'seeds') afterSeeds(job, rows);
          else if (job.stage === 'collect') (job.source === 'tiktok' ? afterTiktok : afterCollect)(job, rows);
          else afterProfiles(job, rows);
        } catch (e) {
          // Потерянный ответ на запуск — не перезапускаем платный прогон сами.
          if (job.status === 'starting') job.status = 'uncertain';
          job.lastError = /^Apify HTTP \d+$/.test(e.message) ? e.message + (e.message.endsWith('401') ? ' — проверьте APIFY_TOKEN' : '') : 'Поиск не завершён: ' + String(e.message).slice(0, 120);
          job.nextAt = Date.now() + 60000; db.write();
        }
      }
    } finally { busy = false; }
  }

  function mount(app, auth) {
    const view = j => { const { candidates, ...rest } = j; return { ...rest, candidates: candidates ? candidates.length : undefined }; };
    app.get('/api/scout/jobs', auth, (req, res) => {
      if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
      res.json({ jobs: jobs().slice(-30).reverse().map(view), sources: SOURCES, configured: configured(), hasToken: Boolean(env.APIFY_TOKEN), runLimit: runLimit(), dayLimit: dayLimit() });
    });
    app.post('/api/scout/jobs', auth, (req, res) => {
      if (req.user.role !== 'admin') return res.status(403).json({ error: 'Платный поиск запускает администратор' });
      if (!configured()) return res.status(409).json({ error: 'Apify не подключён: в Render нужны APIFY_TOKEN и APIFY_SCOUT_ENABLED=1' });
      try { const j = create(req.body || {}, req.user); res.json(view(j)); drain().catch(() => {}); } catch (e) { res.status(400).json({ error: e.message }); }
    });
    // «Наши лучшие блогеры» для источника «Похожие»: больше всего оплаченных интеграций (только ники Instagram).
    app.get('/api/scout/best-bloggers', auth, (req, res) => {
      if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
      const st = db.getState(), cnt = {};
      for (const p of st.payments || []) if (p.status === 'paid' && p.blogger_id) cnt[p.blogger_id] = (cnt[p.blogger_id] || 0) + 1;
      const rows = (st.bloggers || []).map(b => ({ nick: nick(b.instagram_url), n: cnt[b.id] || 0, reach: Number(b.instagram_avg_reach) || 0 })).filter(x => x.nick && x.n > 0)
        .sort((a, b) => b.n - a.n || b.reach - a.reach).slice(0, Math.min(50, Number(req.query.limit) || 30));
      res.json({ accounts: rows.map(x => x.nick) });
    });
    app.post('/api/scout/jobs/:id/cancel', auth, (req, res) => {
      if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
      const j = jobs().find(x => x.id === req.params.id); if (!j) return res.status(404).json({ error: 'Не найдено' });
      if (j.runId) call('actor-runs/' + encodeURIComponent(j.runId) + '/abort', {}).catch(() => {});
      j.status = 'cancelled'; db.write(); res.json(view(j));
    });
    for (const j of jobs()) if (j.status === 'starting') j.status = 'uncertain';
    db.write();
    const t = setInterval(() => drain().catch(() => {}), 20000); t.unref();
  }
  return { create, drain, mount, kzScore, analyze };
}
module.exports = { createScout, kzScore };
