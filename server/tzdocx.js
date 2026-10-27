// ТЗ для блогера в Word: оформление как в ТЗ по туши LashLust.
// Сначала полностью на казахском, с новой страницы — на русском.
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, AlignmentType, PageBreak, LevelFormat, ExternalHyperlink,
} = require('docx');

const F = 'Arial';
const PINK = 'C2185B';
const W = 9638; // ширина текста A4 при полях 1134

// Постоянная часть ТЗ. ИИ её не пишет — только подставляем.
const CONST = {
  kz: {
    title: 'REELS ҮШІН ТЗ',
    labels: { kadr: 'Кадр', say: 'Айтыңыз', head: 'Тақырып', scenario: 'СЦЕНАРИЙ', important: 'МАҢЫЗДЫ',
      format: 'Формат', duration: 'Хронометраж', reveal: 'Ашып көрсету', article: 'Артикул', ref: 'Мысал' },
    boxes: [
      ['«БЮДЖЕТТІК» ДЕГЕН СӨЗДІ АЙТУҒА БОЛМАЙДЫ', 'Және оның синонимдерін: «арзан», «қымбат емес».'],
      ['ӨЗ СӨЗІҢІЗБЕН АЙТЫҢЫЗ', 'Мәтін — бағдар ғана, құрбыларыңызға айтқандай жанды сөйлеңіз.'],
      ['ЖАРЫҒЫ ЖАҚСЫ ЖЕРДЕ ТҮСІРІҢІЗ', 'Терезе жанындағы күндізгі жарық, сүзгісіз.'],
      ['СУБТИТР МІНДЕТТІ', ''],
    ],
    article: 'видео астындағы пікірге жауап ретінде қалдырасыз',
    important: [
      'Жариялағаннан кейін бірінші пікірге артикулмен жауап беріп, оны бекітіңіз.',
      'Басқа өнімдер мен брендтерді атамаңыз және көрсетпеңіз, люкс брендтермен салыстырмаңыз.',
      'Ролик жарнама ретінде белгіленеді. Жарияламас бұрын — менеджермен келісу.',
    ],
  },
  ru: {
    title: 'ТЗ ДЛЯ REELS',
    labels: { kadr: 'Кадр', say: 'Говорите', head: 'Заголовок', scenario: 'СЦЕНАРИЙ', important: 'ВАЖНО',
      format: 'Формат', duration: 'Хронометраж', reveal: 'Раскрыть', article: 'Артикул', ref: 'Пример' },
    boxes: [
      ['НЕЛЬЗЯ ГОВОРИТЬ СЛОВО «БЮДЖЕТНЫЙ»', 'И его синонимы: «дешёвый», «недорогой».'],
      ['ГОВОРИТЕ СВОИМИ СЛОВАМИ', 'Текст — ориентир, рассказывайте живо, как подругам.'],
      ['СНИМАЙТЕ В ХОРОШЕМ СВЕТЕ', 'Дневной свет у окна, без фильтров.'],
      ['СУБТИТРЫ ОБЯЗАТЕЛЬНЫ', ''],
    ],
    article: 'оставляете ответом на комментарий под видео',
    important: [
      'После публикации ответьте на первый комментарий артикулом и закрепите его.',
      'Не называйте и не показывайте другие товары и бренды, не сравнивайте с люксовыми брендами.',
      'Ролик маркируется как реклама. Перед выкладкой — на согласование менеджеру.',
    ],
  },
};
const BOX_COLORS = ['D50000', PINK, '1565C0', '2E7D32'];

const r = (t, o = {}) => new TextRun({ text: String(t ?? ''), font: F, size: 21, ...o });
const para = (kids, o = {}) => new Paragraph({ spacing: { after: 60 }, children: kids, ...o });

