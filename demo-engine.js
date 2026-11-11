/* Simplified browser version of three rule engines, written for this demo.
   It runs on made-up data only. The full pipeline is Python and private. */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- CSV
  function parseCSV(text) {
    let lines = String(text).replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
    if (!lines.length) return { headers: [], rows: [] };
    let delim = ',', best = 0;
    for (const d of [';', '\t', '|', ',']) {
      const n = lines[0].split(d).length - 1;
      if (n > best) { best = n; delim = d; }
    }
    if (delim === '|') {
      lines = lines.filter(l => !/^[\s|:\-]+$/.test(l))
        .map(l => l.trim().replace(/^\|/, '').replace(/\|$/, ''));
    }
    const split = line => {
      const out = []; let cur = '', q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) {
          if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
          else cur += c;
        } else if (c === '"') q = true;
        else if (c === delim) { out.push(cur.trim()); cur = ''; }
        else cur += c;
      }
      out.push(cur.trim());
      return out;
    };
    const headers = split(lines[0]);
    const rows = lines.slice(1).map(l => {
      const r = split(l);
      while (r.length < headers.length) r.push('');
      return r.slice(0, headers.length);
    });
    return { headers, rows };
  }

  // ---------------------------------------------------------------- cell parsers
  function parseMoney(raw, dec) {
    let s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    let neg = false; const notes = [];
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); notes.push('brackets mean negative'); }
    const m = s.match(/\s*(CR|DR)$/i);
    if (m) { if (m[1].toUpperCase() === 'DR') neg = !neg; s = s.slice(0, m.index); notes.push(m[1].toUpperCase() + ' suffix'); }
    if (/-$/.test(s)) { neg = !neg; s = s.slice(0, -1); notes.push('trailing minus'); }
    if (/^-/.test(s)) { neg = !neg; s = s.slice(1); } else if (/^\+/.test(s)) s = s.slice(1);
    const s2 = s.replace(/[$€£₫¥\s]|USD|VND|EUR|AUD/gi, '');
    if (s2 !== s) { notes.push('currency symbol removed'); s = s2; }
    if (!/^[\d.,']+$/.test(s) || !/\d/.test(s)) return null;
    s = s.replace(/'/g, '');
    const norm = dec === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    if (norm !== s) notes.push(dec === ',' ? 'decimal comma' : 'thousands separator removed');
    if (!/^\d*\.?\d*$/.test(norm)) return null;
    const v = parseFloat(norm);
    if (isNaN(v)) return null;
    return { value: neg ? -v : v, notes };
  }

  function detectDecimalMark(values) {
    let comma = 0, dot = 0;
    for (const raw of values) {
      const s = String(raw).replace(/[^\d.,]/g, '');
      if (!s) continue;
      const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
      if (lc >= 0 && ld >= 0) { if (lc > ld) comma += 2; else dot += 2; }
      else if (lc >= 0) { if (s.length - lc - 1 !== 3) comma += 1; else dot += 0.5; }
      else if (ld >= 0) { if (s.length - ld - 1 !== 3) dot += 1; else comma += 0.5; }
    }
    if (comma > dot) return { mark: ',', reason: 'values end in a comma and decimals, like 1.250,00', ambiguous: false };
    if (dot > comma) return { mark: '.', reason: 'values end in a point and decimals, like 1,250.00', ambiguous: false };
    return { mark: '.', reason: 'no separators to judge from, so a decimal point is assumed', ambiguous: comma + dot > 0 };
  }

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function mkDate(y, m, d) {
    if (y < 100) y += 2000;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100)) return null;
    const p = n => String(n).padStart(2, '0');
    return { iso: y + '-' + p(m) + '-' + p(d), day: Math.round(Date.UTC(y, m - 1, d) / 86400000) };
  }
  // returns {iso, day, numeric: true when the day/month order mattered}
  function parseDate(raw, order) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
    if (m) return mkDate(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/);
    if (m) {
      const d = order === 'MDY' ? mkDate(+m[3], +m[1], +m[2]) : mkDate(+m[3], +m[2], +m[1]);
      if (d) d.numeric = true;
      return d;
    }
    m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{2}|\d{4})$/);
    if (m && MONTHS[m[2].toLowerCase()]) return mkDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    m = s.match(/^([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{2}|\d{4})$/);
    if (m && MONTHS[m[1].toLowerCase()]) return mkDate(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
    return null;
  }

  function detectDateOrder(values) {
    let firstBig = 0, secondBig = 0, numeric = 0;
    for (const raw of values) {
      const m = String(raw).trim().match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/);
      if (!m) continue;
      numeric++;
      if (+m[1] > 12) firstBig++;
      if (+m[2] > 12) secondBig++;
    }
    if (!numeric) return { order: 'DMY', reason: 'dates are unambiguous as written', ambiguous: false, applies: false };
    if (firstBig && !secondBig) return { order: 'DMY', reason: 'a first number above 12 can only be a day', ambiguous: false, applies: true };
    if (secondBig && !firstBig) return { order: 'MDY', reason: 'a second number above 12 can only be a day', ambiguous: false, applies: true };
    const sorted = order => {
      let prev = -Infinity;
      for (const raw of values) {
        const d = parseDate(raw, order);
        if (!d) continue;
        if (d.day < prev) return false;
        prev = d.day;
      }
      return true;
    };
    const dmy = sorted('DMY'), mdy = sorted('MDY');
    if (dmy && !mdy) return { order: 'DMY', reason: 'only day-first keeps the rows in date order', ambiguous: false, applies: true };
    if (mdy && !dmy) return { order: 'MDY', reason: 'only month-first keeps the rows in date order', ambiguous: false, applies: true };
    return { order: 'DMY', reason: 'the values fit both orders, so day-first is assumed', ambiguous: true, applies: true };
  }

  // ---------------------------------------------------------------- engine 1: column rules
  const NAME_PATTERNS = [
    { re: /(^|_)(value|val|effective)_(date|dt)($|_)/, nature: 'DATE', target: 'Value date', s: 0.95 },
    { re: /(^|_)(date|dt|posted|posting)($|_)/, nature: 'DATE', target: 'Date', s: 0.9 },
    { re: /(^|_)(description|desc|narration|narrative|particulars|details|memo|remarks|payee)($|_)/, nature: 'TEXT', target: 'Description', s: 0.9 },
    { re: /(^|_)(fee|fees|charge|charges|tax|vat|gst)($|_)/, nature: 'MONEY', target: 'Fee', s: 0.9 },
    { re: /(^|_)(balance|bal)($|_)/, nature: 'MONEY', target: 'Balance', s: 0.9 },
    { re: /(^|_)(debit|dr|withdrawal|withdrawals|paid_out|money_out)($|_)/, nature: 'MONEY', target: 'Debit', s: 0.9 },
    { re: /(^|_)(credit|cr|deposit|deposits|paid_in|money_in)($|_)/, nature: 'MONEY', target: 'Credit', s: 0.9 },
    { re: /(^|_)(amount|amt|value|total)($|_)/, nature: 'MONEY', target: 'Amount', s: 0.8 },
    { re: /(^|_)(ref|reference|cheque|chq|txn_id|transaction_id|id|utr|voucher)($|_)/, nature: 'REFERENCE', target: 'Reference', s: 0.85 },
    { re: /(^|_)(currency|ccy)($|_)/, nature: 'CURRENCY', target: 'Currency', s: 0.9 }
  ];
  const NATURE_LABEL = { DATE: 'a date', TEXT: 'free text', MONEY: 'money', REFERENCE: 'a reference', CURRENCY: 'a currency code', UNKNOWN: 'unknown' };
  const W_NAME = 0.5, W_STATS = 0.35;

  function profile(values) {
    const filled = values.filter(v => String(v).trim() !== '');
    const n = filled.length;
    const p = { n, total: values.length, date: 0, money: 0, id: 0, text: 0, ccy: 0, integer: 0, decimals: 0, distinct: 0 };
    if (!n) return p;
    const seen = new Set();
    for (const raw of filled) {
      const s = String(raw).trim();
      seen.add(s);
      const isDate = !!(parseDate(s, 'DMY') || parseDate(s, 'MDY'));
      const isMoney = !isDate && !!(parseMoney(s, '.') || parseMoney(s, ','));
      if (isDate) p.date++;
      else if (/^[A-Z]{3}$/.test(s)) p.ccy++;
      else if (isMoney) {
        p.money++;
        if (/^\d+$/.test(s)) p.integer++;
        if (/[.,]\d{1,2}\)?$/.test(s)) p.decimals++;
      }
      else if (/^[A-Za-z0-9][A-Za-z0-9\-\/_.#]{3,}$/.test(s) && /\d/.test(s) && /[A-Za-z]/.test(s)) p.id++;
      else if (/[A-Za-z]/.test(s)) p.text++;
    }
    p.distinct = seen.size / n;
    return p;
  }

  function statsScores(p) {
    const sc = { DATE: 0, MONEY: 0, REFERENCE: 0, TEXT: 0, CURRENCY: 0 }, why = {};
    if (!p.n) return { sc, why };
    const pct = x => Math.round(100 * x / p.n) + '%';
    sc.DATE = p.date / p.n; why.DATE = pct(p.date) + ' of values read as dates';
    sc.TEXT = p.text / p.n; why.TEXT = pct(p.text) + ' of values are free text';
    sc.CURRENCY = p.ccy / p.n; why.CURRENCY = pct(p.ccy) + ' of values are three-letter codes';
    sc.MONEY = p.money / p.n; why.MONEY = pct(p.money) + ' of values read as numbers';
    sc.REFERENCE = p.id / p.n; why.REFERENCE = pct(p.id) + ' of values mix letters and digits';
    // whole numbers that never repeat could be amounts or cheque numbers
    if (p.money && p.integer === p.money && !p.decimals) {
      sc.MONEY *= 0.6;
      const asRef = (p.integer / p.n) * p.distinct * 0.55 + sc.REFERENCE;
      if (asRef > sc.REFERENCE) { sc.REFERENCE = Math.min(1, asRef); why.REFERENCE = p.id ? 'values are codes or whole numbers that never repeat' : 'whole numbers that never repeat could be reference numbers'; }
      why.MONEY = 'whole numbers with no decimals: could be amounts or reference numbers';
    }
    return { sc, why };
  }

  function mapColumns(table, threshold) {
    const cols = table.headers.map((name, index) => {
      const values = table.rows.map(r => r[index]);
      const p = profile(values);
      const norm = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const hits = NAME_PATTERNS.filter(x => x.re.test(norm));
      const nameSc = {};
      for (const h of hits) nameSc[h.nature] = Math.max(nameSc[h.nature] || 0, h.s);
      const { sc: st, why } = statsScores(p);
      const samples = values.filter(v => String(v).trim() !== '').slice(0, 3);
      const col = { index, name, samples, evidence: [], alternatives: [], nature: 'UNKNOWN', target: null, conf: 0 };
      if (!p.n) { col.status = 'ignored'; col.evidence.push('the column is empty'); return col; }

      const denom = (hits.length ? W_NAME : 0) + W_STATS;
      const scored = Object.keys(st).map(n => ({ n, v: (W_NAME * (nameSc[n] || 0) + W_STATS * st[n]) / denom }))
        .sort((a, b) => b.v - a.v);
      col.nature = scored[0].n;
      const natureConf = scored[0].v;
      const statsTop = Object.keys(st).sort((a, b) => st[b] - st[a])[0];

      if (hits.length) {
        const h = hits.find(x => x.nature === col.nature) || hits[0];
        col.evidence.push('name "' + name + '" matches the pattern for ' + h.target.toLowerCase());
      } else col.evidence.push('the name gives no clue, so only the values count');
      col.evidence.push(why[col.nature]);
      if (hits.length && statsTop !== col.nature && st[statsTop] > 0.5)
        col.evidence.push('conflict: the values look more like ' + NATURE_LABEL[statsTop]);
      if (scored[1].v > 0.3 && st[scored[1].n] > 0) col.alternatives.push(NATURE_LABEL[scored[1].n] + ' (' + scored[1].v.toFixed(2) + ')');

      // nature -> target
      let targetConf;
      const hit = hits.find(x => x.nature === col.nature);
      if (col.nature === 'MONEY') {
        if (hit) { col.target = hit.target; targetConf = Math.min(0.99, hit.s + 0.05); }
        else { col.target = 'Amount'; targetConf = 0.5; col.evidence.push('a money column with no role in its name: amount is a guess'); }
      } else if (col.nature === 'DATE') { col.target = hit ? hit.target : 'Date'; targetConf = hit ? 0.95 : 0.9; }
      else if (col.nature === 'TEXT') { col.target = 'Description'; targetConf = hit ? 0.95 : 0.85; }
      else if (col.nature === 'REFERENCE') { col.target = 'Reference'; targetConf = hit ? 0.95 : 0.85; }
      else { col.target = 'Currency'; targetConf = 0.95; }
      col.conf = Math.min(natureConf, targetConf);
      return col;
    });

    // one column per target: the most confident column wins
    const taken = {};
    for (const c of cols.filter(c => c.target).sort((a, b) => b.conf - a.conf)) {
      if (c.target === 'Fee') { c.status = 'excluded'; c.evidence.push('fees and taxes are kept apart from the amount'); continue; }
      let t = c.target;
      if (taken[t] && t === 'Date' && !taken['Value date']) t = 'Value date';
      if (taken[t]) {
        c.evidence.push('"' + taken[t].name + '" already holds ' + c.target.toLowerCase() + ' with more confidence');
        c.alternatives.unshift(c.target);
        c.target = null; c.status = 'review';
        continue;
      }
      c.target = t; taken[t] = c;
      c.status = c.conf >= threshold ? 'approved' : 'review';
    }
    return cols;
  }

  // ---------------------------------------------------------------- engine 2: cell rules
  function cleanTable(table, mapping) {
    const col = {};
    for (const m of mapping) if (m.target && m.status !== 'excluded' && m.status !== 'ignored') col[m.target] = m.index;
    const values = i => table.rows.map(r => r[i]);
    const decisions = [], repairs = [], problems = [];
    let order = null;
    if (col.Date != null) {
      order = detectDateOrder(values(col.Date));
      if (order.applies) decisions.push({
        label: 'Date order in "' + table.headers[col.Date] + '"',
        value: order.order === 'DMY' ? 'day / month / year' : 'month / day / year', reason: order.reason, ambiguous: order.ambiguous
      });
    }
    const dec = {};
    for (const t of ['Debit', 'Credit', 'Amount', 'Balance']) if (col[t] != null) {
      dec[t] = detectDecimalMark(values(col[t]));
      if (dec[t].mark === ',' || dec[t].ambiguous) decisions.push({
        label: 'Decimal mark in "' + table.headers[col[t]] + '"',
        value: dec[t].mark === ',' ? 'comma' : 'point', reason: dec[t].reason, ambiguous: dec[t].ambiguous
      });
    }
    const money = (r, t, rowNo) => {
      if (col[t] == null) return null;
      const raw = r[col[t]];
      if (String(raw).trim() === '') return null;
      const v = parseMoney(raw, dec[t].mark);
      if (!v) { problems.push({ row: rowNo, column: table.headers[col[t]], raw, note: 'not a number' }); return null; }
      if (v.notes.length) repairs.push({ row: rowNo, column: table.headers[col[t]], raw, parsed: v.value.toFixed(2), note: v.notes.join(', ') });
      return v.value;
    };
    const rows = table.rows.map((r, i) => {
      const rowNo = i + 1, o = { rowNo };
      if (col.Date != null) {
        const raw = r[col.Date], d = parseDate(raw, order.order);
        if (d) {
          o.date = d.iso; o.day = d.day;
          if (d.iso !== String(raw).trim()) repairs.push({ row: rowNo, column: table.headers[col.Date], raw, parsed: d.iso, note: 'date rewritten as year-month-day' });
        } else if (String(raw).trim() !== '') problems.push({ row: rowNo, column: table.headers[col.Date], raw, note: 'not a date' });
      }
      o.description = col.Description != null ? r[col.Description] : '';
      o.reference = col.Reference != null ? r[col.Reference] : '';
      const debit = money(r, 'Debit', rowNo), credit = money(r, 'Credit', rowNo), amount = money(r, 'Amount', rowNo);
      if (col.Debit != null || col.Credit != null) {
        if (debit == null && credit == null) o.amount = null;
        else {
          o.amount = Math.abs(credit || 0) - Math.abs(debit || 0);
          if (debit && credit) problems.push({ row: rowNo, column: 'Debit and Credit', raw: debit + ' / ' + credit, note: 'both filled: the net was used' });
        }
      } else o.amount = amount;
      o.balance = money(r, 'Balance', rowNo);
      return o;
    });
    return { rows, decisions, repairs, problems, cols: col };
  }

  // ---------------------------------------------------------------- engine 3: balance attribution
  const cents = v => Math.round(v * 100);
  function isTransposition(x, y) {
    let a = String(Math.abs(x)), b = String(Math.abs(y));
    const n = Math.max(a.length, b.length);
    a = a.padStart(n, '0'); b = b.padStart(n, '0');
    const diff = [];
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) diff.push(i);
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }
  function isShift(x, y) {
    const a = Math.abs(x), b = Math.abs(y);
    return a !== 0 && b !== 0 && (a * 10 === b || b * 10 === a || a * 100 === b || b * 100 === a);
  }
  function findBreaks(items) {
    const out = [];
    for (let i = 1; i < items.length; i++) {
      const expected = items[i - 1].bal + items[i].a;
      if (expected !== items[i].bal) out.push({ i, expected, stated: items[i].bal, gap: items[i].bal - expected });
    }
    return out;
  }
  const fmt = c => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function attribute(rows) {
    const items = rows.filter(r => r.balance != null).map(r => ({
      rowNo: r.rowNo, date: r.date || '', description: r.description || '',
      a: r.amount == null ? 0 : cents(r.amount), bal: cents(r.balance)
    }));
    if (items.length < 2) return { items, breaks: [], findings: [], after: 0 };
    const breaks = findBreaks(items), byI = new Map(breaks.map(b => [b.i, b]));
    const used = new Set(), findings = [];
    for (const b of breaks) {
      if (used.has(b.i)) continue;
      const it = items[b.i], prev = items[b.i - 1], g = b.gap, a = it.a, next = byI.get(b.i + 1);
      const f = { rowNo: it.rowNo, description: it.description, gap: g, expected: b.expected, stated: b.stated };
      if (next && next.gap === -g) {
        used.add(next.i);
        const swap = isTransposition(b.stated, b.expected);
        f.kind = swap ? 'Two digits swapped in the balance' : 'Typo in the balance';
        f.conf = swap ? 0.95 : 0.85;
        f.why = 'The balance is off by ' + fmt(g) + ' on this row only: the next row is off by exactly the opposite, so the amounts are right and this one balance is wrong.';
        f.fix = 'Balance ' + fmt(b.stated) + ' should be ' + fmt(b.expected) + '.';
        f.correction = { type: 'set_balance', i: b.i, value: b.expected };
      } else if (a !== 0 && g === -a && prev.a === a && prev.date === it.date && prev.description === it.description) {
        f.kind = 'Duplicate row'; f.conf = 0.9;
        f.why = 'This row repeats the row above, and the balance did not move, so the bank counted it once.';
        f.fix = 'Remove the repeated row.';
        f.correction = { type: 'remove', i: b.i };
      } else if (a !== 0 && g === -2 * a) {
        f.kind = 'Amount in the wrong column'; f.conf = 0.9;
        f.why = 'The gap of ' + fmt(g) + ' is exactly twice the amount, which is what happens when a debit is entered as a credit or the reverse.';
        f.fix = 'Read ' + fmt(Math.abs(a)) + ' as a ' + (a > 0 ? 'debit' : 'credit') + '.';
        f.correction = { type: 'set_amount', i: b.i, value: -a };
      } else if (a !== 0 && Math.sign(a) === Math.sign(a + g) && isTransposition(a, a + g)) {
        f.kind = 'Two digits swapped in the amount'; f.conf = 0.9;
        f.why = 'The gap of ' + fmt(g) + ' divides by 9, the mark of swapped digits, and swapping two digits of the amount closes it exactly.';
        f.fix = 'Amount ' + fmt(Math.abs(a)) + ' should be ' + fmt(Math.abs(a + g)) + '.';
        f.correction = { type: 'set_amount', i: b.i, value: a + g };
      } else if (a !== 0 && Math.sign(a) === Math.sign(a + g) && isShift(a, a + g)) {
        f.kind = 'Decimal point shifted in the amount'; f.conf = 0.85;
        f.why = 'The balance moves by ' + fmt(Math.abs(a + g)) + ', the same digits as the amount with the decimal point moved.';
        f.fix = 'Amount ' + fmt(Math.abs(a)) + ' should be ' + fmt(Math.abs(a + g)) + '.';
        f.correction = { type: 'set_amount', i: b.i, value: a + g };
      } else if (a !== 0 && g === -a) {
        f.kind = 'Row not applied to the balance'; f.conf = 0.7;
        f.why = 'The balance did not move on this row, so the bank did not count it.';
        f.fix = 'Remove the row, or check it with the bank.';
        f.correction = { type: 'remove', i: b.i };
      } else {
        f.kind = 'Missing row'; f.conf = 0.6;
        f.why = 'No change to this row explains a gap of ' + fmt(g) + '. A line of that amount is probably missing above it.';
        f.fix = 'Add a ' + (g > 0 ? 'credit' : 'debit') + ' of ' + fmt(Math.abs(g)) + ' before this row.';
        f.correction = { type: 'insert', i: b.i, value: g };
      }
      findings.push(f);
    }
    // replay the proposed corrections and check the statement again
    const copy = items.map(x => Object.assign({}, x));
    for (const f of findings.slice().sort((x, y) => y.correction.i - x.correction.i)) {
      const c = f.correction;
      if (c.type === 'set_balance') copy[c.i].bal = c.value;
      else if (c.type === 'set_amount') copy[c.i].a = c.value;
      else if (c.type === 'remove') copy.splice(c.i, 1);
      else copy.splice(c.i, 0, { a: c.value, bal: copy[c.i - 1].bal + c.value });
    }
    return { items, breaks, findings, after: findBreaks(copy).length };
  }

  function analyseStatement(text) {
    const table = parseCSV(text);
    const mapping = mapColumns(table, 0);
    const clean = cleanTable(table, mapping);
    if (clean.cols.Balance == null) throw new Error('No balance column found.');
    if (clean.cols.Amount == null && clean.cols.Debit == null && clean.cols.Credit == null) throw new Error('No amount, debit or credit column found.');
    return Object.assign({ mapping, clean }, attribute(clean.rows));
  }

  // ---------------------------------------------------------------- engine 4: reconciliation
  const RULES = [
    { id: 'reference', label: 'Reference', desc: 'same amount and same reference' },
    { id: 'partial_reference', label: 'Partial reference', desc: 'same amount, one reference found inside the other line' },
    { id: 'amount_date', label: 'Amount and date', desc: 'same amount, dates within the tolerance' },
    { id: 'group', label: 'Group', desc: 'one line equals the sum of 2 to 4 lines' },
    { id: 'near_match', label: 'Near match', desc: 'same reference or a typo-shaped amount' }
  ];
  const APPROVE = 0.9;
  const normRef = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function loadEntries(text, prefix) {
    const t = parseCSV(text), h = t.headers.map(x => x.toLowerCase());
    const find = keys => h.findIndex(x => keys.some(k => x.startsWith(k)));
    const iD = find(['date']), iT = find(['desc', 'narr', 'detail', 'text']), iR = find(['ref']), iA = find(['amount', 'amt']);
    if (iD < 0 || iA < 0) throw new Error('Each file needs a Date and an Amount column.');
    const order = detectDateOrder(t.rows.map(r => r[iD])).order;
    const dec = detectDecimalMark(t.rows.map(r => r[iA])).mark;
    const out = [];
    t.rows.forEach((r, i) => {
      const d = parseDate(r[iD], order), a = parseMoney(r[iA], dec);
      if (!d || !a) return;
      const desc = iT >= 0 ? r[iT] : '', ref = iR >= 0 ? r[iR] : '';
      out.push({ id: prefix + (i + 1), date: d.iso, day: d.day, desc, ref, nref: normRef(ref), ntext: normRef(desc), amount: cents(a.value) });
    });
    return out;
  }

  function similarity(a, b) {
    const tok = s => new Set(String(s).toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3));
    const x = tok(a), y = tok(b);
    if (!x.size || !y.size) return 0;
    let both = 0;
    for (const w of x) if (y.has(w)) both++;
    return both / (x.size + y.size - both);
  }

  function combos(cands, target, maxSize) {
    const found = [];
    const walk = (start, left, picked) => {
      if (found.length > 1) return;
      if (left === 0 && picked.length >= 2) { found.push(picked.slice()); return; }
      if (picked.length === maxSize) return;
      for (let i = start; i < cands.length; i++) {
        picked.push(cands[i]);
        walk(i + 1, left - cands[i].amount, picked);
        picked.pop();
      }
    };
    walk(0, target, []);
    return found;
  }

  function reconcile(bank, book, opts) {
    const tol = opts.tolerance, on = opts.rules, opening = cents(opts.opening || 0);
    const mb = new Map(), mk = new Map(), matches = [];
    const freeB = () => bank.filter(b => !mb.has(b.id)), freeK = () => book.filter(k => !mk.has(k.id));
    const gap = (x, y) => Math.abs(x.day - y.day);
    const add = m => {
      m.diff = m.bank.reduce((s, x) => s + x.amount, 0) - m.book.reduce((s, x) => s + x.amount, 0);
      m.status = m.conf >= APPROVE ? 'approved' : 'review';
      matches.push(m);
      m.bank.forEach(x => mb.set(x.id, m)); m.book.forEach(x => mk.set(x.id, m));
    };
    const pair = (rule, base, test) => {
      for (const b of freeB()) {
        const c = freeK().filter(k => k.amount === b.amount && test(b, k)).sort((x, y) => gap(b, x) - gap(b, y));
        if (!c.length) continue;
        const late = gap(b, c[0]) > tol, many = c.length > 1;
        let conf = late ? 0.85 : base;
        const notes = [];
        if (late) notes.push(gap(b, c[0]) + ' days apart, outside the tolerance');
        if (many) { conf *= 0.7; notes.push(c.length + ' equally good partners'); }
        add({ rule, conf, bank: [b], book: [c[0]], note: notes.join('; ') });
      }
    };
    const run = {
      reference: () => pair('reference', 0.99, (b, k) => b.nref && b.nref === k.nref),
      partial_reference: () => pair('partial_reference', 0.95, (b, k) => {
        const sb = b.nref, sk = k.nref;
        return (sb.length >= 6 && (sk.includes(sb) || k.ntext.includes(sb))) || (sk.length >= 6 && (sb.includes(sk) || b.ntext.includes(sk)));
      }),
      amount_date: () => {
        const B = freeB(), K = freeK(), pairs = [];
        for (const b of B) for (const k of K) if (b.amount === k.amount && gap(b, k) <= tol)
          pairs.push({ b, k, days: gap(b, k), score: 0.80 - 0.02 * gap(b, k) + 0.15 * similarity(b.desc, k.desc) });
        const nb = {}, nk = {};
        for (const p of pairs) { nb[p.b.id] = (nb[p.b.id] || 0) + 1; nk[p.k.id] = (nk[p.k.id] || 0) + 1; }
        for (const p of pairs.sort((x, y) => y.score - x.score)) {
          if (mb.has(p.b.id) || mk.has(p.k.id)) continue;
          const many = nb[p.b.id] > 1 || nk[p.k.id] > 1;
          const notes = [p.days ? p.days + ' day' + (p.days > 1 ? 's' : '') + ' apart' : 'same day'];
          if (many) notes.push('several equally good partners');
          add({ rule: 'amount_date', conf: many ? p.score * 0.7 : p.score, bank: [p.b], book: [p.k], note: notes.join('; ') });
        }
      },
      group: () => {
        const side = (ones, others, bankSide) => {
          for (const x of ones()) {
            const c = others().filter(y => gap(x, y) <= tol && Math.sign(y.amount) === Math.sign(x.amount) && Math.abs(y.amount) < Math.abs(x.amount)).slice(0, 12);
            const f = combos(c, x.amount, 4);
            if (!f.length) continue;
            const m = { rule: 'group', conf: f.length > 1 ? 0.8 * 0.7 : 0.8, note: 'one line equals the sum of ' + f[0].length + (f.length > 1 ? '; more than one combination fits' : '') };
            m.bank = bankSide ? [x] : f[0]; m.book = bankSide ? f[0] : [x];
            add(m);
          }
        };
        side(freeB, freeK, true); side(freeK, freeB, false);
      },
      near_match: () => {
        for (const b of freeB()) {
          const K = freeK();
          let k = K.find(x => b.nref && x.nref === b.nref), conf = 0.85, note = 'same reference, different amount: posting error';
          if (!k) { k = K.find(x => gap(b, x) <= tol && Math.sign(x.amount) === Math.sign(b.amount) && isTransposition(b.amount, x.amount)); conf = 0.70; note = 'two digits swapped in the amount: posting error'; }
          if (!k) { k = K.find(x => gap(b, x) <= tol && Math.sign(x.amount) === Math.sign(b.amount) && isShift(b.amount, x.amount)); conf = 0.65; note = 'decimal point shifted: posting error'; }
          if (k) add({ rule: 'near_match', conf, bank: [b], book: [k], note });
        }
      }
    };
    for (const r of RULES) if (on[r.id]) run[r.id]();

    // explain rules for lines with no partner
    const bankOnly = freeB().map(b => {
      const d = b.desc.toLowerCase();
      let label = 'Not in the books', action = 'Find out what it is, then record it.';
      if (/fee|charge|commission/.test(d)) { label = 'Bank charges'; action = 'Record the charge in the books.'; }
      else if (/interest/.test(d)) { label = 'Interest credited'; action = 'Record the interest in the books.'; }
      else if (/dishono|returned|bounced|unpaid/.test(d)) { label = 'Dishonoured cheque'; action = 'Reverse the receipt in the books.'; }
      else if (/direct debit|standing order|autopay/.test(d)) { label = 'Direct debit'; action = 'Record the payment in the books.'; }
      return { entry: b, label, action };
    });
    const bookOnly = freeK().map(k => {
      const idx = book.indexOf(k);
      const twin = book.find((x, j) => x !== k && x.day === k.day && x.amount === k.amount && x.nref === k.nref && x.desc === k.desc && (mk.has(x.id) || j < idx));
      if (twin) return { entry: k, label: 'Duplicate entry in the books', action: 'Remove it: it repeats ' + twin.id + '.', duplicate: true };
      if (k.amount > 0) return { entry: k, label: 'Deposit in transit', action: 'None: the bank will show it later.' };
      const chq = /chq|cheque|check/i.test(k.desc + ' ' + k.ref);
      return { entry: k, label: chq ? 'Outstanding cheque' : 'Outstanding payment', action: 'None: the bank will show it later.' };
    });

    const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);
    const bankBal = opening + sum(bank, x => x.amount), bookBal = opening + sum(book, x => x.amount);
    const timing = sum(bookOnly.filter(x => !x.duplicate), x => x.entry.amount);
    const notInBooks = sum(bankOnly, x => x.entry.amount);
    const dups = sum(bookOnly.filter(x => x.duplicate), x => x.entry.amount);
    const errors = sum(matches, m => m.diff);
    const statement = {
      bankBal, timing, adjBank: bankBal + timing,
      bookBal, notInBooks, dups, errors, adjBook: bookBal + notInBooks - dups + errors
    };
    statement.balanced = statement.adjBank === statement.adjBook;

    const results = {};
    for (const m of matches) {
      const answer = m.bank.map(x => x.id).join('+') + '=' + m.book.map(x => x.id).join('+');
      m.bank.concat(m.book).forEach(x => { results[x.id] = { answer, rule: m.rule }; });
    }
    bankOnly.concat(bookOnly).forEach(x => { results[x.entry.id] = { answer: x.label, rule: '' }; });
    return { matches, bankOnly, bookOnly, statement, results };
  }

  function countChanges(base, other) {
    let answers = 0, rules = 0;
    for (const id of Object.keys(base)) {
      if (base[id].answer !== other[id].answer) answers++;
      else if (base[id].rule !== other[id].rule) rules++;
    }
    return { answers, rules };
  }

  const api = {
    parseCSV, parseMoney, parseDate, detectDateOrder, detectDecimalMark, mapColumns, cleanTable,
    attribute, analyseStatement, loadEntries, reconcile, countChanges, RULES, APPROVE, NATURE_LABEL, fmt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
