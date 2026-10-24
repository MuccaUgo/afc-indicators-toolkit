/* AFC Challenge 1 indicators toolkit: calculation core and Excel export.
   Same logic as the Excel toolkit (reclassification by block and tag, data checks, 24 indicators, residual income). */
function makeCore(SPEC) {
  'use strict';
  const NY = 3;
  const BLOCKS = ['CA', 'NCA', 'AHFS', 'CL', 'NCL', 'LHFS', 'EQ'];
  const BTAGS = ['FA', 'OWC', 'PROV', 'HFS', 'CASH', 'DEBT_ST', 'DEBT_LT', 'EQ'];
  const ITAGS = ['REV_OP', 'REV_OTH', 'RAW', 'PERS', 'DA', 'GA', 'FIN', 'INV', 'EXTR', 'TAX'];
  const NA = 'n/a';

  // ------------------------------------------------------------------ state
  function blankState() {
    const bs = [];
    for (const it of SPEC.BS) {
      if (it[0] === 'SEC') bs.push({ sec: it[1] });
      else bs.push({ key: it[0], label: it[1], block: it[2], tag: it[3], q: it[4] === 'Y', hint: it[5], src: '', v: [null, null, null] });
    }
    const is = SPEC.IS.map(it => ({ key: it[0], label: it[1], tag: it[2], hint: it[3], src: '', v: [null, null, null] }));
    const sup = {}, supsrc = {};
    for (const it of SPEC.SUP) { sup[it[0]] = [null, null, null]; supsrc[it[0]] = ''; }
    return { settings: { company: '', unit: '€ m', mult: 1000000, basis: 1, tol: 1, years: ['Y-2', 'Y-1', 'Y'] }, bs, is, sup, supsrc, niprev: null };
  }

  function loadExample(ex) {
    const S = blankState();
    Object.assign(S.settings, ex.settings);
    const lines = S.bs.filter(l => !l.sec);
    ex.bs.forEach((e, i) => { if (lines[i]) Object.assign(lines[i], { label: e.label, block: e.block, tag: e.tag, q: !!e.q, src: e.src || '', v: e.v.slice() }); });
    ex.is.forEach((e, i) => { if (S.is[i]) Object.assign(S.is[i], { label: e.label, tag: e.tag, src: e.src || '', v: e.v.slice() }); });
    for (const k of Object.keys(S.sup)) { if (ex.sup[k]) S.sup[k] = ex.sup[k].slice(); S.supsrc[k] = (ex.supsrc && ex.supsrc[k]) || ''; }
    S.niprev = ex.niprev == null ? null : ex.niprev;
    return S;
  }

  // ------------------------------------------------------------------ helpers
  const isNum = x => typeof x === 'number' && isFinite(x);
  const z = x => (isNum(x) ? x : 0);
  const sign = b => (!b ? 0 : (b === 'CA' || b === 'NCA' || b === 'AHFS') ? 1 : -1);
  // Excel: IFERROR(a/b,"n/a")
  const div = (a, b) => (isNum(a) && isNum(b) && b !== 0 && isFinite(a / b)) ? a / b : NA;
  const mul = (a, b) => (isNum(a) && isNum(b)) ? a * b : NA;
  const sub = (a, b) => (isNum(a) && isNum(b)) ? a - b : NA;
  const roundUp = x => (isNum(x) ? Math.sign(x) * Math.ceil(Math.abs(x) - 1e-12) : NA);
  const sup = (S, k, y) => (S.sup[k] ? S.sup[k][y] : null);

  // ------------------------------------------------------------------ calculation
  function calc(S) {
    const lines = S.bs.filter(l => !l.sec);
    const byKey = {}; lines.forEach(l => { if (l.key) byKey[l.key] = l; });
    const tol = z(S.settings.tol);
    const R = {}, IND = {}, CHK = {};
    const keys = ['fa', 'nwc', 'prov', 'hfs', 'ic', 'dst', 'dlt', 'fl', 'cashfin', 'nfp', 'eq', 'cov', 'diff', 'ta', 'tl', 'nfl', 'ca', 'cl', 'qa', 'balchk', 'untagbs',
      'rev', 'raw', 'ga', 'va', 'pers', 'ebitda', 'da', 'ebit', 'fin', 'invinc', 'ebtx', 'extr', 'ebt', 'tax', 'ni', 'repni', 'nidiff', 'sales', 'untagis'];
    keys.forEach(k => { R[k] = []; });
    for (let y = 0; y < NY; y++) {
      const sumTag = t => lines.reduce((s, l) => s + (l.tag === t ? sign(l.block) * z(l.v[y]) : 0), 0);
      const sumBlk = bl => lines.reduce((s, l) => s + (bl.includes(l.block) ? z(l.v[y]) : 0), 0);
      const sumI = t => S.is.reduce((s, l) => s + (l.tag === t ? z(l.v[y]) : 0), 0);
      const r = {};
      r.fa = sumTag('FA'); r.nwc = sumTag('OWC'); r.prov = -sumTag('PROV'); r.hfs = sumTag('HFS');
      r.ic = r.fa + r.nwc - r.prov + r.hfs;
      r.dst = -sumTag('DEBT_ST'); r.dlt = -sumTag('DEBT_LT'); r.fl = r.dst + r.dlt;
      r.cashfin = sumTag('CASH'); r.nfp = r.fl - r.cashfin; r.eq = -sumTag('EQ');
      r.cov = r.eq + r.nfp; r.diff = r.ic - r.cov;
      r.ta = sumBlk(['CA', 'NCA', 'AHFS']); r.tl = sumBlk(['CL', 'NCL', 'LHFS']); r.nfl = r.tl - r.fl;
      r.ca = sumBlk(['CA']); r.cl = sumBlk(['CL']);
      r.qa = lines.reduce((s, l) => s + (l.q ? z(l.v[y]) : 0), 0);
      r.balchk = r.ta - r.tl - r.eq;
      r.untagbs = lines.reduce((s, l) => s + (((l.tag === '' || !l.tag || l.block === '' || !l.block) && z(l.v[y]) !== 0) ? 1 : 0), 0);
      r.rev = sumI('REV_OP') + sumI('REV_OTH'); r.raw = sumI('RAW'); r.ga = sumI('GA');
      r.va = r.rev + r.raw + r.ga; r.pers = sumI('PERS'); r.ebitda = r.va + r.pers; r.da = sumI('DA'); r.ebit = r.ebitda + r.da;
      r.fin = sumI('FIN'); r.invinc = sumI('INV'); r.ebtx = r.ebit + r.fin + r.invinc; r.extr = sumI('EXTR'); r.ebt = r.ebtx + r.extr;
      r.tax = sumI('TAX'); r.ni = r.ebt + r.tax;
      const rn = sup(S, 'repni', y);
      r.repni = isNum(rn) ? rn : NA;
      r.nidiff = isNum(r.repni) ? r.ni - r.repni : NA;
      r.sales = sumI('REV_OP');
      r.untagis = S.is.reduce((s, l) => s + (((!l.tag) && z(l.v[y]) !== 0) ? 1 : 0), 0);
      keys.forEach(k => R[k].push(r[k]));
    }
    // data checks
    const ck = { c_bal: [], c_cov: [], c_ni: [], c_ta: [], c_tag: [] };
    for (let y = 0; y < NY; y++) {
      ck.c_bal.push(R.ta[y] === 0 ? NA : (Math.abs(R.balchk[y]) <= tol ? 'OK' : 'CHECK'));
      ck.c_cov.push(R.ic[y] === 0 ? NA : (Math.abs(R.diff[y]) <= tol ? 'OK' : 'CHECK'));
      ck.c_ni.push(isNum(R.nidiff[y]) ? (Math.abs(R.nidiff[y]) <= tol ? 'OK' : 'CHECK') : NA);
      const rta = sup(S, 'repta', y);
      ck.c_ta.push(!isNum(rta) ? NA : (Math.abs(R.ta[y] - rta) <= tol ? 'OK' : 'CHECK'));
      ck.c_tag.push(R.untagbs[y] + R.untagis[y] === 0 ? 'OK' : 'CHECK');
    }
    const all = [].concat(ck.c_bal, ck.c_cov, ck.c_ni, ck.c_ta, ck.c_tag);
    const nOK = ck.c_bal.filter(x => x === 'OK').length;
    let status;
    if (all.includes('CHECK')) status = 'CHECK THE DATA';
    else if (nOK === 0) status = 'NO DATA YET';
    else if (nOK === NY) status = 'ALL CHECKS OK';
    else status = `OK FOR ${nOK} OF ${NY} YEARS (${NY - nOK} NOT FILLED)`;
    CHK.rows = ck; CHK.status = status;

    // indicators
    const mult = z(S.settings.mult);
    const k = ['roe', 'eps', 'payout', 'sgr', 'npm', 'roi', 'roa', 'roce', 'ebitm', 'ebitdam', 'qoe', 'atr', 'de_tl', 'de_fl', 'de_nfp', 'icr', 'cod', 'etr',
      'cur', 'quick', 'invt', 'dso_x', 'dso', 'dpo_x', 'dpo', 'cfd', 'std', 'cxc', 'ric', 'rik', 'ri'];
    k.forEach(x => { IND[x] = []; });
    for (let y = 0; y < NY; y++) {
      const g = key => R[key][y];
      const s = key => z(sup(S, key, y));
      const I = {};
      I.roe = div(g('ni'), g('eq'));
      I.eps = div(g('ni') * mult, s('shares'));
      I.payout = y === 0 ? div(s('div'), z(S.niprev)) : div(s('div'), R.ni[y - 1]);
      I.sgr = (isNum(I.roe) && isNum(I.payout)) ? I.roe * (1 - I.payout) : NA;
      I.npm = div(g('ni'), g('sales'));
      I.roi = div(g('ebit'), g('ta') - g('nfl'));
      I.roa = div(g('ebit'), g('ta'));
      I.roce = div(g('ebit'), g('eq') + g('dlt'));
      I.ebitm = div(g('ebit'), g('sales'));
      I.ebitdam = div(g('ebitda'), g('sales'));
      I.qoe = div(s('cffo'), g('ebit'));
      I.atr = div(g('sales'), g('ta'));
      I.de_tl = div(g('tl'), g('eq')); I.de_fl = div(g('fl'), g('eq')); I.de_nfp = div(g('nfp'), g('eq'));
      I.icr = div(g('ebit'), s('intexp')); I.cod = div(s('intexp'), g('fl')); I.etr = div(-g('tax'), g('ebt'));
      I.cur = div(g('ca'), g('cl')); I.quick = div(g('qa'), g('cl'));
      const inv = byKey.inv ? z(byKey.inv.v[y]) : 0;
      I.invt = div(g('sales'), inv);
      const trec = byKey.trec ? z(byKey.trec.v[y]) : 0, tpay = byKey.tpay ? z(byKey.tpay.v[y]) : 0;
      const d1 = div(trec, g('sales')); I.dso_x = isNum(d1) ? d1 * 365 : NA; I.dso = roundUp(I.dso_x);
      const d2 = div(tpay, -g('raw')); I.dpo_x = isNum(d2) ? d2 * 365 : NA; I.dpo = roundUp(I.dpo_x);
      I.cfd = div(s('cffo'), g('fl')); I.std = div(s('cffo'), g('dst')); I.cxc = div(s('cffo'), s('capex'));
      I.ric = z(S.settings.basis) === 2 ? g('ic') : g('eq') + g('fl');
      const kk = sup(S, 'k', y);
      I.rik = isNum(kk) ? kk : NA;
      I.ri = isNum(I.rik) ? g('ebit') - I.rik * I.ric : NA;
      k.forEach(x => IND[x].push(I[x]));
    }
    return { R, IND, CHK, lines };
  }

  // ------------------------------------------------------------------ indicator catalogue (labels, formula text, format)
  const IND_SPEC = [
    ['SEC', "1. SHAREHOLDERS' PERSPECTIVE (profitability, accrual)"],
    ['roe', 'ROE', 'Net profit / total equity', 'pct2'],
    ['eps', 'Earnings per share', 'Net profit x unit multiplier / weighted average shares', 'rat'],
    ['payout', 'Payout ratio', 'Dividends / net profit of the previous year', 'pct2'],
    ['sgr', 'Sustainable growth rate', 'ROE x (1 - payout ratio)', 'pct2'],
    ['npm', 'Net profit margin', 'Net profit / sales from operations', 'pct2'],
    ['SEC', '2. OVERALL COMPANY PERSPECTIVE (profitability, accrual)'],
    ['roi', 'ROI', 'EBIT / (total assets - non-financial liabilities)', 'pct2'],
    ['roa', 'ROA', 'EBIT / total assets', 'pct2'],
    ['roce', 'ROCE', 'EBIT / (equity + non-current financial liabilities)', 'pct2'],
    ['ebitm', 'EBIT margin (ROS)', 'EBIT / sales from operations', 'pct2'],
    ['ebitdam', 'EBITDA margin', 'EBITDA / sales from operations', 'pct2'],
    ['qoe', 'Quality of operating earnings', 'CFFO / EBIT', 'pct2'],
    ['atr', 'Asset turnover', 'Sales from operations / total assets', 'rat'],
    ['SEC', "3. OTHER STAKEHOLDERS' PERSPECTIVE (profitability, accrual)"],
    ['de_tl', 'Debt to equity: total liabilities', 'Total liabilities / total equity (lecture 08 default)', 'rat'],
    ['de_fl', 'Debt to equity: financial liabilities', 'Financial liabilities (explicit interest rate) / total equity', 'rat'],
    ['de_nfp', 'Debt to equity: net financial position', 'Net financial position / total equity', 'rat'],
    ['icr', 'Interest coverage ratio', 'EBIT / interest expense', 'mult'],
    ['cod', 'Cost of debt', 'Interest expense / financial liabilities', 'pct2'],
    ['etr', 'Effective tax rate', 'Income taxes / pre-tax profit', 'pct2'],
    ['SEC', '4. ALL ACTORS: LIQUIDITY (accrual basis)'],
    ['cur', 'Current ratio', 'Current assets / current liabilities', 'rat'],
    ['quick', 'Quick ratio', '(Cash + financial assets + receivables) / current liabilities', 'rat'],
    ['invt', 'Inventory turnover', 'Sales from operations / inventories', 'rat'],
    ['dso', 'DSO (days, rounded up)', 'Trade receivables / sales from operations x 365, rounded up (lecture 10)', 'days'],
    ['dso_x', '   DSO, exact', 'Same, without rounding (lecture 08 shows the nearest day)', 'd1'],
    ['dpo', 'DPO (days, rounded up)', 'Trade payables / purchases x 365, rounded up (lecture 10)', 'days'],
    ['dpo_x', '   DPO, exact', 'Same, without rounding. Purchases = raw materials line', 'd1'],
    ['SEC', '4b. ALL ACTORS: LIQUIDITY (cash basis)'],
    ['cfd', 'Cash flow to debt', 'CFFO / total financial liabilities', 'pct2'],
    ['std', 'Short-term debt coverage', 'CFFO / current financial liabilities', 'pct2'],
    ['cxc', 'Capex coverage', 'CFFO / capex', 'pct2'],
    ['SEC', '5. VALUE: ABSOLUTE INDICATOR'],
    ['ric', 'Invested capital for residual income', 'Setting 1: equity + financial liabilities; setting 2: reclassified invested capital', 'num'],
    ['rik', 'Cost of capital k', 'From the annual report (Inputs)', 'pct1'],
    ['ri', 'Residual income', 'EBIT - k x invested capital', 'num'],
  ];

  // ------------------------------------------------------------------ Excel export (live formulas with cached results)
  const INP = ['F', 'G', 'H'], OUT = ['C', 'D', 'E'];
  const FMT = { num: '#,##0.0;(#,##0.0);"-"', int: '#,##0', pct1: '0.0%;(0.0%);"-"', pct2: '0.00%;(0.00%);"-"', rat: '0.00;(0.00);"-"', mult: '0.0"x";(0.0"x");"-"', days: '0;(0);"-"', d1: '0.0' };

  function layout(S) {
    // row numbers on the Inputs sheet, same as the Excel toolkit
    const L = { bs: {}, bsRows: [], isRows: [], sup: {} };
    let r = 14; L.bs0 = r;
    for (const it of S.bs) { L.bsRows.push(r); if (it.key) L.bs[it.key] = r; r++; }
    L.bs1 = r - 1;
    r += 1; L.isBand = r; r += 1; L.isHead = r; r += 1; L.is0 = r;
    for (let i = 0; i < S.is.length; i++) { L.isRows.push(r); r++; }
    L.is1 = r - 1;
    r += 1; L.supBand = r; r += 1; L.supHead = r; r += 1;
    for (const it of SPEC.SUP) { L.sup[it[0]] = r; r++; }
    L.niprev = r;
    return L;
  }

  function buildWorkbook(ExcelJS, S) {
    const C = calc(S);
    const L = layout(S);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'AFC indicators toolkit (web prototype)';
    const FN = 'Arial';
    const NAVY = 'FF12263A', TEAL = 'FF1F7A8C', BLUE = 'FF0000FF', GREY = 'FF5B6770', GREEN = 'FF008000';
    const fillIn = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    const fillSec = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDE8E6' } };
    const fillSub = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3F1' } };
    const fillHdr = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    const thin = { style: 'thin', color: { argb: 'FFC9CFD3' } };
    const border = { left: thin, right: thin, top: thin, bottom: thin };
    const put = (ws, ref, value, o = {}) => {
      const c = ws.getCell(ref);
      c.value = value;
      c.font = { name: FN, size: o.size || 10, bold: !!o.bold, italic: !!o.italic, color: { argb: o.color || 'FF000000' } };
      if (o.fill) c.fill = o.fill;
      if (o.fmt) c.numFmt = o.fmt;
      if (o.border) c.border = border;
      c.alignment = { horizontal: o.h, vertical: 'middle', wrapText: !!o.wrap };
      return c;
    };
    const F = (formula, result) => ({ formula, result });
    const band = (ws, row, text, lastCol) => { for (let c = 1; c <= lastCol; c++) { const cell = ws.getCell(row, c); cell.fill = fillHdr; cell.font = { name: FN, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }; } ws.getCell(row, 1).value = text; };
    const cfStatus = (ws, ref, ok, bad) => ws.addConditionalFormatting({ ref, rules: [
      { type: 'cellIs', operator: 'equal', formulae: [`"${ok}"`], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' }, bold: true } } },
      { type: 'cellIs', operator: 'equal', formulae: [`"${bad}"`], priority: 2, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' }, bold: true } } }] });
    const cfAmber = (ws, ref) => ws.addConditionalFormatting({ ref, rules: [{ type: 'expression', formulae: [`AND(${ref.split(':')[0]}<>"ALL CHECKS OK",${ref.split(':')[0]}<>"CHECK THE DATA")`], priority: 3,
      style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } }, font: { color: { argb: 'FF9C5700' }, bold: true } } }] });

    // ---------------- README
    const rd = wb.addWorksheet('README');
    rd.getColumn(1).width = 26; rd.getColumn(2).width = 120;
    put(rd, 'A1', 'AFC Challenge 1 - indicators toolkit (web prototype export)', { bold: true, size: 14 });
    const rl = [
      ['What this is', 'Exported from the web prototype. Inputs, Reclass and Indicators keep live formulas, as in the Excel toolkit, so you can keep editing in Excel.'],
      ['Sheets', 'Inputs (type here, blue on yellow), Reclass (reclassified statements and data checks), Indicators (the 24 course indicators and residual income), AI_Log (audit trail for annex A5).'],
      ['Not included', 'Common size, peer sheets and benchmark: use the full Excel toolkit for those.'],
      ['Status cell', 'Reclass!C2 says ALL CHECKS OK only when all three years are filled and pass. OK FOR n OF 3 YEARS means a year is empty; NO DATA YET means nothing is filled. Neither is a completed analysis.'],
      ['Rule', 'No page reference, no number. Adjusted or non-IFRS figures must be labelled as such. Check every figure against the source before it goes in the deck.'],
      ['Exported', new Date().toISOString().slice(0, 10)],
    ];
    rl.forEach((x, i) => { put(rd, `A${3 + i}`, x[0], { bold: true }); put(rd, `B${3 + i}`, x[1], { wrap: true }); });

    // ---------------- Inputs
    const wi = wb.addWorksheet('Inputs');
    [62, 8, 11, 8, 6, 14, 14, 14, 70].forEach((w, i) => { wi.getColumn(i + 1).width = w; });
    put(wi, 'A1', 'INPUTS - ' + (S.settings.company || 'COMPANY').toUpperCase(), { bold: true, size: 14 });
    put(wi, 'A2', 'Blue on yellow = type here. Black = formula. Balance sheet: enter lines as reported, POSITIVE. Income statement: enter the PROFIT EFFECT (income +, costs -).', { italic: true, color: GREY });
    band(wi, 4, 'SETTINGS', 9);
    const st = S.settings;
    [[5, 'Company name', st.company, null, ''], [6, 'Unit label (for headers)', st.unit, null, ''], [7, 'Unit multiplier (units per 1 in the statements)', st.mult, '#,##0', '1,000,000 if the statements are in millions. Used only for EPS.'],
      [8, 'Residual income: capital basis (1 or 2)', st.basis, '0', '1 = equity + financial liabilities (lecture 08 definition); 2 = reclassified invested capital (equity + NFP)'],
      [9, 'Check tolerance (same unit as the statements)', st.tol, '#,##0', 'The lectures accept a difference of 1 from approximation']].forEach(([r, lab, v, f, n]) => {
      put(wi, `A${r}`, lab); put(wi, `F${r}`, v, { color: BLUE, fill: fillIn, fmt: f, border: true, h: 'right' }); put(wi, `I${r}`, n, { color: GREY, italic: true });
    });
    wi.getCell('F8').dataValidation = { type: 'list', allowBlank: false, formulae: ['"1,2"'] };
    put(wi, 'A10', 'Year labels (type once; they feed every sheet)');
    INP.forEach((c, i) => put(wi, `${c}10`, st.years[i], { color: BLUE, fill: fillIn, border: true, h: 'right', bold: true }));
    put(wi, 'I10', 'Oldest year first. Text, e.g. 2023', { color: GREY, italic: true });
    band(wi, 12, 'BALANCE SHEET (positive numbers, as reported)', 9);
    ['Line item', 'Block', 'Reclass tag', 'Quick?', 'Sign'].forEach((t, i) => put(wi, `${'ABCDE'[i]}13`, t, { bold: true, fill: fillSub, border: true, h: i ? 'center' : undefined }));
    INP.forEach(c => put(wi, `${c}13`, F(`${c}$10`, st.years[INP.indexOf(c)]), { bold: true, fill: fillSub, border: true, h: 'right' }));
    put(wi, 'I13', 'Source page / note', { bold: true, fill: fillSub, border: true });
    S.bs.forEach((it, i) => {
      const r = L.bsRows[i];
      if (it.sec) { put(wi, `A${r}`, it.sec, { bold: true, fill: fillSec }); 'BCDEFGHI'.split('').forEach(c => { wi.getCell(`${c}${r}`).fill = fillSec; }); return; }
      put(wi, `A${r}`, it.label, { border: true });
      put(wi, `B${r}`, it.block || '', { color: BLUE, fill: fillIn, border: true, h: 'center' });
      put(wi, `C${r}`, it.tag || '', { color: BLUE, fill: fillIn, border: true, h: 'center' });
      put(wi, `D${r}`, it.q ? 'Y' : '', { color: BLUE, fill: fillIn, border: true, h: 'center' });
      put(wi, `E${r}`, F(`IF(B${r}="",0,IF(OR(B${r}="CA",B${r}="NCA",B${r}="AHFS"),1,-1))`, sign(it.block)), { border: true, h: 'center' });
      INP.forEach((c, y) => put(wi, `${c}${r}`, isNum(it.v[y]) ? it.v[y] : null, { color: BLUE, fill: fillIn, fmt: FMT.num, border: true }));
      put(wi, `I${r}`, it.src || it.hint || '', { color: GREY, italic: true });
    });
    S.bs.forEach((it, i) => {
      if (it.sec) return; const r = L.bsRows[i];
      wi.getCell(`B${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${BLOCKS.join(',')}"`] };
      wi.getCell(`C${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${BTAGS.join(',')}"`] };
      wi.getCell(`D${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Y"'] };
    });
    band(wi, L.isBand, 'INCOME STATEMENT (profit effect: income +, costs -)', 9);
    put(wi, `A${L.isHead}`, 'Line item', { bold: true, fill: fillSub, border: true }); put(wi, `C${L.isHead}`, 'Reclass tag', { bold: true, fill: fillSub, border: true, h: 'center' });
    ['B', 'D', 'E'].forEach(c => put(wi, `${c}${L.isHead}`, null, { fill: fillSub, border: true }));
    INP.forEach((c, y) => put(wi, `${c}${L.isHead}`, F(`${c}$10`, st.years[y]), { bold: true, fill: fillSub, border: true, h: 'right' }));
    put(wi, `I${L.isHead}`, 'Source page / note', { bold: true, fill: fillSub, border: true });
    S.is.forEach((it, i) => {
      const r = L.isRows[i];
      put(wi, `A${r}`, it.label, { border: true });
      put(wi, `C${r}`, it.tag || '', { color: BLUE, fill: fillIn, border: true, h: 'center' });
      wi.getCell(`C${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${ITAGS.join(',')}"`] };
      INP.forEach((c, y) => put(wi, `${c}${r}`, isNum(it.v[y]) ? it.v[y] : null, { color: BLUE, fill: fillIn, fmt: FMT.num, border: true }));
      put(wi, `I${r}`, it.src || it.hint || '', { color: GREY, italic: true });
    });
    band(wi, L.supBand, 'SUPPLEMENTARY DATA FOR THE INDICATORS', 9);
    put(wi, `A${L.supHead}`, 'Item', { bold: true, fill: fillSub, border: true });
    ['B', 'C', 'D', 'E'].forEach(c => put(wi, `${c}${L.supHead}`, null, { fill: fillSub, border: true }));
    INP.forEach((c, y) => put(wi, `${c}${L.supHead}`, F(`${c}$10`, st.years[y]), { bold: true, fill: fillSub, border: true, h: 'right' }));
    put(wi, `I${L.supHead}`, 'Source page / note', { bold: true, fill: fillSub, border: true });
    for (const it of SPEC.SUP) {
      const r = L.sup[it[0]];
      put(wi, `A${r}`, it[1], { border: true });
      INP.forEach((c, y) => put(wi, `${c}${r}`, isNum(S.sup[it[0]][y]) ? S.sup[it[0]][y] : null, { color: BLUE, fill: fillIn, fmt: it[2] === 'pct' ? '0.0%' : it[2] === 'int' ? FMT.int : FMT.num, border: true }));
      put(wi, `I${r}`, S.supsrc[it[0]] || it[3], { color: GREY, italic: true });
    }
    put(wi, `A${L.niprev}`, 'Net profit of the year before the first column (first payout ratio only)', { border: true });
    put(wi, `F${L.niprev}`, isNum(S.niprev) ? S.niprev : null, { color: BLUE, fill: fillIn, fmt: FMT.num, border: true });
    put(wi, `I${L.niprev}`, 'Optional. Leave empty if unknown: the first payout then shows n/a', { color: GREY, italic: true });
    wi.views = [{ state: 'frozen', ySplit: 13, xSplit: 1 }];

    // ---------------- Reclass
    const wr = wb.addWorksheet('Reclass');
    [58, 50, 14, 14, 14].forEach((w, i) => { wr.getColumn(i + 1).width = w; });
    const bs0 = L.bs0, bs1 = L.bs1, is0 = L.is0, is1 = L.is1;
    const BLK = `Inputs!$B$${bs0}:$B$${bs1}`, TAG = `Inputs!$C$${bs0}:$C$${bs1}`, QCK = `Inputs!$D$${bs0}:$D$${bs1}`, SGN = `Inputs!$E$${bs0}:$E$${bs1}`, TAGI = `Inputs!$C$${is0}:$C$${is1}`;
    const TOL = 'Inputs!$F$9';
    const val = ci => `Inputs!${ci}$${bs0}:${ci}$${bs1}`, vali = ci => `Inputs!${ci}$${is0}:${ci}$${is1}`;
    const spb = (tag, ci) => `SUMPRODUCT((${TAG}="${tag}")*${SGN}*${val(ci)})`;
    const spi = (tag, ci) => `SUMPRODUCT((${TAGI}="${tag}")*${vali(ci)})`;
    const supRef = (key, ci) => `Inputs!${ci}${L.sup[key]}`;
    // key, label, note, formula(ci, co, R), bold, fmt
    const rows = [
      ['SEC', 'RECLASSIFIED BALANCE SHEET: where capital is invested and who funds it'],
      ['fa', 'Fixed assets (non-current assets)', 'Tag FA', (ci, co) => spb('FA', ci), false],
      ['nwc', 'Net working capital (operating)', 'Tag OWC: operating assets - operating liabilities', (ci, co) => spb('OWC', ci), false],
      ['prov', 'Provisions (deducted)', 'Tag PROV, shown positive', (ci, co) => '-' + spb('PROV', ci), false],
      ['hfs', 'Net assets held for sale', 'Tag HFS: assets - liabilities', (ci, co) => spb('HFS', ci), false],
      ['ic', 'INVESTED CAPITAL', 'Fixed assets + NWC - provisions + net assets held for sale', (ci, co, R) => `${co}${R.fa}+${co}${R.nwc}-${co}${R.prov}+${co}${R.hfs}`, true],
      ['BL'],
      ['dst', 'Financial debt: current (borrowings + current leases)', 'Tag DEBT_ST', (ci) => '-' + spb('DEBT_ST', ci), false],
      ['dlt', 'Financial debt: non-current (borrowings + leases)', 'Tag DEBT_LT', (ci) => '-' + spb('DEBT_LT', ci), false],
      ['fl', 'Total financial liabilities (explicit interest rate)', 'Current + non-current', (ci, co, R) => `${co}${R.dst}+${co}${R.dlt}`, false],
      ['cashfin', 'Cash and financial assets deducted from debt', 'Tag CASH', (ci) => spb('CASH', ci), false],
      ['nfp', 'NET FINANCIAL POSITION', 'Financial liabilities - cash and financial assets', (ci, co, R) => `${co}${R.fl}-${co}${R.cashfin}`, true],
      ['eq', "Shareholders' equity (total)", 'Tag EQ', (ci) => '-' + spb('EQ', ci), false],
      ['cov', 'COVERAGE (equity + NFP)', 'Must equal invested capital', (ci, co, R) => `${co}${R.eq}+${co}${R.nfp}`, true],
      ['diff', 'Difference: invested capital - coverage', 'Must be about 0 (tolerance in Inputs)', (ci, co, R) => `${co}${R.ic}-${co}${R.cov}`, false],
      ['BL'],
      ['SEC', 'Building blocks used by the indicators'],
      ['ta', 'Total assets', 'Current + non-current + held for sale', (ci) => `SUMPRODUCT(((${BLK}="CA")+(${BLK}="NCA")+(${BLK}="AHFS"))*${val(ci)})`, false],
      ['tl', 'Total liabilities', 'Current + non-current + held for sale', (ci) => `SUMPRODUCT(((${BLK}="CL")+(${BLK}="NCL")+(${BLK}="LHFS"))*${val(ci)})`, false],
      ['nfl', 'Non-financial liabilities', 'Total liabilities - financial liabilities', (ci, co, R) => `${co}${R.tl}-${co}${R.fl}`, false],
      ['ca', 'Current assets', 'Block CA', (ci) => `SUMPRODUCT((${BLK}="CA")*${val(ci)})`, false],
      ['cl', 'Current liabilities', 'Block CL', (ci) => `SUMPRODUCT((${BLK}="CL")*${val(ci)})`, false],
      ['qa', 'Quick assets', 'Lines flagged Quick? = Y (cash + financial assets + receivables)', (ci) => `SUMPRODUCT((${QCK}="Y")*${val(ci)})`, false],
      ['balchk', 'Total assets - total liabilities - equity', 'Must be about 0', (ci, co, R) => `${co}${R.ta}-${co}${R.tl}-${co}${R.eq}`, false],
      ['untagbs', 'Balance sheet lines with a value but no block or tag', 'Must be 0', (ci) => `SUMPRODUCT(((((${TAG}="")+(${BLK}=""))>0)*(${val(ci)}<>0)))`, false, '0'],
      ['BL'],
      ['SEC', 'RECLASSIFIED INCOME STATEMENT: from revenues to net income'],
      ['rev', 'Total revenues', 'Sales from operations + other income and revenues', (ci) => spi('REV_OP', ci) + '+' + spi('REV_OTH', ci), true],
      ['raw', 'Raw materials (purchases, services and other)', 'Tag RAW', (ci) => spi('RAW', ci), false],
      ['ga', 'General and administration expenses', 'Tag GA: all other operating items', (ci) => spi('GA', ci), false],
      ['va', 'VALUE ADDED', 'Revenues + raw materials + G&A', (ci, co, R) => `${co}${R.rev}+${co}${R.raw}+${co}${R.ga}`, true],
      ['pers', 'Personnel costs', 'Tag PERS', (ci) => spi('PERS', ci), false],
      ['ebitda', 'EBITDA', 'Value added + personnel costs', (ci, co, R) => `${co}${R.va}+${co}${R.pers}`, true],
      ['da', 'Depreciation and amortization', 'Tag DA', (ci) => spi('DA', ci), false],
      ['ebit', 'EBIT (operating profit)', 'EBITDA + D&A', (ci, co, R) => `${co}${R.ebitda}+${co}${R.da}`, true],
      ['fin', 'Net financial expenses (income)', 'Tag FIN', (ci) => spi('FIN', ci), false],
      ['invinc', 'Income from equity investments', 'Tag INV', (ci) => spi('INV', ci), false],
      ['ebtx', 'Earnings before tax and extraordinary items', 'EBIT + financial + investments', (ci, co, R) => `${co}${R.ebit}+${co}${R.fin}+${co}${R.invinc}`, false],
      ['extr', 'Extraordinary gains (losses)', 'Tag EXTR', (ci) => spi('EXTR', ci), false],
      ['ebt', 'PRE-TAX INCOME', '', (ci, co, R) => `${co}${R.ebtx}+${co}${R.extr}`, true],
      ['tax', 'Income taxes', 'Tag TAX', (ci) => spi('TAX', ci), false],
      ['ni', 'NET INCOME', '', (ci, co, R) => `${co}${R.ebt}+${co}${R.tax}`, true],
      ['repni', 'Reported net profit (from Inputs)', 'Link', (ci) => `IF(${supRef('repni', ci)}="","n/a",${supRef('repni', ci)})`, false],
      ['nidiff', 'Difference with reported net profit', 'Must be about 0', (ci, co, R) => `IF(ISNUMBER(${co}${R.repni}),${co}${R.ni}-${co}${R.repni},"n/a")`, false],
      ['sales', 'Sales from operations (denominator of margins)', 'Tag REV_OP', (ci) => spi('REV_OP', ci), false],
      ['untagis', 'Income statement lines with a value but no tag', 'Must be 0', (ci) => `SUMPRODUCT((${TAGI}="")*(${vali(ci)}<>0))`, false, '0'],
      ['BL'],
      ['SEC', 'DATA CHECKS'],
      ['c_bal', 'Balance sheet balances', 'Assets = liabilities + equity', (ci, co, R) => `IF(${co}${R.ta}=0,"n/a",IF(ABS(${co}${R.balchk})<=${TOL},"OK","CHECK"))`, false, 'chk'],
      ['c_cov', 'Invested capital = coverage', '', (ci, co, R) => `IF(${co}${R.ic}=0,"n/a",IF(ABS(${co}${R.diff})<=${TOL},"OK","CHECK"))`, false, 'chk'],
      ['c_ni', 'Net income = reported net profit', 'Needs the optional input', (ci, co, R) => `IF(ISNUMBER(${co}${R.nidiff}),IF(ABS(${co}${R.nidiff})<=${TOL},"OK","CHECK"),"n/a")`, false, 'chk'],
      ['c_ta', 'Total assets = reported total assets', 'Needs the optional input', (ci, co, R) => `IF(${supRef('repta', ci)}="","n/a",IF(ABS(${co}${R.ta}-${supRef('repta', ci)})<=${TOL},"OK","CHECK"))`, false, 'chk'],
      ['c_tag', 'Every line with a value has a block and tag', '', (ci, co, R) => `IF(${co}${R.untagbs}+${co}${R.untagis}=0,"OK","CHECK")`, false, 'chk'],
    ];
    const RR = {}; { let r = 6; for (const s of rows) { if (s[0] !== 'BL' && s[0] !== 'SEC') RR[s[0]] = r; r++; } }
    put(wr, 'A1', F(`IF(Inputs!$F$5="","Company",Inputs!$F$5)&" - reclassified statements"`, (st.company || 'Company') + ' - reclassified statements'), { bold: true, size: 14 });
    put(wr, 'A2', 'Data checks', { bold: true });
    put(wr, 'A3', 'Reclassification scheme of lectures 05-06.', { italic: true, color: GREY });
    put(wr, 'A5', F('IF(Inputs!$F$6="","Amounts","Amounts in "&Inputs!$F$6)', 'Amounts in ' + st.unit), { bold: true, fill: fillSub, border: true });
    put(wr, 'B5', 'How it is built', { bold: true, fill: fillSub, border: true });
    OUT.forEach((co, i) => put(wr, `${co}5`, F(`Inputs!${INP[i]}$10`, st.years[i]), { bold: true, fill: fillSub, border: true, h: 'right', color: GREEN }));
    { let r = 6;
      for (const s of rows) {
        if (s[0] === 'BL') { r++; continue; }
        if (s[0] === 'SEC') { put(wr, `A${r}`, s[1], { bold: true, fill: fillSec }); ['B', 'C', 'D', 'E'].forEach(c => { wr.getCell(`${c}${r}`).fill = fillSec; }); r++; continue; }
        const [key, label, note, fn, bold, fmtKey] = s;
        put(wr, `A${r}`, label, { bold, border: true });
        put(wr, `B${r}`, note, { color: GREY, italic: true, border: true });
        OUT.forEach((co, i) => {
          let res;
          if (key.startsWith('c_')) res = C.CHK.rows[key][i]; else res = C.R[key][i];
          put(wr, `${co}${r}`, F(fn(INP[i], co, RR), res), { bold, fmt: fmtKey === 'chk' ? undefined : fmtKey === '0' ? '0' : FMT.num, border: true, h: (fmtKey === 'chk' || res === NA) ? 'right' : undefined });
        });
        r++;
      } }
    const bal = `C${RR.c_bal}:E${RR.c_bal}`;
    put(wr, 'C2', F(`IF(COUNTIF(C${RR.c_bal}:E${RR.c_tag},"CHECK")>0,"CHECK THE DATA",IF(COUNTIF(${bal},"OK")=0,"NO DATA YET",IF(COUNTIF(${bal},"OK")=3,"ALL CHECKS OK","OK FOR "&COUNTIF(${bal},"OK")&" OF 3 YEARS ("&(3-COUNTIF(${bal},"OK"))&" NOT FILLED)")))`, C.CHK.status), { bold: true, h: 'center', border: true });
    wr.mergeCells('C2:E2');
    cfStatus(wr, 'C2', 'ALL CHECKS OK', 'CHECK THE DATA'); cfAmber(wr, 'C2:C2');
    cfStatus(wr, `C${RR.c_bal}:E${RR.c_tag}`, 'OK', 'CHECK');
    wr.views = [{ state: 'frozen', ySplit: 5, xSplit: 2 }];

    // ---------------- Indicators
    const wd = wb.addWorksheet('Indicators');
    [40, 58, 13, 13, 13, 92].forEach((w, i) => { wd.getColumn(i + 1).width = w; });
    put(wd, 'A1', F('IF(Inputs!$F$5="","Company",Inputs!$F$5)&" - course indicators"', (st.company || 'Company') + ' - course indicators'), { bold: true, size: 14 });
    put(wd, 'A2', 'Data checks', { bold: true });
    put(wd, 'C2', F('Reclass!C2', C.CHK.status), { bold: true, h: 'center', border: true, color: GREEN });
    wd.mergeCells('C2:E2');
    cfStatus(wd, 'C2', 'ALL CHECKS OK', 'CHECK THE DATA'); cfAmber(wd, 'C2:C2');
    put(wd, 'A3', 'Formulas as in lectures 07, 08 and 10. n/a = a needed input is missing. Choose 5-6 indicators that test the critical issues of the brief (lecture 09); do not report them all.', { italic: true, color: GREY });
    put(wd, 'A5', 'Indicator', { bold: true, fill: fillSub, border: true }); put(wd, 'B5', 'Course formula', { bold: true, fill: fillSub, border: true });
    OUT.forEach((co, i) => put(wd, `${co}5`, F(`Inputs!${INP[i]}$10`, st.years[i]), { bold: true, fill: fillSub, border: true, h: 'right', color: GREEN }));
    put(wd, 'F5', 'Reading note', { bold: true, fill: fillSub, border: true });
    const rr = (key, co) => `Reclass!${co}$${RR[key]}`;
    const NI = SPEC.NOTES;
    const indFn = {
      roe: (co, i) => `IFERROR(${rr('ni', co)}/${rr('eq', co)},"n/a")`,
      eps: (co, i) => `IFERROR(${rr('ni', co)}*Inputs!$F$7/${supRef('shares', INP[i])},"n/a")`,
      payout: (co, i) => i === 0 ? `IFERROR(${supRef('div', INP[i])}/Inputs!$F$${L.niprev},"n/a")` : `IFERROR(${supRef('div', INP[i])}/${rr('ni', OUT[i - 1])},"n/a")`,
      sgr: (co, i, X) => `IFERROR(${co}${X.roe}*(1-${co}${X.payout}),"n/a")`,
      npm: (co) => `IFERROR(${rr('ni', co)}/${rr('sales', co)},"n/a")`,
      roi: (co) => `IFERROR(${rr('ebit', co)}/(${rr('ta', co)}-${rr('nfl', co)}),"n/a")`,
      roa: (co) => `IFERROR(${rr('ebit', co)}/${rr('ta', co)},"n/a")`,
      roce: (co) => `IFERROR(${rr('ebit', co)}/(${rr('eq', co)}+${rr('dlt', co)}),"n/a")`,
      ebitm: (co) => `IFERROR(${rr('ebit', co)}/${rr('sales', co)},"n/a")`,
      ebitdam: (co) => `IFERROR(${rr('ebitda', co)}/${rr('sales', co)},"n/a")`,
      qoe: (co, i) => `IFERROR(${supRef('cffo', INP[i])}/${rr('ebit', co)},"n/a")`,
      atr: (co) => `IFERROR(${rr('sales', co)}/${rr('ta', co)},"n/a")`,
      de_tl: (co) => `IFERROR(${rr('tl', co)}/${rr('eq', co)},"n/a")`,
      de_fl: (co) => `IFERROR(${rr('fl', co)}/${rr('eq', co)},"n/a")`,
      de_nfp: (co) => `IFERROR(${rr('nfp', co)}/${rr('eq', co)},"n/a")`,
      icr: (co, i) => `IFERROR(${rr('ebit', co)}/${supRef('intexp', INP[i])},"n/a")`,
      cod: (co, i) => `IFERROR(${supRef('intexp', INP[i])}/${rr('fl', co)},"n/a")`,
      etr: (co) => `IFERROR(-${rr('tax', co)}/${rr('ebt', co)},"n/a")`,
      cur: (co) => `IFERROR(${rr('ca', co)}/${rr('cl', co)},"n/a")`,
      quick: (co) => `IFERROR(${rr('qa', co)}/${rr('cl', co)},"n/a")`,
      invt: (co, i) => `IFERROR(${rr('sales', co)}/Inputs!${INP[i]}$${L.bs.inv},"n/a")`,
      dso: (co, i, X) => `IFERROR(ROUNDUP(${co}${X.dso_x},0),"n/a")`,
      dso_x: (co, i) => `IFERROR(Inputs!${INP[i]}$${L.bs.trec}/${rr('sales', co)}*365,"n/a")`,
      dpo: (co, i, X) => `IFERROR(ROUNDUP(${co}${X.dpo_x},0),"n/a")`,
      dpo_x: (co, i) => `IFERROR(Inputs!${INP[i]}$${L.bs.tpay}/-${rr('raw', co)}*365,"n/a")`,
      cfd: (co, i) => `IFERROR(${supRef('cffo', INP[i])}/${rr('fl', co)},"n/a")`,
      std: (co, i) => `IFERROR(${supRef('cffo', INP[i])}/${rr('dst', co)},"n/a")`,
      cxc: (co, i) => `IFERROR(${supRef('cffo', INP[i])}/${supRef('capex', INP[i])},"n/a")`,
      ric: (co) => `IF(Inputs!$F$8=2,${rr('ic', co)},${rr('eq', co)}+${rr('fl', co)})`,
      rik: (co, i) => `IF(ISNUMBER(${supRef('k', INP[i])}),${supRef('k', INP[i])},"n/a")`,
      ri: (co, i, X) => `IF(ISNUMBER(${co}${X.rik}),${rr('ebit', co)}-${co}${X.rik}*${co}${X.ric},"n/a")`,
    };
    const X = {}; { let r = 6; for (const s of IND_SPEC) { if (s[0] === 'SEC') { if (r > 6) r++; r++; } else { X[s[0]] = r; r++; } } }
    { let r = 6;
      for (const s of IND_SPEC) {
        if (s[0] === 'SEC') { if (r > 6) r++; band(wd, r, s[1], 6); r++; continue; }
        const [key, label, text, fk] = s;
        put(wd, `A${r}`, label, { bold: !label.startsWith(' '), border: true });
        put(wd, `B${r}`, text, { color: GREY, border: true });
        OUT.forEach((co, i) => put(wd, `${co}${r}`, F(indFn[key](co, i, X), C.IND[key][i]), { fmt: FMT[fk], border: true, h: 'right' }));
        put(wd, `F${r}`, NI[key] || '', { color: GREY, italic: true, border: true });
        r++;
      } }
    wd.views = [{ state: 'frozen', ySplit: 5, xSplit: 2 }];

    // ---------------- AI_Log
    const wa = wb.addWorksheet('AI_Log');
    [5, 17, 16, 22, 40, 34, 36, 34, 36, 14, 22].forEach((w, i) => { wa.getColumn(i + 1).width = w; });
    put(wa, 'A1', 'AI audit trail (lecture 09): feeds annex slide A5 "AI Disclosure"', { bold: true, size: 14 });
    put(wa, 'A2', 'One row per AI answer you use. Rule: no validation entry, the number does not go in the deck. No page reference, no number.', { italic: true, color: GREY });
    ['#', 'Date / time', 'Team member', 'Tool and model', 'Prompt (summary)', 'Source used (document, page)', 'Calculation', 'AI conclusion', 'Human validation (who, how)', 'Slide #', 'Status'].forEach((t, i) =>
      put(wa, `${String.fromCharCode(65 + i)}4`, t, { bold: true, color: 'FFFFFFFF', fill: fillHdr, border: true, wrap: true, h: 'center' }));
    for (let r = 5; r <= 44; r++) {
      for (let c = 0; c < 11; c++) put(wa, `${String.fromCharCode(65 + c)}${r}`, c === 0 ? r - 4 : null, { color: c === 0 ? 'FF000000' : BLUE, fill: c === 0 ? undefined : fillIn, border: true, wrap: true });
      wa.getCell(`K${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Validated,Hypothesis - not verified,Rejected"'] };
    }
    wa.views = [{ state: 'frozen', ySplit: 4 }];
    wb.calcProperties = { fullCalcOnLoad: true };
    return wb;
  }

  const RECLASS_VIEW = [
    ['SEC', 'Reclassified balance sheet: where capital is invested and who funds it'],
    ['fa', 'Fixed assets (non-current assets)'], ['nwc', 'Net working capital (operating)'], ['prov', 'Provisions (deducted)'], ['hfs', 'Net assets held for sale'],
    ['ic', 'INVESTED CAPITAL', true], ['dst', 'Financial debt: current'], ['dlt', 'Financial debt: non-current'], ['fl', 'Total financial liabilities'],
    ['cashfin', 'Cash and financial assets deducted from debt'], ['nfp', 'NET FINANCIAL POSITION', true], ['eq', "Shareholders' equity"],
    ['cov', 'COVERAGE (equity + NFP)', true], ['diff', 'Difference: invested capital - coverage'],
    ['SEC', 'Building blocks'],
    ['ta', 'Total assets'], ['tl', 'Total liabilities'], ['nfl', 'Non-financial liabilities'], ['ca', 'Current assets'], ['cl', 'Current liabilities'], ['qa', 'Quick assets'],
    ['SEC', 'Reclassified income statement'],
    ['rev', 'Total revenues', true], ['raw', 'Raw materials (purchases, services and other)'], ['ga', 'General and administration expenses'], ['va', 'VALUE ADDED', true],
    ['pers', 'Personnel costs'], ['ebitda', 'EBITDA', true], ['da', 'Depreciation and amortization'], ['ebit', 'EBIT (operating profit)', true],
    ['fin', 'Net financial expenses (income)'], ['invinc', 'Income from equity investments'], ['ebtx', 'Earnings before tax and extraordinary items'],
    ['extr', 'Extraordinary gains (losses)'], ['ebt', 'PRE-TAX INCOME', true], ['tax', 'Income taxes'], ['ni', 'NET INCOME', true], ['sales', 'Sales from operations (denominator of margins)'],
  ];
  const CHECK_VIEW = [['c_bal', 'Balance sheet balances (assets = liabilities + equity)'], ['c_cov', 'Invested capital = coverage'], ['c_ni', 'Net income = reported net profit (optional input)'],
    ['c_ta', 'Total assets = reported total assets (optional input)'], ['c_tag', 'Every line with a value has a block and a tag']];
  return { NY, BLOCKS, BTAGS, ITAGS, NA, IND_SPEC, RECLASS_VIEW, CHECK_VIEW, FMT, blankState, loadExample, calc, layout, buildWorkbook, isNum };
}
if (typeof module !== 'undefined') module.exports = makeCore; else window.makeCore = makeCore;
