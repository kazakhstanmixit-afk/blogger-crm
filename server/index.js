const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'blogger-crm-secret-key-2024';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db.json');
const adapter = new FileSync(DB_PATH);
const db = low(adapter);
db.defaults({ users: [], bloggers: [], activity: [], batches: [] }).write();

if (!db.get('users').find({ username: 'admin' }).value()) {
  db.get('users').push({ id: uuidv4(), username: 'admin', password: bcrypt.hashSync('admin123', 10), role: 'admin', created_at: new Date().toISOString() }).write();
  console.log('Default admin: admin / admin123');
}

// migration
const needsMigration = db.get('bloggers').find(b => b.price_instagram !== undefined || b.cpv_reels === undefined).value();
if (needsMigration) {
  db.get('bloggers').each(b => {
    if (b.price_instagram !== undefined) { b.price_reels = b.price_instagram; delete b.price_instagram; }
    if (b.cpv_instagram !== undefined) { b.cpv_reels = b.cpv_instagram; delete b.cpv_instagram; }
    if (b.price_stories === undefined) b.price_stories = null;
    if (b.cpv_stories === undefined) b.cpv_stories = null;
    if (b.decline_reason === undefined) b.decline_reason = null;
    if (b.last_comment === undefined) b.last_comment = null;
    const ir = b.instagram_avg_reach || 0;
    const tr = b.tiktok_avg_reach || 0;
    if (b.price_reels && ir) b.cpv_reels = parseFloat((b.price_reels / ir).toFixed(2));
    if (b.price_tiktok && tr) b.cpv_tiktok = parseFloat((b.price_tiktok / tr).toFixed(2));
    if (b.price_both && (ir+tr)) b.cpv_both = parseFloat((b.price_both / (ir+tr)).toFixed(2));
    if (b.price_stories && ir) b.cpv_stories = parseFloat((b.price_stories / ir).toFixed(2));
  }).write();
  console.log('Migration done');
}

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

function cpv(price, reach) {
  if (!price || !reach || reach === 0) return null;
  return parseFloat((price / reach).toFixed(2));
}

function logActivity(blogger_id, user_id, action, details) {
  db.get('activity').push({ id: uuidv4(), blogger_id, user_id, action, details, created_at: new Date().toISOString() }).write();
}

function makeBlogger(d) {
  const ir = Number(d.instagram_avg_reach) || 0;
  const tr = Number(d.tiktok_avg_reach) || 0;
  return {
    name: d.name || '',
    instagram_url: d.instagram_url || null,
    tiktok_url: d.tiktok_url || null,
    instagram_followers: Number(d.instagram_followers) || 0,
    tiktok_followers: Number(d.tiktok_followers) || 0,
    instagram_avg_reach: ir,
    tiktok_avg_reach: tr,
    price_reels: d.price_reels ? Number(d.price_reels) : null,
    price_tiktok: d.price_tiktok ? Number(d.price_tiktok) : null,
    price_both: d.price_both ? Number(d.price_both) : null,
    price_stories: d.price_stories ? Number(d.price_stories) : null,
    cpv_reels: cpv(d.price_reels, ir),
    cpv_tiktok: cpv(d.price_tiktok, tr),
    cpv_both: cpv(d.price_both, ir + tr),
    cpv_stories: cpv(d.price_stories, ir),
    status: d.status || 'new',
    decline_reason: d.decline_reason || null,
    assigned_manager_id: d.assigned_manager_id || null,
    in_work: !!(d.in_work === true || d.in_work === 'true' || d.in_work === 1 || d.status === 'in_work'),
    notes: d.notes || null,
    last_comment: d.last_comment || null,
    contacted_at: d.contacted_at || null,
    price_updated_at: d.price_updated_at || null,
  };
}

// AUTH
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.get('users').find({ username }).value();
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

