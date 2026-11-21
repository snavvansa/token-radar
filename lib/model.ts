// Token Radar's model: one sealed DefiLlama snapshot in, one ranked board of pre-token protocols out.
//
// The question the board answers: if a protocol that records no token issued one today, and its record
// stayed as it is, what would the market pay for it? The model answers from the snapshot alone, by
// peer comparison, never from a list of names:
//
//   peer multiple  M(c)  = the market-cap-to-TVL multiple the snapshot's own TRADED tokens of category c
//                          carry (median of log multiples), shrunk toward the all-category median by
//                          PEER_SHRINK pseudo-peers, so a thin category borrows from the whole market
//   growth         G     = exp(GROWTH_SLOPE x clamp(change_7d, GROWTH_FLOOR, GROWTH_CAP) / 100)
//   track record   A     = AGE_FLOOR + (1 - AGE_FLOOR) x min(age_days, AGE_FULL_DAYS) / AGE_FULL_DAYS
//                          (age_days = days since DefiLlama began tracking it with no token recorded;
//                          unknown age is scored as AGE_UNKNOWN_DAYS and flagged)
//   implied value  V     = round(tvl_usd x M(c) x G x A)
//
// Every constant is exported in MODEL and written into data.js, so the dashboard shows and re-derives
// each row's arithmetic. A protocol whose token already trades is never ranked: it is a peer, shown in
// the Live tokens view with the market's own number.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL = {
  version: 'peer-radar-2',
  peer_shrink: 4, // pseudo-peers at the market median added to every category
  multiple_min: 0.005, // one traded token's mcap/TVL is clamped to this range before it counts
  multiple_max: 20,
  growth_slope: 0.8,
  growth_floor: -50,
  growth_cap: 80,
  age_floor: 0.7,
  age_full_days: 730,
  age_unknown_days: 365,
  airdrop_share: 0.06, // assumed share of a launch's value sent to users, for the per-$1,000 figure only
};

export type Model = typeof MODEL;

