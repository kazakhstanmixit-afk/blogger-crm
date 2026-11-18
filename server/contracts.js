'use strict';
// Договор на рекламные услуги и счёт на оплату из реквизитов ИП блогера (18.11.2026).
// Шаблон договора (Word с полями {{…}}) загружает админ в CRM — хранится на диске рядом с базой.
// Реквизиты MIXIT (Заказчик) — только в CONTRACT_CUSTOMER_JSON: репозиторий публичный, в код их не кладём.
const fs = require('fs'), path = require('path');
const { unzipSync, zipSync, strToU8, strFromU8 } = require('fflate');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = require('docx');

const TEMPLATE = path.join(path.dirname(process.env.DB_PATH || path.join(__dirname, 'db.json')), 'contract-template.docx');
const REQUIRED_TOKENS = ['{{ИП}}', '{{ИИН}}', '{{СУММА}}', '{{КОЛВО}}', '{{НОМЕР}}'];
const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

// Сумма прописью (тенге), до 999 999 999.
function numberWords(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (!n) return 'ноль';
  const ones = [['','один','два','три','четыре','пять','шесть','семь','восемь','девять'], ['','одна','две','три','четыре','пять','шесть','семь','восемь','девять']];
  const teens = ['десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'];
  const tens = ['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];
  const hundreds = ['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];
  const plural = (x, f) => { const a = x % 100, b = x % 10; return a > 10 && a < 20 ? f[2] : b === 1 ? f[0] : b >= 2 && b <= 4 ? f[1] : f[2]; };
  const triad = (x, fem) => { const out = []; out.push(hundreds[Math.floor(x / 100)]); const t = x % 100;
    if (t >= 10 && t < 20) out.push(teens[t - 10]); else { out.push(tens[Math.floor(t / 10)]); out.push(ones[fem ? 1 : 0][t % 10]); }
    return out.filter(Boolean).join(' '); };
  const parts = []; const mln = Math.floor(n / 1e6), th = Math.floor(n / 1e3) % 1000, rest = n % 1000;
  if (mln) parts.push(triad(mln, false) + ' ' + plural(mln, ['миллион','миллиона','миллионов']));
  if (th) parts.push(triad(th, true) + ' ' + plural(th, ['тысяча','тысячи','тысяч']));
  if (rest) parts.push(triad(rest, false));
  return parts.join(' ');
}
const COUNT_WORDS = ['ноль','один','два','три','четыре','пять','шесть','семь','восемь','девять','десять'];
const money = n => Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/\u00a0|\u202f/g, ' ');
const xml = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function dateWords(ymd) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); if (!m) return ''; return `«${m[3]}» ${MONTHS[+m[2] - 1]} ${m[1]}г.`; }
function dateDots(ymd) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; }

const BLOGGER_FIELDS = [['name','название ИП'],['iin','ИИН/БИН'],['address','адрес'],['iban','IBAN (счёт)'],['kbe','КБе'],['bik','БИК'],['bank','банк'],['head','ФИО']];
const CUSTOMER_FIELDS = ['preamble','name','iin','address','iban','kbe','bik','bank','phone','email','head','marking'];