// USERS
app.get('/api/users', auth, (req, res) => {
  res.json(db.get('users').map(u => ({ id: u.id, username: u.username, role: u.role })).value());
});
app.post('/api/users', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только для админа' });
  const { username, password, role } = req.body;
  if (db.get('users').find({ username }).value()) return res.status(400).json({ error: 'Пользователь уже существует' });
  const user = { id: uuidv4(), username, password: bcrypt.hashSync(password, 10), role: role || 'manager', created_at: new Date().toISOString() };
  db.get('users').push(user).write();
  res.json({ id: user.id, username, role });
});
app.delete('/api/users/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только для админа' });
  db.get('users').remove({ id: req.params.id }).write();
  res.json({ ok: true });
});

// BLOGGERS
app.get('/api/bloggers', auth, (req, res) => {
  const { search, status, manager, in_work, sort, platform, cpv_max, reach_min, followers_min, followers_max, batch_id, exclude_declined, exclude_in_work } = req.query;
  const users = db.get('users').value();
  let list = db.get('bloggers').value();

  if (search) { const s = search.toLowerCase(); list = list.filter(b => (b.name||'').toLowerCase().includes(s) || (b.instagram_url||'').toLowerCase().includes(s) || (b.tiktok_url||'').toLowerCase().includes(s)); }
  if (status) list = list.filter(b => b.status === status);
  if (manager) list = list.filter(b => b.assigned_manager_id === manager);
  if (in_work === '1') list = list.filter(b => b.in_work === true);
  if (batch_id) list = list.filter(b => b.batch_id === batch_id);
  if (platform === 'instagram') list = list.filter(b => b.instagram_url);
  if (platform === 'tiktok') list = list.filter(b => b.tiktok_url);
  if (platform === 'both') list = list.filter(b => b.instagram_url && b.tiktok_url);
  if (cpv_max) { const m = parseFloat(cpv_max); list = list.filter(b => { const best = Math.min(b.cpv_reels||9999,b.cpv_tiktok||9999,b.cpv_both||9999); return best <= m; }); }
  if (reach_min) { const m = parseInt(reach_min); list = list.filter(b => (b.instagram_avg_reach||0) >= m || (b.tiktok_avg_reach||0) >= m); }
  if (followers_min) { const m = parseInt(followers_min); list = list.filter(b => (b.instagram_followers||0) >= m || (b.tiktok_followers||0) >= m); }
  if (followers_max) { const m = parseInt(followers_max); list = list.filter(b => (b.instagram_followers||0) <= m || (b.tiktok_followers||0) <= m); }
  if (exclude_declined === '1') list = list.filter(b => b.status !== 'declined');
  if (exclude_in_work === '1') list = list.filter(b => !b.in_work);

  if (sort === 'cpv_asc') list = list.sort((a,b) => Math.min(a.cpv_reels||9999,a.cpv_tiktok||9999,a.cpv_both||9999) - Math.min(b.cpv_reels||9999,b.cpv_tiktok||9999,b.cpv_both||9999));
  else if (sort === 'cpv_desc') list = list.sort((a,b) => Math.min(b.cpv_reels||0,b.cpv_tiktok||0,b.cpv_both||0) - Math.min(a.cpv_reels||0,a.cpv_tiktok||0,a.cpv_both||0));
  else if (sort === 'created_desc') list = list.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  else {
    list = list.sort((a,b) => {
      const ap = !!a.price_updated_at, bp = !!b.price_updated_at;
      if (ap && !bp) return -1; if (!ap && bp) return 1;
      if (ap && bp) return new Date(b.price_updated_at) - new Date(a.price_updated_at);
      return new Date(b.created_at||0) - new Date(a.created_at||0);
    });
  }
  const total = list.length;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;
  const paged = list.slice(offset, offset + limit);
  res.json({ data: paged.map(b => ({ ...b, manager_name: (users.find(u => u.id === b.assigned_manager_id)||{}).username || null })), total, page, limit, pages: Math.ceil(total / limit) });
});

