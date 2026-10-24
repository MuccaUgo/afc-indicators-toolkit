/* Interface of the AFC indicators toolkit (web prototype). All data stays in the browser. */
(function () {
  'use strict';
  const core = makeCore(SPEC);
  const KEY = 'afc-indicators-toolkit-v1';
  let S = null, C = null, tab = 'setup';
  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  };

  // ---------------------------------------------------------------- persistence
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage may be blocked */ } }
  function restore() { try { const t = localStorage.getItem(KEY); if (t) return JSON.parse(t); } catch (e) { /* ignore */ } return null; }
  let timer = null;
  function changed() { clearTimeout(timer); timer = setTimeout(save, 300); recalc(); }

  // ---------------------------------------------------------------- number parsing and formatting
  function parseNum(t) {
    if (t == null) return null;
    let s = String(t).trim().replace(/[€$£\s ]/g, '');
    if (s === '' || s === '-' || s === '–') return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (s.startsWith('−') || s.startsWith('-')) { neg = !neg; s = s.slice(1); }
    let pct = false;
    if (s.endsWith('%')) { pct = true; s = s.slice(0, -1); }
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc >= 0 && ld >= 0) { if (lc > ld) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); }
    else if (lc >= 0) { const parts = s.split(','); s = (parts.length === 2 && parts[1].length !== 3) ? parts[0] + '.' + parts[1] : s.replace(/,/g, ''); }
    const n = Number(s);
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
    pill.textContent = C.CHK.status;
    pill.className = 'pill ' + (C.CHK.status === 'ALL CHECKS OK' ? 'ok' : C.CHK.status === 'CHECK THE DATA' ? 'bad' : 'warn');
    const mini = $('#mini');
    if (mini) renderMini(mini);
    if (['reclass', 'ind'].includes(tab)) render();
  }
  function renderMini(host) {
    host.innerHTML = '';
    const R = C.R;
    const rows = [['Total assets', 'ta'], ['Total liabilities + equity', null], ['Difference', 'balchk']];
    const t = el('table', { class: 'mini' }, el('tr', {}, el('th', { text: 'Live check' }), ...S.settings.years.map(y => el('th', { text: y, class: 'num' }))));
    for (const [lab, key] of rows) {
      t.append(el('tr', {}, el('td', { text: lab }), ...[0, 1, 2].map(i => el('td', { class: 'num', text: fmt(key ? R[key][i] : R.tl[i] + R.eq[i], 'num') }))));
    }
    host.append(t);
  }

  // ---------------------------------------------------------------- input grid with paste support
  const grids = {};
  function numInput(tblId, ri, ci, value, onSet, fmtKey) {
    const inp = el('input', { type: 'text', inputmode: 'decimal', class: 'cell num', value: value == null ? '' : String(fmtKey === 'pct' && value != null ? Math.round(value * 1e6) / 1e4 + '%' : value) });
    inp.addEventListener('change', () => {
      const n = parseNum(inp.value);
      if (Number.isNaN(n)) { inp.classList.add('err'); return; }
      inp.classList.remove('err');
      onSet(n);
      changed();
    });
    inp.addEventListener('paste', ev => {
      const text = (ev.clipboardData || window.clipboardData).getData('text');
      if (!/[\t\n]/.test(text.trim())) return;
      ev.preventDefault();
      const data = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(l => l.split('\t'));
      const g = grids[tblId];
      data.forEach((row, dr) => row.forEach((cell, dc) => {
        const target = g[ri + dr] && g[ri + dr][ci + dc];
        if (target) { target.value = cell; target.dispatchEvent(new Event('change')); }
      }));
    });
    (grids[tblId][ri] = grids[tblId][ri] || [])[ci] = inp;
    return inp;
  }
  function select(options, value, onSet, cls) {
    const s = el('select', { class: 'cell ' + (cls || '') }, el('option', { value: '', text: '' }), options.map(o => el('option', { value: o, text: o })));
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
    const nav = $('#nav'); nav.innerHTML = '';
    TABS.forEach(([id, label]) => nav.append(el('button', { class: 'tab' + (id === tab ? ' on' : ''), onclick: () => { tab = id; render(); } , text: label })));
  }
  function render() {
    renderNav();
    const m = $('#main'); m.innerHTML = '';
    Object.keys(grids).forEach(k => delete grids[k]);
    ({ setup: viewSetup, bs: viewBS, is: viewIS, sup: viewSup, reclass: viewReclass, ind: viewInd, export: viewExport })[tab](m);
    const mini = $('#mini'); if (mini) renderMini(mini);
  }

  function yearHead(first, last) { return [first, ...S.settings.years.map(y => el('th', { class: 'num', text: y })), last]; }

  // ---------------------------------------------------------------- views
  function viewSetup(m) {
    const st = S.settings;
    const f = (label, input, note) => el('div', { class: 'field' }, el('label', { text: label }), input, note ? el('small', { text: note }) : null);
    m.append(
      el('h2', { text: 'Setup' }),
      el('p', { class: 'lead', text: 'Type the figures of the financial statements (as reported), check the data checks, read the indicators, then export to Excel. Everything stays in this browser: nothing is sent anywhere.' }),
      el('div', { class: 'grid2' },
        f('Company name', textInput(st.company, v => { st.company = v; }, '', 'e.g. Campari Group')),
        f('Unit label', textInput(st.unit, v => { st.unit = v; }, '', '€ m')),
        f('Unit multiplier (units per 1 in the statements)', textInput(String(st.mult), v => { const n = parseNum(v); st.mult = Number.isFinite(n) ? n : 1000000; }, 'num'), '1,000,000 if the statements are in millions. Used only for EPS.'),
        f('Check tolerance', textInput(String(st.tol), v => { const n = parseNum(v); st.tol = Number.isFinite(n) ? n : 1; }, 'num'), 'Same unit as the statements. The lectures accept a difference of 1.'),
        f('Residual income: capital basis', (() => { const s = el('select', { class: 'cell' }, el('option', { value: '1', text: '1 = equity + financial liabilities (lecture 08)' }), el('option', { value: '2', text: '2 = reclassified invested capital (equity + NFP)' })); s.value = String(st.basis); s.addEventListener('change', () => { st.basis = Number(s.value); changed(); }); return s; })(), 'State your choice on the slide: the two bases differ by the cash and financial assets deducted from debt.'),
        f('Year labels (oldest first)', el('div', { class: 'years' }, st.years.map((y, i) => textInput(y, v => { st.years[i] = v || ('Y' + i); }, 'num'))), 'Leave the oldest year empty if the report has only two years.')),
      el('div', { class: 'row' },
        el('button', { class: 'btn', onclick: () => load(core.loadExample(EXAMPLES.campari)), text: 'Load the Campari example' }),
        el('button', { class: 'btn ghost', onclick: () => { if (confirm('Clear all data?')) load(core.blankState()); }, text: 'Clear everything' }),
        el('button', { class: 'btn ghost', onclick: saveFile, text: 'Save project (.json)' }),
        el('label', { class: 'btn ghost' }, 'Open project (.json)', el('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: openFile }))),
      el('h3', { text: 'How to use' }),
      el('ol', {}, el('li', { text: 'Balance sheet: enter the lines as reported, positive. Check the block and tag of each line; use the spare lines for anything new. You can paste a block of numbers from Excel. Both 1,234.5 and 1.234,5 are understood; a lone 1.234 is read as the decimal 1.234.' }),
        el('li', { text: 'Income statement: enter the profit effect of each line (income +, costs -). Hidden personnel costs and depreciation come from the notes or the cash flow statement.' }),
        el('li', { text: 'Supplementary data: interest expense, dividends, shares, CFFO, capex, cost of capital k.' }),
        el('li', { text: 'Reclass and checks: the status must not be CHECK THE DATA. "OK FOR 2 OF 3 YEARS" means a year is empty. This is not a completed analysis.' }),
        el('li', { text: 'Indicators and export. No page reference, no number: write the source page in the last column.' })),
      el('p', { class: 'note', text: 'This is a prototype. The Excel toolkit remains the reference; compare the results before relying on them. Check every figure against the source report. If you use AI to fill it, record it in the AI_Log sheet of the export.' }));
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
    m.append(el('h2', { text: 'Balance sheet' }), el('p', { class: 'lead', text: 'Lines as reported, positive numbers. Block: CA/NCA/AHFS assets, CL/NCL/LHFS liabilities, EQ equity. Tag: how the line is reclassified (FA fixed assets, OWC operating working capital, PROV provisions, HFS held for sale, CASH cash and financial assets, DEBT_ST / DEBT_LT financial debt, EQ equity).' }),
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
      const tr = el('tr', {}, el('td', { text: it[1] }));
      [0, 1, 2].forEach(y => tr.append(el('td', {}, numInput('sup', i, y, S.sup[k][y], n => { S.sup[k][y] = n; }, it[2] === 'pct' ? 'pct' : ''))));
      tr.append(el('td', {}, textInput(S.supsrc[k], v => { S.supsrc[k] = v; }, 'src', it[3])));
      body.append(tr);
    });
    const tr = el('tr', {}, el('td', { text: 'Net profit of the year before the first column (first payout ratio only)' }), el('td', {}, numInput('sup', SPEC.SUP.length, 0, S.niprev, n => { S.niprev = n; })), el('td', {}), el('td', {}), el('td', { class: 'hint', text: 'Optional. Leave empty if unknown: the first payout shows n/a' }));
    body.append(tr);
    t.append(body);
    m.append(el('h2', { text: 'Supplementary data' }), el('p', { class: 'lead', text: 'Figures the indicators need that are not in the reclassified statements. Cost of capital k: type 7.8% or 0.078.' }), el('div', { id: 'mini' }), el('div', { class: 'scroll' }, t));
  }

  function viewReclass(m) {
    const R = C.R;
    const head = el('thead', {}, el('tr', {}, el('th', { text: 'Reclassified item' }), ...S.settings.years.map(y => el('th', { class: 'num', text: y }))));
    const body = el('tbody', {});
    for (const v of core.RECLASS_VIEW) {
      if (v[0] === 'SEC') { body.append(el('tr', { class: 'sec' }, el('td', { colspan: 4, text: v[1] }))); continue; }
      body.append(el('tr', { class: v[2] ? 'strong' : '' }, el('td', { text: v[1] }), ...[0, 1, 2].map(i => el('td', { class: 'num', text: fmt(R[v[0]][i], 'num') }))));
    }
    const chk = el('table', { class: 'checks' }, el('thead', {}, el('tr', {}, el('th', { text: 'Data check' }), ...S.settings.years.map(y => el('th', { class: 'num', text: y })))),
      el('tbody', {}, core.CHECK_VIEW.map(([k, lab]) => el('tr', {}, el('td', { text: lab }), ...[0, 1, 2].map(i => { const v = C.CHK.rows[k][i]; return el('td', { class: 'num st ' + (v === 'OK' ? 'ok' : v === 'CHECK' ? 'bad' : 'na'), text: v }); })))));
    m.append(el('h2', { text: 'Reclass and checks' }), el('div', { class: 'statusbig ' + (C.CHK.status === 'ALL CHECKS OK' ? 'ok' : C.CHK.status === 'CHECK THE DATA' ? 'bad' : 'warn'), text: C.CHK.status }),
      el('p', { class: 'lead', text: 'ALL CHECKS OK needs all three years filled and passing. A year left empty shows n/a and is counted as not filled; nothing is read as complete until you decide the scope.' }), chk,
      el('div', { class: 'scroll' }, el('table', { class: 'results' }, head, body)));
  }

  function viewInd(m) {
    const I = C.IND;
    const body = el('tbody', {});
    for (const s of core.IND_SPEC) {
      if (s[0] === 'SEC') { body.append(el('tr', { class: 'sec' }, el('td', { colspan: 6, text: s[1] }))); continue; }
      const [key, label, text, fk] = s;
      body.append(el('tr', { class: label.startsWith(' ') ? 'sub' : '' }, el('td', { text: label.trim(), class: 'l' }), el('td', { class: 'f', text }), ...[0, 1, 2].map(i => el('td', { class: 'num', text: fmt(I[key][i], fk) })), el('td', { class: 'hint', text: SPEC.NOTES[key] || '' })));
    }
    const t = el('table', { class: 'results ind' }, el('thead', {}, el('tr', {}, el('th', { text: 'Indicator' }), el('th', { text: 'Course formula' }), ...S.settings.years.map(y => el('th', { class: 'num', text: y })), el('th', { text: 'Reading note' }))), body);
    m.append(el('h2', { text: 'Indicators' }), el('div', { class: 'statusbig small ' + (C.CHK.status === 'ALL CHECKS OK' ? 'ok' : C.CHK.status === 'CHECK THE DATA' ? 'bad' : 'warn'), text: 'Data checks: ' + C.CHK.status }),
      el('p', { class: 'lead', text: 'Choose the five or six indicators that test the critical issues of the brief; do not report them all. Read changes in points for percentages, and in currency units when a value changes sign.' }), el('div', { class: 'scroll' }, t));
    // residual income sensitivity
    let y = 2; while (y > 0 && C.R.ebit[y] === 0 && C.R.eq[y] === 0) y--;
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
      el('p', { class: 'lead', text: 'Downloads an .xlsx with the sheets Inputs, Reclass, Indicators and AI_Log. Formulas are live (as in the Excel toolkit) and the values are already calculated, so previews show numbers too. Common size, peer and benchmark are not in the prototype: use the full Excel toolkit for those.' }),
      el('div', { class: 'row' },
        el('button', { class: 'btn', id: 'dl', onclick: exportXlsx, text: 'Download Excel (.xlsx)' }),
        el('button', { class: 'btn ghost', onclick: saveFile, text: 'Save project (.json)' })),
      el('p', { id: 'msg', class: 'note' }));
    if (typeof ExcelJS === 'undefined') $('#msg').textContent = 'The Excel library did not load (offline?). Reload the page with an internet connection, or save the project (.json).';
  }

  // ---------------------------------------------------------------- actions
  function load(state) { S = state; save(); tab = 'setup'; recalc(); render(); }
  function download(name, blob) {
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const fname = ext => ((S.settings.company || 'Company').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 40) || 'Company') + '_Indicators.' + ext;
  function saveFile() { download(fname('json'), new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' })); }
  function openFile(ev) {
    const f = ev.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { const o = JSON.parse(r.result); if (!o.bs || !o.is || !o.sup) throw new Error('not a project file'); load(o); } catch (e) { alert('Could not open the file: ' + e.message); } };
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
  S = restore();
  if (!S || !S.bs || !S.is || !S.sup) S = core.blankState();
  // keep stored projects compatible when the line list grows
  if (S.bs.filter(l => !l.sec).length !== core.blankState().bs.filter(l => !l.sec).length) S = core.blankState();
  document.addEventListener('DOMContentLoaded', () => { recalc(); render(); });
})();
