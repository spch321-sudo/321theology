/* 321系統神學 — 內容轉檔管線
   raw/*.md  →  data/lessons/L##.json + lexicon.json + verses.json + index.json
   規則：一律以內文 "## N｜" 的實際編號為準，忽略首行規範說明的舊編號。 */
const fs = require('fs');
const path = require('path');

const RAW = '/home/claude/app/raw';
const OUT = '/home/claude/app/data';

const FILEMAP = [
  ['321神學導論_第一部.md', 'L01', 1, 1],
  ['321神學導論_第二課.md', 'L02', 1, 2],
  ['321神學導論_第三課.md', 'L03', 1, 3],
  ['321神學導論_第四課.md', 'L04', 1, 4],
  ['321神學導論_第五課.md', 'L05', 1, 5],
  ['321神學導論_第六課.md', 'L06', 1, 6],
  ['321神學導論_第七課.md', 'L07', 1, 7],
  ['321神學導論_第八課.md', 'L08', 1, 8],
  ['321聖經論_第九課.md',   'L09', 2, 9],
  ['321聖經論_第十課.md',   'L10', 2, 10],
  ['321聖經論_第十一課.md', 'L11', 2, 11],
  ['321聖經論_第十二課.md', 'L12', 2, 12],
  ['321聖經論_第十三課.md', 'L13', 2, 13],
  ['321聖經論_第十四課.md', 'L14', 2, 14],
  ['321聖經論_第十五課.md', 'L15', 2, 15],
  ['321釋經學_第十六課.md', 'L16', 3, 16],
  ['321釋經學_第十七課.md', 'L17', 3, 17],
  ['321釋經學_第十八課.md', 'L18', 3, 18],
  ['321釋經學_第十九課.md', 'L19', 3, 19],
];

const PARTS = {
  1: { name: '神學導論', sub: '我們如何認識神', color: '#1E3A5F' },
  2: { name: '聖經論',   sub: '神如何向人說話', color: '#1F4D3D' },
  3: { name: '釋經學',   sub: '如何正確地讀神的話', color: '#8B5E1A' },
};

