// Token Radar's page. It reads window.RADAR (data.js, written by main.ts from the same board as
// board.json) and renders three views: the ranked pre-token board (sortable, filterable, with a detail
// view per protocol), the live tokens the peer multiples come from, and the model itself. No network.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) { document.body.textContent = 'data.js is missing: run main.ts first.'; return; }
  var M = D.model;

  // Rows arrive as arrays (compact data.js); rebuild objects by the column list main.ts wrote.
  var ROWS = D.rows.map(function (a) { var o = {}; D.cols.forEach(function (c, i) { o[c] = a[i]; }); return o; });
  var BY = {}; ROWS.forEach(function (r) { BY[r.slug] = r; });
  var PEER = {}; D.peers.forEach(function (p) { PEER[p.category] = p; });

  var S = { tab: 'board', q: '', cat: 'all', chain: 'all', phase: 'all', scope: 'all', minTvl: 0, sort: 'implied_value_usd', dir: -1, sel: ROWS[0].slug };
  readHash();

  // ---- formatting ----
  function usd(n) {
    if (n === null || n === undefined) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n.toFixed(n < 10 ? 2 : 0);
  }
  function pct(n) { return n === null || n === undefined ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function age(d) { return d === null || d === undefined ? 'undated' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd'; }
  function x(n) { return n.toFixed(n < 0.1 ? 3 : 2) + 'x'; }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function add(parent) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]); return parent; }

  // ---- the model, again: the page re-derives each implied value from the row's own inputs ----
  function recompute(r) {
    var g = Math.min(M.growth_cap, Math.max(M.growth_floor, r.change_7d === null ? 0 : r.change_7d));
    var growth = Math.exp(M.growth_slope * g / 100);
    var a = r.age_days === null ? M.age_unknown_days : r.age_days;
    var ageMult = M.age_floor + (1 - M.age_floor) * Math.min(a, M.age_full_days) / M.age_full_days;
    return Math.max(1, Math.round(r.tvl_usd * r.peer_multiple * Math.round(growth * 1e4) / 1e4 * Math.round(ageMult * 1e4) / 1e4));
  }

  // ---- state in the URL hash, so a view can be linked and captured ----
  function readHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (kv) {
      var p = kv.split('='); var k = decodeURIComponent(p[0]); var v = decodeURIComponent(p[1] || '');
      if (k in S) S[k] = k === 'dir' || k === 'minTvl' ? Number(v) : v;
    });
  }
  function writeHash() {
    var parts = ['tab', 'q', 'cat', 'chain', 'phase', 'scope', 'minTvl', 'sort', 'dir', 'sel'].map(function (k) { return k + '=' + encodeURIComponent(S[k]); });
    history.replaceState(null, '', '#' + parts.join('&'));
  }

  function filtered() {
    var q = S.q.toLowerCase();
    var rows = ROWS.filter(function (r) {
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      if (S.cat !== 'all' && (r.category || 'Uncategorised') !== S.cat) return false;
      if (S.chain !== 'all' && r.chains.indexOf(S.chain) < 0) return false;
      if (S.phase !== 'all' && r.phase !== S.phase) return false;
      if (S.scope === 'watch' && !r.on_watchlist) return false;
      if (S.scope === 'early' && r.on_watchlist) return false;
      return r.tvl_usd >= S.minTvl * 1e6;
    });
    var k = S.sort, d = S.dir;
    rows.sort(function (a, b) {
      var va = a[k], vb = b[k];
      if (va === null) return 1; if (vb === null) return -1;
      if (typeof va === 'string') return d * va.localeCompare(vb);
      return d * (va - vb) || a.rank - b.rank;
    });
    return rows;
  }

  // ---- header, tabs, KPIs ----
  function header() {
    var meta = document.getElementById('meta');
    meta.textContent = 'Snapshot ' + D.as_of + ' · ' + D.source + ' · model ' + M.version;
    var tabs = document.getElementById('tabs'); tabs.textContent = '';
    [['board', 'Pre-token board (' + ROWS.length + ')'], ['live', 'Live tokens: the peers (' + D.live.length + ')'], ['model', 'How the value is made']].forEach(function (t) {
      var b = el('button', '', t[1]); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(S.tab === t[0]));
      b.addEventListener('click', function () { S.tab = t[0]; render(); });
      tabs.appendChild(b);
    });
    var k = document.getElementById('kpis'); k.textContent = '';
    var watch = ROWS.filter(function (r) { return r.on_watchlist; }).length;
    var total = ROWS.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    [[ROWS.length, 'pre-token protocols ranked'], [watch + '/' + D.watchlist, 'watchlist covered'], [ROWS.length - watch, 'found beyond the watchlist'], [x(D.market_multiple), 'market mcap/TVL, ' + D.live.length + '+ traded peers'], [usd(total), 'implied value on the board']].forEach(function (p) {
      var c = el('div', 'kpi'); add(c, el('b', '', String(p[0])), el('span', '', p[1])); k.appendChild(c);
    });
    document.getElementById('foot').textContent = 'Implied value is this radar\'s own claim from the snapshot\'s figures, never a forecast that a token will launch, and never make.fun\'s. "Records no token" means DefiLlama\'s record carries none. Farm plans are risk notes, not advice.';
  }

  function select(label, value, options, onChange) {
    var l = el('label', '', label); var s = el('select');
    options.forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; if (o[0] === value) op.selected = true; s.appendChild(op); });
    s.addEventListener('change', function () { onChange(s.value); render(); });
    l.appendChild(s); return l;
  }
  function uniq(list) { return list.filter(function (v, i) { return list.indexOf(v) === i; }).sort(); }

  // ---- the board ----
  var COLS = [
    ['rank', '#', 'r'], ['name', 'Protocol', 'l'], ['chains', 'Chains', 'l'], ['tvl_usd', 'TVL', 'r'], ['change_7d', '7d', 'r'],
    ['age_days', 'No token for', 'r'], ['peer_multiple', 'Peer x', 'r'], ['implied_value_usd', 'Implied value', 'r'], ['airdrop_per_1k_usd', 'Per $1k', 'r'], ['plan_cost_usd', 'Plan $', 'r']
  ];
  function board(pane) {
    var c = el('div', 'controls');
    var q = el('input'); q.type = 'search'; q.placeholder = 'Search protocols'; q.value = S.q;
    q.addEventListener('input', function () { S.q = q.value; renderTable(); writeHash(); });
    c.appendChild(q);
    ['all', 'watch', 'early'].forEach(function (s) {
      var b = el('button', 'chip' + (S.scope === s ? ' on' : ''), s === 'all' ? 'All' : s === 'watch' ? 'Watchlist' : 'Beyond the watchlist');
      b.addEventListener('click', function () { S.scope = s; render(); }); c.appendChild(b);
    });
    add(c,
      select('Category', S.cat, [['all', 'All']].concat(uniq(ROWS.map(function (r) { return r.category || 'Uncategorised'; })).map(function (v) { return [v, v]; })), function (v) { S.cat = v; }),
      select('Chain', S.chain, [['all', 'All']].concat(uniq([].concat.apply([], ROWS.map(function (r) { return r.chains; }))).map(function (v) { return [v, v]; })), function (v) { S.chain = v; }),
      select('Phase', S.phase, [['all', 'All'], ['early', 'Early (<180d)'], ['maturing', 'Maturing'], ['overdue', 'Overdue (2y+)'], ['undated', 'Undated']], function (v) { S.phase = v; }),
      select('Min TVL', String(S.minTvl), [['0', 'any'], ['10', '$10M'], ['50', '$50M'], ['100', '$100M'], ['500', '$500M']], function (v) { S.minTvl = Number(v); })
    );
    c.appendChild(el('span', 'count')).id = 'count';
    pane.appendChild(c);
    var w = el('div', 'tablewrap'); w.id = 'tablewrap'; pane.appendChild(w);
    renderTable();
  }
  function renderTable() {
    var rows = filtered();
    var w = document.getElementById('tablewrap'); w.textContent = '';
    document.getElementById('count').textContent = rows.length + ' of ' + ROWS.length + ' rows';
    var t = el('table'); var hr = el('tr');
    COLS.forEach(function (col) {
      var th = el('th', (col[2] === 'l' ? 'l ' : '') + (S.sort === col[0] ? 'sorted' : ''), col[1] + (S.sort === col[0] ? (S.dir < 0 ? ' ▾' : ' ▴') : ''));
      th.addEventListener('click', function () { if (S.sort === col[0]) S.dir = -S.dir; else { S.sort = col[0]; S.dir = col[0] === 'rank' || col[0] === 'name' ? 1 : -1; } renderTable(); writeHash(); });
      hr.appendChild(th);
    });
    add(t, add(el('thead'), hr));
    var top = ROWS[0].implied_value_usd; var tb = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr', r.slug === S.sel ? 'sel' : '');
      var nm = el('td', 'name l'); nm.appendChild(document.createTextNode(r.name));
      if (r.on_watchlist) nm.appendChild(el('span', 'pill watch', 'watch'));
      nm.appendChild(el('small', '', r.category || 'Uncategorised'));
      var iv = el('td'); var bar = el('span', 'bar'); bar.style.width = Math.max(2, Math.round(60 * Math.sqrt(r.implied_value_usd / top))) + 'px';
      add(iv, bar, document.createTextNode(usd(r.implied_value_usd)));
      var ag = el('td'); ag.appendChild(el('span', 'pill ' + r.phase, age(r.age_days)));
      add(tr, el('td', '', String(r.rank)), nm, el('td', 'l', r.chains[0] ? r.chains[0] + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') : 'n/a'),
        el('td', '', usd(r.tvl_usd)), el('td', r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : '', pct(r.change_7d)), ag,
        el('td', '', x(r.peer_multiple)), iv, el('td', '', usd(r.airdrop_per_1k_usd)), el('td', '', usd(r.plan_cost_usd)));
      tr.addEventListener('click', function () { S.sel = r.slug; renderTable(); detail(); writeHash(); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); w.appendChild(t);
  }

  // ---- the detail view ----
  function detail() {
    var d = document.getElementById('detail'); d.textContent = '';
    var r = BY[S.sel] || ROWS[0];
    var peer = PEER[r.category || 'Uncategorised'];
    var head = el('div'); add(head, el('div', 'sub', '#' + r.rank + ' of ' + ROWS.length + ' · ' + (r.category || 'Uncategorised') + (r.on_watchlist ? ' · on the watchlist' : ' · beyond the watchlist')), el('h2', '', r.name), el('div', 'big', usd(r.implied_value_usd)), el('div', 'sub', 'implied value if ' + r.name + ' launched a token on today\'s record'));
    d.appendChild(head);
    var f = el('div', 'formula');
    var again = recompute(r);
    [['TVL', usd(r.tvl_usd)], ['× peer multiple', x(r.peer_multiple) + ' (' + (r.peers ? r.peers + ' traded ' + (r.category || '') + ' peer' + (r.peers > 1 ? 's' : '') : 'no traded peer: market median') + ')'],
     ['× growth', x(r.growth_multiplier) + ' (7d ' + pct(r.change_7d) + (r.change_7d !== null && r.growth_input_pct !== Math.round(r.change_7d * 1e4) / 1e4 ? ', clamped to ' + pct(r.growth_input_pct) : '') + ')'], ['× track record', x(r.age_multiplier) + ' (' + r.age_input_days + ' days with no token' + (r.age_days === null ? ', assumed' : '') + ')']].forEach(function (p) {
      var line = el('div'); add(line, el('span', '', p[0] + ' '), el('b', '', p[1])); f.appendChild(line);
    });
    var eq = el('div', 'eq', '= ' + usd(r.implied_value_usd)); eq.appendChild(el('span', again === r.implied_value_usd ? 'ok' : 'bad', again === r.implied_value_usd ? '  ✓ the page re-derives board.json\'s figure' : '  ✗ page and board disagree'));
    f.appendChild(eq); d.appendChild(f);
    var facts = el('div', 'facts');
    [['Chains', r.chains.slice(0, 3).join(', ') || 'n/a'], ['Tracked since', r.listed_at || 'undated'], ['Phase', r.phase], ['Per $1,000 farmed', usd(r.airdrop_per_1k_usd)], ['Plan capital + gas', usd(r.plan_cost_usd)], ['Plan length', r.plan_days + ' days']].forEach(function (p) {
      var k = el('div'); add(k, el('span', '', p[0]), el('b', '', p[1])); facts.appendChild(k);
    });
    d.appendChild(facts);
    if (peer && peer.examples.length) d.appendChild(el('div', 'note', 'Peers priced: ' + peer.examples.join(', ') + (peer.median_multiple ? ' (their median ' + x(peer.median_multiple) + ', shrunk to ' + x(peer.multiple) + ')' : '')));
    d.appendChild(el('h2', '', 'Farm plan'));
    var ol = el('ol', 'steps');
    r.farm_steps.forEach(function (s) {
      var m = /^(.*?) Cost: (.*?)\. Time: (.*?)\.$/.exec(s);
      var li = el('li', '', m ? m[1] : s);
      if (m) { var ct = el('div', 'ct'); add(ct, el('em', '', m[2]), el('em', 't', m[3])); li.appendChild(ct); }
      ol.appendChild(li);
    });
    d.appendChild(ol);
    d.appendChild(el('div', 'note', 'Per $1,000 assumes ' + Math.round(M.airdrop_share * 100) + '% of the implied value goes to users pro rata to TVL. It is an order of magnitude, not a promise.'));
  }

  // ---- the live tokens ----
  function live(pane) {
    var w = el('div', 'tablewrap'); var t = el('table'); var hr = el('tr');
    ['Protocol', 'Symbol', 'Category', 'TVL', 'Market cap', 'mcap/TVL', '7d'].forEach(function (h, i) { hr.appendChild(el('th', i < 3 ? 'l' : '', h)); });
    add(t, add(el('thead'), hr)); var tb = el('tbody');
    D.live.forEach(function (r) {
      var tr = el('tr');
      add(tr, el('td', 'name l', r.name), el('td', 'l', r.symbol || ''), el('td', 'l', r.category || ''), el('td', '', usd(r.tvl_usd)), el('td', '', usd(r.mcap_usd)), el('td', '', x(r.multiple)), el('td', r.change_7d > 0 ? 'up' : 'down', pct(r.change_7d)));
      tb.appendChild(tr);
    });
    t.appendChild(tb); w.appendChild(t);
    pane.appendChild(add(el('div', 'controls'), el('span', 'sub', 'These tokens already trade: they are never ranked, only used to price the pre-token board. Top ' + D.live.length + ' by market cap.')));
    pane.appendChild(w);
  }

  // ---- the model ----
  function model(pane) {
    var m = el('div', 'model');
    add(m, el('h2', '', 'Implied value = TVL × peer multiple × growth × track record'),
      el('p', '', 'Peer multiple: for each category, the median market-cap-to-TVL multiple of the snapshot\'s own traded tokens (each clamped to ' + M.multiple_min + 'x..' + M.multiple_max + 'x, medians taken in log space), shrunk toward the all-market median ' + x(D.market_multiple) + ' with ' + M.peer_shrink + ' pseudo-peers, so a category with one traded token borrows most of its multiple from the market.'),
      el('p', '', 'Growth: exp(' + M.growth_slope + ' × 7-day TVL change / 100), the change clamped to ' + M.growth_floor + '%..+' + M.growth_cap + '%. A missing change counts as 0.'),
      el('p', '', 'Track record: ' + M.age_floor + ' + ' + (1 - M.age_floor).toFixed(1) + ' × min(days tracked, ' + M.age_full_days + ') / ' + M.age_full_days + '. A protocol that has held TVL for two years with no token is priced as a proven peer; a new one is discounted. Undated protocols are scored at ' + M.age_unknown_days + ' days and marked undated.'),
      el('p', '', 'Universe: every protocol on the watchlist, plus every protocol below the floor that records no token and is not a bridge, liquid-staking or exchange product, a versioned pool or a wrapped/staked name. No protocol name is special-cased.'));
    var t = el('table'); var hr = el('tr');
    ['Category', 'Traded peers', 'Their median', 'Multiple used', 'Example peers'].forEach(function (h, i) { hr.appendChild(el('th', i === 0 || i === 4 ? 'l' : '', h)); });
    add(t, add(el('thead'), hr)); var tb = el('tbody');
    D.peers.forEach(function (p) {
      add(tb, add(el('tr'), el('td', 'name l', p.category), el('td', '', String(p.peers)), el('td', '', p.median_multiple ? x(p.median_multiple) : 'n/a'), el('td', '', x(p.multiple)), el('td', 'l', p.examples.join(', '))));
    });
    t.appendChild(tb); m.appendChild(add(el('div', 'tablewrap'), t));
    pane.appendChild(m);
  }

  function render() {
    header();
    var pane = document.getElementById('pane'); pane.textContent = '';
    document.querySelector('.layout').style.gridTemplateColumns = S.tab === 'board' ? '' : '1fr';
    document.getElementById('detail').style.display = S.tab === 'board' ? '' : 'none';
    if (S.tab === 'board') { board(pane); detail(); } else if (S.tab === 'live') live(pane); else model(pane);
    writeHash();
  }
  render();
})();
