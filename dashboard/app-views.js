// Token Radar page, part 2: the views. Board (sortable, filterable, deposit-aware verdicts), a detail
// view per protocol (how its figure is made, nearest priced peers, farm verdict grid, the plan) and the
// priced peers the launch value is fitted on.
(function () {
  'use strict';
  var UI = window.UI, D = UI.D, SNAP = UI.SNAP, S = UI.state, el = UI.el, add = UI.add;
  var RM = window.RadarModel, ST = window.RadarStats, M = D.model;
  var FEAT = {}; RM.features(SNAP).forEach(function (f) { FEAT[f.slug] = f; });
  var TRADED = Object.keys(FEAT).map(function (k) { return FEAT[k]; }).filter(function (f) { return f.lm !== null; });
  var CATS = []; TRADED.forEach(function (f) { if (CATS.indexOf(f.cat) < 0) CATS.push(f.cat); }); CATS.sort();
  var VD = RM.valueDesign(M.value_terms, CATS);
  function launchOf(f) { return Math.exp(ST.dot(M.value_w, VD.row(f)) + VD.offset(f)); }

  function seg(opts, cur, on) {
    var s = el('div', 'seg');
    opts.forEach(function (o) { var b = el('button', o[0] === cur ? 'on' : '', o[1]); b.addEventListener('click', function () { on(o[0]); render(); }); s.appendChild(b); });
    return s;
  }
  function sel(label, cur, opts, on) {
    var s = el('select'); s.setAttribute('aria-label', label);
    opts.forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; op.selected = String(o[0]) === String(cur); s.appendChild(op); });
    s.addEventListener('change', function () { on(s.value); render(); });
    return s;
  }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }).sort(); }

  // ---- board ----
  var COLS = [['rank', '#'], ['name', 'Protocol'], ['tvl_usd', 'TVL'], ['change_7d', '7D'], ['age_days', 'No token for'], ['token_odds', 'Token odds'], ['launch_value_usd', 'If it launches'], ['implied_value_usd', 'Implied value · P25-P75'], ['net', 'Verdict · net'], ['per_hour', 'Net / hour'], ['breakeven', 'Break-even deposit']];
  function rows() {
    var q = S.q.toLowerCase();
    var list = D.board.map(function (r) { var e = UI.econ(r); return { r: r, e: e, net: e.net, per_hour: e.per_hour, breakeven: e.breakeven }; }).filter(function (x) {
      var r = x.r;
      if (S.verdict !== 'all' && x.e.verdict !== S.verdict) return false;
      if (S.scope === 'watch' && !r.on_watchlist) return false;
      if (S.scope === 'early' && r.on_watchlist) return false;
      if (S.cat !== 'all' && (r.category || 'Uncategorised') !== S.cat) return false;
      if (S.chain !== 'all' && r.chains.indexOf(S.chain) < 0) return false;
      return !q || (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) >= 0;
    });
    list.sort(function (a, b) {
      var k = S.sort, va = k in a ? a[k] : a.r[k], vb = k in b ? b[k] : b.r[k];
      if (va === null) return 1; if (vb === null) return -1;
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * S.dir || a.r.rank - b.r.rank;
    });
    return list;
  }
  function board(app) {
    add(app, UI.kpis(), UI.ledger(), UI.evidence());
    var p = el('section', 'panel board'), c = el('div', 'controls');
    var vc = { all: D.board.length, FARM: 0, THIN: 0, SKIP: 0 }; D.board.forEach(function (r) { vc[UI.econ(r).verdict]++; });
    add(c, seg([['all', 'All ' + vc.all], ['FARM', 'Farm ' + vc.FARM], ['THIN', 'Thin ' + vc.THIN], ['SKIP', 'Skip ' + vc.SKIP]], S.verdict, function (v) { S.verdict = v; }),
      seg([['all', 'All tiers'], ['watch', 'Watchlist'], ['early', 'Beyond the watchlist']], S.scope, function (v) { S.scope = v; }));
    var q = el('input'); q.type = 'search'; q.placeholder = 'Search name, chain, category'; q.value = S.q;
    q.addEventListener('input', function () { S.q = q.value; draw(); UI.writeHash(); });
    add(c, q, sel('Category', S.cat, [['all', 'All categories']].concat(uniq(D.board.map(function (r) { return r.category || 'Uncategorised'; })).map(function (v) { return [v, v]; })), function (v) { S.cat = v; }),
      sel('Chain', S.chain, [['all', 'All chains']].concat(uniq([].concat.apply([], D.board.map(function (r) { return r.chains; }))).map(function (v) { return [v, v]; })), function (v) { S.chain = v; }),
      el('span', 'sub', 'Deposit'), sel('Deposit', S.deposit, [1000, 3000, 5000, 10000, 30000, 100000].map(function (d) { return [d, UI.usd(d) + (d === M.farm.deposit ? ' (board)' : '')]; }), function (v) { S.deposit = Number(v); }));
    var cnt = el('span', 'count'); c.appendChild(cnt);
    var sc = el('div', 'scroll'); add(p, c, sc); app.appendChild(p);
    function draw() {
      var list = rows(), t = el('table'), hr = el('tr');
      cnt.textContent = list.length + ' of ' + D.board.length + ' rows · ' + UI.usd(list.reduce(function (s, x) { return s + x.r.tvl_usd; }, 0)) + ' TVL';
      COLS.forEach(function (col, i) {
        var th = el('th', (i === 1 ? 'l ' : '') + (S.sort === col[0] ? 'on' : ''), col[1] + (S.sort === col[0] ? (S.dir > 0 ? ' ↑' : ' ↓') : ''));
        th.addEventListener('click', function () { if (S.sort === col[0]) S.dir = -S.dir; else { S.sort = col[0]; S.dir = col[0] === 'rank' || col[0] === 'name' ? 1 : -1; } draw(); UI.writeHash(); });
        hr.appendChild(th);
      });
      add(t, add(el('thead'), hr)); var tb = el('tbody');
      list.forEach(function (x) {
        var r = x.r, e = x.e, tr = el('tr'), nm = el('td', 'name l');
        add(nm, r.name, r.on_watchlist ? el('span', 'tag w', 'Watchlist') : r.tvl_usd >= SNAP.floor_usd ? el('span', 'tag o', 'Off-list') : el('span', 'tag e', 'Early'), el('small', '', (r.category || 'Uncategorised') + ' · ' + r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '')));
        var od = el('td'), ob = el('span', 'ob'); ob.style.width = Math.round(40 * r.token_odds) + 'px'; add(od, ob, Math.round(r.token_odds * 100) + '%');
        var iv = el('td'); add(iv, el('b', '', UI.usd(r.implied_value_usd)), el('span', 'rng', UI.usd(r.range_p25_p75[0]) + '-' + UI.usd(r.range_p25_p75[1])));
        var vd = el('td'); add(vd, el('span', 'v ' + e.verdict, e.verdict), el('span', e.net >= 0 ? 'pos' : 'neg', UI.usd(e.net)));
        add(tr, el('td', '', String(r.rank)), nm, el('td', '', UI.usd(r.tvl_usd)), el('td', r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'dn' : '', UI.pct(r.change_7d)), el('td', '', UI.age(r.age_days)), od,
          el('td', '', UI.usd(r.launch_value_usd)), iv, vd, el('td', e.per_hour >= 0 ? 'pos' : 'neg', UI.usd(e.per_hour)), el('td', '', e.breakeven === null ? 'none' : UI.usd(e.breakeven)));
        tr.addEventListener('click', function () { S.sel = r.slug; S.view = 'detail'; render(); window.scrollTo(0, 0); });
        tb.appendChild(tr);
      });
      t.appendChild(tb); sc.textContent = ''; sc.appendChild(t);
    }
    draw();
  }

  // ---- detail ----
  function detail(app) {
    var r = D.board.filter(function (b) { return b.slug === S.sel; })[0] || D.board[0], f = FEAT[r.slug], e = UI.econ(r);
    var back = el('span', 'back', '← Board'); back.addEventListener('click', function () { S.view = 'board'; render(); });
    var head = el('section', 'panel'), hero = el('div', 'hero'), left = el('div'), right = el('div');
    add(left, back, el('div', 'sub', '#' + r.rank + ' of ' + D.board.length + ' by implied value · ' + (r.on_watchlist ? 'on the watchlist' : r.tvl_usd >= SNAP.floor_usd ? 'off-list: above the floor, so the house rule found a DefiLlama parent; it still records no token itself' : 'below the $' + SNAP.floor_usd / 1e6 + 'M floor') + ' · ' + (r.category || 'Uncategorised')), el('h1', '', r.name));
    add(right, el('div', 'sub', 'Implied value · launch value × token odds'), el('div', 'big', UI.usd(r.implied_value_usd)), el('div', 'sub', 'P25-P75 ' + UI.usd(r.range_p25_p75[0]) + '-' + UI.usd(r.range_p25_p75[1]) + ' · P10-P90 ' + UI.usd(r.range_p10_p90[0]) + '-' + UI.usd(r.range_p10_p90[1])));
    add(hero, left, right); head.appendChild(hero);
    var facts = el('div', 'facts');
    [['TVL', UI.usd(r.tvl_usd)], ['7-day change', UI.pct(r.change_7d)], ['Tracked since', r.listed_at || 'undated'], ['No token for', UI.age(r.age_days)], ['Chains', r.chains.slice(0, 3).join(', ')], ['Farm on', r.farm_chain], ['If it launches', UI.usd(r.launch_value_usd)], ['Token odds', Math.round(r.token_odds * 100) + '%']].forEach(function (x) { add(facts, add(el('div'), el('span', '', x[0]), el('b', '', x[1]))); });
    head.appendChild(facts); app.appendChild(head);

    var g = el('section', 'detail'), how = el('div', 'panel');
    var lines = [], w = M.value_w, i = 1, base = Math.exp(w[0]);
    lines.push(['Base launch value', 'a token at $100M TVL, fitted on ' + M.value_n + ' traded tokens', UI.usd(base)]);
    if (M.value_terms.indexOf('size') >= 0) { lines.push(['Size curve', 'TVL ' + UI.usd(r.tvl_usd) + ' ^ ' + w[i].toFixed(3) + ' relative to $100M', UI.x(Math.exp(w[i] * f.z))]); i++; }
    else lines.push(['Flat multiple', 'value scales 1:1 with TVL', UI.x(Math.exp(f.z))]);
    if (M.value_terms.indexOf('category') >= 0) { var ci = CATS.indexOf(f.cat); lines.push(['Category · ' + f.cat, 'ridge-shrunk offset', UI.x(Math.exp(ci >= 0 ? w[i + ci] : 0))]); i += CATS.length; }
    [['growth', '7-day growth', f.g * 100, '%'], ['age', 'Years tracked', f.y, ' yr'], ['family', 'Versioned or wrapped name', f.fam, ''], ['chains', 'Chain count', r.chains.length, '']].forEach(function (t) {
      if (M.value_terms.indexOf(t[0]) < 0) return;
      var v = t[0] === 'chains' ? f.ch : t[0] === 'growth' ? f.g : t[0] === 'age' ? f.y : f.fam;
      lines.push([t[1], (Math.round(t[2] * 10) / 10) + t[3] + ', coefficient ' + w[i].toFixed(3), UI.x(Math.exp(w[i] * v))]); i++;
    });
    lines.push(['= Value if a token launches', 'held-out miss ' + UI.x(M.value_steps.filter(function (s) { return s.kept; }).pop().a), UI.usd(launchOf(f))]);
    var ow = M.odds_w, logit = ow[0], oparts = ['intercept ' + ow[0].toFixed(2)];
    M.odds_terms.forEach(function (t, k) { var v = t === 'age' ? f.y : t === 'size' ? f.z : t === 'growth' ? f.g : t === 'chains' ? f.ch : 0; logit += ow[k + 1] * v; oparts.push(t + ' ' + (ow[k + 1] >= 0 ? '+' : '') + (ow[k + 1] * v).toFixed(2)); });
    lines.push(['× Token odds', 'logit ' + oparts.join(', ') + ' = ' + logit.toFixed(2) + ' (base rate ' + Math.round(M.odds_base * 100) + '%)', Math.round(ST.sigmoid(logit) * 100) + '%']);
    lines.push(['= Implied value', 'the board ranks on this', UI.usd(r.implied_value_usd)]);
    var t = UI.table(['Step', 'From the snapshot', ''], lines.map(function (l) { var c = el('div'); add(c, l[0], el('small', '', l[1])); return [c, '', l[2]]; }), [0]);
    t.className = 'how'; t.querySelector('tbody').lastChild.className = 'sum';
    var check = launchOf(f) * ST.sigmoid(logit), okc = Math.max(1, Math.round(check)) === r.implied_value_usd;
    add(how, el('h2', '', 'How the figure is made'), t, el('div', okc ? 'note pos' : 'note neg', okc ? '✓ these factors, multiplied here, give board.json\'s ' + UI.usd(r.implied_value_usd) : '✗ the factors do not reproduce board.json'));
    var peers = TRADED.slice().sort(function (a, b) { return (Math.abs(a.z - f.z) + (a.cat === f.cat ? 0 : 0.7)) - (Math.abs(b.z - f.z) + (b.cat === f.cat ? 0 : 0.7)) || (a.slug < b.slug ? -1 : 1); }).slice(0, 6);
    add(how, el('h2', '', 'Nearest priced peers · their tokens trade'), UI.table(['Token', 'Category', 'TVL', 'Market cap', 'Cap/TVL', 'Model'], peers.map(function (p) { return [p.p.name + (p.p.symbol ? ' · ' + p.p.symbol : ''), p.cat, UI.usd(p.p.tvl_usd), UI.usd(p.p.mcap_usd), UI.x(p.p.mcap_usd / p.p.tvl_usd), UI.usd(launchOf(p))]; }), [0, 1]));

    var farm = el('div', 'panel');
    var vt = el('div'); add(vt, el('span', 'v ' + e.verdict, e.verdict), ' ' + UI.usd(e.deposit) + ' for ' + M.farm.weeks + ' weeks: modelled drop ' + UI.usd(e.drop) + ' less ' + UI.usd(e.fees) + ' fees (' + e.txs + ' transactions) and ' + UI.usd(e.tbill) + ' a T-bill would pay = ', el('b', e.net >= 0 ? 'pos' : 'neg', UI.usd(e.net)), ' net, ' + UI.usd(e.per_hour) + ' an hour over ' + e.hours + ' h.');
    var deps = [1000, 3000, 5000, 10000, 30000], shares = [0.035, 0.07, 0.14];
    var grid = UI.table(['Drop share \\ deposit'].concat(deps.map(UI.usd)), shares.map(function (sh) {
      return [Math.round(sh * 1000) / 10 + '%'].concat(deps.map(function (d) { var x = window.RadarBoard.economics({ implied: r.implied_value_usd * sh / M.farm.drop_share, tvl: r.tvl_usd, chain: r.farm_chain }, d); var s = el('span', x.net >= 0 ? 'pos' : 'neg', UI.usd(x.net)); return s; }));
    }), [0]);
    grid.className = 'grid';
    add(farm, el('h2', '', 'Farm verdict · net of every outflow'), vt, el('div', 'note', 'Drop = implied value × drop share × deposit ÷ (TVL + deposit). Break-even deposit: ' + (e.breakeven === null ? 'none (the drop per dollar is below the T-bill rate)' : UI.usd(e.breakeven)) + '.'), grid);
    var ol = el('ol', 'steps');
    r.farm_steps.forEach(function (s) { var m = /^(.*?) Cost: (.*?)\. Time: (.*?)\.$/.exec(s), li = el('li', '', m ? m[1] + ' ' : s); if (m) add(li, el('em', 'c', m[2]), el('em', 'h', m[3])); ol.appendChild(li); });
    add(farm, el('h2', '', 'Farm plan · ' + r.farm_steps.length + ' steps at the board\'s ' + UI.usd(M.farm.deposit)), ol);
    add(g, how, farm); app.appendChild(g);
  }

  // ---- priced peers ----
  function peers(app) {
    var p = el('section', 'panel'), list = TRADED.slice().sort(function (a, b) { return b.p.mcap_usd - a.p.mcap_usd; });
    add(p, el('h2', '', 'The ' + list.length + ' traded tokens the launch value is fitted on (never ranked)'), UI.table(['Protocol', 'Category', 'Listed', 'TVL', 'Market cap', 'Cap/TVL', 'Model', 'Miss'], list.map(function (f) {
      var m = launchOf(f), miss = f.p.mcap_usd / m; return [f.p.name, f.cat, f.listed || 'undated', UI.usd(f.p.tvl_usd), UI.usd(f.p.mcap_usd), UI.x(f.p.mcap_usd / f.p.tvl_usd), UI.usd(m), UI.x(miss >= 1 ? miss : 1 / miss)];
    }), [0, 1, 2]));
    app.appendChild(p);
  }

  function nav(app) {
    var c = el('div', 'controls'); c.style.padding = '0';
    add(c, seg([['board', 'Board'], ['detail', 'Detail: ' + ((D.board.filter(function (b) { return b.slug === S.sel; })[0] || D.board[0]).name)], ['peers', 'Priced peers']], S.view, function (v) { S.view = v; }));
    app.appendChild(c);
  }

  function render() {
    var app = document.getElementById('app'); app.textContent = '';
    UI.header(); nav(app);
    if (S.view === 'detail') detail(app); else if (S.view === 'peers') peers(app); else board(app);
    UI.writeHash();
  }
  render();
})();
