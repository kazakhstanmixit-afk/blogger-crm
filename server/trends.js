// ── ТРЕНДЫ ──────────────────────────────────────────────────────────────
// Сбор популярных роликов под товары (Apify), отбор, разбор (Gemini),
// ТЗ для блогеров в Word (казахский → русский), назначение блогерам.
//
// Переменные окружения (Render → Environment):
//   APIFY_TOKEN     — токен Apify (Settings → API & Integrations)
//   GEMINI_API_KEY  — ключ Gemini (aistudio.google.com → Get API key)
//   TRENDS_SCHEDULER=off — выключить авто-запуск по расписанию (по умолчанию включён)
//   APIFY_BASE / GEMINI_BASE — только для тестов (подмена адресов API)

const { buildTzDocx } = require('./tzdocx');

const APIFY_BASE = (process.env.APIFY_BASE || 'https://api.apify.com').replace(/\/$/, '');
const GEMINI_BASE = (process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
const TT_ACTOR = 'clockworks~tiktok-scraper';
const IG_ACTOR = 'apify~instagram-hashtag-scraper';
const TZ_OFFSET_H = 5; // Казахстан, UTC+5
const CATCHUP_H = 4;   // окно догоняющего запуска после времени по расписанию

const DEFAULT_SETTINGS = {
  schedule_days: [2, 5],        // вт, пт (0 = вс)
  schedule_hour: 8,             // местное время
  results_per_query: 30,        // лимит результатов на запрос
  max_queries_per_product: 6,
  max_total_results: 600,       // общий лимит сбора за запуск
  max_apify_usd_per_run: 3,     // жёсткий потолок расходов Apify на один запуск
  max_prescreen: 80,            // предпроверок по подписи за запуск
  max_full: 20,                 // полных разборов видео за запуск
  min_per_product: 1,           // минимальная квота полных разборов на товар
  on_limit: 'stop',             // stop | ask — что делать при достижении лимита разборов
  max_age_days: 90,
  min_plays_viral: 100000,
  rising_max_age_days: 14,
  rising_min_per_day: 15000,
  instagram_enabled: false,     // пилот: Instagram по хэштегам даёт в основном старые посты
  gemini_model: 'gemini-3.5-flash',
  gemini_price_in: 0.3,         // $ за 1 млн входных токенов (для учёта расходов)
  gemini_price_out: 2.5,        // $ за 1 млн выходных токенов
};

const BANNED_RE = /бюджетн|дешёв|дешев|недорог|инновацион|идеальн|уникальн\w* формул|chanel|шанел|dior|диор|люкс|арзан|бюджеттік/i;

const EXAMPLE_TZ = `ПРИМЕР ХОРОШЕГО ТЗ (стиль и подробность, не копировать содержание):
Подзаголовок: Тушь MIXIT LashLust Volume Max · обучение: чистое нанесение без пятен
Чёрная рамка (хук): ОБЯЗАТЕЛЬНО: ВИЗУАЛЬНЫЙ ХУК «НОВИЧОК — ПРОФИ» / Первый кадр — сравнение: как красят новички (пятна на веке) и как получается с лайфхаком (чисто).
Формат: видео-обучение: показываете, почему при обычном нанесении остаются пятна на веке, и как с надёжной тушью и одним лайфхаком накрасить ресницы чисто с первого раза.
Хронометраж: 25–35 секунд
Сценарий:
01 Хук: новичок — профи. Кадр: разделённый экран или два кадра подряд. Подпись «Новичок»: красите ресницы у зеркала, на веке остаются пятна, вытираете ватной палочкой. Подпись «Профи»: чистые ресницы, веко без пятен. Говорите: «90% девушек красят ресницы просто глядя в зеркало — а потом удивляются пятнам». Заголовок: «90% девушек красят ресницы неправильно»
02 Что нужно. Кадр: вы крупно, в руке тушь. Говорите: «А для чистого результата нужны всего две вещи: хорошая тушь и один простой лайфхак.»
03 Тушь. Кадр: тушь крупно, название MIXIT видно. Говорите: «Я крашу тушью LashLust от MIXIT. Она прокрашивает каждую ресничку без комочков.»
04 Лайфхак. Кадр: подкладываете бумажку под ресницы. Говорите: «Беру стикер и подкладываю под ресницы. Так тушь не отпечатается на веке.»
05 Нанесение. Кадр: крупно красите от корней зигзагом, убираете бумажку. Говорите: «Крашу от корней зигзагом — и убираю бумажку. Смотрите, ни одного пятна.»
06 Результат. Кадр: смотрите в камеру, моргаете. Говорите: «Вот и всё!»
07 Финал. Кадр: тушь у лица логотипом вперёд. Говорите: «Сохраняйте, чтобы не забыть. Артикул оставлю в комментариях.»`;

module.exports = function mountTrends(app, db, auth, uuidv4) {
  db.defaults({ trend_videos: [], trend_runs: [], trend_settings: {}, trend_product_cfg: {} }).write();

  // ── helpers ──
  const now = () => new Date().toISOString();
  const settings = () => ({ ...DEFAULT_SETTINGS, ...(db.get('trend_settings').value() || {}) });
  const products = () => db.get('products').value() || [];
  const pcfg = id => ({ active: true, on_limit: false, limit_note: '', props: '', banned: '', queries: [], ig_hashtags: [], priority: false, ...((db.get('trend_product_cfg').value() || {})[id] || {}) });
  const setPcfg = (id, patch) => {
    const all = { ...(db.get('trend_product_cfg').value() || {}) };
    all[id] = { ...pcfg(id), ...patch };
    db.set('trend_product_cfg', all).write();
    return all[id];
  };
  const keys = () => ({ apify: !!process.env.APIFY_TOKEN, gemini: !!process.env.GEMINI_API_KEY });
  const isAdmin = req => req.user && req.user.role === 'admin';
  const canEdit = req => req.user && req.user.role !== 'viewer' && req.user.role !== 'operator';
  const videos = () => db.get('trend_videos');
  const getVideo = id => videos().find({ id }).value();
  const saveVideo = (id, patch) => videos().find({ id }).assign(patch).write();
  const runs = () => db.get('trend_runs');
  const saveRun = (id, patch) => runs().find({ id }).assign(patch).write();
  const getRun = id => runs().find({ id }).value();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const productName = id => (products().find(p => p.id === id) || {}).name || '';

  function log(runId, msg) {
    const r = getRun(runId); if (!r) return;
    const l = (r.log || []).concat(`${now().slice(11, 19)} ${msg}`).slice(-200);
    saveRun(runId, { log: l });
  }

  // ── Apify ──
  async function apify(method, path, body, query = {}) {
    const qs = new URLSearchParams({ token: process.env.APIFY_TOKEN || '', ...query });
    const res = await fetch(`${APIFY_BASE}${path}?${qs}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Apify ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }
  async function apifyRun(actor, input, maxUsd, timeoutMs = 15 * 60 * 1000) {
    const started = await apify('POST', `/v2/acts/${actor}/runs`, input, maxUsd ? { maxTotalChargeUsd: String(maxUsd) } : {});
    let run = started.data;
    const t0 = Date.now();
    while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
      if (Date.now() - t0 > timeoutMs) throw new Error('Apify: превышено время ожидания запуска');
      await sleep(process.env.APIFY_POLL_MS ? Number(process.env.APIFY_POLL_MS) : 5000);
      run = (await apify('GET', `/v2/actor-runs/${run.id}`)).data;
    }
    const items = [];
    if (run.defaultDatasetId) {
      for (let offset = 0; offset < 20000; offset += 1000) {
        const qs = new URLSearchParams({ token: process.env.APIFY_TOKEN || '', clean: '1', offset: String(offset), limit: '1000' });
        const res = await fetch(`${APIFY_BASE}/v2/datasets/${run.defaultDatasetId}/items?${qs}`);
        if (!res.ok) throw new Error(`Apify dataset ${res.status}`);
        const page = await res.json();
        items.push(...page);
        if (page.length < 1000) break;
      }
    }
    return { status: run.status, statusMessage: run.statusMessage, usd: Number(run.usageTotalUsd) || 0, items, runId: run.id };
  }

  // ── Gemini ──
  async function gemini(parts, cost) {
    const s = settings();
    const res = await fetch(`${GEMINI_BASE}/v1beta/models/${s.gemini_model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY || '' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.5 } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    const u = data.usageMetadata || {};
    const usd = ((u.promptTokenCount || 0) * s.gemini_price_in + ((u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0)) * s.gemini_price_out) / 1e6;
    if (cost) cost.gemini_usd = (cost.gemini_usd || 0) + usd;
    const text = (((data.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || '').join('') || '';
    try { return { json: JSON.parse(text.replace(/^```json\s*|```\s*$/g, '')), usd }; }
    catch (e) { throw new Error('Gemini вернул не JSON: ' + text.slice(0, 200)); }
  }
  async function geminiUpload(buf, mime) {
    const start = await fetch(`${GEMINI_BASE}/upload/v1beta/files`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': process.env.GEMINI_API_KEY || '', 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(buf.length), 'X-Goog-Upload-Header-Content-Type': mime, 'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: 'trend-' + Date.now() } }),
    });
    const url = start.headers.get('x-goog-upload-url');
    if (!start.ok || !url) throw new Error('Gemini upload start ' + start.status);
    const up = await fetch(url, { method: 'POST', headers: { 'Content-Length': String(buf.length), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: buf });
    const j = await up.json();
    if (!up.ok || !j.file) throw new Error('Gemini upload ' + up.status);
    let f = j.file;
    for (let i = 0; i < 40 && f.state && f.state !== 'ACTIVE'; i++) {
      if (f.state === 'FAILED') throw new Error('Gemini не смог обработать видео');
      await sleep(process.env.GEMINI_POLL_MS ? Number(process.env.GEMINI_POLL_MS) : 3000);
      f = await (await fetch(`${GEMINI_BASE}/v1beta/${f.name}`, { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY || '' } })).json();
    }
    if (f.state && f.state !== 'ACTIVE') throw new Error('Gemini: видео не готово');
    return f;
  }
  const geminiDelete = name => fetch(`${GEMINI_BASE}/v1beta/${name}`, { method: 'DELETE', headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY || '' } }).catch(() => {});

  // ── нормализация и оценка ──
  function fromTikTok(o) {
    if (!o || !o.id || !o.webVideoUrl) return null;
    return {
      id: 'tt:' + o.id, platform: 'tiktok', url: o.webVideoUrl,
      author: o.authorMeta?.name || '', followers: o.authorMeta?.fans ?? null,
      plays: o.playCount || 0, likes: o.diggCount || 0, shares: o.shareCount || 0, saves: o.collectCount || 0, comments: o.commentCount || 0,
      posted_at: o.createTimeISO || null, caption: (o.text || '').slice(0, 1000), cover: o.videoMeta?.coverUrl || null,
      duration: o.videoMeta?.duration || null, is_ad: !!(o.isAd || o.isSponsored), query: o.searchQuery || '', lang: o.textLanguage || '',
    };
  }
  function fromInstagram(o) {
    if (!o || o.error || !(o.shortCode || o.id) || !o.url) return null;
    const tag = decodeURIComponent(((o.inputUrl || '').split('/tags/')[1] || '').replace(/\/$/, ''));
    return {
      id: 'ig:' + (o.shortCode || o.id), platform: 'instagram', url: o.url,
      author: o.ownerUsername || '', followers: null,
      plays: o.videoPlayCount || o.igPlayCount || 0, likes: o.likesCount > 0 ? o.likesCount : 0, shares: o.sharesCount || 0, saves: 0, comments: o.commentsCount || 0,
      posted_at: o.timestamp || null, caption: (o.caption || '').slice(0, 1000), cover: o.displayUrl || null,
      duration: o.videoDuration || null, is_ad: !!o.paidPartnership, query: tag ? '#' + tag : '', lang: '', video_url: o.videoUrl || null,
    };
  }
  function score(v, s) {
    const ageDays = v.posted_at ? Math.max((Date.now() - Date.parse(v.posted_at)) / 864e5, 0.5) : 999;
    const perDay = v.plays / ageDays;
    const virality = v.followers != null ? v.plays / Math.max(v.followers, 1000) : null;
    const eng = (v.likes + v.shares + v.saves + v.comments) / Math.max(v.plays, 1);
    let category = 'weak';
    if (v.is_ad) category = 'ad';
    else if (ageDays > s.max_age_days) category = 'old';
    else if (v.plays >= s.min_plays_viral) category = 'viral';
    else if (ageDays <= s.rising_max_age_days && perDay >= s.rising_min_per_day) category = 'rising';
    const pop = Math.round(100 * (0.4 * clamp01(Math.log10(Math.max(v.plays, 1)) / 7)
      + 0.35 * clamp01(virality != null ? Math.log10(Math.max(virality, 1)) / 3 : 0.3)
      + 0.25 * clamp01(eng / 0.15)));
    return { age_days: Math.round(ageDays * 10) / 10, per_day: Math.round(perDay), virality: virality != null ? Math.round(virality * 10) / 10 : null, engagement: Math.round(eng * 1000) / 1000, category, pop };
  }

  function productListForAI(ids) {
    return products().filter(p => !ids || ids.includes(p.id)).map(p => {
      const c = pcfg(p.id);
      return { id: p.id, name: p.name, article: p.article, props: c.props || '', limit: c.on_limit ? (c.limit_note || 'на лимите') : '' };
    });
  }

  // ── генерация поисковых запросов под товар ──
  async function genQueries(productId, cost) {
    const p = products().find(x => x.id === productId);
    if (!p) throw new Error('Товар не найден');
    const c = pcfg(productId);
    const { json } = await gemini([{ text:
`Ты помогаешь бьюти-бренду MIXIT (Казахстан) искать вирусные ролики в TikTok под товар, чтобы потом адаптировать идеи для блогеров.
Товар: ${p.name}. Свойства: ${c.props || 'не указаны'}.
Придумай 6–8 коротких поисковых запросов, по которым в TikTok находятся популярные обучающие/лайфхак/до-после ролики с таким типом продукта
(не название бренда, а тип продукта и задача): 3 на русском, 3 на английском, 1–2 на корейском. Плюс 3 хэштега для Instagram без #.
Ответ строго JSON: {"queries":["..."],"ig_hashtags":["..."]}` }], cost);
    const queries = (json.queries || []).map(String).map(s => s.trim()).filter(Boolean).slice(0, 10);
    const ig = (json.ig_hashtags || []).map(s => String(s).replace(/^#/, '').trim()).filter(Boolean).slice(0, 5);
    return setPcfg(productId, { queries, ig_hashtags: ig });
  }

  // ── основной запуск ──
  let running = null;

  async function startRun(trigger, userName) {
    if (running) throw new Error('Сбор уже идёт');
    if (!keys().apify) throw new Error('Не задан APIFY_TOKEN в Render');
    const run = { id: uuidv4(), trigger, by: userName || null, started_at: now(), finished_at: null, status: 'running', step: 'start',
      counts: { queries: 0, apify_items: 0, unique: 0, new_candidates: 0, updated: 0, prescreened: 0, rejected: 0, full_analyzed: 0, full_failed: 0, tz_created: 0 },
      cost: { apify_usd: 0, gemini_usd: 0 }, errors: [], log: [], pending: [] };
    runs().push(run).write();
    // храним только последние 60 запусков
    const all = runs().value(); if (all.length > 60) db.set('trend_runs', all.slice(-60)).write();
    running = run.id;
    pipeline(run.id).catch(e => { saveRun(run.id, { status: 'error', step: 'error', finished_at: now(), errors: (getRun(run.id).errors || []).concat(e.message) }); })
      .finally(() => { running = null; });
    return run;
  }

  async function pipeline(runId) {
    const s = settings();
    const cost = { apify_usd: 0, gemini_usd: 0 };
    const counts = { ...getRun(runId).counts };
    const flush = (extra = {}) => saveRun(runId, { counts: { ...counts }, cost: { apify_usd: +cost.apify_usd.toFixed(4), gemini_usd: +cost.gemini_usd.toFixed(4) }, ...extra });

    // 1. запросы
    saveRun(runId, { step: 'queries' });
    const active = products().filter(p => pcfg(p.id).active);
    if (!active.length) throw new Error('Нет активных товаров (Тренды → Товары)');
    const qmap = {}; // запрос → [productId]
    for (const p of active) {
      let c = pcfg(p.id);
      if (!c.queries.length && keys().gemini) {
        try { c = await genQueries(p.id, cost); log(runId, `Запросы для «${p.name}» сгенерированы`); }
        catch (e) { log(runId, `Не удалось сгенерировать запросы для «${p.name}»: ${e.message}`); }
      }
      const qs = (c.queries.length ? c.queries : [p.name]).slice(0, s.max_queries_per_product);
      qs.forEach(q => { (qmap[q] = qmap[q] || []).includes(p.id) || qmap[q].push(p.id); });
    }
    // общий лимит сбора: урезаем число запросов по кругу между товарами
    let queries = Object.keys(qmap);
    const maxQueries = Math.max(1, Math.floor(s.max_total_results / Math.max(1, s.results_per_query)));
    if (queries.length > maxQueries) {
      const byProduct = active.map(p => queries.filter(q => qmap[q].includes(p.id)));
      const picked = [];
      for (let i = 0; picked.length < maxQueries && i < 50; i++) byProduct.forEach(list => { if (list[i] && !picked.includes(list[i]) && picked.length < maxQueries) picked.push(list[i]); });
      log(runId, `Лимит сбора: взято ${picked.length} запросов из ${queries.length}`);
      queries = picked;
    }
    counts.queries = queries.length; flush();

    // 2. сбор
    saveRun(runId, { step: 'collect' });
    const raw = [];
    const tt = await apifyRun(TT_ACTOR, {
      searchQueries: queries, searchSection: '/video', resultsPerPage: s.results_per_query,
      // пилот 27.10: страна прокси и фильтры по дате/лайкам ломают поиск — берём по умолчанию, свежесть отбираем сами
      proxyCountryCode: 'None', videoSearchSorting: 'MOST_RELEVANT', videoSearchDateFilter: 'ALL_TIME',
      shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadAvatars: false, shouldDownloadMusicCovers: false,
      shouldDownloadSlideshowImages: false, shouldDownloadSubtitles: false, scrapeRelatedSearchWords: false, scrapeRelatedVideos: false,
      scrapeAdditionalAuthorMeta: false, commentsPerPost: 0, aiVideoDescription: false, aiVideoSummary: false,
    }, s.max_apify_usd_per_run);
    cost.apify_usd += tt.usd;
    log(runId, `TikTok: ${tt.items.length} результатов, $${tt.usd.toFixed(3)} (${tt.status})`);
    if (!tt.items.length) saveRun(runId, { errors: (getRun(runId).errors || []).concat(`TikTok вернул 0 роликов: ${tt.statusMessage || tt.status}`) });
    tt.items.forEach(o => { const v = fromTikTok(o); if (v) raw.push(v); });

    if (s.instagram_enabled) {
      const tagMap = {};
      active.forEach(p => pcfg(p.id).ig_hashtags.forEach(h => { (tagMap[h] = tagMap[h] || []).push(p.id); }));
      const tags = Object.keys(tagMap).slice(0, 10);
      if (tags.length) {
        try {
          const ig = await apifyRun(IG_ACTOR, { hashtags: tags, keywordSearch: false, resultsLimit: s.results_per_query, resultsType: 'reels' }, Math.max(0.5, s.max_apify_usd_per_run - cost.apify_usd));
          cost.apify_usd += ig.usd;
          log(runId, `Instagram: ${ig.items.length} результатов, $${ig.usd.toFixed(3)}`);
          ig.items.forEach(o => { const v = fromInstagram(o); if (v) { raw.push(v); const t = v.query.replace('#', ''); if (tagMap[t]) qmap[v.query] = tagMap[t]; } });
        } catch (e) { log(runId, 'Instagram: ошибка ' + e.message); }
      }
    }
    counts.apify_items = raw.length; flush();

    // 3. дедупликация, история замеров, отбор
    saveRun(runId, { step: 'filter' });
    const seen = new Map();
    raw.forEach(v => {
      const prev = seen.get(v.id);
      if (prev) { const pids = new Set([...(prev.product_ids || []), ...(qmap[v.query] || [])]); prev.product_ids = [...pids]; }
      else seen.set(v.id, { ...v, product_ids: [...(qmap[v.query] || [])] });
    });
    counts.unique = seen.size;
    const ts = now();
    for (const v of seen.values()) {
      const sc = score(v, s);
      const existing = getVideo(v.id);
      if (existing) {
        const hist = (existing.history || []).concat({ at: ts, plays: v.plays, likes: v.likes }).slice(-30);
        const patch = { ...v, ...sc, history: hist, last_seen: ts, product_ids: [...new Set([...(existing.product_ids || []), ...v.product_ids])] };
        delete patch.status;
        if (existing.status === 'pool' && ['viral', 'rising'].includes(sc.category)) { patch.status = 'new'; patch.surfaced_at = ts; counts.new_candidates++; }
        saveVideo(v.id, patch); counts.updated++;
      } else {
        const eligible = ['viral', 'rising'].includes(sc.category);
        videos().push({ ...v, ...sc, status: eligible ? 'new' : 'pool', first_seen: ts, last_seen: ts, surfaced_at: eligible ? ts : null, run_id: runId,
          history: [{ at: ts, plays: v.plays, likes: v.likes }], analysis_status: 'none', analysis: null, analysis_error: null, tz: [], assigned: [] }).write();
        if (eligible) counts.new_candidates++;
      }
    }
    log(runId, `Уникальных: ${counts.unique}, новых кандидатов: ${counts.new_candidates}`);
    flush();

    // 4. предпроверка по подписи (дёшево, без видео)
    if (keys().gemini) {
      saveRun(runId, { step: 'prescreen' });
      const cands = videos().filter(v => v.status === 'new' && v.analysis_status === 'none').value()
        .sort((a, b) => b.pop - a.pop).slice(0, s.max_prescreen);
      const plist = productListForAI(active.map(p => p.id));
      for (let i = 0; i < cands.length; i += 40) {
        const batch = cands.slice(i, i + 40);
        try {
          const { json } = await gemini([{ text:
`Бренд MIXIT (Казахстан) ищет вирусные ролики, идеи которых можно адаптировать для блогеров под свои товары.
Товары: ${JSON.stringify(plist)}
Ролики (подпись, поисковый запрос): ${JSON.stringify(batch.map(v => ({ key: v.id, query: v.query, caption: v.caption.slice(0, 300) })))}
Для каждого ролика реши: подходит ли он как референс (обучение, лайфхак, до/после, ошибка-правильно, реакция, тест и т.п. с продуктом такого типа) под один из товаров.
Не подходит: реклама другого бренда без идеи, не про косметику, только музыка/мем без связи с продуктом.
Ответ строго JSON: {"items":[{"key":"...","relevant":true,"product_id":"id товара или null","idea":"одна строка: что в ролике и как адаптировать"}]}` }], cost);
          (json.items || []).forEach(it => {
            const v = batch.find(b => b.id === it.key); if (!v) return;
            counts.prescreened++;
            const pid = products().some(p => p.id === it.product_id) ? it.product_id : (v.product_ids[0] || null);
            if (it.relevant === false) { saveVideo(v.id, { status: 'rejected', analysis_status: 'pre', analysis: { summary: it.idea || '' }, analysis_error: 'Не подходит по подписи' }); counts.rejected++; }
            else saveVideo(v.id, { analysis_status: 'pre', product_id: pid, analysis: { summary: it.idea || '', pre_only: true } });
          });
        } catch (e) { log(runId, 'Предпроверка: ' + e.message); }
        flush();
      }
      log(runId, `Предпроверено: ${counts.prescreened}, отсеяно: ${counts.rejected}`);
    } else log(runId, 'GEMINI_API_KEY не задан — предпроверка и разбор пропущены');

    // 5. полный разбор видео с лимитом и квотами
    if (keys().gemini) {
      saveRun(runId, { step: 'analyze' });
      // не повторяем автоматически ролики, у которых видео уже не скачалось/не разобралось (только вручную кнопкой)
      const pool = videos().filter(v => v.status === 'new' && ['none', 'pre'].includes(v.analysis_status) && !v.analysis_error).value().sort((a, b) => b.pop - a.pop);
      const chosen = [];
      const prio = active.slice().sort((a, b) => (pcfg(b.id).priority ? 1 : 0) - (pcfg(a.id).priority ? 1 : 0));
      for (const p of prio) {
        pool.filter(v => (v.product_id || v.product_ids[0]) === p.id && !chosen.includes(v)).slice(0, s.min_per_product).forEach(v => chosen.length < s.max_full && chosen.push(v));
      }
      pool.forEach(v => { if (chosen.length < s.max_full && !chosen.includes(v)) chosen.push(v); });
      const rest = pool.filter(v => !chosen.includes(v)).map(v => v.id);
      await analyzeVideos(chosen.map(v => v.id), runId, cost, counts);
      flush();
      if (rest.length && s.on_limit === 'ask') {
        flush({ status: 'waiting_confirm', step: 'waiting_confirm', pending: rest.slice(0, 200), finished_at: now() });
        log(runId, `Лимит разборов (${s.max_full}) достигнут, ждут подтверждения: ${rest.length}`);
        return;
      }
      if (rest.length) log(runId, `Лимит разборов (${s.max_full}) достигнут, остальные ${rest.length} — с разбором по подписи`);
    }
    flush({ status: 'done', step: 'done', finished_at: now() });
  }

  // скачивание видео и разбор Gemini
  async function analyzeVideos(ids, runId, cost, counts) {
    if (!ids.length) return;
    const list = ids.map(getVideo).filter(Boolean);
    const media = {}; // id → url видеофайла
    const tts = list.filter(v => v.platform === 'tiktok');
    if (tts.length) {
      try {
        const dl = await apifyRun(TT_ACTOR, { postURLs: tts.map(v => v.url), resultsPerPage: 1, shouldDownloadVideos: true, shouldDownloadCovers: false,
          shouldDownloadAvatars: false, shouldDownloadMusicCovers: false, shouldDownloadSlideshowImages: false, shouldDownloadSubtitles: false, proxyCountryCode: 'None' }, 2);
        cost.apify_usd += dl.usd;
        if (runId) log(runId, `Скачивание видео: ${dl.items.length} из ${tts.length}, $${dl.usd.toFixed(3)}`);
        dl.items.forEach(o => { const u = (o.mediaUrls || [])[0]; if (u && o.id) media['tt:' + o.id] = u; });
      } catch (e) { if (runId) log(runId, 'Скачивание видео: ' + e.message); }
    }
    list.filter(v => v.platform === 'instagram' && v.video_url).forEach(v => { media[v.id] = v.video_url; });

    const plist = productListForAI();
    for (const v of list) {
      const url = media[v.id];
      if (!url) { saveVideo(v.id, { analysis_status: v.analysis_status === 'pre' ? 'pre' : 'failed', analysis_error: 'Видео не скачалось (удалено, закрыто или сборщик не отдал файл)' }); counts && counts.full_failed++; continue; }
      let file;
      try {
        const u = new URL(url);
        if (u.origin === new URL(APIFY_BASE).origin && process.env.APIFY_TOKEN) u.searchParams.set('token', process.env.APIFY_TOKEN);
        const res = await fetch(u.toString());
        if (!res.ok) throw new Error('файл ' + res.status);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 60 * 1024 * 1024) throw new Error('видео больше 60 МБ');
        file = await geminiUpload(buf, res.headers.get('content-type')?.startsWith('video/') ? res.headers.get('content-type') : 'video/mp4');
        const { json } = await gemini([
          { file_data: { mime_type: file.mimeType || 'video/mp4', file_uri: file.uri } },
          { text:
`Посмотри ролик. Бренд MIXIT (Казахстан) хочет адаптировать идею для своих блогеров.
Товары бренда: ${JSON.stringify(plist)}
Подпись ролика: ${v.caption.slice(0, 500)}
Опиши честно только то, что видно и слышно. Если речь на другом языке — переведи на русский.
Ответ строго JSON:
{"hook":"что происходит и что говорится в первые 2–3 секунды",
 "structure":["шаг 1","шаг 2","..."],
 "techniques":["❌/✅","по типу лица","до/после","без речи","реакция","тест","лайфхак","..."],
 "has_speech":true,
 "why_works":["гипотеза 1","гипотеза 2"],
 "fits":true,
 "product_id":"id подходящего товара или null",
 "summary":"одна строка для карточки",
 "adaptation":"2–3 предложения: как снять это с товаром MIXIT"}` }], cost);
        const pid = products().some(p => p.id === json.product_id) ? json.product_id : (v.product_id || v.product_ids[0] || null);
        saveVideo(v.id, { analysis_status: 'full', analysis: { ...json, pre_only: false }, analysis_error: null, product_id: pid, analyzed_at: now(),
          ...(json.fits === false ? { status: 'rejected', analysis_error: 'Не подходит по разбору видео' } : {}) });
        if (counts) { counts.full_analyzed++; if (json.fits === false) counts.rejected++; }
      } catch (e) {
        saveVideo(v.id, { analysis_status: v.analysis_status === 'pre' ? 'pre' : 'failed', analysis_error: 'Разбор не удался: ' + e.message });
        if (counts) counts.full_failed++;
      } finally { if (file && file.name) geminiDelete(file.name); }
    }
  }

  // ── ТЗ ──
  async function makeTz(video, productId, instruction, prev, cost) {
    const p = products().find(x => x.id === productId);
    if (!p) throw new Error('Выберите товар');
    const c = pcfg(productId);
    const a = video.analysis || {};
    const base = (attempt, feedback) => [{ text:
`Ты пишешь ТЗ для блогера бренда MIXIT (Казахстан) по мотивам вирусного ролика. Нужно адаптировать идею, а не копировать ролик.
ТОВАР: ${p.name} (артикул ${p.article}). Что раскрыть: ${c.props || 'не указано — не придумывай свойства, пиши общими словами'}.
${c.on_limit ? 'ВНИМАНИЕ по остаткам: ' + (c.limit_note || 'товар на лимите') + '. Учти это в ТЗ.' : ''}
${c.banned ? 'Запреты по товару: ' + c.banned : ''}
РЕФЕРЕНС: ${video.url}
Разбор референса: ${JSON.stringify({ hook: a.hook, structure: a.structure, techniques: a.techniques, summary: a.summary, adaptation: a.adaptation, caption: video.caption.slice(0, 400) })}
${prev ? 'ПРЕДЫДУЩАЯ ВЕРСИЯ ТЗ (правим её): ' + JSON.stringify(prev) : ''}
${instruction ? 'ПРАВКА ОТ МЕНЕДЖЕРА: ' + instruction : ''}
${feedback || ''}

${EXAMPLE_TZ}

ПРАВИЛА:
- Фразы в «Говорите» — живая разговорная речь, как девушка говорит подругам в сторис. Не реклама.
- Запрещены слова: бюджетный, дешёвый, недорогой, инновационный, идеальный, уникальная формула; нельзя упоминать и сравнивать с другими брендами (Chanel, Dior и т.п.).
- Не придумывай свойства товара сверх указанных.
- 5–7 шагов. Последний шаг — финал с товаром у лица и «артикул в комментариях».
- Казахская и русская версии — одно и то же ТЗ. Казахский — естественный разговорный, не дословный перевод.
- hook_title — заглавными, по образцу «ОБЯЗАТЕЛЬНО: ВИЗУАЛЬНЫЙ ХУК «...»».
Ответ строго JSON:
{"ru":{"subtitle":"Товар · формат","hook_title":"...","hook_sub":"...","format":"...","duration":"25–35 секунд","reveal":"что раскрыть","steps":[{"title":"...","kadr":"...","say":"...","head":"только для 1-го шага, иначе пусто"}]},
 "kz":{ те же поля на казахском }}` }];
    let { json } = await gemini(base(1), cost);
    let warnings = [];
    const text = JSON.stringify(json);
    const extraBan = (c.banned || '').split(/[,;]/).map(x => x.trim()).filter(x => x.length > 2);
    const bad = () => { const t = JSON.stringify(json); const m = t.match(BANNED_RE); const e = extraBan.find(w => t.toLowerCase().includes(w.toLowerCase())); return m ? m[0] : e; };
    let hit = bad();
    if (hit || !json.ru?.steps?.length || !json.kz?.steps?.length) {
      ({ json } = await gemini(base(2, `ПРОШЛЫЙ ОТВЕТ ОТКЛОНЁН: ${hit ? 'есть запрещённое слово «' + hit + '»' : 'нет шагов в одной из версий'}. Исправь. Прошлый ответ: ${text.slice(0, 3000)}`), cost));
      hit = bad();
    }
    if (hit) warnings.push(`В тексте осталось слово «${hit}» — проверьте перед отправкой`);
    if (!json.ru?.steps?.length || !json.kz?.steps?.length) throw new Error('ИИ не вернул сценарий, попробуйте ещё раз');
    return { data: json, warnings };
  }

  // ── расписание ──
  function localNow() { const d = new Date(Date.now() + TZ_OFFSET_H * 3600e3); return { day: d.getUTCDay(), hour: d.getUTCHours(), date: d.toISOString().slice(0, 10) }; }
  function nextRunAt() {
    const s = settings();
    for (let i = 0; i < 8; i++) {
      const d = new Date(Date.now() + TZ_OFFSET_H * 3600e3 + i * 864e5);
      if (s.schedule_days.includes(d.getUTCDay())) {
        const date = d.toISOString().slice(0, 10);
        if (i === 0 && (localNow().hour >= s.schedule_hour + CATCHUP_H || runs().value().some(r => r.trigger === 'schedule' && localDate(r.started_at) === date))) continue;
        return `${date} ${String(s.schedule_hour).padStart(2, '0')}:00`;
      }
    }
    return null;
  }
  const localDate = iso => new Date(Date.parse(iso) + TZ_OFFSET_H * 3600e3).toISOString().slice(0, 10);
  if (process.env.TRENDS_SCHEDULER !== 'off') {
    setInterval(() => {
      try {
        const s = settings(); const ln = localNow();
        // догоняем пропущенный запуск (сервер на Render мог спать) только в окне schedule_hour…+4 ч
        if (!s.schedule_days.includes(ln.day) || ln.hour < s.schedule_hour || ln.hour >= s.schedule_hour + CATCHUP_H || running || !keys().apify) return;
        if (runs().value().some(r => r.trigger === 'schedule' && localDate(r.started_at) === ln.date)) return;
        startRun('schedule').catch(e => console.error('Trends schedule:', e.message));
      } catch (e) { console.error('Trends schedule:', e.message); }
    }, 5 * 60 * 1000);
  }

  // ── API ──
  const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => { console.error('Trends API:', e.message); res.status(500).json({ error: e.message }); });

  app.get('/api/trends/status', auth, (req, res) => {
    const last = runs().value().slice(-1)[0] || null;
    res.json({ keys: keys(), running: !!running, running_id: running, last_run: last && { ...last, log: undefined }, next_run: nextRunAt(), settings: settings() });
  });

  app.get('/api/trends', auth, (req, res) => {
    const { status = 'active', product } = req.query;
    let list = videos().value();
    if (status === 'active') list = list.filter(v => ['new', 'tz', 'assigned'].includes(v.status));
    else if (status !== 'all') list = list.filter(v => v.status === status);
    if (product) list = list.filter(v => (v.product_id || (v.product_ids || [])[0]) === product || (v.product_ids || []).includes(product));
    list = list.slice().sort((a, b) => (b.surfaced_at || b.first_seen || '').localeCompare(a.surfaced_at || a.first_seen || '') || b.pop - a.pop).slice(0, 500);
    const counts = {};
    videos().value().forEach(v => { counts[v.status] = (counts[v.status] || 0) + 1; });
    res.json({ items: list.map(v => ({ ...v, history: (v.history || []).slice(-10) })), counts });
  });

  app.post('/api/trends/run', auth, wrap(async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Только для админа' });
    if (running) return res.status(409).json({ error: 'Сбор уже идёт' });
    const run = await startRun('manual', req.user.username);
    res.json({ id: run.id });
  }));

  app.get('/api/trends/runs', auth, (req, res) => res.json(runs().value().slice().reverse()));

  app.post('/api/trends/runs/:id/continue', auth, wrap(async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Только для админа' });
    const r = getRun(req.params.id);
    if (!r || r.status !== 'waiting_confirm') return res.status(400).json({ error: 'Запуск не ждёт подтверждения' });
    if (running) return res.status(409).json({ error: 'Идёт другой запуск' });
    const s = settings();
    const ids = (r.pending || []).filter(id => { const v = getVideo(id); return v && v.status === 'new' && ['none', 'pre'].includes(v.analysis_status) && !v.analysis_error; }).slice(0, s.max_full);
    const rest = (r.pending || []).filter(id => !ids.includes(id));
    saveRun(r.id, { status: 'running', step: 'analyze', pending: rest });
    running = r.id;
    res.json({ ok: true, analyzing: ids.length });
    const cost = { ...r.cost }; const counts = { ...r.counts };
    analyzeVideos(ids, r.id, cost, counts)
      .then(() => saveRun(r.id, { counts, cost: { apify_usd: +cost.apify_usd.toFixed(4), gemini_usd: +cost.gemini_usd.toFixed(4) },
        status: rest.length ? 'waiting_confirm' : 'done', step: rest.length ? 'waiting_confirm' : 'done', finished_at: now() }))
      .catch(e => saveRun(r.id, { status: 'error', errors: (r.errors || []).concat(e.message), finished_at: now() }))
      .finally(() => { running = null; });
  }));

  app.post('/api/trends/:id/skip', auth, (req, res) => {
    if (!canEdit(req)) return res.status(403).json({ error: 'Нет доступа' });
    const v = getVideo(req.params.id); if (!v) return res.status(404).json({ error: 'Не найдено' });
    saveVideo(v.id, { status: req.body?.restore ? 'new' : 'skipped', skipped_by: req.user.username, skipped_at: now() });
    res.json({ ok: true });
  });

  app.put('/api/trends/:id/product', auth, (req, res) => {
    if (!canEdit(req)) return res.status(403).json({ error: 'Нет доступа' });
    const v = getVideo(req.params.id); if (!v) return res.status(404).json({ error: 'Не найдено' });
    if (!products().some(p => p.id === req.body.product_id)) return res.status(400).json({ error: 'Товар не найден' });
    saveVideo(v.id, { product_id: req.body.product_id });
    res.json({ ok: true });
  });

  app.post('/api/trends/:id/analyze', auth, wrap(async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Только для админа' });
    if (!keys().gemini || !keys().apify) return res.status(400).json({ error: 'Нужны APIFY_TOKEN и GEMINI_API_KEY' });
    const v = getVideo(req.params.id); if (!v) return res.status(404).json({ error: 'Не найдено' });
    if (v.status === 'pool' || v.status === 'rejected') saveVideo(v.id, { status: 'new', surfaced_at: now() });
    const cost = { apify_usd: 0, gemini_usd: 0 };
    await analyzeVideos([v.id], null, cost, null);
    const after = getVideo(v.id);
    res.json({ ok: after.analysis_status === 'full', video: after, cost_usd: +(cost.apify_usd + cost.gemini_usd).toFixed(4) });
  }));

  app.post('/api/trends/:id/tz', auth, wrap(async (req, res) => {
    if (!canEdit(req)) return res.status(403).json({ error: 'Нет доступа' });
    if (!keys().gemini) return res.status(400).json({ error: 'Не задан GEMINI_API_KEY в Render' });
    const v = getVideo(req.params.id); if (!v) return res.status(404).json({ error: 'Не найдено' });
    const productId = req.body.product_id || v.product_id || (v.product_ids || [])[0];
    const prev = req.body.base_version ? (v.tz || []).find(t => t.v === Number(req.body.base_version)) : null;
    const cost = { apify_usd: 0, gemini_usd: 0 };
    const { data, warnings } = await makeTz(v, productId, (req.body.instruction || '').slice(0, 1000), prev && prev.data, cost);
    const version = { v: (v.tz || []).reduce((m, t) => Math.max(m, t.v), 0) + 1, created_at: now(), by: req.user.username, product_id: productId,
      instruction: req.body.instruction || '', base_version: prev ? prev.v : null, data, warnings, cost_usd: +cost.gemini_usd.toFixed(4) };
    saveVideo(v.id, { tz: (v.tz || []).concat(version), status: v.status === 'assigned' ? 'assigned' : 'tz' });
    const last = runs().value().slice(-1)[0]; if (last) saveRun(last.id, { counts: { ...last.counts, tz_created: (last.counts.tz_created || 0) + 1 } });
    res.json(version);
  }));

  app.get('/api/trends/:id/tz/:v/docx', auth, wrap(async (req, res) => {
    const v = getVideo(req.params.id); if (!v) return res.status(404).json({ error: 'Не найдено' });
    const t = (v.tz || []).find(x => x.v === Number(req.params.v)); if (!t) return res.status(404).json({ error: 'Нет такой версии' });
    const buf = await buildTzDocx(t.data, v.url);
    const name = `TZ_${(productName(t.product_id) || 'MIXIT').replace(/[^\wа-яё]+/gi, '_')}_v${t.v}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.send(buf);
  }));

  app.post('/api/trends/:id/assign', auth, (req, res) => {
    if (!canEdit(req)) return res.status(403).json({ error: 'Нет доступа' });
    const v = getVideo(req.params.id); if (!v) return res.status(404).json({ error: 'Не найдено' });
    const b = (db.get('bloggers').value() || []).find(x => x.id === req.body.blogger_id);
    if (!b) return res.status(400).json({ error: 'Блогер не найден' });
    const tzv = Number(req.body.v) || ((v.tz || []).slice(-1)[0] || {}).v || null;
    const assigned = (v.assigned || []).filter(a => a.blogger_id !== b.id).concat({ blogger_id: b.id, blogger_name: b.name, tz_v: tzv, by: req.user.username, at: now() });
    saveVideo(v.id, { assigned, status: 'assigned' });
    res.json({ ok: true, assigned });
  });

  app.delete('/api/trends/:id/assign/:bloggerId', auth, (req, res) => {
    if (!canEdit(req)) return res.status(403).json({ error: 'Нет доступа' });
    const v = getVideo(req.params.id); if (!v) return res.status(404).json({ error: 'Не найдено' });
    const assigned = (v.assigned || []).filter(a => a.blogger_id !== req.params.bloggerId);
    saveVideo(v.id, { assigned, status: assigned.length ? 'assigned' : ((v.tz || []).length ? 'tz' : 'new') });
    res.json({ ok: true });
  });

  app.get('/api/trends/bloggers', auth, (req, res) => {
    const q = String(req.query.q || '').toLowerCase().replace(/^@/, '');
    const list = (db.get('bloggers').value() || []).filter(b => !q || (b.name || '').toLowerCase().includes(q) || (b.instagram_url || '').toLowerCase().includes(q) || (b.tiktok_url || '').toLowerCase().includes(q));
    res.json(list.slice(0, 20).map(b => ({ id: b.id, name: b.name, status: b.status })));
  });

  app.get('/api/trends/products', auth, (req, res) => {
    res.json(products().map(p => ({ id: p.id, name: p.name, article: p.article, cfg: pcfg(p.id),
      counts: { active: videos().filter(v => ['new', 'tz', 'assigned'].includes(v.status) && (v.product_id || (v.product_ids || [])[0]) === p.id).size().value() } })));
  });

  app.put('/api/trends/products/:id', auth, (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Только для админа' });
    if (!products().some(p => p.id === req.params.id)) return res.status(404).json({ error: 'Товар не найден' });
    const b = req.body || {};
    const patch = {};
    ['active', 'on_limit', 'priority'].forEach(k => { if (k in b) patch[k] = !!b[k]; });
    ['limit_note', 'props', 'banned'].forEach(k => { if (k in b) patch[k] = String(b[k] || '').slice(0, 1000); });
    if ('queries' in b) patch.queries = (Array.isArray(b.queries) ? b.queries : String(b.queries).split('\n')).map(s => String(s).trim()).filter(Boolean).slice(0, 15);
    if ('ig_hashtags' in b) patch.ig_hashtags = (Array.isArray(b.ig_hashtags) ? b.ig_hashtags : String(b.ig_hashtags).split(/[\n,]/)).map(s => String(s).replace(/^#/, '').trim()).filter(Boolean).slice(0, 10);
    res.json(setPcfg(req.params.id, patch));
  });

  app.post('/api/trends/products/:id/gen-queries', auth, wrap(async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Только для админа' });
    if (!keys().gemini) return res.status(400).json({ error: 'Не задан GEMINI_API_KEY в Render' });
    res.json(await genQueries(req.params.id, { gemini_usd: 0 }));
  }));

  app.put('/api/trends/settings', auth, (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Только для админа' });
    const b = req.body || {}; const cur = settings(); const out = {};
    Object.keys(DEFAULT_SETTINGS).forEach(k => {
      if (!(k in b)) return;
      const d = DEFAULT_SETTINGS[k];
      if (Array.isArray(d)) out[k] = (Array.isArray(b[k]) ? b[k] : String(b[k]).split(',')).map(Number).filter(n => n >= 0 && n <= 6);
      else if (typeof d === 'number') { const n = Number(b[k]); if (Number.isFinite(n) && n >= 0) out[k] = n; }
      else if (typeof d === 'boolean') out[k] = !!b[k];
      else out[k] = String(b[k]).trim() || d;
    });
    if (out.on_limit && !['stop', 'ask'].includes(out.on_limit)) delete out.on_limit;
    db.set('trend_settings', { ...cur, ...out }).write();
    res.json(settings());
  });

  console.log('Trends module ready', keys());
  return { startRun, settings, _test: { score, fromTikTok, fromInstagram, makeTz } };
};
