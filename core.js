/* AFC Challenge 1 indicators toolkit: calculation core, project validation and Excel export.
   Same logic as the Excel toolkit (reclassification by block and tag, data checks, 24 indicators, residual income). */
function makeCore(SPEC) {
  'use strict';
  const NY = 3;
  const VERSION = 3;
  const BLOCKS = ['CA', 'NCA', 'AHFS', 'CL', 'NCL', 'LHFS', 'EQ'];
  const BTAGS = ['FA', 'OWC', 'PROV', 'HFS', 'CASH', 'DEBT_ST', 'DEBT_LT', 'EQ'];
  const ITAGS = ['REV_OP', 'REV_OTH', 'RAW', 'PERS', 'DA', 'GA', 'FIN', 'INV', 'EXTR', 'TAX'];
  const NA = 'n/a';
  const REQUIRED_SUP = ['intexp', 'div', 'shares', 'cffo', 'capex'];   // needed by the indicators; k, reported total assets and net profit are optional
  const NUMFMTS = ['auto', 'en', 'eu'];
  const STD_BS = {}, STD_IS = {};
  SPEC.BS.forEach(it => { if (it[0] !== 'SEC') STD_BS[it[0]] = { label: it[1], block: it[2], tag: it[3] }; });
  SPEC.IS.forEach(it => { STD_IS[it[0]] = { label: it[1], tag: it[2] }; });
  const SECTION_OF = { CA: 'Current assets', NCA: 'Non-current assets', AHFS: 'Assets held for sale', CL: 'Current liabilities', NCL: 'Non-current liabilities', LHFS: 'Liabilities held for sale', EQ: 'Equity' };

  // ------------------------------------------------------------------ state
  function blankState() {
    const bs = [];
    for (const it of SPEC.BS) {
      if (it[0] === 'SEC') bs.push({ sec: it[1] });
      else bs.push({ key: it[0], label: it[1], block: it[2], tag: it[3], q: it[4] === 'Y', hint: it[5], src: '', rev: false, v: [null, null, null] });
    }
    const is = SPEC.IS.map(it => ({ key: it[0], label: it[1], tag: it[2], hint: it[3], src: '', rev: false, v: [null, null, null] }));
    const sup = {}, supsrc = {};
    for (const it of SPEC.SUP) { sup[it[0]] = [null, null, null]; supsrc[it[0]] = ''; }
    return { version: VERSION, settings: { company: '', unit: '€ m', mult: 1000000, basis: 1, tol: 1, years: ['Y-2', 'Y-1', 'Y'], scope: [true, true, true], numfmt: 'auto', roundUnit: 1, byFunction: false }, bs, is, sup, supsrc, niprev: null };
  }

  function loadExample(ex) {
    const S = blankState();
    Object.assign(S.settings, JSON.parse(JSON.stringify(ex.settings)));
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
  // Excel: IFERROR(a/b,"n/a"); a missing input (null) is not a number, so it stays n/a
  const div = (a, b) => (isNum(a) && isNum(b) && b !== 0 && isFinite(a / b)) ? a / b : NA;
  const mul = (a, b) => (isNum(a) && isNum(b)) ? a * b : NA;
  const ad = (a, b) => (isNum(a) && isNum(b)) ? a + b : NA;
  const sb = (a, b) => (isNum(a) && isNum(b)) ? a - b : NA;
  const ng = a => (isNum(a) ? -a : NA);
  const roundUp = x => (isNum(x) ? Math.sign(x) * Math.ceil(Math.abs(x) - 1e-12) : NA);
  const sup = (S, k, y) => { const a = S.sup && S.sup[k]; const v = a ? a[y] : null; return isNum(v) ? v : null; };
  const BS_KEYS = ['fa', 'nwc', 'prov', 'hfs', 'ic', 'dst', 'dlt', 'fl', 'cashfin', 'nfp', 'eq', 'cov', 'diff', 'ta', 'tl', 'nfl', 'ca', 'cl', 'qa', 'balchk'];
  const IS_KEYS = ['rev', 'raw', 'ga', 'va', 'pers', 'ebitda', 'da', 'ebit', 'fin', 'invinc', 'ebtx', 'extr', 'ebt', 'tax', 'ni', 'sales'];

  // ------------------------------------------------------------------ calculation
  function calc(S) {
    const lines = S.bs.filter(l => !l.sec);
    const byKey = {}; lines.forEach(l => { if (l.key) byKey[l.key] = l; });
    const tol = z(S.settings.tol);
    const scope = (S.settings.scope && S.settings.scope.length === NY) ? S.settings.scope.map(Boolean) : [true, true, true];
    const R = {}, IND = {}, CHK = {}, WHY = {};
    const keys = ['fa', 'nwc', 'prov', 'hfs', 'ic', 'dst', 'dlt', 'fl', 'cashfin', 'nfp', 'eq', 'cov', 'diff', 'ta', 'tl', 'nfl', 'ca', 'cl', 'qa', 'balchk', 'untagbs',
      'rev', 'raw', 'ga', 'va', 'pers', 'ebitda', 'da', 'ebit', 'fin', 'invinc', 'ebtx', 'extr', 'ebt', 'tax', 'ni', 'repni', 'nidiff', 'sales', 'untagis'];
    keys.forEach(k => { R[k] = []; });
    const raw = [], hasBS = [], hasIS = [], bad = [];
    for (let y = 0; y < NY; y++) {
      const sumTag = t => lines.reduce((s, l) => s + (l.tag === t ? sign(l.block) * z(l.v[y]) : 0), 0);
      const sumBlk = bl => lines.reduce((s, l) => s + (bl.includes(l.block) ? z(l.v[y]) : 0), 0);
      const sumI = t => S.is.reduce((s, l) => s + (l.tag === t ? z(l.v[y]) : 0), 0);
      hasBS.push(lines.some(l => isNum(l.v[y])));
      hasIS.push(S.is.some(l => isNum(l.v[y])));
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
      // lines with a value must carry a block and a tag that belong to the allowed sets (empty and unknown are both flagged)
      let ub = 0;
      for (const l of lines) {
        if (z(l.v[y]) === 0) continue;
        const okTag = BTAGS.includes(l.tag), okBlk = BLOCKS.includes(l.block);
        if (!okTag || !okBlk) { ub++; bad.push({ sheet: 'Balance sheet', label: l.label, block: l.block || '', tag: l.tag || '', year: y, reason: (!l.tag || !l.block) ? 'missing block or tag' : 'unknown ' + (!okBlk ? 'block' : 'tag') }); }
      }
      r.untagbs = ub;
      r.rev = sumI('REV_OP') + sumI('REV_OTH'); r.raw = sumI('RAW'); r.ga = sumI('GA') - (S.settings.byFunction ? sumI('DA') : 0);
      r.va = r.rev + r.raw + r.ga; r.pers = sumI('PERS'); r.ebitda = r.va + r.pers; r.da = sumI('DA'); r.ebit = r.ebitda + r.da;
      r.fin = sumI('FIN'); r.invinc = sumI('INV'); r.ebtx = r.ebit + r.fin + r.invinc; r.extr = sumI('EXTR'); r.ebt = r.ebtx + r.extr;
      r.tax = sumI('TAX'); r.ni = r.ebt + r.tax;
      r.sales = sumI('REV_OP');
      let ui = 0;
      for (const l of S.is) {
        if (z(l.v[y]) === 0) continue;
        if (!ITAGS.includes(l.tag)) { ui++; bad.push({ sheet: 'Income statement', label: l.label, block: '', tag: l.tag || '', year: y, reason: !l.tag ? 'missing tag' : 'unknown tag' }); }
      }
      r.untagis = ui;
      raw.push(r);
      // outputs: a statement that is entirely empty is not a statement of zeros
      const o = Object.assign({}, r);
      if (!hasBS[y]) BS_KEYS.forEach(k => { o[k] = NA; });
      if (!hasIS[y]) IS_KEYS.forEach(k => { o[k] = NA; });
      const rn = sup(S, 'repni', y);
      o.repni = isNum(rn) ? rn : NA;
      o.nidiff = (isNum(o.ni) && isNum(o.repni)) ? o.ni - o.repni : NA;
      keys.forEach(k => R[k].push(o[k]));
    }
    // data checks (computed on every year; the status only looks at the years in scope)
    const ck = { c_bal: [], c_cov: [], c_ni: [], c_ta: [], c_tag: [] };
    for (let y = 0; y < NY; y++) {
      const r = raw[y];
      ck.c_bal.push(!hasBS[y] || r.ta === 0 ? NA : (Math.abs(r.balchk) <= tol ? 'OK' : 'CHECK'));
      ck.c_cov.push(!hasBS[y] || r.ic === 0 ? NA : (Math.abs(r.diff) <= tol ? 'OK' : 'CHECK'));
      ck.c_ni.push(isNum(R.nidiff[y]) ? (Math.abs(R.nidiff[y]) <= tol ? 'OK' : 'CHECK') : NA);
      const rta = sup(S, 'repta', y);
      ck.c_ta.push(!isNum(rta) || !hasBS[y] ? NA : (Math.abs(r.ta - rta) <= tol ? 'OK' : 'CHECK'));
      ck.c_tag.push(r.untagbs + r.untagis === 0 ? 'OK' : 'CHECK');
    }
    // year by year state and the overall status
    const YEAR = [];
    for (let y = 0; y < NY; y++) {
      const supN = REQUIRED_SUP.filter(k => sup(S, k, y) !== null).length;
      const inScope = scope[y];
      let state;
      if (!inScope) state = 'out of scope';
      else if (!hasBS[y] && !hasIS[y] && supN === 0) state = 'empty';
      else if (hasBS[y] && hasIS[y] && supN === REQUIRED_SUP.length && ck.c_bal[y] === 'OK' && ck.c_cov[y] === 'OK') state = 'complete';
      else state = 'partial';
      const missing = [];
      if (inScope && state !== 'empty') {
        if (!hasBS[y]) missing.push('Balance sheet not entered');
        if (!hasIS[y]) missing.push('Income statement not entered');
        REQUIRED_SUP.forEach(k => { if (sup(S, k, y) === null) missing.push((SPEC.SUP.find(x => x[0] === k) || [k, k])[1] + ' not entered'); });
      }
      YEAR.push({ inScope, hasBS: hasBS[y], hasIS: hasIS[y], supN, state, missing, optionalNotRun: inScope ? (ck.c_ni[y] === 'n/a' ? 1 : 0) + (ck.c_ta[y] === 'n/a' ? 1 : 0) : 0 });
    }
    const nScope = scope.filter(Boolean).length;
    const nCheck = [0, 1, 2].reduce((s, y) => s + (scope[y] ? ['c_bal', 'c_cov', 'c_ni', 'c_ta', 'c_tag'].filter(k => ck[k][y] === 'CHECK').length : 0), 0);
    const nPartial = YEAR.filter(x => x.state === 'partial').length, nComplete = YEAR.filter(x => x.state === 'complete').length;
    const anyBS = YEAR.some(x => x.inScope && x.hasBS);
    let status;
    if (nCheck > 0) status = 'CHECK THE DATA';
    else if (nScope === 0) status = 'NO YEARS IN SCOPE';
    else if (!anyBS) status = 'NO DATA YET';
    else if (nPartial > 0) status = `INCOMPLETE INPUTS IN ${nPartial} OF ${nScope} YEARS`;
    else if (nComplete === nScope) status = 'ALL CHECKS OK';
    else status = `OK FOR ${nComplete} OF ${nScope} YEARS (${nScope - nComplete} NOT FILLED)`;
    // source references (a separate check, not part of the status)
    const inScopeY = [0, 1, 2].filter(y => scope[y]);
    const withRef = [], withoutRef = [];
    for (const l of lines) if (inScopeY.some(y => z(l.v[y]) !== 0)) (String(l.src || '').trim() ? withRef : withoutRef).push(l.label);
    for (const l of S.is) if (inScopeY.some(y => z(l.v[y]) !== 0)) (String(l.src || '').trim() ? withRef : withoutRef).push(l.label);
    for (const it of SPEC.SUP) if (inScopeY.some(y => sup(S, it[0], y) !== null)) (String((S.supsrc && S.supsrc[it[0]]) || '').trim() ? withRef : withoutRef).push(it[1]);
    CHK.rows = ck; CHK.status = status; CHK.years = YEAR; CHK.bad = bad;
    CHK.sources = { withRef: withRef.length, total: withRef.length + withoutRef.length, missing: withoutRef };

    // indicators
    const mult = z(S.settings.mult);
    const k = ['roe', 'eps', 'payout', 'sgr', 'npm', 'roi', 'roa', 'roce', 'ebitm', 'ebitdam', 'qoe', 'atr', 'de_tl', 'de_fl', 'de_nfp', 'icr', 'cod', 'etr',
      'cur', 'quick', 'invt', 'dso_x', 'dso', 'dpo_x', 'dpo', 'cfd', 'std', 'cxc', 'ric', 'rik', 'ri'];
    k.forEach(x => { IND[x] = []; WHY[x] = []; });
    const REQ = { eps: ['shares'], payout: ['div'], qoe: ['cffo'], icr: ['intexp'], cod: ['intexp'], cfd: ['cffo'], std: ['cffo'], cxc: ['cffo', 'capex'], rik: ['k'], ri: ['k'] };
    for (let y = 0; y < NY; y++) {
      const g = key => R[key][y];
      const s = key => sup(S, key, y);
      const line = key => (byKey[key] && isNum(byKey[key].v[y]) ? byKey[key].v[y] : null);
      const I = {};
      I.roe = div(g('ni'), g('eq'));
      I.eps = div(mul(g('ni'), mult), s('shares'));
      I.payout = y === 0 ? div(s('div'), isNum(S.niprev) ? S.niprev : null) : div(s('div'), R.ni[y - 1]);
      I.sgr = (isNum(I.roe) && isNum(I.payout)) ? I.roe * (1 - I.payout) : NA;
      I.npm = div(g('ni'), g('sales'));
      I.roi = div(g('ebit'), sb(g('ta'), g('nfl')));
      I.roa = div(g('ebit'), g('ta'));
      I.roce = div(g('ebit'), ad(g('eq'), g('dlt')));
      I.ebitm = div(g('ebit'), g('sales'));
      I.ebitdam = div(g('ebitda'), g('sales'));
      I.qoe = div(s('cffo'), g('ebit'));
      I.atr = div(g('sales'), g('ta'));
      I.de_tl = div(g('tl'), g('eq')); I.de_fl = div(g('fl'), g('eq')); I.de_nfp = div(g('nfp'), g('eq'));
      I.icr = div(g('ebit'), s('intexp')); I.cod = div(s('intexp'), g('fl')); I.etr = div(ng(g('tax')), g('ebt'));
      I.cur = div(g('ca'), g('cl')); I.quick = div(g('qa'), g('cl'));
      I.invt = div(g('sales'), line('inv'));
      const d1 = div(line('trec'), g('sales')); I.dso_x = isNum(d1) ? d1 * 365 : NA; I.dso = roundUp(I.dso_x);
      const d2 = div(line('tpay'), ng(g('raw'))); I.dpo_x = isNum(d2) ? d2 * 365 : NA; I.dpo = roundUp(I.dpo_x);
      I.cfd = div(s('cffo'), g('fl')); I.std = div(s('cffo'), g('dst')); I.cxc = div(s('cffo'), s('capex'));
      I.ric = z(S.settings.basis) === 2 ? g('ic') : ad(g('eq'), g('fl'));
      const kk = s('k');
      I.rik = isNum(kk) ? kk : NA;
      I.ri = (isNum(I.rik) && isNum(g('ebit')) && isNum(I.ric)) ? g('ebit') - I.rik * I.ric : NA;
      k.forEach(x => {
        IND[x].push(I[x]);
        let why = '';
        if (I[x] === NA) {
          const miss = (REQ[x] || []).filter(q => s(q) === null).map(q => (SPEC.SUP.find(t => t[0] === q) || [q, q])[1]);
          if (x === 'payout' && y === 0 && !isNum(S.niprev)) miss.push('Net profit of the year before the first column');
          if (!hasBS[y] && !hasIS[y]) why = 'No statements entered for this year';
          else if (miss.length) why = 'Missing: ' + miss.join('; ');
          else if (['invt', 'dso', 'dso_x'].includes(x) && line(x === 'invt' ? 'inv' : 'trec') === null) why = 'Missing: ' + (x === 'invt' ? 'Inventories' : 'Trade and other receivables');
          else if (['dpo', 'dpo_x'].includes(x) && line('tpay') === null) why = 'Missing: Trade and other payables';
          else why = 'A needed input is missing or the denominator is zero';
        }
        WHY[x].push(why);
      });
    }
    // rounding hint: the maximum rounding error of n figures rounded to a unit is n x unit / 2
    const unit = isNum(S.settings.roundUnit) && S.settings.roundUnit > 0 ? S.settings.roundUnit : 1;
    CHK.rounding = [];
    for (let y = 0; y < NY; y++) {
      const n = lines.filter(l => isNum(l.v[y])).length;
      const gap = hasBS[y] ? Math.abs(raw[y].balchk) : NA;
      const maxErr = n * unit / 2;
      const fails = ck.c_bal[y] === 'CHECK';
      const within = fails && gap <= maxErr;
      const tolUp = within ? Math.ceil(Math.round(gap * 1e6) / 1e4) / 100 : null;
      CHK.rounding.push({ gap, n, maxErr, advice: fails ? (within ? 'within max rounding: if typed correctly set tolerance to ' + tolUp : 'larger than rounding: check the figures') : '', suggestTol: tolUp });
    }
    // unit warnings (not part of the status)
    CHK.unitWarn = { shares: [], eps: [], da: [] };
    for (let y = 0; y < NY; y++) {
      const sh = sup(S, 'shares', y), ni = R.ni[y];
      CHK.unitWarn.shares.push(sh !== null && sh > 0 && sh < 100000 ? 'CHECK UNITS' : '');
      CHK.unitWarn.da.push(raw[y].da > 0 ? 'CHECK SIGN' : '');
      CHK.unitWarn.eps.push(sh !== null && sh > 0 && isNum(ni) && Math.abs(ni * mult / sh) > 10000 ? 'CHECK UNITS' : '');
    }
    // classification review: lines whose block or tag differs from the standard one, spare lines in use and custom lines
    const latest = (l, sheet) => {
      let y = 2; while (y >= 0 && !(scope[y] && isNum(l.v[y]))) y--;
      if (y < 0) { y = 2; while (y >= 0 && !isNum(l.v[y])) y--; }
      const base = sheet === 'bs' ? raw[y].ta : raw[y].sales;
      return { y, amount: l.v[y], share: base ? Math.abs(l.v[y]) / Math.abs(base) : null };
    };
    const review = [], renamed = [];
    for (const l of lines) {
      if (!l.v.some(isNum)) continue;
      const std = STD_BS[l.key], reasons = [];
      if (!std) reasons.push('custom line');
      else {
        if ((l.block || '') !== std.block) reasons.push(`block ${std.block} -> ${l.block || '(empty)'}`);
        if ((l.tag || '') !== std.tag) reasons.push(std.tag ? `tag ${std.tag} -> ${l.tag || '(empty)'}` : `spare line in use, tag ${l.tag || '(empty)'}`);
      }
      const a = latest(l, 'bs');
      const item = { sheet: 'Balance sheet', key: l.key, label: l.label, std: std ? `${std.block}/${std.tag || '(spare)'}` : '(custom)', now: `${l.block || '(empty)'}/${l.tag || '(empty)'}`, year: a.y, amount: a.amount, share: a.share, reasons, rev: !!l.rev };
      if (reasons.length) review.push(item); else if (std && l.label !== std.label) renamed.push(Object.assign(item, { reasons: ['renamed'] }));
    }
    for (const l of S.is) {
      if (!l.v.some(isNum)) continue;
      const std = STD_IS[l.key], reasons = [];
      if (!std) reasons.push('custom line');
      else if ((l.tag || '') !== std.tag) reasons.push(std.tag ? `tag ${std.tag} -> ${l.tag || '(empty)'}` : `spare line in use, tag ${l.tag || '(empty)'}`);
      const a = latest(l, 'is');
      const item = { sheet: 'Income statement', key: l.key, label: l.label, std: std ? (std.tag || '(spare)') : '(custom)', now: l.tag || '(empty)', year: a.y, amount: a.amount, share: a.share, reasons, rev: !!l.rev };
      if (reasons.length) review.push(item); else if (std && l.label !== std.label) renamed.push(Object.assign(item, { reasons: ['renamed'] }));
    }
    review.sort((a, b) => (b.share || 0) - (a.share || 0));
    CHK.review = review; CHK.renamed = renamed;
    return { R, IND, CHK, WHY, lines };
  }

  // ------------------------------------------------------------------ project validation and migration (used for import, restore and example loading)
  function validateProject(o) {
    const errors = [], warnings = [], notes = [];
    const err = m => { if (errors.length < 12) errors.push(m); };
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, errors: ['The file is not a project (a JSON object was expected).'], warnings, notes };
    const st = o.settings;
    if (!st || typeof st !== 'object' || Array.isArray(st)) err('The settings section is missing.');
    if (!Array.isArray(o.bs)) err('The balance sheet lines (bs) must be a list.');
    if (!Array.isArray(o.is)) err('The income statement lines (is) must be a list.');
    if (!o.sup || typeof o.sup !== 'object' || Array.isArray(o.sup)) err('The supplementary data (sup) must be an object.');
    if (errors.length) return { ok: false, errors, warnings, notes };
    const settings = {};
    const str = (v, name, dflt) => { if (v === undefined || v === null) return dflt; if (typeof v === 'string') return v; if (typeof v === 'number' && isFinite(v)) return String(v); err(`settings.${name} must be text.`); return dflt; };
    settings.company = str(st.company, 'company', ''); settings.unit = str(st.unit, 'unit', '€ m');
    settings.mult = st.mult === undefined ? 1000000 : st.mult; if (!isNum(settings.mult) || settings.mult <= 0) err('settings.mult must be a positive number.');
    settings.basis = st.basis === undefined ? 1 : st.basis; if (settings.basis !== 1 && settings.basis !== 2) err('settings.basis must be 1 or 2.');
    settings.tol = st.tol === undefined ? 1 : st.tol; if (!isNum(settings.tol) || settings.tol < 0) err('settings.tol must be a number of at least 0.');
    settings.roundUnit = st.roundUnit === undefined ? 1 : st.roundUnit; if (!isNum(settings.roundUnit) || settings.roundUnit <= 0) err('settings.roundUnit must be a positive number.');
    if (st.byFunction === undefined) settings.byFunction = false;
    else if (typeof st.byFunction !== 'boolean') err('settings.byFunction must be true or false.');
    else settings.byFunction = st.byFunction;
    if (!Array.isArray(st.years) || st.years.length !== NY || st.years.some(x => !(typeof x === 'string' || (typeof x === 'number' && isFinite(x))))) err('settings.years must list three year labels.');
    else settings.years = st.years.map(String);
    if (st.scope === undefined) settings.scope = [true, true, true];
    else if (!Array.isArray(st.scope) || st.scope.length !== NY || st.scope.some(x => typeof x !== 'boolean')) err('settings.scope must list three true/false values.');
    else settings.scope = st.scope.slice();
    if (st.numfmt === undefined) settings.numfmt = 'auto';
    else if (!NUMFMTS.includes(st.numfmt)) err('settings.numfmt must be one of ' + NUMFMTS.join(', ') + '.');
    else settings.numfmt = st.numfmt;
    const vals = (v, where) => {
      if (!Array.isArray(v) || v.length !== NY) { err(`${where}: the values must be a list of three numbers or empty cells.`); return [null, null, null]; }
      return v.map((x, i) => { if (x === null || x === undefined || x === '') return null; if (isNum(x)) return x; err(`${where}: value ${i + 1} is not a finite number.`); return null; });
    };
    const text = (v, where, name) => { if (v === undefined || v === null) return ''; if (typeof v === 'string') return v; err(`${where}: ${name} must be text.`); return ''; };
    const bs = o.bs.map((l, i) => {
      const w = `Balance sheet row ${i + 1}`;
      if (!l || typeof l !== 'object' || Array.isArray(l)) { err(`${w} is not an object.`); return null; }
      if ('sec' in l) return { sec: text(l.sec, w, 'sec') };
      return { key: l.key === undefined || l.key === null ? undefined : String(l.key), label: text(l.label, w, 'label'), block: text(l.block, w, 'block'), tag: text(l.tag, w, 'tag'),
        q: !!l.q, hint: text(l.hint, w, 'hint'), src: text(l.src, w, 'src'), rev: !!l.rev, v: vals(l.v, w) };
    });
    const is = o.is.map((l, i) => {
      const w = `Income statement row ${i + 1}`;
      if (!l || typeof l !== 'object' || Array.isArray(l)) { err(`${w} is not an object.`); return null; }
      return { key: l.key === undefined || l.key === null ? undefined : String(l.key), label: text(l.label, w, 'label'), tag: text(l.tag, w, 'tag'), hint: text(l.hint, w, 'hint'), src: text(l.src, w, 'src'), rev: !!l.rev, v: vals(l.v, w) };
    });
    const supKeys = SPEC.SUP.map(x => x[0]);
    const supv = {}, supsrc = {};
    for (const [key, v] of Object.entries(o.sup)) {
      if (!supKeys.includes(key)) { warnings.push(`Supplementary item "${key}" is not in the current list and was ignored.`); continue; }
      supv[key] = vals(v, `Supplementary item ${key}`);
    }
    if (o.supsrc && typeof o.supsrc === 'object' && !Array.isArray(o.supsrc)) for (const key of supKeys) if (typeof o.supsrc[key] === 'string') supsrc[key] = o.supsrc[key];
    let niprev = null;
    if (o.niprev !== undefined && o.niprev !== null && o.niprev !== '') { if (isNum(o.niprev)) niprev = o.niprev; else err('niprev must be a number.'); }
    if (errors.length) return { ok: false, errors, warnings, notes };

    // migrate by stable line key: catalogue lines keep their position, unknown lines are kept as custom lines
    const blank = blankState();
    const catBS = blank.bs;
    const catLines = catBS.filter(x => !x.sec);
    const candLines = bs.filter(l => !l.sec);
    const hasKeys = candLines.length > 0 && candLines.every(l => l.key);
    const byKey = new Map();
    candLines.forEach((l, i) => {
      const key = hasKeys ? l.key : (candLines.length === catLines.length ? catLines[i].key : undefined);
      if (key && !byKey.has(key)) byKey.set(key, l);
    });
    const matched = new Set(byKey.values());
    const customBS = candLines.filter(l => !matched.has(l) || !catLines.some(c => byKey.get(c.key) === l));
    let added = 0;
    const outBS = [];
    let section = null;
    const used = new Set();
    const flushCustom = () => { customBS.filter(l => SECTION_OF[l.block] === section && !used.has(l)).forEach(l => { used.add(l); outBS.push(Object.assign({}, l, { key: l.key || 'custom' + outBS.length })); }); };
    for (const c of catBS) {
      if (c.sec) { flushCustom(); section = c.sec; outBS.push({ sec: c.sec }); continue; }
      const m = byKey.get(c.key);
      if (m) outBS.push(Object.assign({}, c, { label: m.label || c.label, block: m.block, tag: m.tag, q: m.q, src: m.src, rev: m.rev, v: m.v.slice() }));
      else { outBS.push(Object.assign({}, c)); if (hasKeys) added++; }
    }
    flushCustom();
    customBS.filter(l => !used.has(l)).forEach(l => outBS.push(Object.assign({}, l, { key: l.key || 'custom' + outBS.length })));
    const isCat = blank.is;
    const isHasKeys = is.length > 0 && is.every(l => l.key);
    const isByKey = new Map();
    is.forEach((l, i) => { const key = isHasKeys ? l.key : (is.length === isCat.length ? isCat[i].key : undefined); if (key && !isByKey.has(key)) isByKey.set(key, l); });
    const outIS = isCat.map(c => { const m = isByKey.get(c.key); if (!m) { if (isHasKeys) added++; return Object.assign({}, c); } return Object.assign({}, c, { label: m.label || c.label, tag: m.tag, src: m.src, rev: m.rev, v: m.v.slice() }); });
    const isMatched = new Set(isByKey.values());
    const isCustom = is.filter(l => !isMatched.has(l) || !isCat.some(c => isByKey.get(c.key) === l));
    isCustom.forEach(l => outIS.push(Object.assign({}, l, { key: l.key || 'customis' + outIS.length })));
    const nCustom = customBS.length + isCustom.length;
    if (nCustom) warnings.push(`${nCustom} custom line${nCustom > 1 ? 's' : ''} not in the standard list ${nCustom > 1 ? 'were' : 'was'} kept.`);
    if (added) notes.push(`${added} line${added > 1 ? 's' : ''} of the current standard list ${added > 1 ? 'were' : 'was'} added empty.`);
    const project = { version: VERSION, settings: Object.assign({}, blank.settings, settings), bs: outBS, is: outIS, sup: Object.assign({}, blank.sup, supv), supsrc: Object.assign({}, blank.supsrc, supsrc), niprev };
    try { calc(project); } catch (e) { return { ok: false, errors: ['The project could not be calculated: ' + e.message], warnings, notes }; }
    return { ok: true, errors, warnings, notes, project };
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
    const L = { bs: {}, bsRows: [], isRows: [], sup: {}, scopeRow: 11, roundRow: 12, funcRow: 13 };
    let r = 16; L.bs0 = r;
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
    const NAVY = 'FF12263A', BLUE = 'FF0000FF', GREY = 'FF5B6770', GREEN = 'FF008000';
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
      ['Sheets', 'Inputs (type here, blue on yellow), Reclass (reclassified statements, data checks, status by year), Indicators (the 24 course indicators and residual income), AI_Log (audit trail for annex A5).'],
      ['Not included', 'Common size, peer sheets and benchmark: use the full Excel toolkit for those.'],
      ['Years in scope', 'Inputs row 11: 1 = the year is analysed, 0 = out of scope (for example a report with only two years). The status looks only at the years in scope.'],
      ['Status cell', 'Reclass!C2 says ALL CHECKS OK only when every year in scope reconciles AND has the balance sheet, the income statement and the five required supplementary inputs. INCOMPLETE INPUTS means something is missing; OK FOR n OF m YEARS means a year in scope is empty; NO DATA YET means nothing is filled. A missing input is n/a, never zero; an explicit 0 is a valid number.'],
      ['Rounding, review, units', 'Reclass shows, outside the status: the balance sheet gap with a rounding advice (Inputs F12 = rounding unit), the number of lines to review (Inputs column K: block or tag different from the standard one, custom lines, spare lines in use), unit warnings for shares and EPS, and a sign warning when depreciation is typed positive. For a by-function income statement set Inputs F13 = 1: depreciation is typed once on the DA line and is added back inside G&A automatically.'],
      ['Rule', 'No page reference, no number. Adjusted or non-IFRS figures must be labelled as such. Check every figure against the source before it goes in the deck.'],
      ['Exported', new Date().toISOString().slice(0, 10)],
    ];
    rl.forEach((x, i) => { put(rd, `A${3 + i}`, x[0], { bold: true }); put(rd, `B${3 + i}`, x[1], { wrap: true }); });

    // ---------------- Inputs
    const wi = wb.addWorksheet('Inputs');
    [62, 8, 11, 8, 6, 14, 14, 14, 70, 16, 9].forEach((w, i) => { wi.getColumn(i + 1).width = w; });
    put(wi, 'A1', 'INPUTS - ' + (S.settings.company || 'COMPANY').toUpperCase(), { bold: true, size: 14 });
    put(wi, 'A2', 'Blue on yellow = type here. Black = formula. Balance sheet: enter lines as reported, POSITIVE. Income statement: enter the PROFIT EFFECT (income +, costs -). Leave a cell empty if the figure is missing: an empty cell is n/a, an explicit 0 is a number.', { italic: true, color: GREY });
    band(wi, 4, 'SETTINGS', 11);
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
    put(wi, 'A11', 'Year in scope? (1 = analysed, 0 = out of scope)');
    INP.forEach((c, i) => { put(wi, `${c}11`, (st.scope && st.scope[i] === false) ? 0 : 1, { color: BLUE, fill: fillIn, border: true, h: 'right', fmt: '0' }); wi.getCell(`${c}11`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"1,0"'] }; });
    put(wi, 'I11', 'Set 0 for a year the report does not contain. The status is judged on the years in scope only.', { color: GREY, italic: true });
    put(wi, 'A12', 'Rounding unit of the statements (1 = whole units, 0.1 = one decimal)');
    put(wi, 'F12', st.roundUnit, { color: BLUE, fill: fillIn, fmt: '0.0##', border: true, h: 'right' });
    put(wi, 'I12', 'Used only to tell a rounding gap from a typing error: the maximum rounding error of n figures is n x unit / 2.', { color: GREY, italic: true });
    put(wi, 'A13', 'Income statement by function? (1 = add depreciation back inside G&A automatically)');
    put(wi, 'F13', st.byFunction ? 1 : 0, { color: BLUE, fill: fillIn, fmt: '0', border: true, h: 'right' });
    wi.getCell('F13').dataValidation = { type: 'list', allowBlank: false, formulae: ['"1,0"'] };
    put(wi, 'I13', 'Set 1 when the statement shows cost of sales, SG&A and no depreciation line. Type depreciation once on the DA line (negative): the toolkit offsets it in G&A so EBIT does not change.', { color: GREY, italic: true });
    band(wi, 14, 'BALANCE SHEET (positive numbers, as reported)', 11);
    ['Line item', 'Block', 'Reclass tag', 'Quick?', 'Sign'].forEach((t, i) => put(wi, `${'ABCDE'[i]}15`, t, { bold: true, fill: fillSub, border: true, h: i ? 'center' : undefined }));
    INP.forEach(c => put(wi, `${c}15`, F(`${c}$10`, st.years[INP.indexOf(c)]), { bold: true, fill: fillSub, border: true, h: 'right' }));
    put(wi, 'I15', 'Source page / note', { bold: true, fill: fillSub, border: true });
    put(wi, 'J15', 'Standard block / tag', { bold: true, fill: fillSub, border: true });
    put(wi, 'K15', 'Review', { bold: true, fill: fillSub, border: true, h: 'center' });
    S.bs.forEach((it, i) => {
      const r = L.bsRows[i];
      if (it.sec) { put(wi, `A${r}`, it.sec, { bold: true, fill: fillSec }); 'BCDEFGHIJK'.split('').forEach(c => { wi.getCell(`${c}${r}`).fill = fillSec; }); return; }
      put(wi, `A${r}`, it.label, { border: true });
      put(wi, `B${r}`, it.block || null, { color: BLUE, fill: fillIn, border: true, h: 'center' });
      put(wi, `C${r}`, it.tag || null, { color: BLUE, fill: fillIn, border: true, h: 'center' });
      put(wi, `D${r}`, it.q ? 'Y' : null, { color: BLUE, fill: fillIn, border: true, h: 'center' });
      put(wi, `E${r}`, F(`IF(B${r}="",0,IF(OR(B${r}="CA",B${r}="NCA",B${r}="AHFS"),1,-1))`, sign(it.block)), { border: true, h: 'center' });
      INP.forEach((c, y) => put(wi, `${c}${r}`, isNum(it.v[y]) ? it.v[y] : null, { color: BLUE, fill: fillIn, fmt: FMT.num, border: true }));
      put(wi, `I${r}`, it.src || it.hint || null, { color: GREY, italic: true });
      const sd = STD_BS[it.key];
      put(wi, `J${r}`, sd ? (sd.tag ? `${sd.block}/${sd.tag}` : `${sd.block}/(spare)`) : '(custom)', { color: GREY, border: true });
      const cnt = `COUNT(F${r}:H${r})=0`, tagc = sd && sd.tag ? `C${r}<>"${sd.tag}"` : `LEN(C${r})>0`;
      const flagged = C.CHK.review.some(x => x.sheet === 'Balance sheet' && x.key === it.key && x.label === it.label);
      put(wi, `K${r}`, F(sd ? `IF(${cnt},"-",IF(OR(B${r}<>"${sd.block}",${tagc}),"REVIEW","ok"))` : `IF(${cnt},"-","REVIEW")`, !it.v.some(isNum) ? '-' : flagged ? 'REVIEW' : 'ok'), { color: GREY, border: true, h: 'center' });
    });
    S.bs.forEach((it, i) => {
      if (it.sec) return; const r = L.bsRows[i];
      wi.getCell(`B${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${BLOCKS.join(',')}"`] };
      wi.getCell(`C${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${BTAGS.join(',')}"`] };
      wi.getCell(`D${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Y"'] };
    });
    band(wi, L.isBand, 'INCOME STATEMENT (profit effect: income +, costs -)', 11);
    put(wi, `A${L.isHead}`, 'Line item', { bold: true, fill: fillSub, border: true }); put(wi, `C${L.isHead}`, 'Reclass tag', { bold: true, fill: fillSub, border: true, h: 'center' });
    ['B', 'D', 'E'].forEach(c => put(wi, `${c}${L.isHead}`, null, { fill: fillSub, border: true }));
    INP.forEach((c, y) => put(wi, `${c}${L.isHead}`, F(`${c}$10`, st.years[y]), { bold: true, fill: fillSub, border: true, h: 'right' }));
    put(wi, `I${L.isHead}`, 'Source page / note', { bold: true, fill: fillSub, border: true });
    put(wi, `J${L.isHead}`, 'Standard tag', { bold: true, fill: fillSub, border: true });
    put(wi, `K${L.isHead}`, 'Review', { bold: true, fill: fillSub, border: true, h: 'center' });
    S.is.forEach((it, i) => {
      const r = L.isRows[i];
      put(wi, `A${r}`, it.label, { border: true });
      put(wi, `C${r}`, it.tag || null, { color: BLUE, fill: fillIn, border: true, h: 'center' });
      wi.getCell(`C${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${ITAGS.join(',')}"`] };
      INP.forEach((c, y) => put(wi, `${c}${r}`, isNum(it.v[y]) ? it.v[y] : null, { color: BLUE, fill: fillIn, fmt: FMT.num, border: true }));
      put(wi, `I${r}`, it.src || it.hint || null, { color: GREY, italic: true });
      const sd = STD_IS[it.key];
      put(wi, `J${r}`, sd ? (sd.tag || '(spare)') : '(custom)', { color: GREY, border: true });
      const cnt = `COUNT(F${r}:H${r})=0`, tagc = sd && sd.tag ? `C${r}<>"${sd.tag}"` : `LEN(C${r})>0`;
      const flagged = C.CHK.review.some(x => x.sheet === 'Income statement' && x.key === it.key && x.label === it.label);
      put(wi, `K${r}`, F(sd ? `IF(${cnt},"-",IF(${tagc},"REVIEW","ok"))` : `IF(${cnt},"-","REVIEW")`, !it.v.some(isNum) ? '-' : flagged ? 'REVIEW' : 'ok'), { color: GREY, border: true, h: 'center' });
    });
    band(wi, L.supBand, 'SUPPLEMENTARY DATA FOR THE INDICATORS (the first five are required by the indicators)', 11);
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
    for (const rng of [`K${L.bs0}:K${L.bs1}`, `K${L.is0}:K${L.is1}`]) wi.addConditionalFormatting({ ref: rng, rules: [{ type: 'cellIs', operator: 'equal', formulae: ['"REVIEW"'], priority: 4,
      style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } }, font: { color: { argb: 'FF9C5700' }, bold: true } } }] });
    wi.views = [{ state: 'frozen', ySplit: 15, xSplit: 1 }];

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
    const anyOf = (rng, list) => '(' + list.map(x => `(${rng}="${x}")`).join('+') + ')';
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
      ['untagbs', 'Balance sheet lines with a value but no valid block or tag', 'Must be 0 (empty or unknown block or tag)', (ci) => `SUMPRODUCT((${val(ci)}<>0)*((${anyOf(TAG, BTAGS)}*${anyOf(BLK, BLOCKS)})=0))`, false, '0'],
      ['BL'],
      ['SEC', 'RECLASSIFIED INCOME STATEMENT: from revenues to net income'],
      ['rev', 'Total revenues', 'Sales from operations + other income and revenues', (ci) => spi('REV_OP', ci) + '+' + spi('REV_OTH', ci), true],
      ['raw', 'Raw materials (purchases, services and other)', 'Tag RAW', (ci) => spi('RAW', ci), false],
      ['ga', 'General and administration expenses', 'Tag GA: all other operating items; for a by-function statement (Inputs F13 = 1) depreciation is added back here automatically', (ci) => spi('GA', ci) + `-IF(Inputs!$F$13=1,` + spi('DA', ci) + `,0)`, false],
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
      ['nidiff', 'Difference with reported net profit', 'Must be about 0', (ci, co, R) => `IF(AND(ISNUMBER(${co}${R.ni}),ISNUMBER(${co}${R.repni})),${co}${R.ni}-${co}${R.repni},"n/a")`, false],
      ['sales', 'Sales from operations (denominator of margins)', 'Tag REV_OP', (ci) => spi('REV_OP', ci), false],
      ['untagis', 'Income statement lines with a value but no valid tag', 'Must be 0 (empty or unknown tag)', (ci) => `SUMPRODUCT((${vali(ci)}<>0)*((${anyOf(TAGI, ITAGS)})=0))`, false, '0'],
      ['BL'],
      ['SEC', 'DATA CHECKS'],
      ['c_bal', 'Balance sheet balances', 'Assets = liabilities + equity', (ci, co, R) => `IF(ISNUMBER(${co}${R.ta}),IF(${co}${R.ta}=0,"n/a",IF(ABS(${co}${R.balchk})<=${TOL},"OK","CHECK")),"n/a")`, false, 'chk'],
      ['c_cov', 'Invested capital = coverage', '', (ci, co, R) => `IF(ISNUMBER(${co}${R.ic}),IF(${co}${R.ic}=0,"n/a",IF(ABS(${co}${R.diff})<=${TOL},"OK","CHECK")),"n/a")`, false, 'chk'],
      ['c_ni', 'Net income = reported net profit', 'Needs the optional input', (ci, co, R) => `IF(ISNUMBER(${co}${R.nidiff}),IF(ABS(${co}${R.nidiff})<=${TOL},"OK","CHECK"),"n/a")`, false, 'chk'],
      ['c_ta', 'Total assets = reported total assets', 'Needs the optional input', (ci, co, R) => `IF(ISNUMBER(${supRef('repta', ci)}),IF(ISNUMBER(${co}${R.ta}),IF(ABS(${co}${R.ta}-${supRef('repta', ci)})<=${TOL},"OK","CHECK"),"n/a"),"n/a")`, false, 'chk'],
      ['c_tag', 'Every line with a value has a valid block and tag', '', (ci, co, R) => `IF(${co}${R.untagbs}+${co}${R.untagis}=0,"OK","CHECK")`, false, 'chk'],
      ['BL'],
      ['SEC', 'STATUS BY YEAR (which years are analysed and whether they are complete)'],
      ['s_scope', 'Year in scope', 'Inputs row 11: 1 = analysed, 0 = out of scope', (ci) => `IF(Inputs!${ci}$11=1,1,0)`, false, '0'],
      ['s_bs', 'Balance sheet entered', '1 if any balance sheet cell holds a number', (ci) => `IF(COUNT(${val(ci)})>0,1,0)`, false, '0'],
      ['s_is', 'Income statement entered', '1 if any income statement cell holds a number', (ci) => `IF(COUNT(${vali(ci)})>0,1,0)`, false, '0'],
      ['s_sup', 'Required supplementary inputs entered (of 5)', 'Interest expense, dividends, shares, CFFO, capex', (ci) => `COUNT(Inputs!${ci}${L.sup.intexp}:${ci}${L.sup.capex})`, false, '0'],
      ['s_state', 'Year state', 'complete / partial / empty / out of scope', (ci, co, R) => `IF(${co}${R.s_scope}=0,"out of scope",IF(AND(${co}${R.s_bs}=0,${co}${R.s_is}=0,${co}${R.s_sup}=0),"empty",IF(AND(${co}${R.s_bs}=1,${co}${R.s_is}=1,${co}${R.s_sup}=5,${co}${R.c_bal}="OK",${co}${R.c_cov}="OK"),"complete","partial")))`, false, 'chk'],
      ['s_opt', 'Optional checks not run', 'Reported net profit / total assets not typed', (ci, co, R) => `IF(${co}${R.s_scope}=1,IF(${co}${R.c_ni}="n/a",1,0)+IF(${co}${R.c_ta}="n/a",1,0),0)`, false, '0'],
      ['BL'],
      ['SEC', 'ROUNDING, CLASSIFICATION REVIEW AND UNIT WARNINGS (not part of the status)'],
      ['s_gap', 'Balance sheet gap (absolute)', 'Total assets - total liabilities - equity', (ci, co, R) => `ABS(${co}${R.balchk})`, false],
      ['s_n', 'Balance sheet cells with a number', 'Counts the figures that were typed', (ci) => `COUNT(${val(ci)})`, false, '0'],
      ['s_maxr', 'Maximum rounding error of those figures', 'Figures x rounding unit (Inputs F12) / 2', (ci, co, R) => `${co}${R.s_n}*Inputs!$F$12/2`, false, 'r3'],
      ['s_adv', 'Rounding advice', 'Shown only when the balance check fails', (ci, co, R) => `IF(${co}${R.c_bal}="CHECK",IF(${co}${R.s_gap}<=${co}${R.s_maxr},"within max rounding: if typed correctly set tolerance to "&ROUNDUP(${co}${R.s_gap},2),"larger than rounding: check the figures"),"-")`, false, 'txt'],
      ['s_rev', 'Lines to review', 'Lines whose block or tag differs from the standard one, custom lines or spare lines in use (Inputs column K)', () => `COUNTIF(Inputs!$K$${bs0}:$K$${bs1},"REVIEW")+COUNTIF(Inputs!$K$${is0}:$K$${is1},"REVIEW")`, false, '0'],
      ['s_wsh', 'Unit warning: shares', 'Shares below 100,000 look like millions: type units', (ci) => `IF(ISNUMBER(${supRef('shares', ci)}),IF(AND(${supRef('shares', ci)}>0,${supRef('shares', ci)}<100000),"CHECK UNITS","OK"),"-")`, false, 'txt'],
      ['s_weps', 'Unit warning: EPS', 'EPS above 10,000 usually means shares typed in millions', (ci, co, R) => `IF(AND(ISNUMBER(${supRef('shares', ci)}),${supRef('shares', ci)}>0,ISNUMBER(${co}${R.ni})),IF(ABS(${co}${R.ni}*Inputs!$F$7/${supRef('shares', ci)})>10000,"CHECK UNITS","OK"),"-")`, false, 'txt'],
      ['s_wda', 'Sign warning: depreciation', 'Depreciation is a cost: type it with a minus sign (a positive figure corrupts EBITDA even when EBIT is unchanged)', (ci) => `IF(COUNT(${vali(ci)})=0,"-",IF(${spi('DA', ci)}>0,"CHECK SIGN","OK"))`, false, 'txt'],
    ];
    const RR = {}; { let r = 6; for (const s of rows) { if (s[0] !== 'BL' && s[0] !== 'SEC') RR[s[0]] = r; r++; } }
    const cachedFor = (key, i) => {
      if (key.startsWith('c_')) return C.CHK.rows[key][i];
      const Y = C.CHK.years[i];
      if (key === 's_scope') return Y.inScope ? 1 : 0;
      if (key === 's_bs') return Y.hasBS ? 1 : 0;
      if (key === 's_is') return Y.hasIS ? 1 : 0;
      if (key === 's_sup') return Y.supN;
      if (key === 's_state') return Y.state;
      if (key === 's_opt') return Y.optionalNotRun;
      const Q = C.CHK.rounding[i];
      if (key === 's_gap') return Q.gap;
      if (key === 's_n') return Q.n;
      if (key === 's_maxr') return Q.maxErr;
      if (key === 's_adv') return Q.advice || '-';
      if (key === 's_rev') return C.CHK.review.length;
      const shv = sup(S, 'shares', i);
      if (key === 's_wsh') return shv === null ? '-' : (C.CHK.unitWarn.shares[i] || 'OK');
      if (key === 's_weps') return (shv !== null && shv > 0 && isNum(C.R.ni[i])) ? (C.CHK.unitWarn.eps[i] || 'OK') : '-';
      if (key === 's_wda') return Y.hasIS ? (C.CHK.unitWarn.da[i] || 'OK') : '-';
      return C.R[key][i];
    };
    put(wr, 'A1', F(`IF(Inputs!$F$5="","Company",Inputs!$F$5)&" - reclassified statements"`, (st.company || 'Company') + ' - reclassified statements'), { bold: true, size: 14 });
    put(wr, 'A2', 'Data checks', { bold: true });
    put(wr, 'A3', 'Reclassification scheme of lectures 05-06. A statement with no numbers shows n/a, not zeros.', { italic: true, color: GREY });
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
          let f = fn(INP[i], co, RR);
          if (BS_KEYS.includes(key) || key === 's_gap') f = `IF(COUNT(${val(INP[i])})=0,"n/a",${f})`;
          if (IS_KEYS.includes(key)) f = `IF(COUNT(${vali(INP[i])})=0,"n/a",${f})`;
          const res = cachedFor(key, i);
          put(wr, `${co}${r}`, F(f, res), { bold, fmt: (fmtKey === 'chk' || fmtKey === 'txt') ? undefined : fmtKey === '0' ? '0' : fmtKey === 'r3' ? '0.0##' : FMT.num, border: true, h: (fmtKey === 'chk' || res === NA) ? 'right' : undefined });
        });
        r++;
      } }
    const sc = `$C$${RR.s_scope}:$E$${RR.s_scope}`, stRng = `$C$${RR.s_state}:$E$${RR.s_state}`;
    const nChk = ['c_bal', 'c_cov', 'c_ni', 'c_ta', 'c_tag'].map(k => `SUMPRODUCT((${sc}=1)*(C${RR[k]}:E${RR[k]}="CHECK"))`).join('+');
    put(wr, 'C2', F(`IF(${nChk}>0,"CHECK THE DATA",IF(SUM(${sc})=0,"NO YEARS IN SCOPE",IF(SUMPRODUCT((${sc}=1)*($C$${RR.s_bs}:$E$${RR.s_bs}))=0,"NO DATA YET",IF(COUNTIF(${stRng},"partial")>0,"INCOMPLETE INPUTS IN "&COUNTIF(${stRng},"partial")&" OF "&SUM(${sc})&" YEARS",IF(COUNTIF(${stRng},"complete")=SUM(${sc}),"ALL CHECKS OK","OK FOR "&COUNTIF(${stRng},"complete")&" OF "&SUM(${sc})&" YEARS ("&(SUM(${sc})-COUNTIF(${stRng},"complete"))&" NOT FILLED)")))))`, C.CHK.status), { bold: true, h: 'center', border: true });
    wr.mergeCells('C2:E2');
    cfStatus(wr, 'C2', 'ALL CHECKS OK', 'CHECK THE DATA'); cfAmber(wr, 'C2:C2');
    cfStatus(wr, `C${RR.c_bal}:E${RR.c_tag}`, 'OK', 'CHECK');
    for (const k of ['s_wsh', 's_weps', 's_wda']) wr.addConditionalFormatting({ ref: `C${RR[k]}:E${RR[k]}`, rules: [{ type: 'expression', formulae: [`LEFT(C${RR[k]},5)="CHECK"`], priority: 5,
      style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' }, bold: true } } }] });
    wr.views = [{ state: 'frozen', ySplit: 5, xSplit: 2 }];

    // ---------------- Indicators
    const wd = wb.addWorksheet('Indicators');
    [40, 58, 13, 13, 13, 92].forEach((w, i) => { wd.getColumn(i + 1).width = w; });
    put(wd, 'A1', F('IF(Inputs!$F$5="","Company",Inputs!$F$5)&" - course indicators"', (st.company || 'Company') + ' - course indicators'), { bold: true, size: 14 });
    put(wd, 'A2', 'Data checks', { bold: true });
    put(wd, 'C2', F('Reclass!C2', C.CHK.status), { bold: true, h: 'center', border: true, color: GREEN });
    wd.mergeCells('C2:E2');
    cfStatus(wd, 'C2', 'ALL CHECKS OK', 'CHECK THE DATA'); cfAmber(wd, 'C2:C2');
    put(wd, 'A3', 'Formulas as in lectures 07, 08 and 10. n/a = a needed input is missing (an empty cell is not a zero). Choose 5-6 indicators that test the critical issues of the brief (lecture 09); do not report them all.', { italic: true, color: GREY });
    put(wd, 'A5', 'Indicator', { bold: true, fill: fillSub, border: true }); put(wd, 'B5', 'Course formula', { bold: true, fill: fillSub, border: true });
    OUT.forEach((co, i) => put(wd, `${co}5`, F(`Inputs!${INP[i]}$10`, st.years[i]), { bold: true, fill: fillSub, border: true, h: 'right', color: GREEN }));
    put(wd, 'F5', 'Reading note', { bold: true, fill: fillSub, border: true });
    const rr = (key, co) => `Reclass!${co}$${RR[key]}`;
    const NI = SPEC.NOTES;
    const lineRef = (key, ci) => (L.bs[key] ? `Inputs!${ci}$${L.bs[key]}` : null);
    const ifnum = (ref, expr) => `IF(ISNUMBER(${ref}),${expr},"n/a")`;
    const guard1 = (ref, expr) => (ref ? ifnum(ref, expr) : '"n/a"');
    const indFn = {
      roe: (co, i) => `IFERROR(${rr('ni', co)}/${rr('eq', co)},"n/a")`,
      eps: (co, i) => `IFERROR(${rr('ni', co)}*Inputs!$F$7/${supRef('shares', INP[i])},"n/a")`,
      payout: (co, i) => i === 0 ? `IF(AND(ISNUMBER(${supRef('div', INP[i])}),ISNUMBER(Inputs!$F$${L.niprev})),IFERROR(${supRef('div', INP[i])}/Inputs!$F$${L.niprev},"n/a"),"n/a")` : ifnum(supRef('div', INP[i]), `IFERROR(${supRef('div', INP[i])}/${rr('ni', OUT[i - 1])},"n/a")`),
      sgr: (co, i, X) => `IFERROR(${co}${X.roe}*(1-${co}${X.payout}),"n/a")`,
      npm: (co) => `IFERROR(${rr('ni', co)}/${rr('sales', co)},"n/a")`,
      roi: (co) => `IFERROR(${rr('ebit', co)}/(${rr('ta', co)}-${rr('nfl', co)}),"n/a")`,
      roa: (co) => `IFERROR(${rr('ebit', co)}/${rr('ta', co)},"n/a")`,
      roce: (co) => `IFERROR(${rr('ebit', co)}/(${rr('eq', co)}+${rr('dlt', co)}),"n/a")`,
      ebitm: (co) => `IFERROR(${rr('ebit', co)}/${rr('sales', co)},"n/a")`,
      ebitdam: (co) => `IFERROR(${rr('ebitda', co)}/${rr('sales', co)},"n/a")`,
      qoe: (co, i) => ifnum(supRef('cffo', INP[i]), `IFERROR(${supRef('cffo', INP[i])}/${rr('ebit', co)},"n/a")`),
      atr: (co) => `IFERROR(${rr('sales', co)}/${rr('ta', co)},"n/a")`,
      de_tl: (co) => `IFERROR(${rr('tl', co)}/${rr('eq', co)},"n/a")`,
      de_fl: (co) => `IFERROR(${rr('fl', co)}/${rr('eq', co)},"n/a")`,
      de_nfp: (co) => `IFERROR(${rr('nfp', co)}/${rr('eq', co)},"n/a")`,
      icr: (co, i) => ifnum(supRef('intexp', INP[i]), `IFERROR(${rr('ebit', co)}/${supRef('intexp', INP[i])},"n/a")`),
      cod: (co, i) => ifnum(supRef('intexp', INP[i]), `IFERROR(${supRef('intexp', INP[i])}/${rr('fl', co)},"n/a")`),
      etr: (co) => `IFERROR(-${rr('tax', co)}/${rr('ebt', co)},"n/a")`,
      cur: (co) => `IFERROR(${rr('ca', co)}/${rr('cl', co)},"n/a")`,
      quick: (co) => `IFERROR(${rr('qa', co)}/${rr('cl', co)},"n/a")`,
      invt: (co, i) => guard1(lineRef('inv', INP[i]), `IFERROR(${rr('sales', co)}/${lineRef('inv', INP[i])},"n/a")`),
      dso: (co, i, X) => `IFERROR(ROUNDUP(${co}${X.dso_x},0),"n/a")`,
      dso_x: (co, i) => guard1(lineRef('trec', INP[i]), `IFERROR(${lineRef('trec', INP[i])}/${rr('sales', co)}*365,"n/a")`),
      dpo: (co, i, X) => `IFERROR(ROUNDUP(${co}${X.dpo_x},0),"n/a")`,
      dpo_x: (co, i) => guard1(lineRef('tpay', INP[i]), `IFERROR(${lineRef('tpay', INP[i])}/-${rr('raw', co)}*365,"n/a")`),
      cfd: (co, i) => ifnum(supRef('cffo', INP[i]), `IFERROR(${supRef('cffo', INP[i])}/${rr('fl', co)},"n/a")`),
      std: (co, i) => ifnum(supRef('cffo', INP[i]), `IFERROR(${supRef('cffo', INP[i])}/${rr('dst', co)},"n/a")`),
      cxc: (co, i) => `IF(AND(ISNUMBER(${supRef('cffo', INP[i])}),ISNUMBER(${supRef('capex', INP[i])})),IFERROR(${supRef('cffo', INP[i])}/${supRef('capex', INP[i])},"n/a"),"n/a")`,
      ric: (co) => `IFERROR(IF(Inputs!$F$8=2,${rr('ic', co)},${rr('eq', co)}+${rr('fl', co)}),"n/a")`,
      rik: (co, i) => `IF(ISNUMBER(${supRef('k', INP[i])}),${supRef('k', INP[i])},"n/a")`,
      ri: (co, i, X) => `IFERROR(IF(ISNUMBER(${co}${X.rik}),${rr('ebit', co)}-${co}${X.rik}*${co}${X.ric},"n/a"),"n/a")`,
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
    ['c_ta', 'Total assets = reported total assets (optional input)'], ['c_tag', 'Every line with a value has a valid block and tag']];
  return { NY, VERSION, BLOCKS, BTAGS, ITAGS, NA, NUMFMTS, REQUIRED_SUP, IND_SPEC, RECLASS_VIEW, CHECK_VIEW, FMT, blankState, loadExample, calc, validateProject, layout, buildWorkbook, isNum };
}
if (typeof module !== 'undefined') module.exports = makeCore; else window.makeCore = makeCore;