// check duplicate
app.post('/api/bloggers/check-duplicate', auth, (req, res) => {
  const { instagram_url, tiktok_url } = req.body;
  const users = db.get('users').value();
  let found = null;
  if (instagram_url) found = db.get('bloggers').find(b => b.instagram_url === instagram_url).value();
  if (!found && tiktok_url) found = db.get('bloggers').find(b => b.tiktok_url === tiktok_url).value();
  if (found) {
    const mgr = users.find(u => u.id === found.assigned_manager_id);
    return res.json({ duplicate: true, id: found.id, name: found.name, manager: mgr?.username || null });
  }
  res.json({ duplicate: false });
});

app.post('/api/bloggers', auth, (req, res) => {
  const now = new Date().toISOString();
  const blogger = { id: uuidv4(), batch_id: null, created_at: now, updated_at: now, ...makeBlogger(req.body) };
  db.get('bloggers').push(blogger).write();
  logActivity(blogger.id, req.user.id, 'created', 'Блогер добавлен');
  res.json({ id: blogger.id });
});

app.put('/api/bloggers/:id', auth, (req, res) => {
  const d = req.body;
  const existing = db.get('bloggers').find({ id: req.params.id }).value();
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const priceChanged = d.price_reels !== existing.price_reels || d.price_tiktok !== existing.price_tiktok || d.price_both !== existing.price_both || d.price_stories !== existing.price_stories;
  const statusChanged = d.status !== existing.status;
  const contactedAt = (statusChanged && (d.status === 'contacted' || d.status === 'declined') && !existing.contacted_at) ? new Date().toISOString() : existing.contacted_at;
  db.get('bloggers').find({ id: req.params.id }).assign({
    ...makeBlogger(d),
    contacted_at: contactedAt,
    price_updated_at: priceChanged ? new Date().toISOString() : existing.price_updated_at,
    updated_at: new Date().toISOString(),
  }).write();
  if (priceChanged) logActivity(req.params.id, req.user.id, 'price_updated', 'Расценки обновлены');
  if (statusChanged) logActivity(req.params.id, req.user.id, 'status_changed', `Статус → ${d.status}`);
  res.json({ ok: true });
});

// patch single field
app.patch('/api/bloggers/:id', auth, (req, res) => {
  const existing = db.get('bloggers').find({ id: req.params.id }).value();
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const updates = { ...req.body, updated_at: new Date().toISOString() };
  // recalc cpv if price or reach changed
  const ir = Number(updates.instagram_avg_reach ?? existing.instagram_avg_reach) || 0;
  const tr = Number(updates.tiktok_avg_reach ?? existing.tiktok_avg_reach) || 0;
  const pr = Number(updates.price_reels ?? existing.price_reels) || null;
  const pt = Number(updates.price_tiktok ?? existing.price_tiktok) || null;
  const pb = Number(updates.price_both ?? existing.price_both) || null;
  const ps = Number(updates.price_stories ?? existing.price_stories) || null;
  if (pr !== undefined) updates.cpv_reels = cpv(pr, ir);
  if (pt !== undefined) updates.cpv_tiktok = cpv(pt, tr);
  if (pb !== undefined) updates.cpv_both = cpv(pb, ir+tr);
  if (ps !== undefined) updates.cpv_stories = cpv(ps, ir);
  if (updates.status && updates.status !== existing.status) {
    if (updates.status === 'contacted' || updates.status === 'declined') {
      if (!existing.contacted_at) updates.contacted_at = new Date().toISOString();
    }
    if (updates.status === 'in_work') updates.in_work = true;
    logActivity(req.params.id, req.user.id, 'status_changed', `Статус → ${updates.status}`);
  }
  db.get('bloggers').find({ id: req.params.id }).assign(updates).write();
  const updated = db.get('bloggers').find({ id: req.params.id }).value();
  const users = db.get('users').value();
  res.json({ ...updated, manager_name: (users.find(u => u.id === updated.assigned_manager_id)||{}).username || null });
});
app.post('/api/bloggers/distribute', auth, (req, res) => {
  const { blogger_ids, manager_ids } = req.body;
  if (!blogger_ids?.length || !manager_ids?.length) return res.status(400).json({ error: 'Нужны блогеры и менеджеры' });
  blogger_ids.forEach((bid, i) => {
    const mgr = manager_ids[i % manager_ids.length];
    db.get('bloggers').find({ id: bid }).assign({ assigned_manager_id: mgr, in_work: true, status: 'in_work', updated_at: new Date().toISOString() }).write();
  });
  res.json({ ok: true, distributed: blogger_ids.length });
});
app.delete('/api/bloggers/all', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только для админа' });
  db.set('bloggers', []).write();
  db.set('batches', []).write();
  db.set('activity', []).write();
  res.json({ ok: true });
});