/** A category's peer multiple: what traded tokens of that kind are worth per dollar of TVL. */
export interface Peer {
  category: string;
  peers: number; // traded tokens of this category in the snapshot
  median_multiple: number | null; // their own median, before shrinkage
  multiple: number; // the multiple the model uses
  examples: string[]; // up to three peer names, by market cap
}

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export type Phase = 'early' | 'maturing' | 'overdue' | 'undated';

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  phase: Phase;
  implied_value_usd: number;
  model: {
    peer_multiple: number;
    peers: number;
    growth_multiplier: number;
    age_multiplier: number;
    growth_input_pct: number;
    age_input_days: number;
  };
  airdrop_per_1k_usd: number;
  plan_cost_usd: number;
  plan_days: number;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
  change_7d: number | null;
  symbol: string | null;
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Traded: a market cap above zero is on record, so the market already prices it. */
export function isTraded(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

// The house's own exclusions, applied below the floor too: products of a token that already trades.
const DERIVED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const VERSIONED = /\s(v\d+(\.\d+)?|\d+\.\d+)$/i;
const WRAPPED = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;

/** Whether a pre-token protocol is a fresh subject rather than a product of a traded token. */
export function isCandidate(p: SnapshotProtocol): boolean {
  if (!isPreToken(p) || p.tvl_usd <= 0) return false;
  if (p.category !== null && DERIVED_CATEGORIES.has(p.category)) return false;
  return !VERSIONED.test(p.name) && !WRAPPED.test(p.name) && !EXCHANGE.test(p.name);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Every category's peer multiple, from the snapshot's traded tokens alone. */
export function peerTable(snapshot: Snapshot, model: Model = MODEL): { market: number; byCategory: Map<string, Peer> } {
  const traded = snapshot.protocols.filter((p) => isTraded(p) && p.category !== 'CEX');
  const logOf = (p: SnapshotProtocol): number => Math.log(clamp(p.mcap_usd! / p.tvl_usd, model.multiple_min, model.multiple_max));
  const marketLog = median(traded.map(logOf));
  const groups = new Map<string, SnapshotProtocol[]>();
  for (const p of traded) {
    const c = p.category ?? 'Uncategorised';
    const g = groups.get(c);
    if (g === undefined) groups.set(c, [p]);
    else g.push(p);
  }
  const byCategory = new Map<string, Peer>();
  const categories = new Set(snapshot.protocols.map((p) => p.category ?? 'Uncategorised'));
  for (const c of [...categories].sort(byText)) {
    const g = groups.get(c) ?? [];
    const n = g.length;
    const own = n > 0 ? median(g.map(logOf)) : marketLog;
    const shrunk = (n * own + model.peer_shrink * marketLog) / (n + model.peer_shrink);
    byCategory.set(c, {
      category: c,
      peers: n,
      median_multiple: n > 0 ? round4(Math.exp(own)) : null,
      multiple: round4(Math.exp(shrunk)),
      examples: [...g].sort((a, b) => b.mcap_usd! - a.mcap_usd! || byText(a.slug, b.slug)).slice(0, 3).map((p) => p.name),
    });
  }
  return { market: round4(Math.exp(marketLog)), byCategory };
}

export function phaseOf(age: number | null): Phase {
  if (age === null) return 'undated';
  if (age < 180) return 'early';
  if (age < 730) return 'maturing';
  return 'overdue';
}

/** One protocol's implied value and the three factors behind it. */
export function value(p: SnapshotProtocol, asOf: string, peer: Peer, model: Model = MODEL) {
  const age = ageDays(asOf, p.listed_at);
  const growthIn = clamp(p.change_7d ?? 0, model.growth_floor, model.growth_cap);
  const growth = Math.exp((model.growth_slope * growthIn) / 100);
  const ageIn = age ?? model.age_unknown_days;
  const ageMult = model.age_floor + (1 - model.age_floor) * (Math.min(ageIn, model.age_full_days) / model.age_full_days);
  // The stated (4-decimal) factors are the ones multiplied, so the page re-derives the figure exactly.
  const g4 = round4(growth);
  const a4 = round4(ageMult);
  const implied = Math.max(1, Math.round(p.tvl_usd * peer.multiple * g4 * a4));
  return { age, growthIn, growth: g4, ageIn, ageMult: a4, implied };
}

// ---- farm plans ------------------------------------------------------------------------------------

/** Rough cost of one transaction per chain family, in dollars, and how long a deposit takes to settle. */
export function chainCost(chain: string): { tx: number; settle: string; family: string } {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return { tx: 4, settle: '1 to 3 minutes', family: 'Ethereum mainnet' };
  if (c === 'bitcoin') return { tx: 2, settle: 'about an hour (6 confirmations)', family: 'Bitcoin' };
  if (c === 'solana') return { tx: 0.01, settle: 'under a minute', family: 'Solana' };
  if (c === 'tron') return { tx: 1.5, settle: 'under a minute', family: 'Tron' };
  if (['binance', 'bsc', 'polygon', 'avalanche', 'sui', 'aptos', 'algorand', 'stellar', 'ripple', 'near', 'ton'].includes(c)) return { tx: 0.05, settle: 'under a minute', family: 'a low-fee L1' };
  return { tx: 0.1, settle: 'a few minutes', family: 'an L2 or app chain' };
}

/** The chain to farm on: the cheapest of the protocol's first three listed chains (ties keep order). */
export function farmChain(p: SnapshotProtocol): string {
  const listed = p.chains.slice(0, 3);
  if (listed.length === 0) return 'Ethereum';
  return listed.reduce((best, c) => (chainCost(c).tx < chainCost(best).tx ? c : best), listed[0]!);
}

/** Position size: a dollar amount that is a meaningful but tiny share of the pool. */
export function capitalFor(p: SnapshotProtocol, txCost: number): number {
  const base = p.tvl_usd >= 1e9 ? 2000 : p.tvl_usd >= 2e8 ? 1500 : p.tvl_usd >= 5e7 ? 1000 : 500;
  return txCost >= 2 ? base * 2 : base; // expensive gas needs a bigger position to be worth it
}

export function holdDays(phase: Phase): number {
  return phase === 'early' ? 90 : phase === 'maturing' ? 60 : phase === 'overdue' ? 45 : 60;
}

interface Action {
  core: string;
  extra: string;
  risk: string;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): Action {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield aggregator'))
    return { core: `Deposit $${capital} of USDC into the largest ${n} vault on ${chain} and keep the vault shares in the same wallet.`, extra: `After 14 days split $${Math.round(capital / 4)} into a second ${n} vault with a different asset, so the wallet shows more than one strategy.`, risk: `Read the vault's listed markets first: a curator vault inherits the risk of every market it lends into.` };
  if (c.includes('lend') || c === 'cdp' || c.includes('collateral'))
    return { core: `Supply $${capital} of USDC or ETH to ${n} on ${chain} as collateral.`, extra: `Borrow 20% of the collateral's value in a stablecoin and repay it within 7 days: borrowers usually count for more than idle suppliers.`, risk: `Keep the loan-to-value under 30% so a 40% price drop cannot liquidate you.` };
  if (c.includes('dex') || c.includes('liquidity manager') || c.includes('farm'))
    return { core: `Provide $${capital} of liquidity to ${n}'s deepest stablecoin pair on ${chain}, a full-range position.`, extra: `Make at least four swaps of about $50 each through ${n} over the hold, on different days.`, risk: `A stable-stable pair keeps impermanent loss near zero; a volatile pair can lose more than the farm pays.` };
  if (c.includes('rwa') || c.includes('basis') || c.includes('stable') || c.includes('cedefi') || c.includes('yield'))
    return { core: `Mint or buy $${capital} of ${n}'s yield-bearing asset on ${chain} and hold it in the same wallet.`, extra: `Use the asset once in a partner pool or as collateral where ${n} lists one, so the activity is visible on chain.`, risk: `Check the redemption terms (delay, KYC, minimum) before minting: some RWA and basis products lock withdrawals.` };
  if (c.includes('restak') || c.includes('staking pool') || c.includes('chain') || c.includes('btc'))
    return { core: `Stake or delegate $${capital} of the native asset through ${n} on ${chain}.`, extra: `Delegate to a second operator or pool after 14 days, so the position is not one click.`, risk: `Note the unbonding period before you stake: the capital is locked for it on exit.` };
  if (c.includes('derivative') || c.includes('perp') || c.includes('option') || c.includes('prediction'))
    return { core: `Deposit $${capital} of USDC as margin on ${n} on ${chain}.`, extra: `Trade about $${capital * 3} of volume a week in small, hedged trades (or the liquidity vault, where ${n} has one).`, risk: `Use 2x leverage or less: fees and funding should be the only cost, never a liquidation.` };
  if (c.includes('payment'))
    return { core: `Open a ${n} account or channel on ${chain} with $${capital} and make one payment through it.`, extra: `Route at least one payment a week through ${n}, keeping the balance in place.`, risk: `A payment rail may never issue a token: treat this one as the cheapest position on the board.` };
  return { core: `Deposit $${capital} into ${n}'s main product on ${chain} and keep the position open.`, extra: `Use a second feature of ${n} once (a vote, a referral, a second pool) after 14 days.`, risk: `Read ${n}'s own docs for withdrawal limits before you deposit.` };
}

/** A protocol's farm plan: eight concrete steps, each with a cost and a time, from its own record. */
export function farmPlan(p: SnapshotProtocol, phase: Phase, perK: number): { steps: FarmStep[]; cost: number; days: number } {
  const chain = farmChain(p);
  const gas = chainCost(chain);
  const capital = capitalFor(p, gas.tx);
  const hold = holdDays(phase);
  const act = actionFor(p, capital, chain);
  const weeks = Math.ceil(hold / 7);
  const gasTotal = Math.round((6 + weeks) * gas.tx * 100) / 100;
  const expect = Math.round((perK * capital) / 1000);
  const stop = p.change_7d !== null && p.change_7d < -10 ? `TVL falls a further 15% in one week (it already lost ${Math.abs(p.change_7d).toFixed(1)}% in the snapshot week)` : 'TVL falls 25% or more in one week';
  const fmt = (n: number): string => (n < 1 ? n.toFixed(2) : String(Math.round(n)));
  const steps: FarmStep[] = [
    { text: `Make a fresh wallet for ${p.name} alone and fund it on ${chain} (${gas.family}) with the position plus about $${fmt(gas.tx * 10)} for gas.`, cost: `the bridge or exchange withdrawal fee, about $${fmt(Math.max(1, gas.tx * 2))}`, time: `15 minutes, ${gas.settle} to settle` },
    { text: `Find ${p.name}'s app through its DefiLlama listing and its official docs, and bookmark it; never use a link from a reply, an ad or a DM.`, cost: 'free', time: '5 minutes' },
    { text: act.core, cost: `$${capital} of capital, about $${fmt(gas.tx * 2)} of gas to approve and deposit`, time: `10 minutes, ${gas.settle} to confirm` },
    { text: act.extra, cost: `about $${fmt(gas.tx * 2)} of gas`, time: '10 minutes, on day 14' },
    { text: `Come back once a week and make one small qualifying action (top up, claim, rebalance or vote) so the wallet is active in ${weeks} separate weeks.`, cost: `about $${fmt(gas.tx)} of gas a week`, time: `5 minutes a week for ${weeks} weeks` },
    { text: `Hold the position for at least ${hold} days (${phase} phase: ${phase === 'early' ? 'a young protocol counts long holders' : phase === 'overdue' ? 'a long run with no token means a snapshot may be close' : 'a mid-life protocol rewards steady use'}).`, cost: `the $${capital} stays deployed`, time: `${hold} days` },
    { text: `${act.risk} Exit if ${stop}, or if ${p.name} announces a points end with no token.`, cost: `about $${fmt(gas.tx * 2)} of gas to withdraw`, time: '10 minutes' },
    { text: `Keep a log of every transaction and date. The model's figure for this position is about $${expect} of tokens at a ${Math.round(MODEL.airdrop_share * 100)}% user share; total gas for the plan is about $${fmt(gasTotal)}.`, cost: 'free', time: '5 minutes' },
  ];
  return { steps, cost: Math.round((capital + gasTotal) * 100) / 100, days: hold };
}

export function stepText(s: FarmStep): string {
  let t = `${s.text} Cost: ${s.cost}. Time: ${s.time}.`;
  if (t.length > 600) t = `${t.slice(0, 596)}...`;
  return t;
}

// ---- the board ---------------------------------------------------------------------------------------

export function buildBoard(snapshot: Snapshot, model: Model = MODEL): { rows: BoardRow[]; peers: Peer[]; market: number; live: LiveRow[] } {
  const { market, byCategory } = peerTable(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter((p) => watch.has(p.slug) || isCandidate(p));
  const scored = chosen.map((p) => {
    const peer = byCategory.get(p.category ?? 'Uncategorised')!;
    return { p, peer, v: value(p, snapshot.as_of, peer, model) };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || byText(a.p.slug, b.p.slug));
  const rows = scored.map(({ p, peer, v }, i): BoardRow => {
    const phase = phaseOf(v.age);
    const perK = Math.round(((model.airdrop_share * v.implied) / p.tvl_usd) * 1000 * 100) / 100;
    const plan = farmPlan(p, phase, perK);
    return {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: v.age,
      token_status: 'pre-token',
      on_watchlist: watch.has(p.slug),
      phase,
      implied_value_usd: v.implied,
      model: { peer_multiple: peer.multiple, peers: peer.peers, growth_multiplier: v.growth, age_multiplier: v.ageMult, growth_input_pct: round4(v.growthIn), age_input_days: v.ageIn },
      airdrop_per_1k_usd: perK,
      plan_cost_usd: plan.cost,
      plan_days: plan.days,
      farm_steps: plan.steps.map(stepText),
    };
  });
  const used = new Set(rows.map((r) => r.category ?? 'Uncategorised'));
  const peers = [...byCategory.values()].filter((p) => used.has(p.category) || p.peers > 0).sort((a, b) => b.peers - a.peers || byText(a.category, b.category));
  const live = snapshot.protocols
    .filter((p) => isTraded(p) && p.category !== 'CEX')
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || byText(a.slug, b.slug))
    .slice(0, 60)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains.slice(0, 4), tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd!, multiple: round4(p.mcap_usd! / p.tvl_usd), change_7d: p.change_7d, symbol: p.symbol }));
  return { rows, peers, market, live };
}

/** Why the gate would refuse this board, or null. */
export function boardIssue(rows: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(rows.map((r) => r.slug));
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  if (rows.length < 100 || rows.length > 4000) return `the board has ${rows.length} rows`;
  if (slugs.size !== rows.length) return 'a slug appears twice';
  const unknown = rows.filter((r) => !known.has(r.slug));
  if (unknown.length > 0) return `unknown slugs: ${unknown.slice(0, 3).map((r) => r.slug).join(', ')}`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.rank !== i + 1) return `row ${i} has rank ${r.rank}`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) return `${r.slug} outranks the row above it`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
  }
  if (rows[0]!.implied_value_usd === rows[rows.length - 1]!.implied_value_usd) return 'every row shares one implied value';
  return null;
}

export function parseSnapshot(text: string): Snapshot {
  const o = JSON.parse(text) as Snapshot;
  if (typeof o !== 'object' || o === null || !Array.isArray(o.protocols) || !Array.isArray(o.watchlist) || typeof o.as_of !== 'string') {
    throw new Error('snapshot.json is not the sealed snapshot shape (as_of, protocols, watchlist)');
  }
  return o;
}
