/* Interface of the AFC indicators toolkit (web prototype). All data stays in the browser. */
(function () {
  'use strict';
  const core = makeCore(SPEC);
  const KEY = 'afc-indicators-toolkit-v1';
  let S = null, C = null, tab = 'setup';
  let saveFailed = false, alertedSave = false, restoreInfo = null;
  const notices = {};
  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  };

  // ---------------------------------------------------------------- notices (banner under the header)
  function setNotice(id, text, kind, actions) {
    if (text) notices[id] = { text, kind: kind || 'warn', actions: actions || [] }; else delete notices[id];
    const host = $('#notice');
    if (!host) return;
    host.innerHTML = '';
    Object.keys(notices).forEach(k => {
      const n = notices[k];
      host.append(el('div', { class: 'notice ' + n.kind }, el('span', { text: n.text }), ...n.actions.map(a => el('button', { class: 'btn small', onclick: a.run, text: a.label }))));
    });
  }

  // ---------------------------------------------------------------- persistence
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
      if (saveFailed) { saveFailed = false; setNotice('save', ''); }
      return true;
    } catch (e) {
      saveFailed = true;
      setNotice('save', 'Changes are NOT saved in this browser (storage is blocked or full). Download the project (.json) to keep your work.', 'bad', [{ label: 'Download project', run: () => saveFile() }]);
      if (!alertedSave) { alertedSave = true; alert('Your changes cannot be saved in this browser (storage is blocked or full). The toolkit keeps working, but download the project (.json) to keep your work.'); }
      return false;
    }
  }
  // returns a validated, migrated project, or null (restoreInfo explains why, and keeps the raw data for recovery)
  function restore() {
    restoreInfo = null;
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return null; }
    if (!raw) return null;
    let obj;
    try { obj = JSON.parse(raw); } catch (e) { restoreInfo = { raw, errors: ['The saved data is not valid JSON.'], warnings: [] }; return null; }
    const v = core.validateProject(obj);
    if (!v.ok) { restoreInfo = { raw, errors: v.errors, warnings: [] }; return null; }
    restoreInfo = { raw: null, errors: [], warnings: v.warnings };
    return v.project;
  }
  let timer = null;
  function changed() { clearTimeout(timer); timer = setTimeout(save, 300); recalc(); }

  // ---------------------------------------------------------------- number parsing and formatting
  // Documented forms: 1234.5, 1,234.5, 1.234,5, (100), -100, 7.8%, 0.078, 7,8%. Malformed signs and groupings are rejected (NaN).
  // Empty or dash = missing (null). Mode: auto (default), en (comma = thousands) or eu (comma = decimal).
  function parseNum(t, mode) {
    if (t == null) return null;
    mode = mode || (S && S.settings && S.settings.numfmt) || 'auto';
    let s = String(t).trim().replace(/[€$£ \s]/g, '');
    if (s === '' || s === '-' || s === '–' || s === '—') return null;
    let neg = false, pct = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); if (/^[+\-−(]/.test(s)) return NaN; }
    const m = s.match(/^([+\-−])?(.*)$/);
    if (m[1]) { if (neg) return NaN; neg = m[1] !== '+'; }
    s = m[2];
    if (/^[+\-−]/.test(s)) return NaN;
    if (s.endsWith('%')) { pct = true; s = s.slice(0, -1); }
    if (!/^(?:[0-9][0-9.,]*|[.,][0-9]+)$/.test(s)) return NaN;
    const count = ch => s.split(ch).length - 1;
    const nC = count(','), nD = count('.');
    const grouped = (str, sep) => { const g = str.split(sep); return g[0].length >= 1 && g[0].length <= 3 && !(g[0] === '0' || (g[0].length > 1 && g[0][0] === '0')) && g.slice(1).every(x => x.length === 3); };
    let thousands = null, decimal = null;
    if (nC === 0 && nD === 0) { /* plain digits */ }
    else if (mode === 'en') { thousands = ','; decimal = '.'; }
    else if (mode === 'eu') { thousands = '.'; decimal = ','; }
    else if (nC > 0 && nD > 0) { decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.'; thousands = decimal === ',' ? '.' : ','; }
    else {
      const sep = nC > 0 ? ',' : '.', n = nC > 0 ? nC : nD, i = s.indexOf(sep);
      if (n > 1) thousands = sep;
      else {
        const after = s.length - i - 1, before = s.slice(0, i);
        if (sep === ',' && after === 3 && before !== '' && before !== '0') thousands = ','; else decimal = sep;
      }
    }
    let intStr = s, frac = '';
    if (decimal && s.includes(decimal)) {
      if (count(decimal) > 1) return NaN;
      const parts = s.split(decimal);
      if (parts.length !== 2 || parts[1] === '' || !/^[0-9]+$/.test(parts[1])) return NaN;
      intStr = parts[0]; frac = parts[1];
      if (thousands && intStr.includes(decimal)) return NaN;
    }
    if (thousands) {
      if (intStr.includes(thousands)) { if (!grouped(intStr, thousands)) return NaN; intStr = intStr.split(thousands).join(''); }
      else if (!/^[0-9]*$/.test(intStr)) return NaN;
    } else if (!/^[0-9]*$/.test(intStr)) return NaN;
    if (intStr === '' && frac === '') return NaN;
    const n = Number((intStr || '0') + (frac ? '.' + frac : ''));
    if (!isFinite(n)) return NaN;
    return (neg ? -1 : 1) * (pct ? n / 100 : n);
  }
  function fmt(v, f) {
    if (typeof v !== 'number' || !isFinite(v)) return 'n/a';
    if (v === 0) return '-';
    const a = Math.abs(v);
    const wrap = s => (v < 0 ? '(' + s + ')' : s);
    const grp = (x, d) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    switch (f) {
      case 'pct1': return wrap(grp(a * 100, 1) + '%');
      case 'pct2': return wrap(grp(a * 100, 2) + '%');
      case 'rat': return wrap(grp(a, 2));
      case 'mult': return wrap(grp(a, 1) + 'x');
      case 'days': return wrap(grp(a, 0));
      case 'd1': return wrap(grp(a, 1));
      case 'int': return wrap(grp(a, 0));
      default: return wrap(grp(a, 1));
    }
  }

  // ---------------------------------------------------------------- calc and status pill
  function recalc() {
    C = core.calc(S);
    const pill = $('#status');
    if (pill) {
      pill.textContent = C.CHK.status;
      pill.className = 'pill ' + (C.CHK.status === 'ALL CHECKS OK' ? 'ok' : C.CHK.status === 'CHECK THE DATA' ? 'bad' : 'warn');
    }
    const mini = $('#mini');
    if (mini) renderMini(mini);
    if (['reclass', 'ind'].includes(tab)) render();
  }
  function renderMini(host) {
    host.innerHTML = '';
    const R = C.R;
    const rows = [['Total assets', i => R.ta[i]], ['Total liabilities + equity', i => (typeof R.tl[i] === 'number' && typeof R.eq[i] === 'number') ? R.tl[i] + R.eq[i] : 'n/a'], ['Difference', i => R.balchk[i]]];
    const t = el('table', { class: 'mini' }, el('tr', {}, el('th', { text: 'Live check' }), ...S.settings.years.map(y => el('th', { text: y, class: 'num' }))));
    for (const [lab, f] of rows) t.append(el('tr', {}, el('td', { text: lab }), ...[0, 1, 2].map(i => el('td', { class: 'num', text: fmt(f(i), 'num') }))));
    host.append(t);
  }

  // ---------------------------------------------------------------- input grid with paste support
  const grids = {};
  function numInput(tblId, ri, ci, value, onSet, fmtKey) {
    const shown = v => (v == null ? '' : fmtKey === 'pct' ? String(Math.round(v * 1e6) / 1e4) + '%' : String(v));
    const inp = el('input', { type: 'text', inputmode: 'decimal', class: 'cell num', value: shown(value) });
    inp.addEventListener('change', () => {
      const n = parseNum(inp.value);
      let msg = '';
      if (Number.isNaN(n)) msg = 'Not a valid number. Examples: 1234.5, 1,234.5, 1.234,5, (100), 7.8%. Check the number format in Setup.';
      else if (fmtKey === 'pct' && n !== null && (n > 1 || n < 0)) msg = 'Type the rate as a percentage (7.8%) or as a fraction (0.078).';
      if (msg) { inp.classList.add('err'); inp.title = msg; return; }
      inp.classList.remove('err');
      inp.title = n === null ? '' : 'Read as ' + n;
      if (fmtKey === 'pct' && n !== null) inp.value = shown(n);
      onSet(n);
      changed();
    });
    inp.addEventListener('paste', ev => {
      const text = (ev.clipboardData || window.clipboardData).getData('text');
      if (!/[\t\n]/.test(text.trim())) return;
      ev.preventDefault();
      const data = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(l => l.split('\t'));
      const g = grids[tblId], touched = [];
      data.forEach((row, dr) => row.forEach((cell, dc) => {
        const target = g[ri + dr] && g[ri + dr][ci + dc];
        if (target) { target.value = cell; target.dispatchEvent(new Event('change')); touched.push(target); }
      }));
      const bad = touched.filter(t => t.classList.contains('err')).length;
      if (bad) setNotice('paste', `${bad} pasted cell${bad > 1 ? 's were' : ' was'} not applied (invalid number, highlighted in red). The other cells were applied.`, 'warn'); else setNotice('paste', '');
    });
    (grids[tblId][ri] = grids[tblId][ri] || [])[ci] = inp;
    return inp;
  }
  function select(options, value, onSet, cls) {
    const known = options.includes(value) || !value;
    const opts = ['', ...options]; if (!known) opts.push(value);
    const s = el('select', { class: 'cell ' + (cls || '') + (known ? '' : ' err'), title: known ? '' : 'Unknown value: the data check flags this line' }, opts.map(o => el('option', { value: o, text: o })));
    s.value = value || '';
    s.addEventListener('change', () => { onSet(s.value); changed(); });
    return s;
  }
  function textInput(value, onSet, cls, placeholder) {
    const i = el('input', { type: 'text', class: 'cell ' + (cls || ''), value: value || '', placeholder: placeholder || '' });
    i.addEventListener('change', () => { onSet(i.value); changed(); });
    return i;
  }

  // ---------------------------------------------------------------- tabs
  const TABS = [['setup', '1 Setup'], ['bs', '2 Balance sheet'], ['is', '3 Income statement'], ['sup', '4 Supplementary'], ['reclass', '5 Reclass and checks'], ['ind', '6 Indicators'], ['export', '7 Export']];
  function renderNav() {
    const nav = $('#nav'); if (!nav) return; nav.innerHTML = '';
    TABS.forEach(([id, label]) => nav.append(el('button', { class: 'tab' + (id === tab ? ' on' : ''), onclick: () => { tab = id; render(); }, text: label })));
  }
  function render() {
    renderNav();
    const m = $('#main'); if (!m) return; m.innerHTML = '';
    Object.keys(grids).forEach(k => delete grids[k]);
    ({ setup: viewSetup, bs: viewBS, is: viewIS, sup: viewSup, reclass: viewReclass, ind: viewInd, export: viewExport })[tab](m);
    const mini = $('#mini'); if (mini) renderMini(mini);
  }

  // ---------------------------------------------------------------- views
  function viewSetup(m) {
    const st = S.settings;
    const f = (label, input, note) => el('div', { class: 'field' }, el('label', { text: label }), input, note ? el('small', { text: note }) : null);
    const sel = (opts, value, onSet) => { const s = el('select', { class: 'cell' }, opts.map(([v, t]) => el('option', { value: v, text: t }))); s.value = value; s.addEventListener('change', () => { onSet(s.value); changed(); }); return s; };
    const scopeBox = el('div', { class: 'years' }, st.years.map((y, i) => { const c = el('input', { type: 'checkbox' }); c.checked = !!st.scope[i]; c.addEventListener('change', () => { st.scope[i] = c.checked; changed(); }); return el('label', { class: 'chk' }, c, ' ' + y); }));
    m.append(
      el('h2', { text: 'Setup' }),
      el('p', { class: 'lead', text: 'Type the figures of the financial statements (as reported), check the data checks, read the indicators, then export to Excel. Everything stays in this browser: nothing is sent anywhere.' }),
      el('div', { class: 'grid2' },
        f('Company name', textInput(st.company, v => { st.company = v; }, '', 'e.g. Campari Group')),
        f('Unit label', textInput(st.unit, v => { st.unit = v; }, '', '€ m')),
        f('Unit multiplier (units per 1 in the statements)', textInput(String(st.mult), v => { const n = parseNum(v); st.mult = Number.isFinite(n) && n > 0 ? n : 1000000; }, 'num'), '1,000,000 if the statements are in millions. Used only for EPS.'),
        f('Check tolerance', textInput(String(st.tol), v => { const n = parseNum(v); st.tol = Number.isFinite(n) && n >= 0 ? n : 1; }, 'num'), 'Same unit as the statements. The lectures accept a difference of 1.'),
        f('Residual income: capital basis', sel([['1', '1 = equity + financial liabilities (lecture 08)'], ['2', '2 = reclassified invested capital (equity + NFP)']], String(st.basis), v => { st.basis = Number(v); }), 'State your choice on the slide: the two bases differ by the cash and financial assets deducted from debt.'),
        f('Number format', sel([['auto', 'Automatic: 1,234.5 and 1.234,5 both understood'], ['en', 'English: comma = thousands, point = decimal'], ['eu', 'European: point = thousands, comma = decimal']], st.numfmt || 'auto', v => { st.numfmt = v; }), 'Automatic reads 0,078 as 0.078 and a lone 1,234 as 1234 (thousands) but a lone 1.234 as 1.234 (decimal). Choose English or European to remove any doubt. Malformed numbers are rejected.'),
        f('Year labels (oldest first)', el('div', { class: 'years' }, st.years.map((y, i) => textInput(y, v => { st.years[i] = v || ('Y' + i); }, 'num'))), 'Type the labels, then tick the years in scope below.'),
        f('Years in scope', scopeBox, 'Untick a year the report does not contain (for example a report with only two years). The status judges completeness on the ticked years only.')),
      el('div', { class: 'row' },
        el('button', { class: 'btn', onclick: () => load(core.loadExample(EXAMPLES.campari)), text: 'Load the Campari example' }),
        el('button', { class: 'btn ghost', onclick: () => { if (confirm('Clear all data?')) load(core.blankState()); }, text: 'Clear everything' }),
        el('button', { class: 'btn ghost', onclick: saveFile, text: 'Save project (.json)' }),
        el('label', { class: 'btn ghost' }, 'Open project (.json)', el('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: openFile }))),
      el('h3', { text: 'How to use' }),
      el('ol', {}, el('li', { text: 'Balance sheet: enter the lines as reported, positive. Check the block and tag of each line; use the spare lines for anything new. You can paste a block of numbers from Excel.' }),
        el('li', { text: 'Income statement: enter the profit effect of each line (income +, costs -). Hidden personnel costs and depreciation come from the notes or the cash flow statement.' }),
        el('li', { text: 'Supplementary data: interest expense, dividends, shares, CFFO and capex are required by the indicators; cost of capital k is needed only for residual income. Leave a cell empty if a figure is missing: it stays n/a. Type 0 only if the figure really is zero.' }),
        el('li', { text: 'Reclass and checks: ALL CHECKS OK means every year in scope reconciles and has all the required inputs. It does not mean that the numbers match the report: check them against the source.' }),
        el('li', { text: 'Indicators and export. No page reference, no number: write the source page in the last column.' })),
      el('p', { class: 'note', text: 'This is a prototype. The Excel toolkit remains the reference; compare the results before relying on them. If you use AI to fill it, record it in the AI_Log sheet of the export.' }));
  }

  function lineRow(tbl, ri, l, kind) {
    const tr = el('tr', {});
    tr.append(el('td', {}, textInput(l.label, v => { l.label = v; }, 'label')));
    if (kind === 'bs') {
      tr.append(el('td', {}, select(core.BLOCKS, l.block, v => { l.block = v; }, 'blk')), el('td', {}, select(core.BTAGS, l.tag, v => { l.tag = v; }, 'tag')),
        el('td', { class: 'ctr' }, (() => { const c = el('input', { type: 'checkbox', title: 'Quick asset' }); c.checked = !!l.q; c.addEventListener('change', () => { l.q = c.checked; changed(); }); return c; })()));
    } else {
      tr.append(el('td', {}, select(core.ITAGS, l.tag, v => { l.tag = v; }, 'tag')));
    }
    [0, 1, 2].forEach(y => tr.append(el('td', {}, numInput(tbl, ri, y, l.v[y], n => { l.v[y] = n; }))));
    tr.append(el('td', {}, textInput(l.src, v => { l.src = v; }, 'src', l.hint || 'Source page / note')));
    return tr;
  }
  function viewBS(m) {
    grids.bs = [];
    const t = el('table', { class: 'inputs' }, el('thead', {}, el('tr', {}, el('th', { text: 'Line item' }), el('th', { text: 'Block' }), el('th', { text: 'Tag' }), el('th', { text: 'Quick' }), ...S.settings.years.map(y => el('th', { class: 'num', text: y })), el('th', { text: 'Source page / note' }))));
    const body = el('tbody', {}); let ri = 0;
    for (const l of S.bs) {
      if (l.sec) { body.append(el('tr', { class: 'sec' }, el('td', { colspan: 8, text: l.sec }))); continue; }
      body.append(lineRow('bs', ri++, l, 'bs'));
    }
    t.append(body);
    m.append(el('h2', { text: 'Balance sheet' }), el('p', { class: 'lead', text: 'Lines as reported, positive numbers. Block: CA/NCA/AHFS assets, CL/NCL/LHFS liabilities, EQ equity. Tag: how the line is reclassified (FA fixed assets, OWC operating working capital, PROV provisions, HFS held for sale, CASH cash and financial assets, DEBT_ST / DEBT_LT financial debt, EQ equity). An empty cell is a missing figure; type 0 only for a real zero.' }),
      el('div', { id: 'mini' }), el('div', { class: 'scroll' }, t));
  }
  function viewIS(m) {
    grids.is = [];
    const t = el('table', { class: 'inputs' }, el('thead', {}, el('tr', {}, el('th', { text: 'Line item' }), el('th', { text: 'Tag' }), ...S.settings.years.map(y => el('th', { class: 'num', text: y })), el('th', { text: 'Source page / note' }))));
    const body = el('tbody', {});
    S.is.forEach((l, i) => body.append(lineRow('is', i, l, 'is')));
    t.append(body);
    m.append(el('h2', { text: 'Income statement' }), el('p', { class: 'lead', text: 'Enter the profit effect of each line: income +, costs -. If the statement is by function (cost of sales, SG&A), put the cost lines on GA, add depreciation back from the cash flow statement on its own DA line and subtract the same amount from GA, so that EBIT stays unchanged.' }), el('div', { id: 'mini' }), el('div', { class: 'scroll' }, t));
  }
  function viewSup(m) {
    grids.sup = [];
    const t = el('table', { class: 'inputs' }, el('thead', {}, el('tr', {}, el('th', { text: 'Item' }), ...S.settings.years.map(y => el('th', { class: 'num', text: y })), el('th', { text: 'Source page / note' }))));
    const body = el('tbody', {});
    SPEC.SUP.forEach((it, i) => {
      const k = it[0];
      const tr = el('tr', {}, el('td', { text: it[1] + (core.REQUIRED_SUP.includes(k) ? ' *' : '') }));
      [0, 1, 2].forEach(y => tr.append(el('td', {}, numInput('sup', i, y, S.sup[k][y], n => { S.sup[k][y] = n; }, it[2] === 'pct' ? 'pct' : ''))));
      tr.append(el('td', {}, textInput(S.supsrc[k], v => { S.supsrc[k] = v; }, 'src', it[3])));
      body.append(tr);
    });
    const tr = el('tr', {}, el('td', { text: 'Net profit of the year before the first column (first payout ratio only)' }), el('td', {}, numInput('sup', SPEC.SUP.length, 0, S.niprev, n => { S.niprev = n; })), el('td', {}), el('td', {}), el('td', { class: 'hint', text: 'Optional. Leave empty if unknown: the first payout shows n/a' }));
    body.append(tr);
    t.append(body);
    m.append(el('h2', { text: 'Supplementary data' }), el('p', { class: 'lead', text: 'Figures the indicators need that are not in the reclassified statements. Items marked * are required for a year to count as complete. Cost of capital k: type 7.8% or 0.078. An empty cell is missing (n/a), an explicit 0 is a number.' }), el('div', { id: 'mini' }), el('div', { class: 'scroll' }, t));
  }

  function statusClass() { return C.CHK.status === 'ALL CHECKS OK' ? 'ok' : C.CHK.status === 'CHECK THE DATA' ? 'bad' : 'warn'; }
  function viewReclass(m) {
    const R = C.R, Y = C.CHK.years;
    const head = el('thead', {}, el('tr', {}, el('th', { text: 'Reclassified item' }), ...S.settings.years.map(y => el('th', { class: 'num', text: y }))));
    const body = el('tbody', {});
    for (const v of core.RECLASS_VIEW) {
      if (v[0] === 'SEC') { body.append(el('tr', { class: 'sec' }, el('td', { colspan: 4, text: v[1] }))); continue; }
      body.append(el('tr', { class: v[2] ? 'strong' : '' }, el('td', { text: v[1] }), ...[0, 1, 2].map(i => el('td', { class: 'num', text: fmt(R[v[0]][i], 'num') }))));
    }
    const yearTable = el('table', { class: 'checks wide' }, el('thead', {}, el('tr', {}, ...['Year', 'In scope', 'Balance sheet', 'Income statement', 'Required inputs', 'State', 'Missing'].map(t => el('th', { text: t })))),
      el('tbody', {}, Y.map((y, i) => el('tr', {}, el('td', { text: S.settings.years[i] }), el('td', { text: y.inScope ? 'yes' : 'no' }), el('td', { text: y.hasBS ? 'entered' : 'empty' }), el('td', { text: y.hasIS ? 'entered' : 'empty' }),
        el('td', { text: y.supN + ' of ' + core.REQUIRED_SUP.length }), el('td', { class: 'st ' + (y.state === 'complete' ? 'ok' : y.state === 'partial' ? 'bad' : 'na'), text: y.state }), el('td', { class: 'hint', text: y.missing.join('; ') })))));
    const chk = el('table', { class: 'checks' }, el('thead', {}, el('tr', {}, el('th', { text: 'Reconciliation check' }), ...S.settings.years.map(y => el('th', { class: 'num', text: y })))),
      el('tbody', {}, core.CHECK_VIEW.map(([k, lab]) => el('tr', {}, el('td', { text: lab }), ...[0, 1, 2].map(i => { const v = C.CHK.rows[k][i]; return el('td', { class: 'num st ' + (v === 'OK' ? 'ok' : v === 'CHECK' ? 'bad' : 'na'), text: v === 'n/a' ? 'not run' : v }); })))));
    const optRun = Y.reduce((s, y) => s + y.optionalNotRun, 0);
    const bad = C.CHK.bad.length ? el('div', {}, el('h3', { text: 'Lines with a missing or unknown block or tag' }),
      el('table', { class: 'checks wide' }, el('thead', {}, el('tr', {}, ...['Statement', 'Line', 'Year', 'Block', 'Tag', 'Problem'].map(t => el('th', { text: t })))),
        el('tbody', {}, C.CHK.bad.map(b => el('tr', {}, el('td', { text: b.sheet }), el('td', { text: b.label }), el('td', { text: S.settings.years[b.year] }), el('td', { text: b.block || '(empty)' }), el('td', { text: b.tag || '(empty)' }), el('td', { class: 'st bad', text: b.reason })))))) : null;
    const src = C.CHK.sources;
    m.append(el('h2', { text: 'Reclass and checks' }), el('div', { class: 'statusbig ' + statusClass(), text: C.CHK.status }),
      el('p', { class: 'lead', text: 'ALL CHECKS OK means: every year in scope reconciles and has the balance sheet, the income statement and the five required supplementary inputs. It does not certify that the numbers match the report.' }),
      el('h3', { text: 'Status by year' }), yearTable,
      el('h3', { text: 'Reconciliations' }), chk,
      el('p', { class: 'note', text: optRun ? `Optional checks not run: ${optRun} (reported net profit and reported total assets are not typed). They are not counted as passed.` : 'Optional checks (reported net profit, reported total assets) were run.' }),
      bad,
      el('h3', { text: 'Source references (separate check, not part of the status)' }),
      el('p', { class: 'note', text: `${src.withRef} of ${src.total} values used have a page or note typed. A reference that is typed is not proof that the figure was checked against the report.${src.missing.length ? ' Without reference: ' + src.missing.slice(0, 10).join(', ') + (src.missing.length > 10 ? ', ...' : '') + '.' : ''}` }),
      el('div', { class: 'scroll' }, el('table', { class: 'results' }, head, body)));
  }

  function viewInd(m) {
    const I = C.IND;
    const body = el('tbody', {});
    for (const s of core.IND_SPEC) {
      if (s[0] === 'SEC') { body.append(el('tr', { class: 'sec' }, el('td', { colspan: 6, text: s[1] }))); continue; }
      const [key, label, text, fk] = s;
      body.append(el('tr', { class: label.startsWith(' ') ? 'sub' : '' }, el('td', { text: label.trim(), class: 'l' }), el('td', { class: 'f', text }),
        ...[0, 1, 2].map(i => el('td', { class: 'num' + (I[key][i] === 'n/a' ? ' na' : ''), title: C.WHY[key][i], text: fmt(I[key][i], fk) })), el('td', { class: 'hint', text: SPEC.NOTES[key] || '' })));
    }
    const t = el('table', { class: 'results ind' }, el('thead', {}, el('tr', {}, el('th', { text: 'Indicator' }), el('th', { text: 'Course formula' }), ...S.settings.years.map(y => el('th', { class: 'num', text: y })), el('th', { text: 'Reading note' }))), body);
    m.append(el('h2', { text: 'Indicators' }), el('div', { class: 'statusbig small ' + statusClass(), text: 'Data checks: ' + C.CHK.status }),
      el('p', { class: 'lead', text: 'n/a = a needed input is missing (hover the cell to see which one); it is never shown as zero. Choose the five or six indicators that test the critical issues of the brief; do not report them all. Read changes in points for percentages, and in currency units when a value changes sign.' }), el('div', { class: 'scroll' }, t));
    // residual income sensitivity
    let y = 2; while (y > 0 && !core.isNum(C.R.ebit[y])) y--;
    const ebit = C.R.ebit[y], ric = C.IND.ric[y];
    if (core.isNum(ebit) && core.isNum(ric) && ric !== 0) {
      const k0 = core.isNum(C.IND.rik[y]) ? C.IND.rik[y] : 0.08;
      const ks = []; for (let d = -4; d <= 4; d++) ks.push(Math.round((k0 + d * 0.005) * 1e4) / 1e4);
      const be = ebit / ric;
      const isBase = k => Math.abs(k - k0) < 1e-9;
      const headRow = el('tr', {}, el('th', { text: 'k' }));
      const valRow = el('tr', {}, el('td', { text: 'Residual income' }));
      ks.forEach(k => {
        headRow.append(el('th', { class: 'num' + (isBase(k) ? ' base' : ''), text: fmt(k, 'pct1') }));
        valRow.append(el('td', { class: 'num' + (isBase(k) ? ' base' : ''), text: fmt(ebit - k * ric, 'num') }));
      });
      const sens = el('table', { class: 'results sens' }, el('thead', {}, headRow), el('tbody', {}, valRow));
      const beText = 'Break-even k = EBIT / invested capital = ' + (be * 100).toFixed(2) + '%. EBIT is pre-tax while the cost of capital in annual reports is usually post-tax: state this limit when you use residual income.';
      m.append(el('h3', { text: 'Residual income: sensitivity to k (' + S.settings.years[y] + ')' }), el('div', { class: 'scroll' }, sens), el('p', { class: 'note', text: beText }));
    }
  }

  function viewExport(m) {
    m.append(el('h2', { text: 'Export' }),
      el('p', { class: 'lead', text: 'Downloads an .xlsx with the sheets Inputs, Reclass, Indicators and AI_Log. Formulas are live (as in the Excel toolkit), the years in scope are on Inputs row 11, and the values are already calculated, so previews show numbers too. Common size, peer and benchmark are not in the prototype: use the full Excel toolkit for those.' }),
      el('div', { class: 'row' },
        el('button', { class: 'btn', id: 'dl', onclick: exportXlsx, text: 'Download Excel (.xlsx)' }),
        el('button', { class: 'btn ghost', onclick: saveFile, text: 'Save project (.json)' })),
      el('p', { id: 'msg', class: 'note' }));
    if (typeof ExcelJS === 'undefined') $('#msg').textContent = 'The Excel library did not load (offline?). Reload the page with an internet connection, or save the project (.json).';
  }

  // ---------------------------------------------------------------- actions
  // The candidate is validated and migrated first; the active project and the saved copy change only after that succeeds.
  function load(state) {
    const v = core.validateProject(state);
    if (!v.ok) { alert('The project was not loaded and nothing was changed.\n' + v.errors.join('\n')); return false; }
    S = v.project; save(); tab = 'setup'; recalc(); render();
    setNotice('migrate', v.warnings.join(' '), 'warn');
    return true;
  }
  function download(name, blob) {
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const fname = ext => ((S.settings.company || 'Company').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 40) || 'Company') + '_Indicators.' + ext;
  function saveFile() { download(fname('json'), new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' })); }
  function openFile(ev) {
    const f = ev.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      let o;
      try { o = JSON.parse(r.result); } catch (e) { alert('Could not open the file: it is not valid JSON. Nothing was changed.'); return; }
      load(o);
    };
    r.readAsText(f);
  }
  async function exportXlsx() {
    const msg = $('#msg');
    try {
      if (typeof ExcelJS === 'undefined') throw new Error('Excel library not loaded');
      const wb = core.buildWorkbook(ExcelJS, S);
      const buf = await wb.xlsx.writeBuffer();
      download(fname('xlsx'), new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      msg.textContent = 'Done. Open the file and check the Reclass status cell before using the numbers.';
    } catch (e) { msg.textContent = 'Export failed: ' + e.message; }
  }

  // ---------------------------------------------------------------- start
  let bootText = '';
  S = restore();
  if (S) {
    if (restoreInfo && restoreInfo.warnings.length) bootText = 'Your saved project was loaded. ' + restoreInfo.warnings.join(' ');
  } else {
    S = core.blankState();
    if (restoreInfo && restoreInfo.raw) {
      try { localStorage.setItem(KEY + '-backup', restoreInfo.raw); } catch (e) { /* ignore */ }
      bootText = 'The saved project could not be restored (' + restoreInfo.errors.slice(0, 3).join(' ') + ') and a blank project was started. The saved data was NOT erased: it is kept as a backup in this browser. Use "Download backup" before you change anything.';
    }
  }
  if (bootText) alert(bootText);
  document.addEventListener('DOMContentLoaded', () => {
    recalc(); render();
    if (bootText) setNotice('boot', bootText, restoreInfo && restoreInfo.raw ? 'bad' : 'warn', restoreInfo && restoreInfo.raw ? [{ label: 'Download backup', run: () => download('afc-toolkit-backup.json', new Blob([restoreInfo.raw], { type: 'application/json' })) }] : []);
  });
})();