app.delete('/api/bloggers/:id', auth, (req, res) => {
  db.get('bloggers').remove({ id: req.params.id }).write();
  res.json({ ok: true });
});

// IMPORT with update by ID
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/bloggers/import', auth, upload.single('file'), (req, res) => {
  try {
    let rows = [];
    const filename = req.file.originalname.toLowerCase();
    if (filename.endsWith('.csv')) {
      rows = parse(req.file.buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true });
    } else {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    }

    const aliases = {
      name: ['ник','name','имя','блогер','никнейм'],
      instagram_url: ['ссылкаinstagram','ссылкаинстаграм','instagram_url','инстаграм','instagram'],
      tiktok_url: ['ссылкаtiktok','ссылкатикток','tiktok_url','тикток','tiktok'],
      instagram_followers: ['подп.инст','подписчикиинстаграм','подписчикиинст','instagram_followers'],
      tiktok_followers: ['подп.тт','подписчикитикток','подписчикитт','tiktok_followers'],
      instagram_avg_reach: ['охватинст','среднийохватинстаграм','среднеохватыинстаграм','instagram_avg_reach'],
      tiktok_avg_reach: ['охватти','среднийохваттикток','tiktok_avg_reach'],
      price_reels: ['ценарилс(₸)','стоимостьрилс','price_reels'],
      price_tiktok: ['ценатт(₸)','стоимостьтт','price_tiktok'],
      price_both: ['ценарилс+тт(₸)','стоимостьрилс+тт','price_both'],
      price_stories: ['ценасторис(₸)','стоимостьсторис','price_stories'],
      status: ['статус','status'],
      last_comment: ['последнийкомментарий','комментарий','last_comment'],
    };

    function findCol(row, keys) {
      const rowKeys = Object.keys(row);
      const norm = k => k.toLowerCase().replace(/[\s_\-\.+\(\)₸]+/g,'');
      for (const alias of keys) {
        const a = norm(alias);
        const found = rowKeys.find(k => norm(k) === a || norm(k).includes(a) || a.includes(norm(k)));
        if (found) return found;
      }
      return null;
    }

    const STATUS_MAP = { 'новый':'new','написали':'contacted','ответили':'replied','вработе':'in_work','in_work':'in_work','отказ':'declined','new':'new','contacted':'contacted','replied':'replied','declined':'declined' };

    const batchId = uuidv4();
    const batchDate = new Date().toISOString();
    const parseNum = v => { const n = parseInt(String(v||'').replace(/[^\d]/g,'')); return isNaN(n) ? 0 : n; };
    const parsePrice = v => { const n = parseFloat(String(v||'').replace(/[^\d.]/g,'')); return isNaN(n) ? null : n; };
    let updated = 0, added = 0;

    for (const row of rows) {
      const rawId = row['ID'] || row['id'] || '';
      const existingId = String(rawId).trim();
      const existing = existingId ? db.get('bloggers').find({ id: existingId }).value() : null;

      const nameKey = findCol(row, aliases.name);
      const name = nameKey ? String(row[nameKey]).trim() : String(Object.values(row)[0]||'').trim();
      if (!name || name === 'undefined') continue;

      const ir = parseNum(row[findCol(row, aliases.instagram_avg_reach)]) || (existing?.instagram_avg_reach||0);
      const tr = parseNum(row[findCol(row, aliases.tiktok_avg_reach)]) || (existing?.tiktok_avg_reach||0);
      const pReels = parsePrice(row[findCol(row, aliases.price_reels)]);
      const pTT = parsePrice(row[findCol(row, aliases.price_tiktok)]);
      const pBoth = parsePrice(row[findCol(row, aliases.price_both)]);
      const pStories = parsePrice(row[findCol(row, aliases.price_stories)]);

      const rawStatus = String(row[findCol(row, aliases.status)]||'').trim().toLowerCase().replace(/\s+/g,'');
      const status = STATUS_MAP[rawStatus] || null;

      const data = {
        name,
        instagram_url: row[findCol(row, aliases.instagram_url)] || existing?.instagram_url || null,
        tiktok_url: row[findCol(row, aliases.tiktok_url)] || existing?.tiktok_url || null,
        instagram_followers: parseNum(row[findCol(row, aliases.instagram_followers)]) || existing?.instagram_followers || 0,
        tiktok_followers: parseNum(row[findCol(row, aliases.tiktok_followers)]) || existing?.tiktok_followers || 0,
        instagram_avg_reach: ir,
        tiktok_avg_reach: tr,
        price_reels: pReels !== null ? pReels : existing?.price_reels || null,
        price_tiktok: pTT !== null ? pTT : existing?.price_tiktok || null,
        price_both: pBoth !== null ? pBoth : existing?.price_both || null,
        price_stories: pStories !== null ? pStories : existing?.price_stories || null,
        cpv_reels: cpv(pReels ?? existing?.price_reels, ir),
        cpv_tiktok: cpv(pTT ?? existing?.price_tiktok, tr),
        cpv_both: cpv(pBoth ?? existing?.price_both, ir+tr),
        cpv_stories: cpv(pStories ?? existing?.price_stories, ir),
        last_comment: row[findCol(row, aliases.last_comment)] || existing?.last_comment || null,
        updated_at: batchDate,
      };

      if (status) {
        data.status = status;
        data.in_work = status === 'in_work';
        if ((status === 'contacted' || status === 'declined') && !existing?.contacted_at) {
          data.contacted_at = batchDate;
        }
      }

      if (existing) {
        db.get('bloggers').find({ id: existingId }).assign(data).write();
        updated++;
      } else {
        db.get('bloggers').push({
          id: uuidv4(), batch_id: batchId, created_at: batchDate,
          status: status || 'new', in_work: status === 'in_work',
          decline_reason: null, assigned_manager_id: null,
          notes: null, contacted_at: null, price_updated_at: null,
          ...data,
        }).write();
        added++;
      }
    }

    if (added > 0) db.get('batches').push({ id: batchId, count: added, created_at: batchDate, imported_by: req.user.username }).write();
    res.json({ updated, added, total: updated + added });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка импорта: ' + e.message });
  }
});

