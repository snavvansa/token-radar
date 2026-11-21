// Token Radar page, part 1: state, formatting, the proof, KPIs, ledger and evidence. On load the page
// reruns RadarBoard.build (the code main.ts ran) on the same snapshot and compares every row with board.json.
(function () {
  'use strict';
  var D = window.RADAR, SNAP = window.RADAR_SNAPSHOT;
  var UI = window.UI = { D: D, SNAP: SNAP };

  // ---- formatting ----
  UI.usd = function (n) {
    if (n === null || n === undefined) return 'n/a';
    var a = Math.abs(n), s = n < 0 ? '-$' : '$';
    if (a >= 1e9) return s + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e4) return s + Math.round(a / 1e3) + 'K';
    if (a >= 100) return s + Math.round(a).toLocaleString('en-US');
    return s + a.toFixed(2);
  };
  UI.pct = function (n) { return n === null || n === undefined ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; };
  UI.age = function (d) { return d === null || d === undefined ? 'undated' : d >= 365 ? (d / 365).toFixed(1) + ' yr' : d + ' d'; };
  UI.x = function (n) { return '×' + n.toFixed(2); };
  UI.el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined && text !== null) n.textContent = text; return n; };
  UI.add = function (p) { for (var i = 1; i < arguments.length; i++) { var c = arguments[i]; if (c) p.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); } return p; };
  UI.table = function (heads, rows, leftCols) {
    var t = UI.el('table'), hr = UI.el('tr');
    heads.forEach(function (h, i) { hr.appendChild(UI.el('th', leftCols.indexOf(i) >= 0 ? 'l' : '', h)); });
    UI.add(t, UI.add(UI.el('thead'), hr));
    var tb = UI.el('tbody');
    rows.forEach(function (r) {
      var tr = UI.el('tr');
      r.forEach(function (c, i) { var td = UI.el('td', leftCols.indexOf(i) >= 0 ? 'l t' : ''); if (c && c.nodeType) td.appendChild(c); else td.textContent = c; tr.appendChild(td); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); return t;
  };

  // ---- the proof: rebuild the board here and compare ----
  UI.proof = (function () {
    var t0 = performance.now(), again, err = null;
    try { again = window.RadarBoard.build(SNAP); } catch (e) { err = String(e); }
    var ms = Math.round(performance.now() - t0), same = 0, diffs = [];
    if (again) D.board.forEach(function (r, i) {
      var b = again.board[i];
      var ok = b && b.slug === r.slug && b.rank === r.rank && b.implied_value_usd === r.implied_value_usd && b.launch_value_usd === r.launch_value_usd && b.token_odds === r.token_odds && b.farm.net === r.farm.net && b.farm.verdict === r.farm.verdict;
      if (ok) same++; else if (diffs.length < 3) diffs.push(r.slug);
    });
    // coefficients agree to 1e-9 (two JS engines may differ in the last bit of Math.exp)
    var maxDiff = 0;
    if (again) [['value_w'], ['odds_w']].forEach(function (k) { D.model[k].forEach(function (w, i) { maxDiff = Math.max(maxDiff, Math.abs(w - again.model[k][i]) / Math.max(1, Math.abs(w))); }); });
    var coefSame = again && maxDiff < 1e-9;
    var testsOk = again && again.tests.every(function (t) { return t.ok; });
    var total = 0; Object.keys(D.ledger).forEach(function (k) { total += D.ledger[k]; });
    return { ms: ms, same: same, n: D.board.length, diffs: diffs, coefSame: !!coefSame, maxDiff: maxDiff, testsOk: !!testsOk, err: err, ledgerTotal: total, again: again };
  })();

  UI.state = { view: 'board', sel: D.board[0].slug, verdict: 'all', scope: 'all', q: '', cat: 'all', chain: 'all', deposit: D.model.farm.deposit, sort: 'rank', dir: 1 };
  (function readHash() {
    location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('='), k = decodeURIComponent(p[0]), v = decodeURIComponent(p[1] || '');
      if (k in UI.state) UI.state[k] = typeof UI.state[k] === 'number' ? Number(v) : v;
    });
  })();
  UI.writeHash = function () {
    var s = UI.state;
    history.replaceState(null, '', '#' + Object.keys(s).map(function (k) { return k + '=' + encodeURIComponent(s[k]); }).join('&'));
  };

  // Economics at the deposit the reader picked: the same economics() main.ts ran at $5,000.
  UI.econ = function (r) {
    if (UI.state.deposit === D.model.farm.deposit) return r.farm;
    return window.RadarBoard.economics({ implied: r.implied_value_usd, tvl: r.tvl_usd, chain: r.farm_chain }, UI.state.deposit);
  };

  // ---- header, KPIs, ledger, integrity, evidence ----
  UI.header = function () {
    var P = UI.proof, M = D.model, badge = document.getElementById('proof');
    var ok = !P.err && P.same === P.n && P.coefSame && P.testsOk;
    badge.className = 'proof' + (ok ? '' : ' bad');
    badge.textContent = ok ? '✓ recomputed here: ' + P.same + '/' + P.n + ' rows equal board.json (' + P.ms + ' ms)' : '✗ ' + (P.err || (P.n - P.same) + ' rows differ: ' + P.diffs.join(', '));
    document.getElementById('meta').textContent = 'DefiLlama snapshot ' + SNAP.as_of + ' · ' + SNAP.protocols.length + ' protocols · model radar-v2';
    document.getElementById('foot').textContent = 'Implied value is this radar\'s estimate from the snapshot\'s figures, never a forecast that a token will launch and never make.fun\'s. "Records no token" means DefiLlama\'s record carries none. Farm verdicts are arithmetic on stated assumptions (' + Math.round(M.farm.drop_share * 100) + '% of launch value to users, ' + M.farm.weeks + ' weeks, T-bill ' + M.farm.tbill * 100 + '%, $' + M.farm.hourly_bar + '/h bar), not advice.';
  };

  UI.kpis = function () {
    var M = D.model, vs = M.value_steps, os = M.odds_steps, vf = vs.filter(function (s) { return s.kept; }).pop(), of = os.filter(function (s) { return s.kept; }).pop();
    var v = { FARM: 0, THIN: 0, SKIP: 0 }; D.board.forEach(function (r) { v[UI.econ(r).verdict]++; });
    var watch = D.board.filter(function (r) { return r.on_watchlist; }).length, tot = D.board.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var k = UI.el('section', 'kpis');
    [['Launch value, held-out miss', UI.x(vf.a), 'leave-one-out; walk-forward ' + UI.x(vf.b) + ' vs flat multiple ' + UI.x(vs[0].a) + ' / ' + UI.x(vs[0].b)],
     ['Token odds, Brier score', of.a.toFixed(3), '10-fold; walk-forward ' + of.b.toFixed(3) + ' vs base rate ' + os[0].a.toFixed(3) + ' / ' + os[0].b.toFixed(3)],
     ['Is the range honest?', Math.round(M.coverage.iqr * 100) + '% · ' + Math.round(M.coverage.p80 * 100) + '%', 'later-listed caps inside P25-P75 · P10-P90 (stated 50% · 80%)'],
     ['Worth farming at ' + UI.usd(UI.state.deposit), v.FARM + ' FARM', v.THIN + ' thin, ' + v.SKIP + ' skip: net of every fee and a T-bill'],
     ['Watchlist ranked', watch + ' / ' + SNAP.watchlist.length, 'plus ' + (D.board.length - watch) + ' beyond it (' + D.board.filter(function (r) { return !r.on_watchlist && r.tvl_usd >= SNAP.floor_usd; }).length + ' off-list above the floor)'],
     ['Implied value on the board', UI.usd(tot), D.board.length + ' rows · terms kept: ' + M.value_terms.join(', ') + ' | ' + M.odds_terms.join(', ')]
    ].forEach(function (c) { UI.add(k, UI.add(UI.el('div', 'kpi'), UI.el('div', 'k', c[0]), UI.el('b', '', c[1]), UI.el('div', 's', c[2]))); });
    return k;
  };

  var GROUPS = [['ranked_watch', 'Ranked · watchlist', '#6cc4ff'], ['ranked_early', 'Ranked · beyond the watchlist', '#3ee6a8'], ['traded', 'Token trades · priced peer', '#f5b84b'], ['token_recorded', 'Token recorded · no usable cap', '#9b7a3a'], ['out_exchange', 'Out · exchange', '#5f7090'], ['out_bridge', 'Out · bridge', '#4b5a78'], ['out_staking', 'Out · liquid staking', '#3d4a66'], ['out_versioned', 'Out · versioned or wrapped', '#323d55'], ['out_empty', 'Out · no TVL', '#2a3347']];
  UI.ledger = function () {
    var P = UI.proof, p = UI.el('section', 'panel ledger');
    p.appendChild(UI.el('h2', '', 'Protocol accounting · all ' + SNAP.protocols.length + ' snapshot protocols, each in exactly one group'));
    var bar = UI.el('div', 'bar'), lg = UI.el('div', 'legend');
    GROUPS.forEach(function (g) {
      var n = D.ledger[g[0]] || 0; if (!n) return;
      var s = UI.el('span'); s.style.width = (100 * n / SNAP.protocols.length) + '%'; s.style.background = g[2]; s.title = g[1] + ': ' + n; bar.appendChild(s);
      var i = UI.el('i'); i.style.background = g[2]; UI.add(lg, UI.add(UI.el('span'), i, g[1], UI.el('b', '', String(n))));
    });
    UI.add(p, bar, lg);
    var ch = UI.el('div', 'checks');
    var browser = [[P.same === P.n, 'board.json: ' + P.same + '/' + P.n + ' rows recomputed here'], [P.coefSame, 'refit here: both models\' coefficients match (max diff ' + P.maxDiff.toExponential(0) + ')']];
    browser.concat(D.tests.map(function (t) { return [t.ok, t.id + ': ' + t.detail]; })).forEach(function (c) { ch.appendChild(UI.el('span', 'chk' + (c[0] ? '' : ' bad'), (c[0] ? '✓ ' : '✗ ') + c[1])); });
    p.appendChild(ch);
    return p;
  };

  UI.evidence = function () {
    var M = D.model, p = UI.el('section', 'panel'), g = UI.el('div', 'evidence');
    function steps(list, fa, fb, a, b) {
      return UI.table(['Term, added in order', a, b, ''], list.map(function (s, i) {
        return [(i ? '+ ' : '') + s.term, fa(s.a), fb(s.b), UI.el('span', s.kept ? 'kept' : 'drop', i === 0 ? 'baseline' : s.kept ? '✓ kept' : '✗ dropped')];
      }), [0]);
    }
    var v = UI.el('div'); UI.add(v, UI.el('h2', '', 'Launch value · typical held-out miss, ' + M.value_n + ' traded tokens'), steps(M.value_steps, UI.x, UI.x, 'Leave-one-out', 'Walk-forward'));
    var o = UI.el('div'); UI.add(o, UI.el('h2', '', 'Token odds · held-out Brier, ' + M.odds_n + ' protocols'), steps(M.odds_steps, function (n) { return n.toFixed(3); }, function (n) { return n.toFixed(3); }, '10-fold', 'Walk-forward'));
    var q = M.quantiles, row = UI.el('div', 'charts');
    var c1 = UI.el('div'); UI.add(c1, UI.el('h2', '', 'The curve the launch value reads off · ' + M.value_n + ' traded tokens'), UI.scatter(null, 700, 250));
    var c2 = UI.el('div'); UI.add(c2, UI.el('h2', '', 'Are the odds honest?'), UI.calibration());
    var c3 = UI.el('div'); UI.add(c3, UI.el('h2', '', 'How to read the tests'),
      UI.el('p', 'note', 'A term stays only if BOTH held-out tests improve. Walk-forward fits on tokens listed before ' + M.walk_cut + ' and scores the ' + M.value_test_n + ' listed after: the amber dots.'),
      UI.el('p', 'note', 'Row ranges are the leave-one-out misses: P25-P75 is ' + UI.x(Math.exp(q.p25)) + ' to ' + UI.x(Math.exp(q.p75)) + '. ' + Math.round(M.coverage.iqr * 100) + '% of the later-listed tokens land inside it, ' + Math.round(M.coverage.p80 * 100) + '% inside P10-P90.'),
      UI.el('p', 'note', 'Odds: held-out predictions in 8 bins against the share that record a token. The dashed line is perfect calibration.'));
    UI.add(g, v, o); UI.add(row, c1, c2, c3); UI.add(p, g, row);
    return p;
  };
})();
