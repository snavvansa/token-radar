// RadarBoard: turns the fitted models into the ranked board, the farm economics and the self-test.
// main.ts runs build() to write board.json; the page runs the same build() on the same snapshot and
// compares every row with the board it was handed. Nothing here reads a clock or a random number.
(function (root) {
  'use strict';
  var node = typeof module !== 'undefined' && module.exports;
  var S = node ? require('./core-stats.js') : root.RadarStats;
  var M = node ? require('./core-model.js') : root.RadarModel;

  var FARM = { drop_share: 0.07, weeks: 12, tbill: 0.04, hourly_bar: 25, deposit: 5000 };

  function chainCost(chain) {
    var c = chain.toLowerCase();
    if (c === 'ethereum') return { tx: 4, fund: 3, settle: '1-3 min' };
    if (c === 'bitcoin') return { tx: 2, fund: 2, settle: 'about 60 min' };
    if (c === 'solana') return { tx: 0.01, fund: 1, settle: 'under 1 min' };
    if (c === 'tron') return { tx: 1.5, fund: 1, settle: 'under 1 min' };
    if (/^(binance|bsc|polygon|avalanche|sui|aptos|algorand|stellar|ripple|near|ton|sonic)$/.test(c)) return { tx: 0.05, fund: 1, settle: 'under 1 min' };
    return { tx: 0.1, fund: 1, settle: '2-20 min' };
  }
  function farmChain(p) {
    var l = p.chains.slice(0, 3);
    if (!l.length) return 'Ethereum';
    return l.reduce(function (b, c) { return chainCost(c).tx < chainCost(b).tx ? c : b; }, l[0]);
  }

  // One category's action set: [core action, second action, risk note]. From the record, never a name.
  function actions(p, D, ch) {
    var c = (p.category || '').toLowerCase(), n = p.name, d = '$' + D.toLocaleString('en-US');
    if (/curator|allocator|aggregator/.test(c)) return ['Deposit ' + d + ' of USDC into the largest ' + n + ' vault on ' + ch + ' and keep the vault shares in this wallet.', 'On day 14 move a quarter into a second ' + n + ' vault with another asset, so the wallet shows more than one strategy.', 'A curator vault carries the risk of every market it lends into: read its market list first.'];
    if (/lend|cdp|collateral/.test(c)) return ['Supply ' + d + ' of USDC to ' + n + ' on ' + ch + ' as collateral.', 'Borrow 20% of it in a stablecoin and repay within 7 days: borrowers usually count for more than idle supply.', 'Keep loan-to-value under 30% so a 40% price drop cannot liquidate you.'];
    if (/dex|liquidity|farm/.test(c)) return ['Provide ' + d + ' to ' + n + "'s deepest stablecoin pair on " + ch + ', full range.', 'Swap about $50 through ' + n + ' on four different days.', 'A stable-stable pair keeps impermanent loss near zero; a volatile pair can lose more than the drop.'];
    if (/rwa|basis|stable|cedefi|yield|wrapper/.test(c)) return ['Mint or buy ' + d + ' of ' + n + "'s yield asset on " + ch + ' and hold it here.', 'Use the asset once where ' + n + ' lists a partner pool or a collateral market.', 'Check redemption terms (delay, KYC, minimum) before minting: some products lock withdrawals.'];
    if (/restak|staking|chain|btc|governance/.test(c)) return ['Stake or delegate ' + d + ' of the native asset through ' + n + ' on ' + ch + '.', 'Delegate a second slice to another operator on day 14.', 'Note the unbonding period first: the capital is locked for it on exit.'];
    if (/derivative|perp|option|prediction|otc/.test(c)) return ['Deposit ' + d + ' of USDC as margin on ' + n + ' on ' + ch + '.', 'Trade about ' + d + ' of volume a week in small hedged trades, or use its liquidity vault.', 'Use 2x leverage or less: fees should be the only cost, never a liquidation.'];
    return ['Deposit ' + d + ' into ' + n + "'s main product on " + ch + ' and keep it open.', 'Use a second feature of ' + n + ' once on day 14 (a vote, a second pool).', "Read " + n + "'s withdrawal limits before you deposit."];
  }

  // The farm economics of one row at deposit D: every outflow, the modelled drop, the net, the verdict.
  function economics(r, D) {
    var cc = chainCost(r.chain), w = FARM.weeks;
    var txs = 2 + 1 + w + 2; // approve + deposit, the day-14 action, one touch a week, withdraw
    var fees = S.round(cc.fund + txs * cc.tx, 2);
    var K = r.implied * FARM.drop_share;
    var drop = S.round(K * D / (r.tvl + D), 2);
    var tbill = S.round(D * FARM.tbill * w / 52, 2);
    var hours = S.round((10 + 5 + 15 + 10 + 5 * w + 10 + 5) / 60, 2);
    var net = S.round(drop - fees - tbill, 2);
    var verdict = drop <= fees ? 'SKIP' : net > 0 && net / hours >= FARM.hourly_bar ? 'FARM' : 'THIN';
    // smallest deposit whose drop covers the fees and the T-bill: r D^2 + (r T + F - K) D + F T = 0
    var rr = FARM.tbill * w / 52, bq = rr * r.tvl + fees - K, disc = bq * bq - 4 * rr * fees * r.tvl, be = null;
    if (disc >= 0 && bq < 0) be = Math.ceil((-bq - Math.sqrt(disc)) / (2 * rr));
    return { deposit: D, fees: fees, txs: txs, gas: cc.tx, fund: cc.fund, settle: cc.settle, drop: drop, tbill: tbill, hours: hours, net: net, per_hour: S.round(net / hours, 2), verdict: verdict, breakeven: be };
  }

  function money(n) { var a = Math.abs(n); return (n < 0 ? '-$' : '$') + (a >= 100 ? Math.round(a).toLocaleString('en-US') : a.toFixed(2)); }

  function plan(r, e) {
    var a = actions(r.p, e.deposit, r.chain), w = FARM.weeks;
    var st = [
      ['Make a fresh wallet for ' + r.name + ' alone and fund it on ' + r.chain + ' straight from an exchange.', money(e.fund) + ' withdrawal fee', '10 min, ' + e.settle + ' to arrive'],
      ['Reach ' + r.name + ' from its DefiLlama listing or official docs, bookmark it, and check contract addresses there; never use a link from a reply or a DM.', 'free', '5 min'],
      [a[0], money(e.deposit) + ' at risk, ' + money(2 * e.gas) + ' gas', '15 min'],
      [a[1], money(e.gas) + ' gas', '10 min on day 14'],
      ['Touch the position once a week (top up, claim, vote) so the wallet is active in ' + w + ' separate weeks.', money(w * e.gas) + ' gas in all', '5 min a week, ' + w + ' weeks'],
      [a[2] + ' Exit if TVL falls 25% in a week, or ' + r.name + ' ends points with no token.', money(2 * e.gas) + ' gas to withdraw', '10 min'],
      ['Verdict ' + e.verdict + ': modelled drop ' + money(e.drop) + ' (' + Math.round(FARM.drop_share * 100) + '% of ' + money(r.implied) + ' x your share of TVL) less ' + money(e.fees) + ' fees and ' + money(e.tbill) + ' T-bill yield = ' + money(e.net) + ' net, ' + money(e.per_hour) + ' an hour.', money(e.fees) + ' fees in all', Math.round(e.hours * 10) / 10 + ' h hands-on over ' + w + ' weeks'],
      [e.breakeven === null ? 'No deposit size beats a T-bill here: the drop per dollar is below the T-bill rate, so only farm it for the product itself.' : 'Break-even deposit ' + money(e.breakeven) + ': below it fees and the T-bill beat the drop. Log every transaction for taxes and claims.', 'free', '5 min']
    ];
    return st.map(function (s) { return s[0] + ' Cost: ' + s[1] + '. Time: ' + s[2] + '.'; });
  }

  function build(snap) {
    var fit = M.fitAll(snap), watch = {};
    snap.watchlist.forEach(function (s) { watch[s] = true; });
    var res = fit.vsel.final.looRes, q = { p10: S.quantile(res, 0.1), p25: S.quantile(res, 0.25), p75: S.quantile(res, 0.75), p90: S.quantile(res, 0.9) };
    var wfr = fit.vsel.final.wfRes, inside = function (a, b) { return wfr.filter(function (x) { return x >= a && x <= b; }).length / wfr.length; };
    var ledger = {}, rows = [];
    fit.F.forEach(function (r) {
      var b = M.bucketOf(r.p, watch);
      (ledger[b] = ledger[b] || []).push(r.slug);
      if (b !== 'ranked_watch' && b !== 'ranked_early') return;
      var launch = Math.exp(fit.value.predict(r)), odds = fit.odds.predict(r);
      rows.push({ f: r, p: r.p, slug: r.slug, name: r.p.name, tvl: r.p.tvl_usd, chain: farmChain(r.p), watch: !!watch[r.slug], launch: launch, odds: odds, implied: Math.max(1, Math.round(launch * odds)) });
    });
    rows.sort(function (a, b) { return b.implied - a.implied || (a.slug < b.slug ? -1 : 1); });
    var board = rows.map(function (r, i) {
      var e = economics(r, FARM.deposit), p = r.p;
      return {
        rank: i + 1, slug: r.slug, name: r.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, change_7d: p.change_7d, listed_at: p.listed_at, age_days: r.f.age,
        on_watchlist: r.watch, token_status: 'pre-token', implied_value_usd: r.implied,
        launch_value_usd: Math.round(r.launch), token_odds: S.round(r.odds, 4),
        range_p25_p75: [Math.round(r.launch * Math.exp(q.p25) * r.odds), Math.round(r.launch * Math.exp(q.p75) * r.odds)],
        range_p10_p90: [Math.round(r.launch * Math.exp(q.p10) * r.odds), Math.round(r.launch * Math.exp(q.p90) * r.odds)],
        farm_chain: r.chain, farm: e, farm_steps: plan(r, e)
      };
    });
    var model = {
      value_terms: fit.vsel.kept, value_steps: fit.vsel.steps, value_w: fit.value.w, value_n: fit.V.length, value_test_n: fit.vsel.final.nTest, walk_cut: fit.vsel.final.cutDate,
      odds_terms: fit.osel.kept, odds_steps: fit.osel.steps, odds_w: fit.odds.w, odds_n: fit.O.length, odds_base: fit.odds.rates.base,
      quantiles: q, coverage: { iqr: inside(q.p25, q.p75), p80: inside(q.p10, q.p90) }, farm: FARM
    };
    return { board: board, ledger: ledger, model: model, tests: selfTest(snap, board, ledger, model, fit) };
  }

  // Checks that can fail. main.ts refuses to write an entry when any fails; the page shows each one.
  function selfTest(snap, board, ledger, model, fit) {
    var t = [], add = function (id, ok, detail) { t.push({ id: id, ok: !!ok, detail: detail }); };
    var n = 0, seen = {}, dup = 0;
    Object.keys(ledger).forEach(function (k) { ledger[k].forEach(function (s) { n++; if (seen[s]) dup++; seen[s] = 1; }); });
    add('ledger', n === snap.protocols.length && dup === 0, n + ' of ' + snap.protocols.length + ' protocols in exactly one group');
    var on = {}; board.forEach(function (r) { on[r.slug] = 1; });
    var miss = snap.watchlist.filter(function (s) { return !on[s]; });
    add('watchlist', miss.length === 0, (snap.watchlist.length - miss.length) + ' of ' + snap.watchlist.length + ' watchlist protocols ranked');
    var order = board.every(function (r, i) { return r.rank === i + 1 && (i === 0 || r.implied_value_usd <= board[i - 1].implied_value_usd); }) && board[0].implied_value_usd > board[board.length - 1].implied_value_usd;
    add('ranks', order && board.length >= 100 && board.length <= 4000, 'ranks 1-' + board.length + ', implied value never rises');
    var tok = board.filter(function (r) { var p = fit.F.filter(function (f) { return f.slug === r.slug; })[0].p; return p.gecko_id !== null || p.symbol !== null || p.mcap_usd !== null; });
    add('pre_token_only', tok.length === 0, tok.length + ' ranked rows record a token');
    var vs = model.value_steps, os = model.odds_steps;
    add('value_beats_flat', vs[0].a > fit.vsel.final.loo && vs[0].b > fit.vsel.final.wf, 'held-out miss x' + S.round(fit.vsel.final.loo, 2) + ' / x' + S.round(fit.vsel.final.wf, 2) + ' vs flat x' + S.round(vs[0].a, 2) + ' / x' + S.round(vs[0].b, 2));
    add('odds_beat_base', os[0].a > fit.osel.final.kfold && os[0].b > fit.osel.final.wf, 'Brier ' + S.round(fit.osel.final.kfold, 3) + ' / ' + S.round(fit.osel.final.wf, 3) + ' vs base ' + S.round(os[0].a, 3) + ' / ' + S.round(os[0].b, 3));
    var badSteps = board.filter(function (r) { return r.farm_steps.length < 3 || r.farm_steps.length > 12 || r.farm_steps.some(function (s) { var l = s.trim().length; return l < 20 || l > 600; }); });
    add('farm_steps', badSteps.length === 0, badSteps.length + ' rows with a step out of 20-600 chars');
    var badV = board.filter(function (r) { var e = r.farm; return (e.verdict === 'SKIP') !== (e.drop <= e.fees) || (e.verdict === 'FARM') !== (e.drop > e.fees && e.net > 0 && e.net / e.hours >= FARM.hourly_bar); });
    add('verdicts', badV.length === 0, badV.length + ' verdicts disagree with their own net');
    add('range_honest', model.coverage.iqr >= 0.3 && model.coverage.p80 >= 0.6, 'walk-forward caps inside P25-P75 ' + Math.round(model.coverage.iqr * 100) + '%, inside P10-P90 ' + Math.round(model.coverage.p80 * 100) + '%');
    return t;
  }

  var api = { build: build, economics: economics, FARM: FARM, chainCost: chainCost };
  if (node) module.exports = api;
  else root.RadarBoard = api;
})(this);