function box(color, title, sub) {
  const b = { style: BorderStyle.SINGLE, size: 12, color };
  const kids = [para([r(title, { bold: true, size: 22, color })], { alignment: AlignmentType.CENTER, spacing: { after: sub ? 20 : 0 } })];
  if (sub) kids.push(para([r(sub, { size: 19, color })], { alignment: AlignmentType.CENTER, spacing: { after: 0 } }));
  return [
    new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], rows: [new TableRow({ children: [
      new TableCell({ width: { size: W, type: WidthType.DXA }, borders: { top: b, bottom: b, left: b, right: b },
        margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: kids }),
    ] })] }),
    new Paragraph({ spacing: { after: 80 }, children: [] }),
  ];
}

function info(rows) {
  const nb = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return [new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], rows: [new TableRow({ children: [
    new TableCell({ width: { size: W, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: 'FCE4EC', color: 'auto' },
      borders: { top: nb, bottom: nb, left: nb, right: nb }, margins: { top: 120, bottom: 120, left: 160, right: 160 },
      children: rows.filter(([, v]) => v).map(([k, v]) => para([r(k + ': ', { bold: true }), r(v)], { spacing: { after: 80 } })) }),
  ] })] })];
}

const sect = t => para([r(t, { bold: true, size: 24, color: PINK })], { spacing: { before: 320, after: 160 } });

function step(n, s, L, last) {
  const out = [para([r(String(n).padStart(2, '0') + '  ', { bold: true, size: 30, color: PINK }), r(s.title, { bold: true })], { spacing: { before: 200, after: 80 } })];
  if (s.kadr) out.push(para([r(L.kadr + ': ', { bold: true }), r(s.kadr)]));
  if (s.say) out.push(para([r(L.say + ': ', { bold: true }), r('«' + String(s.say).replace(/^«|»$/g, '') + '»')]));
  if (s.head) out.push(para([r(L.head + ': ', { bold: true }), r('«' + String(s.head).replace(/^«|»$/g, '') + '»')]));
  if (!last) out.push(new Paragraph({ spacing: { after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD', space: 6 } }, children: [] }));
  return out;
}

// part: { subtitle, hook_title, hook_sub, format, duration, reveal, steps:[{title,kadr,say,head}], extra_important:[] }
function part(lang, p, refUrl) {
  const C = CONST[lang], L = C.labels;
  const steps = Array.isArray(p.steps) ? p.steps : [];
  const out = [
    para([r(C.title, { bold: true, size: 44, color: PINK })], { spacing: { after: 40 } }),
    para([r(p.subtitle || '', { size: 19, color: '6F6F6F' })], { spacing: { after: 200 } }),
    ...box('000000', p.hook_title || '', p.hook_sub || ''),
    ...C.boxes.flatMap(([t, s], i) => box(BOX_COLORS[i], t, s)),
    ...info([[L.format, p.format], [L.duration, p.duration], [L.reveal, p.reveal], [L.article, C.article]]),
    sect(L.scenario),
    ...steps.flatMap((s, i) => step(i + 1, s, L, i === steps.length - 1)),
    sect(L.important),
    ...[...C.important, ...(p.extra_important || [])].map(x => new Paragraph({ numbering: { reference: 'b', level: 0 }, spacing: { after: 40 }, children: [r(x)] })),
  ];
  if (refUrl) {
    out.push(para([r(L.ref + ': ', { bold: true }), new ExternalHyperlink({ link: refUrl, children: [new TextRun({ text: refUrl, style: 'Hyperlink', font: F, size: 19 })] })], { spacing: { before: 200 } }));
  }
  return out;
}

async function buildTzDocx(tz, refUrl) {
  const children = [...part('kz', tz.kz || {}, refUrl), new Paragraph({ children: [new PageBreak()] }), ...part('ru', tz.ru || {}, refUrl)];
  const doc = new Document({
    numbering: { config: [{ reference: 'b', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }] }] },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1134, right: 1134 } } }, children }],
  });
  return Packer.toBuffer(doc);
}

module.exports = { buildTzDocx, TZ_CONST: CONST };