function createContracts({ db, env = process.env, templatePath = TEMPLATE }) {
  const customer = () => { try { const c = JSON.parse(env.CONTRACT_CUSTOMER_JSON || '{}'); return c && typeof c === 'object' ? c : {}; } catch { return {}; } };
  function prepare(blogger, body) {
    const r = Object.assign({}, blogger.ip_requisites || {});
    const c = customer();
    const missing = BLOGGER_FIELDS.filter(([k]) => !String(r[k] || '').trim()).map(([, l]) => l);
    if (missing.length) throw Object.assign(Error('Заполните реквизиты ИП блогера: ' + missing.join(', ')), { status: 409 });
    const cm = CUSTOMER_FIELDS.filter(k => !String(c[k] || '').trim());
    if (cm.length) throw Object.assign(Error('Не настроены реквизиты MIXIT (CONTRACT_CUSTOMER_JSON): ' + cm.join(', ')), { status: 503 });
    const amount = Math.round(Number(body.amount));
    if (!(amount > 0)) throw Object.assign(Error('Укажите сумму договора'), { status: 400 });
    const videos = Math.round(Number(body.videos) || 0);
    if (!(videos >= 1 && videos <= 20)) throw Object.assign(Error('Количество видео — от 1 до 20'), { status: 400 });
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? body.date : new Date().toISOString().slice(0, 10);
    const number = String(body.number || '').trim().slice(0, 40) || (dateDots(date).slice(0, 5) + '-' + date.slice(0, 4));
    return { r, c, amount, videos, date, number, city: String(body.city || c.city || 'Астана').trim().slice(0, 60),
      instagram: String(blogger.instagram_url || '').trim() || '—', tiktok: String(blogger.tiktok_url || '').trim() || '—' };
  }
  function contract(blogger, body) {
    const p = prepare(blogger, body);
    if (!fs.existsSync(templatePath)) throw Object.assign(Error('Шаблон договора не загружен: админ загружает его в карточке блогера'), { status: 409 });
    const files = unzipSync(new Uint8Array(fs.readFileSync(templatePath)));
    const values = {
      'НОМЕР': p.number, 'ГОРОД': p.city, 'ДАТА': dateWords(p.date),
      'ИП': p.r.name, 'ИИН': p.r.iin, 'АДРЕС': p.r.address, 'IBAN': p.r.iban, 'КБЕ': p.r.kbe, 'БИК': p.r.bik, 'БАНК': p.r.bank,
      'ТЕЛ': p.r.phone || '—', 'EMAIL': p.r.email || '—', 'ФИО': p.r.head,
      'INSTAGRAM': p.instagram, 'TIKTOK': p.tiktok,
      'КОЛВО': `${p.videos} (${COUNT_WORDS[p.videos] || numberWords(p.videos)})`,
      'СУММА': money(p.amount), 'СУММА_ПРОПИСЬЮ': numberWords(p.amount) + ' тенге',
      'МАРКИРОВКА': p.c.marking, 'З_ПРЕАМБУЛА': p.c.preamble, 'З_НАЗВАНИЕ': p.c.name, 'З_ИИН': p.c.iin, 'З_АДРЕС': p.c.address,
      'З_IBAN': p.c.iban, 'З_КБЕ': p.c.kbe, 'З_БИК': p.c.bik, 'З_БАНК': p.c.bank, 'З_ТЕЛ': p.c.phone, 'З_EMAIL': p.c.email, 'З_РУК': p.c.head,
    };
    let doc = strFromU8(files['word/document.xml']);
    doc = doc.replace(/\{\{([^{}<>]+)\}\}/g, (m, k) => (k in values ? xml(values[k]) : m));
    if (/\{\{[^{}<>]+\}\}/.test(doc)) throw Object.assign(Error('В шаблоне договора остались незаполненные поля'), { status: 500 });
    files['word/document.xml'] = strToU8(doc);
    return { buffer: Buffer.from(zipSync(files, { level: 6 })), filename: `Договор ${p.number} — ${p.r.name}.docx`.replace(/[\\/:*?"<>|]/g, '_') };
  }
  async function invoice(blogger, body) {
    const p = prepare(blogger, body);
    const no = String(body.invoiceNumber || p.number).trim().slice(0, 40);
    const F = 'Arial', b = (t, o = {}) => new TextRun({ text: String(t), font: F, size: 20, ...o });
    const cell = (t, w, o = {}) => new TableCell({ width: { size: w, type: WidthType.DXA }, children: [new Paragraph({ alignment: o.align, children: [b(t, { bold: o.bold })] })] });
    const line = (label, value) => new Paragraph({ spacing: { after: 40 }, children: [b(label + ' ', { bold: true }), b(value)] });
    const service = `Рекламные услуги: создание и размещение ${p.videos} (${COUNT_WORDS[p.videos] || p.videos}) рекламных видеороликов (Instagram Reels + TikTok) по договору № ${p.number} от ${dateDots(p.date)}`;
    const d = new Document({ sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1134, right: 850 } } }, children: [
      new Paragraph({ spacing: { after: 160 }, children: [b(`Счёт на оплату № ${no} от ${dateDots(p.date)}`, { bold: true, size: 28 })] }),
      line('Поставщик:', `ИП «${p.r.name}», ИИН ${p.r.iin}, ${p.r.address}`),
      line('Банк:', `${p.r.bank}, БИК ${p.r.bik}, ИИК (IBAN) ${p.r.iban}, КБе ${p.r.kbe}`),
      line('Покупатель:', `${p.c.name}, БИН (ИИН) ${p.c.iin}, ${p.c.address}`),
      line('Договор:', `№ ${p.number} от ${dateDots(p.date)}`),
      new Paragraph({ spacing: { after: 120 }, children: [] }),
      new Table({ width: { size: 9900, type: WidthType.DXA }, rows: [
        new TableRow({ tableHeader: true, children: [cell('№', 500, { bold: true }), cell('Наименование', 4900, { bold: true }), cell('Кол-во', 900, { bold: true }), cell('Ед.', 1100, { bold: true }), cell('Цена, ₸', 1250, { bold: true }), cell('Сумма, ₸', 1250, { bold: true })] }),
        new TableRow({ children: [cell('1', 500), cell(service, 4900), cell('1', 900), cell('услуга', 1100), cell(money(p.amount), 1250, { align: AlignmentType.RIGHT }), cell(money(p.amount), 1250, { align: AlignmentType.RIGHT })] }),
      ] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 120 }, children: [b(`Итого: ${money(p.amount)} ₸`, { bold: true })] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, children: [b('Без НДС')] }),
      new Paragraph({ spacing: { before: 120, after: 360 }, children: [b(`Всего к оплате: ${numberWords(p.amount)} тенге 00 тиын`, { bold: true })] }),
      new Paragraph({ children: [b(`Исполнитель: ____________________ / ${p.r.head} /`)] }),
    ] }] });
    return { buffer: await Packer.toBuffer(d), filename: `Счёт ${no} — ${p.r.name}.docx`.replace(/[\\/:*?"<>|]/g, '_') };
  }
  function saveTemplate(buffer) {
    let doc = '';
    try { doc = strFromU8(unzipSync(new Uint8Array(buffer))['word/document.xml'] || new Uint8Array()); } catch { doc = ''; }
    const missing = REQUIRED_TOKENS.filter(t => !doc.includes(t));
    if (!doc || missing.length) throw Object.assign(Error('Это не шаблон договора MIXIT: нет полей ' + (missing.join(', ') || 'Word')), { status: 400 });
    fs.mkdirSync(path.dirname(templatePath), { recursive: true });
    fs.writeFileSync(templatePath + '.tmp', buffer); fs.renameSync(templatePath + '.tmp', templatePath);
    return { ok: true };
  }
  function mount(app, auth) {
    const upload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('template');
    app.get('/api/contracts/template', auth, (req, res) => { let at = null; try { at = fs.statSync(templatePath).mtime.toISOString(); } catch {} res.json({ uploaded: !!at, updatedAt: at }); });
    app.post('/api/contracts/template', auth, (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Шаблон загружает админ' }),
      (req, res, next) => upload(req, res, e => e ? res.status(400).json({ error: 'Файл до 5 МБ' }) : next()),
      (req, res) => { try { if (!req.file || !/\.docx$/i.test(req.file.originalname)) throw Object.assign(Error('Нужен файл .docx'), { status: 400 }); res.json(saveTemplate(req.file.buffer)); } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'Не удалось сохранить шаблон' }); } });
    const allowed = (req, b) => req.user.role === 'admin' || (req.user.role === 'manager' && b.assigned_manager_id === req.user.id);
    app.post('/api/bloggers/:id/documents/:kind', auth, async (req, res) => {
      try {
        const b = db.get('bloggers').find({ id: req.params.id }).value();
        if (!b) return res.status(404).json({ error: 'Блогер не найден' });
        if (!allowed(req, b)) return res.status(403).json({ error: 'Документы готовит ответственный менеджер' });
        if (!['contract', 'invoice'].includes(req.params.kind)) return res.status(404).json({ error: 'Неизвестный документ' });
        const out = req.params.kind === 'contract' ? contract(b, req.body || {}) : await invoice(b, req.body || {});
        res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(out.filename)}`);
        res.set('Cache-Control', 'no-store');
        res.send(out.buffer);
      } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'Не удалось собрать документ' }); }
    });
  }
  return { contract, invoice, mount, numberWords, saveTemplate };
}
module.exports = { createContracts, numberWords };
