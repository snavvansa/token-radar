// Token Radar v4: token-radar-01 entry (Node 22.18+, standard library only).
//
// The model lives in dashboard/core-*.js, one script the page also runs: main.ts builds the board with
// it and writes /output (or MAKEFUN_OUTPUT_DIR); the page builds it again from the same snapshot and
// shows whether every row matches. Output is deterministic (no clock, no randomness).
//   board.json    the ranked board the gate reads
//   data.js       the snapshot and the board, for the page to re-derive
//   dashboard/    the page, screenshots/ its three captures, dossier.json written last
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);
const core = require('./dashboard/core-farm.js');

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
const snapshot = JSON.parse(readFileSync(inputFile, 'utf8'));

const result = core.build(snapshot);
const failed = result.tests.filter((t: { ok: boolean }) => !t.ok);
for (const t of result.tests) process.stdout.write(`self-test ${t.ok ? 'pass' : 'FAIL'} ${t.id}: ${t.detail}\n`);
if (failed.length > 0) {
  process.stderr.write(`token radar: ${failed.length} self-test check(s) failed; refusing to write an entry\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ model: 'radar-v4', as_of: snapshot.as_of, value_terms: result.model.value_terms, odds_terms: result.model.odds_terms, rows: result.board })}\n`);
const ledger: Record<string, number> = {};
for (const [k, v] of Object.entries(result.ledger)) ledger[k] = (v as string[]).length;
writeFileSync(join(out, 'data.js'), `window.RADAR_SNAPSHOT=${JSON.stringify(snapshot)};\nwindow.RADAR=${JSON.stringify({ board: result.board, ledger, model: result.model, tests: result.tests })};\n`);

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
process.stdout.write(`token radar v4: ${snapshot.protocols.length} protocols accounted, ${result.board.length} ranked; value terms [${result.model.value_terms}], odds terms [${result.model.odds_terms}]; wrote ${pageFiles.length} page files and ${shots.length} screenshots to ${out}\n`);