const BOOKS = ['創','出','利','民','申','書','士','得','撒上','撒下','王上','王下','代上','代下','拉','尼','斯','伯','詩','箴','傳','歌','賽','耶','哀','結','但','何','珥','摩','俄','拿','彌','鴻','哈','番','該','亞','瑪','太','可','路','約壹','約貳','約參','約','徒','羅','林前','林後','加','弗','腓利','腓','西','帖前','帖後','提前','提後','多','門','來','雅','彼前','彼後','猶','啟'];
const BOOKRE = new RegExp('(' + BOOKS.join('|') + ')(\\d{1,3}):(\\d{1,3}(?:[-–—]\\d{1,3})?(?:[,、]\\d{1,3}(?:[-–—]\\d{1,3})?)*)', 'g');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- 行內處理 ----------
function inline(t) {
  let s = esc(t);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 原文編號 → 可點
  s = s.replace(/<strong>((?:[GH]\d{1,4})(?:\s*\+\s*[GH]\d{1,4})*)<\/strong>/g,
    (m, codes) => codes.split(/\s*\+\s*/).map(c => `<a class="lx" data-code="${c}">${c}</a>`).join(' + '));
  s = s.replace(/(?<!data-code=")\b([GH]\d{2,4})\b(?![^<]*<\/a>)/g, m => m);
  // 經文 → 可點
  s = s.replace(BOOKRE, (m) => `<a class="vs" data-ref="${m}">${m}</a>`);
  return s;
}

// ---------- 表格 ----------
function tableHTML(rows) {
  if (!rows.length) return '';
  const head = rows[0], body = rows.slice(1);
  let h = '<div class="tw"><table><thead><tr>' +
    head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
  for (const r of body) h += '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>';
  return h + '</tbody></table></div>';
}

// 單行內嵌表格（附件常見）： | a | b | |—|—| | c | d |
function inlineTable(seg) {
  const tok = seg.split('|').map(s => s.trim());
  const isSep = c => /^[—–\-]{1,}$/.test(c);
  let start = -1, n = 0;
  for (let i = 0; i < tok.length; i++) {
    if (isSep(tok[i])) { if (start < 0) start = i; n++; }
    else if (start >= 0) break;
  }
  if (n < 2) return null;
  const rows = [];
  let i = 0;
  while (i < tok.length) {
    if (tok[i] !== '') { i++; continue; }          // 列邊界：空 token
    const row = tok.slice(i + 1, i + 1 + n);
    if (row.length < n) break;
    if (!row.every(isSep)) rows.push(row);
    i += n + 1;
  }
  return rows.length > 1 ? rows : null;
}

// ---------- 段落轉 HTML ----------
function render(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const L = lines[i], t = L.trim();
    if (!t) { i++; continue; }

    // 標準 markdown 表格
    if (/^\|/.test(t)) {
      const buf = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { buf.push(lines[i].trim()); i++; }
      const isTable = buf.some(r => /^\|[\s:\-|]+\|$/.test(r));
      if (isTable) {
        const rows = buf.filter(r => !/^\|[\s:\-|]+\|$/.test(r))
          .map(r => r.replace(/^\||\|$/g, '').split('|').map(s => s.trim()));
        out.push(tableHTML(rows));
      } else {
        out.push('<pre class="ascii">' + esc(buf.join('\n')) + '</pre>');
      }
      continue;
    }

    // ASCII 卡片
    if (/^\+[-+]+\+/.test(t)) {
      const buf = [];
      while (i < lines.length && (/^\s*[+|]/.test(lines[i]) || lines[i].trim() === '')) {
        if (lines[i].trim() === '' && !/^\s*[+|]/.test(lines[i + 1] || '')) break;
        buf.push(lines[i].replace(/\s+$/, '')); i++;
      }
      out.push('<pre class="ascii">' + esc(buf.join('\n')) + '</pre>');
      continue;
    }

    // 神學地圖（縮排箭頭）
    if (/^\s+↓/.test(L) || (/^[^\s|#\-*]/.test(t) && /^\s+↓/.test(lines[i + 1] || ''))) {
      const buf = [];
      while (i < lines.length && (lines[i].trim() === '' ? /^\s+↓|^[^\s|#\-*]/.test((lines[i + 1] || '')) && lines[i + 1] !== undefined && lines[i + 1].trim() !== '' : true)) {
        if (/^#{1,3} /.test(lines[i].trim())) break;
        if (lines[i].trim() !== '') buf.push(lines[i].replace(/\s+$/, ''));
        i++;
        if (i < lines.length && /^#{1,3} /.test((lines[i] || '').trim())) break;
      }
      out.push('<pre class="map">' + esc(buf.join('\n')) + '</pre>');
      continue;
    }

    if (/^### /.test(t)) { out.push('<h4>' + inline(t.slice(4)) + '</h4>'); i++; continue; }

    if (/^[-*] /.test(t)) {
      const items = [];
      while (i < lines.length) {
        const s = lines[i].trim();
        if (/^[-*] /.test(s)) { items.push(s.slice(2)); i++; }
        else if (s === '') { if (/^[-*] /.test((lines[i + 1] || '').trim())) { i++; continue; } else break; }
        else break;
      }
      out.push('<ul>' + items.map(x => '<li>' + para(x).replace(/<\/?p>/g,'') + '</li>').join('') + '</ul>');
      continue;
    }

    const r = para(t);
    out.push(/<(div|ul|table|pre)\b/.test(r) ? '<div class="pp">' + r + '</div>' : '<p>' + r + '</p>');
    i++;
  }
  return out.join('\n');
}

// 段落內：處理「**經文** > 內容」與內嵌表格
function para(t) {
  const m = t.match(/^\*\*([^*]{1,24})\*\*\s*>\s*(.+)$/);
  if (m && new RegExp('^' + BOOKRE.source + '$').test(m[1].trim()))
    return `<span class="vref">${inline(m[1])}</span><span class="vtext">${inline(m[2])}</span>`;
  const ti = t.indexOf('| ');
  if (ti >= 0 && /\|\s*[—–\-]+\s*\|/.test(t)) {
    const rows = inlineTable(t.slice(ti));
    if (rows) return inline(t.slice(0, ti)) + tableHTML(rows);
  }
  if (/^> /.test(t)) return '<span class="quote">' + inline(t.slice(2)) + '</span>';
  // 粗體標題後接 " - " 條列 → 轉為清單
  const lm = t.match(/^(\*\*[^*]+\*\*)\s+-\s+(.+)$/);
  if (lm && lm[2].split(/\s+-\s+/).length > 1) {
    const items = lm[2].split(/\s+-\s+/).filter(Boolean);
    return inline(lm[1]) + '<ul>' + items.map(x => '<li>' + inline(x) + '</li>').join('') + '</ul>';
  }
  // 段落中的 > 引言
  const seg = t.split(/\s>\s/);
  if (seg.length > 1)
    return inline(seg[0]) + seg.slice(1).map(x => '<span class="quote">' + inline(x) + '</span>').join('');
  return inline(t);
}


// ---------- 繁殖卡結構化 ----------
function parseCard(lines) {
  const raw = lines.map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
  const idx = [];
  raw.forEach((l, i) => { if (/^\s*\+[-+\s]*\+\s*$/.test(l)) idx.push(i); });
  if (idx.length < 3) return null;
  const secs = [];
  for (let k = 0; k < idx.length - 1; k++) {
    const body = raw.slice(idx[k] + 1, idx[k + 1])
      .map(l => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').replace(/\s+$/, ''))
      .filter(l => l.trim());
    if (body.length) secs.push(body);
  }
  if (!secs.length) return null;

  const out = { title: secs[0].map(x => x.trim()).join(' ').trim(), diagram: [], lines: [], verse: '', ref: '', question: '' };
  const has = (a, re) => a.some(x => re.test(x));
  const dedent = a => {
    const m = Math.min(...a.filter(x => x.trim()).map(x => x.match(/^\s*/)[0].length));
    return a.map(x => x.slice(m));
  };

  for (let k = 1; k < secs.length; k++) {
    const sec = secs[k];
    if (has(sec, /^\s*三句話/)) {
      const rest = sec.filter(x => !/^\s*三句話/.test(x));
      let cur = null;
      rest.forEach(l => {
        const m = l.match(/^\s*([1-3])[.．]\s*(.*)$/);
        if (m) { if (cur) out.lines.push(cur); cur = m[2].trim(); }
        else if (cur !== null) cur += l.trim();
      });
      if (cur) out.lines.push(cur);
    } else if (has(sec, /^\s*一節經文/)) {
      const rest = sec.filter(x => !/^\s*一節經文/.test(x));
      const refLine = rest.find(x => /^\s{10,}[（(]/.test(x));
      out.ref = refLine ? refLine.trim().replace(/^[（(]|[）)]$/g, '') : '';
      out.verse = rest.filter(x => x !== refLine).map(x => x.trim()).join('');
      if (!out.ref) {
        const rm = out.verse.match(/[（(]([^（()）]{2,20})[）)]\s*$/);
        if (rm) { out.ref = rm[1]; out.verse = out.verse.slice(0, rm.index); }
      }
      out.verse = out.verse.replace(/^[「"]+/, '').replace(/[」"]+$/, '').trim();
    } else if (has(sec, /^\s*一個問題/)) {
      out.question = sec.filter(x => !/^\s*一個問題/.test(x)).map(x => x.trim()).join('')
        .replace(/^[「"]|[」"]$/g, '');
    } else if (!out.lines.length) {
      out.diagram = dedent(sec);
    }
  }
  return (out.lines.length || out.verse) ? out : null;
}

// ---------- 主解析 ----------
const lexicon = {};
const verses = {};
const index = [];

function addVerses(id, html) {
  const re = new RegExp(BOOKRE.source, 'g');
  let m;
  const plain = html.replace(/<[^>]+>/g, '');
  while ((m = re.exec(plain))) {
    const ref = m[0];
    (verses[ref] = verses[ref] || []).push(id);
  }
}

for (const [file, id, part, num] of FILEMAP) {
  const src = fs.readFileSync(path.join(RAW, file), 'utf8').split('\n');

  // 切出各 # 區
  const H1 = [];
  src.forEach((l, n) => { if (/^# /.test(l.trim())) H1.push({ n, txt: l.trim().slice(2) }); });

  let title = '';
  for (const h of H1) {
    if (/^《321系統神學》/.test(h.txt)) continue;
    if (/^卷首/.test(h.txt)) continue;
    if (/^附件/.test(h.txt)) continue;
    const m = h.txt.match(/^第[一二三四五六七八九十]+課｜(.+)$/);
    title = m ? m[1] : h.txt;
    break;
  }

  function sliceBetween(startTest, endTest) {
    let s = -1;
    for (const h of H1) { if (startTest(h.txt)) { s = h.n; break; } }
    if (s < 0) return null;
    let e = src.length;
    for (const h of H1) { if (h.n > s && (!endTest || endTest(h.txt))) { e = h.n; break; } }
    return src.slice(s + 1, e);
  }

  // 教師本：從「## 1｜」開始到「# 附件一」
  const bodyStart = src.findIndex(l => /^## 1[｜|]/.test(l.trim()));
  const appxStart = src.findIndex(l => /^# 附件一/.test(l.trim()));
  const bodyLines = src.slice(bodyStart, appxStart > 0 ? appxStart : src.length);

  const blocks = [];
  let cur = null;
  for (const l of bodyLines) {
    const m = l.trim().match(/^## ([0-9]{1,2}(?:-[ab])?)[｜|](.+)$/);
    if (m) {
      if (cur) blocks.push(cur);
      cur = { n: m[1], heading: m[2].trim(), lines: [] };
    } else if (cur) cur.lines.push(l);
  }
  if (cur) blocks.push(cur);

  const full = blocks.map(b => {
    const html = render(b.lines);
    addVerses(id, html);
    return { n: b.n, heading: b.heading, html, star: /★/.test(b.heading) };
  });

  // 附件
  const core8raw = sliceBetween(x => /^附件一/.test(x), x => /^附件二/.test(x)) || [];
  const live4raw = sliceBetween(x => /^附件二/.test(x), x => /^附件三/.test(x)) || [];
  const cardraw = sliceBetween(x => /^附件三/.test(x), () => true) || [];

  const core8 = render(core8raw.filter(l => !/^### 第[一二三四五六七八九十]+課｜/.test(l.trim())));
  const live4 = render(live4raw);
  const cardClean = cardraw.filter(l => {
    const t = l.trim();
    return !/^\*本教材本身/.test(t) && !/^321系統神學\s*\d*$/.test(t)
        && !/^願一切榮耀歸給神。阿們。$/.test(t.replace(/\*\*/g, ''));
  });
  const card = render(cardClean);
  const cardData = parseCard(cardClean);
  addVerses(id, core8); addVerses(id, live4); addVerses(id, card);

  // 卷首（部總覽）
  const prefaceRaw = sliceBetween(x => /^卷首/.test(x), x => !/^卷首/.test(x));
  const preface = prefaceRaw ? render(prefaceRaw) : null;

  // 摘取欄位
  const get = n => (full.find(b => b.n === n) || {}).html || '';
  const findByHead = re => (full.find(b => re.test(b.heading)) || {});

  const truthBlock = findByHead(/一句話核心真理/);
  const oneLine = truthBlock.html ? truthBlock.html.replace(/<[^>]+>/g, '').trim() : '';

  const qBlock = findByHead(/核心問題/);
  const coreQ = qBlock.html ? (qBlock.html.match(/<li>(.*?)<\/li>/) || [, ''])[1].replace(/<[^>]+>/g, '') : '';

  const verseBlock = findByHead(/核心經文/);
  const coreVerses = [];
  if (verseBlock.html) {
    const re = /<span class="vref">(.*?)<\/span><span class="vtext">(.*?)<\/span>/g; let m;
    while ((m = re.exec(verseBlock.html))) coreVerses.push({ ref: m[1].replace(/<[^>]+>/g, ''), text: m[2].replace(/<[^>]+>/g, '') });
  }

  const closing = findByHead(/固定結尾語/).html || '';
  const tiers = findByHead(/三個?層次分辨|三層分辨/).html || '';
  const cred = findByHead(/引用可信度標示|引用標示/).html || '';
  const rev = findByHead(/修正、限定或深化/).html || '';
  const diag4 = findByHead(/有己四型/).html || '';
  const memBlock = findByHead(/繁殖任務/).html || '';

  // 原文
  const lxCodes = [];
  const lxBlock = full.find(b => /重要經文原文解釋/.test(b.heading));
  if (lxBlock) {
    for (const line of (blocks.find(b => /重要經文原文解釋/.test(b.heading)) || { lines: [] }).lines) {
      const h = line.trim();
      if (!/^### /.test(h)) continue;
      const label = h.slice(4).replace(/^（\d+）/, '').replace(/\*\*/g, '');
      const codes = (h.match(/[GH]\d{1,4}/g) || []);
      const orig = (label.match(/^([^\sA-Za-z（(｜|]+)/) || [, ''])[1].trim();
      const tr = (label.match(/([a-zA-Zāēīōūǎěǐǒǔġṓ’'\-]{3,})/) || [, ''])[1] || '';
      codes.forEach(c => {
        lxCodes.push(c);
        if (!lexicon[c]) lexicon[c] = { code: c, original: orig, translit: tr, label, lessons: [] };
        if (!lexicon[c].lessons.includes(id)) lexicon[c].lessons.push(id);
        if (!lexicon[c].original && orig) lexicon[c].original = orig;
      });
    }
  }
  // 全文出現的編號
  const allCodes = new Set(lxCodes);
  const allHtml = full.map(b => b.html).join('') + core8 + live4 + card;
  (allHtml.match(/data-code="([GH]\d{1,4})"/g) || []).forEach(m => {
    const c = m.match(/[GH]\d{1,4}/)[0];
    allCodes.add(c);
    if (!lexicon[c]) lexicon[c] = { code: c, original: '', translit: '', label: c, lessons: [] };
    if (!lexicon[c].lessons.includes(id)) lexicon[c].lessons.push(id);
  });

  // 本課金句與宣告
  let memoryVerse = null, declarations = [];
  {
    const all = src.join('\n');
    const mv = all.match(/#{2,3} [^\n]{0,8}本課金句[^\n]*\n+\*\*[「"]?([^」"*]+)[」"]?\s*[（(]([^（()）]{2,20})[）)]\*\*/);
    if (mv) memoryVerse = { text: mv[1].trim(), ref: mv[2].trim() };
    const md = all.match(/#{2,3} [^\n]{0,8}本課宣告[^\n]*\n+([\s\S]{0,700}?)\n#{2,3} /);
    if (md) declarations = md[1].split(/\s*我宣告[：:]\s*/).map(x => x.replace(/\*\*/g,'').trim())
      .filter(x => x && x.length > 4);
  }

  const lesson = {
    id, part, partName: PARTS[part].name, number: num, title,
    level: /A級/.test(src.slice(0, 12).join('')) ? 'A' : (/整合課/.test(src.slice(0, 12).join('')) ? '整合' : 'B'),
    coreQuestion: coreQ, oneLineTruth: oneLine, coreVerses, memoryVerse, declarations,
    lexicon: [...allCodes],
    preface,
    views: { card, cardData, core8, live4, full },
    parts: { closing, tiers, cred, revisions: rev, diagnosis: diag4, multiply: memBlock },
  };

  fs.writeFileSync(path.join(OUT, 'lessons', id + '.json'), JSON.stringify(lesson));
  index.push({
    id, part, partName: PARTS[part].name, number: num, title,
    level: lesson.level, coreQuestion: coreQ, oneLineTruth: oneLine, memoryVerse,
    blocks: full.length, lexicon: lesson.lexicon.length,
  });
  console.log(id, title, '| 區塊', full.length, '| 原文', lesson.lexicon.length, '| Core8', core8.length, '| Live4', live4.length, '| Card', card.length);
}

// ---------- 補齊字彙：從內文擷取原文、音譯或中文釋義 ----------
{
  const HEB = /[\u0590-\u05FF]/, GRK = /[\u0370-\u03FF\u1F00-\u1FFF]/, CJK = /^[\u4e00-\u9fa5]{2,6}$/;
  const LAT = /^[a-zA-Zāēīōūǎěǐǒǔḥṭṣšźʾʿŏĕăêôîû'\u2019\-]{3,}$/;
  for (const [file] of FILEMAP) {
    const txt = fs.readFileSync(path.join(RAW, file), 'utf8');
    const re = /\*\*([GH]\d{1,4})(?:\s*\+\s*[GH]\d{1,4})?\*\*/g;
    let m;
    while ((m = re.exec(txt))) {
      const code = m[1], L = lexicon[code];
      if (!L || L.original) continue;
      const seg = txt.slice(Math.max(0, m.index - 60), m.index).replace(/\*\*/g, '');
      const tok = seg.split(/[\s，。、：；「」（）()／\/｜|＋+]+/).filter(Boolean);
      // 只看緊鄰的一至兩個詞，避免誤取到別的字的原文
      for (let k = tok.length - 1; k >= 0 && k >= tok.length - 2; k--) {
        const t = tok[k];
        if (CJK.test(t)) { if (!L.original && !L.gloss) L.gloss = t; break; }
        if (HEB.test(t) || GRK.test(t)) { L.original = t; break; }
        if (LAT.test(t) && !L.translit) L.translit = t;
        else break;
      }
      if (L.label === code) L.label = [L.original, L.translit, L.gloss].filter(Boolean).join(' ');
    }
  }
}

// 經文索引去重
const vout = {};
Object.keys(verses).forEach(k => { vout[k] = [...new Set(verses[k])].sort(); });

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({
  app: '321系統神學', version: '1.0.0', parts: PARTS, lessons: index,
}, null, 1));
fs.writeFileSync(path.join(OUT, 'lexicon.json'), JSON.stringify(lexicon, null, 1));
fs.writeFileSync(path.join(OUT, 'verses.json'), JSON.stringify(vout));

console.log('\n原文字彙：', Object.keys(lexicon).length, '個');
console.log('經文索引：', Object.keys(vout).length, '處');
