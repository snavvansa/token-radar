// RadarModel: the radar's two fitted models, run by main.ts to write board.json and run again by the
// page to prove the board. Inputs are the snapshot's own ten fields; no protocol name is special-cased.
//   launch value  ln(mcap) of the snapshot's traded tokens, fitted on size and the terms that survive
//   token odds    P(a protocol records a token), fitted on every protocol but exchanges
// A term is kept only when it lowers the held-out error in BOTH tests (leave-one-out or 10-fold, and
// walk-forward: fit on protocols listed earlier, score the ones listed later).
(function (root) {
  'use strict';
  var S = typeof module !== 'undefined' && module.exports ? require('./core-stats.js') : root.RadarStats;

  var DERIVED = { 'Bridge': 'bridge', 'Canonical Bridge': 'bridge', 'Liquid Staking': 'liquid staking', 'Liquid Restaking': 'liquid staking', 'Restaked BTC': 'liquid staking' };
  var VERSIONED = /\s(v\d+(\.\d+)?|\d+\.\d+)$/i, WRAPPED = /\b(wrapped|staked|staking)\b/i, EXCHANGE = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;
  var DAY = 86400000;

  function hasToken(p) { return p.gecko_id !== null || p.symbol !== null || p.mcap_usd !== null; }
  function traded(p) { return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX'; }
  function ageDays(asOf, d) { return d === null ? null : Math.max(0, Math.floor((Date.parse(asOf + 'T00:00:00Z') - Date.parse(d + 'T00:00:00Z')) / DAY)); }

  // Every protocol lands in exactly one group: the ledger the page draws and the self-test sums.
  function bucketOf(p, watch) {
    if (watch[p.slug]) return 'ranked_watch';
    if (traded(p)) return 'traded';
    if (hasToken(p)) return p.category === 'CEX' ? 'out_exchange' : 'token_recorded';
    if (p.category === 'CEX' || EXCHANGE.test(p.name)) return 'out_exchange';
    if (DERIVED[p.category]) return DERIVED[p.category] === 'bridge' ? 'out_bridge' : 'out_staking';
    if (VERSIONED.test(p.name) || WRAPPED.test(p.name)) return 'out_versioned';
    if (p.tvl_usd <= 0) return 'out_empty';
    return 'ranked_early';
  }

  // The features every term reads, from the ten snapshot fields alone.
  function features(snap) {
    var dated = snap.protocols.map(function (p) { return ageDays(snap.as_of, p.listed_at); }).filter(function (a) { return a !== null; });
    var medAge = S.median(dated) / 365;
    return snap.protocols.map(function (p) {
      var a = ageDays(snap.as_of, p.listed_at);
      return {
        p: p, slug: p.slug, cat: p.category || 'Uncategorised', listed: p.listed_at, age: a,
        z: Math.log(Math.max(p.tvl_usd, 1) / 1e8),
        g: Math.min(80, Math.max(-50, p.change_7d === null ? 0 : p.change_7d)) / 100,
        y: Math.min(6, a === null ? medAge : a / 365),
        fam: VERSIONED.test(p.name) || WRAPPED.test(p.name) ? 1 : 0,
        ch: Math.log(1 + p.chains.length),
        tok: hasToken(p) ? 1 : 0,
        lm: traded(p) ? Math.log(p.mcap_usd) : null
      };
    });
  }

  // Walk-forward split: dated rows by listing date; the oldest 60% (and the undated) fit, the rest score.
  function walkSplit(rows) {
    var d = rows.filter(function (r) { return r.listed !== null; }).sort(function (a, b) { return a.listed < b.listed ? -1 : a.listed > b.listed ? 1 : a.slug < b.slug ? -1 : 1; });
    var cut = Math.floor(d.length * 0.6), test = {};
    d.slice(cut).forEach(function (r) { test[r.slug] = true; });
    return { train: rows.filter(function (r) { return !test[r.slug]; }), test: rows.filter(function (r) { return test[r.slug]; }), cutDate: d[cut] ? d[cut].listed : null };
  }

  // ---- launch value: ln(mcap) on the traded tokens ----
  var VALUE_TERMS = ['size', 'category', 'growth', 'age', 'family', 'chains'];
  function valueDesign(terms, cats) {
    var on = {}; terms.forEach(function (t) { on[t] = true; });
    return {
      on: on,
      row: function (r) {
        var x = [1];
        if (on.size) x.push(r.z);
        if (on.category) cats.forEach(function (c) { x.push(r.cat === c ? 1 : 0); });
        if (on.growth) x.push(r.g);
        if (on.age) x.push(r.y);
        if (on.family) x.push(r.fam);
        if (on.chains) x.push(r.ch);
        return x;
      },
      pen: function () {
        var p = [0];
        if (on.size) p.push(0);
        if (on.category) cats.forEach(function () { p.push(4); }); // 4 pseudo-peers at the market's level
        ['growth', 'age', 'family', 'chains'].forEach(function (t) { if (on[t]) p.push(0.5); });
        return p;
      },
      // without the size term the slope on ln TVL is fixed at 1: a flat cap/TVL multiple
      target: function (r) { return on.size ? r.lm : r.lm - r.z; },
      offset: function (r) { return on.size ? 0 : r.z; }
    };
  }
  function fitValue(train, terms, cats) {
    var D = valueDesign(terms, cats);
    var w = S.ridge(train.map(D.row), train.map(D.target), D.pen());
    return { w: w, predict: function (r) { return S.dot(w, D.row(r)) + D.offset(r); } };
  }
  function scoreValue(rows, terms, cats) {
    var loo = rows.map(function (r, i) { var f = fitValue(rows.filter(function (_, j) { return j !== i; }), terms, cats); return r.lm - f.predict(r); });
    var ws = walkSplit(rows), f = fitValue(ws.train, terms, cats);
    var wf = ws.test.map(function (r) { return r.lm - f.predict(r); });
    return { loo: S.typicalMiss(loo), wf: S.typicalMiss(wf), looRes: loo, wfRes: wf, nTest: ws.test.length, cutDate: ws.cutDate };
  }

  // ---- token odds: does a protocol record a token ----
  var ODDS_TERMS = ['age', 'size', 'growth', 'category', 'chains'];
  function catRates(train) {
    var base = train.reduce(function (s, r) { return s + r.tok; }, 0) / train.length, by = {};
    train.forEach(function (r) { var b = by[r.cat] || (by[r.cat] = [0, 0]); b[0] += r.tok; b[1] += 1; });
    var out = {};
    Object.keys(by).forEach(function (c) { out[c] = (by[c][0] + 4 * base) / (by[c][1] + 4); }); // shrunk by 4 pseudo-protocols
    return { base: base, of: function (c) { return out[c] === undefined ? base : out[c]; }, table: out };
  }
  function oddsRow(terms, rates, r) {
    var x = [1];
    terms.forEach(function (t) {
      if (t === 'age') x.push(r.y);
      else if (t === 'size') x.push(r.z);
      else if (t === 'growth') x.push(r.g);
      else if (t === 'chains') x.push(r.ch);
      else if (t === 'category') { var q = Math.min(0.98, Math.max(0.02, rates.of(r.cat))); x.push(Math.log(q / (1 - q))); }
    });
    return x;
  }
  function fitOdds(train, terms) {
    var rates = catRates(train), pen = [0].concat(terms.map(function () { return 0.01; }));
    var w = S.logistic(train.map(function (r) { return oddsRow(terms, rates, r); }), train.map(function (r) { return r.tok; }), pen);
    return { w: w, rates: rates, predict: function (r) { return S.sigmoid(S.dot(w, oddsRow(terms, rates, r))); } };
  }
  function scoreOdds(rows, terms) {
    var pk = [], yk = [];
    for (var k = 0; k < 10; k++) {
      var f = fitOdds(rows.filter(function (r) { return S.foldOf(r.slug, 10) !== k; }), terms);
      rows.forEach(function (r) { if (S.foldOf(r.slug, 10) === k) { pk.push(f.predict(r)); yk.push(r.tok); } });
    }
    var ws = walkSplit(rows), g = fitOdds(ws.train, terms);
    return { kfold: S.brier(pk, yk), wf: S.brier(ws.test.map(g.predict), ws.test.map(function (r) { return r.tok; })), nTest: ws.test.length };
  }

  // Forward selection in a fixed order: add a term only if it lowers BOTH held-out errors.
  function select(order, score, a, b, first) {
    var kept = [], cur = score([]), steps = [{ term: first, a: cur[a], b: cur[b], kept: true }];
    order.forEach(function (t) {
      var s = score(kept.concat([t])), keep = s[a] < cur[a] && s[b] < cur[b];
      steps.push({ term: t, a: s[a], b: s[b], kept: keep });
      if (keep) { kept.push(t); cur = s; }
    });
    return { kept: kept, steps: steps, final: cur };
  }

  function fitAll(snap) {
    var F = features(snap);
    var V = F.filter(function (r) { return r.lm !== null; });
    var cats = []; V.forEach(function (r) { if (cats.indexOf(r.cat) < 0) cats.push(r.cat); }); cats.sort();
    var vsel = select(VALUE_TERMS, function (t) { return scoreValue(V, t, cats); }, 'loo', 'wf', 'flat cap/TVL multiple');
    var value = fitValue(V, vsel.kept, cats);
    var O = F.filter(function (r) { return r.cat !== 'CEX'; });
    var osel = select(ODDS_TERMS, function (t) { return scoreOdds(O, t); }, 'kfold', 'wf', 'base rate');
    var odds = fitOdds(O, osel.kept);
    return { F: F, V: V, O: O, cats: cats, vsel: vsel, value: value, osel: osel, odds: odds };
  }

  var api = { bucketOf: bucketOf, features: features, fitAll: fitAll, fitValue: fitValue, valueDesign: valueDesign, oddsRow: oddsRow, walkSplit: walkSplit, VALUE_TERMS: VALUE_TERMS, ODDS_TERMS: ODDS_TERMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarModel = api;
})(this);
