// Token Radar: token-radar-01 entry (Node 22.18+, standard library only).
//
// Reads the sealed snapshot (/input/snapshot.json, or --input <file|dir>), ranks every pre-token
// protocol by the peer-multiple model in lib/model.ts, and writes into /output (or MAKEFUN_OUTPUT_DIR):
//   board.json    the ranked board the gate reads
//   data.js       the same board plus peers, live tokens and the model's constants, for the page
//   dashboard/    the static page (no network), copied from this repository
//   screenshots/  three captures of that page
//   dossier.json  written last by the vendored make.fun library, as the scorer rebuilds it
// Output is deterministic: nothing depends on the clock, so two runs write the same bytes.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL, boardIssue, buildBoard, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && at + 1 < process.argv.length ? process.argv[at + 1]! : fallback;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { rows, peers, market, live } = buildBoard(snapshot);
const issue = boardIssue(rows, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: refusing to write a board the gate would refuse: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ model: MODEL.version, as_of: snapshot.as_of, rows })}\n`);

// The page's data: compact rows (arrays keep data.js small), with the farm steps in full.
const data = {
  as_of: snapshot.as_of,
  source: snapshot.source,
  floor_usd: snapshot.floor_usd,
  protocols: snapshot.protocols.length,
  watchlist: snapshot.watchlist.length,
  model: MODEL,
  market_multiple: market,
  peers,
  live,
  cols: ['rank', 'slug', 'name', 'category', 'chains', 'tvl_usd', 'change_7d', 'listed_at', 'age_days', 'on_watchlist', 'phase', 'implied_value_usd', 'peer_multiple', 'peers', 'growth_multiplier', 'age_multiplier', 'growth_input_pct', 'age_input_days', 'airdrop_per_1k_usd', 'plan_cost_usd', 'plan_days', 'farm_steps'],
  rows: rows.map((r) => [r.rank, r.slug, r.name, r.category, r.chains, r.tvl_usd, r.change_7d, r.listed_at, r.age_days, r.on_watchlist, r.phase, r.implied_value_usd, r.model.peer_multiple, r.model.peers, r.model.growth_multiplier, r.model.age_multiplier, r.model.growth_input_pct, r.model.age_input_days, r.airdrop_per_1k_usd, r.plan_cost_usd, r.plan_days, r.farm_steps]),
};
writeFileSync(join(out, 'data.js'), `window.RADAR=${JSON.stringify(data)};\n`);

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const pageFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3 || shots.length > 4) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} images; the gate wants 3 or 4\n`);
  process.exit(1);
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const early = rows.filter((r) => !r.on_watchlist).length;
process.stdout.write(`token radar (${MODEL.version}): ${snapshot.protocols.length} protocols, ${rows.length} ranked (${snapshot.watchlist.length} watchlist + ${early} below the floor), ${live.length} live tokens as peers; market multiple ${market}x\n`);
process.stdout.write(`token radar: wrote board.json, data.js, dashboard/ (${pageFiles.length} files), screenshots/ (${shots.length}) and dossier.json to ${out}\n`);
