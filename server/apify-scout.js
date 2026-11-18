'use strict';
// Поиск блогеров через Apify (тест, 18.11.2026): хэштеги → рилсы (apify/instagram-hashtag-scraper)
// → профили авторов (apify/instagram-profile-scraper) → новые блогеры в CRM с подписчиками, средними просмотрами и ER.
// Платно: запускает только администратор, у каждого запуска потолок в USD (maxTotalChargeUsd), плюс дневной лимит.
const crypto = require('crypto');
const REELS_ACTOR = 'apify~instagram-hashtag-scraper';
const PROFILE_ACTOR = 'apify~instagram-profile-scraper';

const nick = v => { let s = String(v || '').trim().toLowerCase(); if (s.includes('instagram.com/')) s = s.split('instagram.com/')[1].split(/[/?#]/)[0]; s = s.replace(/^@/, ''); return /^[a-z0-9._]{1,30}$/.test(s) ? s : null; };
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const median = a => { const s = a.filter(x => x > 0).sort((x, y) => x - y); if (!s.length) return 0; const m = s.length >> 1; return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2); };

// Метрики профиля: средние просмотры — медиана по видео (рилсам) из профиля, иначе по рилсам из хэштегов; ER — (лайки+комм.)/подписчики.
function metrics(profile, reelsFromTags) {
  const posts = Array.isArray(profile.latestPosts) ? profile.latestPosts : [];
  const videos = posts.filter(p => /video/i.test(p.type || '') || p.productType === 'clips');
  const views = videos.map(p => num(p.videoViewCount || p.videoPlayCount || p.igPlayCount));
  const tagViews = (reelsFromTags || []).map(r => num(r.videoPlayCount || r.igPlayCount || r.videoViewCount));
  const reach = median(views) || median(tagViews);
  const followers = num(profile.followersCount);
  const eng = posts.slice(0, 12).map(p => num(p.likesCount) + num(p.commentsCount));
  const er = followers && eng.length ? Math.round(eng.reduce((a, b) => a + b, 0) / eng.length / followers * 1000) / 10 : 0;
  return { followers, reach, er, videos: videos.length };
}

function createScout({ db, makeBlogger, env = process.env, fetchImpl = fetch }) {
  let busy = false;
  const jobs = () => db.getState().apify_scout_jobs || (db.getState().apify_scout_jobs = []);
  const runLimit = () => Math.min(10, Number(env.APIFY_SCOUT_MAX_USD) || 1);
  const dayLimit = () => Math.min(50, Number(env.APIFY_SCOUT_DAILY_USD) || 3);
  const configured = () => Boolean(env.APIFY_TOKEN) && env.APIFY_SCOUT_ENABLED === '1';

  async function call(path, body) {
    const r = await fetchImpl('https://api.apify.com/v2/' + path, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Authorization: 'Bearer ' + env.APIFY_TOKEN, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw Error('Apify HTTP ' + r.status);
    return r.json();
  }

  function create(raw, user) {
    const tags = [...new Set(String(raw.hashtags || '').split(/[\s,;\n]+/).map(t => t.trim().replace(/^#/, '').toLowerCase()).filter(t => /^[\p{L}\p{N}_]{2,60}$/u.test(t)))].slice(0, 10);
    if (!tags.length) throw Error('Введите хэштеги, например: бьютиалматы, косметикаказахстан');
    const perTag = Math.max(5, Math.min(100, Math.round(Number(raw.perTag) || 30)));
    const maxProfiles = Math.max(5, Math.min(200, Math.round(Number(raw.maxProfiles) || 50)));
    const minF = Math.max(0, Math.round(Number(raw.minFollowers) || 0)), maxF = Math.max(0, Math.round(Number(raw.maxFollowers) || 0));
    const usd = Number(raw.maxUsd) || runLimit();
    if (!(usd > 0 && usd <= runLimit())) throw Error('Потолок запуска — до ' + runLimit() + ' $');
    const today = new Date().toISOString().slice(0, 10);
    const spent = jobs().filter(j => String(j.createdAt).slice(0, 10) === today && j.status !== 'cancelled').reduce((s, j) => s + Number(j.maxUsd || 0), 0);
    if (spent + usd > dayLimit()) throw Error('Дневной лимит Apify ' + dayLimit() + ' $ уже исчерпан (заложено ' + spent + ' $)');
    const users = db.get('users').value();
    const managers = [...new Set(raw.managerIds || [])].filter(id => users.some(u => u.id === id && u.role === 'manager'));
    const j = { id: crypto.randomUUID(), hashtags: tags, perTag, maxProfiles, minFollowers: minF, maxFollowers: maxF, maxUsd: usd, managerIds: managers, status: 'pending', stage: 'reels', nextAt: 0, createdBy: user.id, createdByName: user.username, createdAt: new Date().toISOString() };
    jobs().push(j); db.write(); return j;
  }

  async function start(job, actor, input, usd) {
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

  function afterReels(job, rows) {
    const known = new Set(db.getState().bloggers.map(b => nick(b.instagram_url)).filter(Boolean));
    const by = {};
    for (const r of rows) {
      const u = nick(r.ownerUsername); if (!u) continue;
      (by[u] = by[u] || { username: u, reels: [], tags: new Set() }).reels.push({ url: r.url, videoPlayCount: r.videoPlayCount, igPlayCount: r.igPlayCount, videoViewCount: r.videoViewCount, likesCount: r.likesCount, caption: String(r.caption || '').slice(0, 300) });
      if (r.queryTag || r.inputUrl) by[u].tags.add(String(r.queryTag || r.inputUrl).replace(/^.*\/tags\//, '').replace(/\/$/, ''));
    }
    const all = Object.values(by);
    job.reelsFound = rows.length; job.authorsFound = all.length;
    const fresh = all.filter(a => !known.has(a.username));
    job.alreadyInCrm = all.length - fresh.length;
    job.candidates = fresh.sort((a, b) => b.reels.length - a.reels.length).slice(0, job.maxProfiles).map(a => ({ username: a.username, reels: a.reels.slice(0, 5), tags: [...a.tags].slice(0, 5) }));
    job.stage = 'profiles'; job.status = job.candidates.length ? 'pending' : 'done'; job.nextAt = 0;
    if (!job.candidates.length) job.result = { created: 0, skipped: 0 };
    db.write();
  }

  function afterProfiles(job, rows) {
    const s = db.getState(), known = new Set(s.bloggers.map(b => nick(b.instagram_url)).filter(Boolean));
    const cand = Object.fromEntries((job.candidates || []).map(c => [c.username, c]));
    const loads = Object.fromEntries(job.managerIds.map(id => [id, s.bloggers.filter(b => b.assigned_manager_id === id && b.in_work).length]));
    const batchId = crypto.randomUUID(), now = new Date().toISOString(), created = [], skipped = { private: 0, followers: 0, duplicate: 0 };
    for (const p of rows) {
      const u = nick(p.username); if (!u) continue;
      if (known.has(u)) { skipped.duplicate++; continue; }
      if (p.private) { skipped.private++; continue; }
      const c = cand[u] || {}, m = metrics(p, c.reels);
      if ((job.minFollowers && m.followers < job.minFollowers) || (job.maxFollowers && m.followers > job.maxFollowers)) { skipped.followers++; continue; }
      known.add(u);
      const b = { id: crypto.randomUUID(), batch_id: batchId, created_at: now, updated_at: now,
        ...makeBlogger({ name: String(p.fullName || u).slice(0, 150), instagram_url: 'https://www.instagram.com/' + u + '/', instagram_followers: m.followers, instagram_avg_reach: m.reach, er: m.er ? String(m.er) : null, category: p.businessCategoryName || null, status: 'new',
          notes: ('Apify: #' + (c.tags && c.tags.length ? c.tags.join(' #') : job.hashtags.join(' #')) + (p.biography ? ' · ' + String(p.biography).replace(/\s+/g, ' ').slice(0, 300) : '')).slice(0, 600) }),
        instagram_platform_id: p.id ? String(p.id) : null, discovery_status: 'unreviewed', discovery_source: 'apify_scout', discovery_search_id: job.id,
        discovery_evidence: 'Найден по хэштегам; ' + m.videos + ' видео в последних постах', discovery_context: { biography: String(p.biography || '').slice(0, 1500), captions: (c.reels || []).slice(0, 3).map(r => r.caption), reels: (c.reels || []).slice(0, 3).map(r => r.url).filter(Boolean), externalUrl: p.externalUrl || null, verified: !!p.verified } };
      if (job.managerIds.length) { const id = job.managerIds.slice().sort((a, z) => loads[a] - loads[z])[0]; b.assigned_manager_id = id; b.manager_name = (s.users.find(x => x.id === id) || {}).username; b.in_work = true; b.status = 'transferred'; loads[id]++; }
      s.bloggers.push(b); created.push({ id: b.id, username: u, followers: m.followers, reach: m.reach, er: m.er });
    }
    if (created.length) s.batches.push({ id: batchId, name: 'Apify: #' + job.hashtags.join(' #'), created_at: now, count: created.length });
    job.result = { created: created.length, skipped, sample: created.slice(0, 50) };
    job.status = 'done'; job.stage = 'done'; job.finishedAt = now; delete job.candidates; db.write();
  }

  async function drain() {
    if (busy || !configured()) return; busy = true;
    try {
      for (const job of jobs().filter(j => ['pending', 'running'].includes(j.status) && (j.nextAt || 0) <= Date.now()).slice(0, 2)) {
        try {
          const left = Math.max(0.1, Math.round((job.maxUsd - (job.spentUsd || 0)) * 100) / 100);
          if (job.status === 'pending' && job.stage === 'reels') { await start(job, REELS_ACTOR, { hashtags: job.hashtags, resultsType: 'reels', resultsLimit: job.perTag, keywordSearch: false }, Math.round(job.maxUsd * 0.6 * 100) / 100); continue; }
          if (job.status === 'pending' && job.stage === 'profiles') { await start(job, PROFILE_ACTOR, { usernames: job.candidates.map(c => c.username), includeAboutSection: false }, left); continue; }
          if (job.status === 'running') { const rows = await poll(job); if (!rows) continue; if (job.stage === 'reels') afterReels(job, rows); else afterProfiles(job, rows); }
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
      res.json({ jobs: jobs().slice(-30).reverse().map(view), configured: configured(), hasToken: Boolean(env.APIFY_TOKEN), runLimit: runLimit(), dayLimit: dayLimit() });
    });
    app.post('/api/scout/jobs', auth, (req, res) => {
      if (req.user.role !== 'admin') return res.status(403).json({ error: 'Платный поиск запускает администратор' });
      if (!configured()) return res.status(409).json({ error: 'Apify не подключён: в Render нужны APIFY_TOKEN и APIFY_SCOUT_ENABLED=1' });
      try { const j = create(req.body || {}, req.user); res.json(view(j)); drain().catch(() => {}); } catch (e) { res.status(400).json({ error: e.message }); }
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
  return { create, drain, metrics, afterReels, afterProfiles, mount };
}
module.exports = { createScout, metrics };