// TEMPLATE
app.get('/api/template', auth, (req, res) => {
  const headers = ['ID','Ник','Ссылка Instagram','Подп. Инст','Охват Инст','Ссылка TikTok','Подп. ТТ','Охват ТТ','Цена Рилс (₸)','Цена ТТ (₸)','Цена Рилс+ТТ (₸)','Цена Сторис (₸)','Статус','Последний комментарий'];
  const example = ['','@blogger_name','https://instagram.com/blogger_name',62700,28700,'https://tiktok.com/@blogger_name',15000,23900,'','','','','new',''];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 18) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Шаблон');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="blogger_template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// EXPORT with filters
app.get('/api/export', auth, (req, res) => {
  const users = db.get('users').value();
  const { status, manager, platform, batch_id, cpv_max, reach_min, in_work } = req.query;
  let filtered = db.get('bloggers').value();
  if (status) filtered = filtered.filter(b => b.status === status);
  if (manager) filtered = filtered.filter(b => b.assigned_manager_id === manager);
  if (platform === 'instagram') filtered = filtered.filter(b => b.instagram_url);
  if (platform === 'tiktok') filtered = filtered.filter(b => b.tiktok_url);
  if (platform === 'both') filtered = filtered.filter(b => b.instagram_url && b.tiktok_url);
  if (batch_id) filtered = filtered.filter(b => b.batch_id === batch_id);
  if (in_work === '1') filtered = filtered.filter(b => b.in_work === true);
  if (cpv_max) { const m = parseFloat(cpv_max); filtered = filtered.filter(b => Math.min(b.cpv_reels||9999,b.cpv_tiktok||9999,b.cpv_both||9999) <= m); }
  if (reach_min) { const m = parseInt(reach_min); filtered = filtered.filter(b => (b.instagram_avg_reach||0) >= m || (b.tiktok_avg_reach||0) >= m); }

  const rows = filtered.map(b => {
    const mgr = users.find(u => u.id === b.assigned_manager_id);
    return {
      'ID': b.id,
      'Ник': b.name,
      'Ссылка Instagram': b.instagram_url||'',
      'Подп. Инст': b.instagram_followers||'',
      'Охват Инст': b.instagram_avg_reach||'',
      'Ссылка TikTok': b.tiktok_url||'',
      'Подп. ТТ': b.tiktok_followers||'',
      'Охват ТТ': b.tiktok_avg_reach||'',
      'Цена Рилс (₸)': b.price_reels||'',
      'CPV Рилс': b.cpv_reels||'',
      'Цена ТТ (₸)': b.price_tiktok||'',
      'CPV ТТ': b.cpv_tiktok||'',
      'Цена Рилс+ТТ (₸)': b.price_both||'',
      'CPV Рилс+ТТ': b.cpv_both||'',
      'Цена Сторис (₸)': b.price_stories||'',
      'CPV Сторис': b.cpv_stories||'',
      'Статус': b.status||'',
      'Причина отказа': b.decline_reason||'',
      'Менеджер': mgr?.username||'',
      'Дата добавления': b.created_at ? new Date(b.created_at).toLocaleDateString('ru') : '',
      'Последний комментарий': b.last_comment||'',
      'Заметки': b.notes||'',
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{'ID':'','Ник':''}]);
  ws['!cols'] = Array(22).fill({ wch: 20 });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Блогеры');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="bloggers_export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// BATCHES
app.get('/api/batches', auth, (req, res) => {
  res.json(db.get('batches').value().sort((a,b) => new Date(b.created_at) - new Date(a.created_at)));
});

// STATS
app.get('/api/stats', auth, (req, res) => {
  const bloggers = db.get('bloggers').value();
  const users = db.get('users').value();
  const waiting = bloggers.filter(b => b.status==='contacted' && b.contacted_at && (Date.now()-new Date(b.contacted_at))>3*24*60*60*1000).length;
  const by_status = {};
  bloggers.forEach(b => { by_status[b.status]=(by_status[b.status]||0)+1; });
  const by_manager = users.map(u => ({
    username: u.username,
    in_work: bloggers.filter(b => b.assigned_manager_id === u.id && b.in_work).length,
    total: bloggers.filter(b => b.assigned_manager_id === u.id).length,
  })).filter(u => u.total > 0);
  const best_cpv = bloggers.filter(b => b.cpv_reels||b.cpv_tiktok||b.cpv_both)
    .map(b => ({...b, best_cpv: Math.min(b.cpv_reels||9999,b.cpv_tiktok||9999,b.cpv_both||9999)}))
    .sort((a,b)=>a.best_cpv-b.best_cpv).slice(0,10);
  res.json({ total: bloggers.length, in_work: bloggers.filter(b=>b.in_work===true).length,
    with_price: bloggers.filter(b=>b.price_reels||b.price_tiktok||b.price_both).length,
    waiting, by_status: Object.entries(by_status).map(([status,c])=>({status,c})), best_cpv, by_manager });
});

app.get('/api/bloggers/:id/activity', auth, (req, res) => {
  const users = db.get('users').value();
  const logs = db.get('activity').filter({ blogger_id: req.params.id }).value()
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,50)
    .map(a=>({...a,username:(users.find(u=>u.id===a.user_id)||{}).username}));
  res.json(logs);
});

if (process.env.NODE_ENV === 'production') {
  app.get('*', (req,res) => res.sendFile(path.join(__dirname,'../client/build/index.html')));
}
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
