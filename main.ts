// A working token-radar-01 entry (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// pre-token protocol with the model in lib/model.ts, writes the ranked board to /output/board.json, and
// copies this repository's dashboard/ and screenshots/ to /output. Last, it writes /output/dossier.json,
// the summary the judge reads, with the vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html, dashboard/app.css
// and dashboard/app.js read /output/data.js, which this program writes from the same board. A starting
// point, not a winner: it covers the watchlist, states the model and gives every protocol a farm plan.
// Change the model, the page or the plan; keep the gate's shape.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL, MODEL_VERSION, boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** Whether the command line carries an exact flag, short or long. */
function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

/** A dollar amount with thousands separators, for the run summary. */
function formatUsd(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

/** The model version alone, plus the constants that define it. */
function printVersion(): void {
  process.stdout.write(`token radar ${MODEL_VERSION}\n`);
  process.stdout.write(`model ${MODEL_VERSION}: base multiple ${MODEL.base_multiple}, growth weight ${MODEL.growth_weight}, growth capped at +${MODEL.growth_cap}% over 7 days, age peaks at ${MODEL.age_peak_days} days\n`);
}

/** Usage, the paths the program reads and writes, and the model in one paragraph. */
function printUsage(): void {
  process.stdout.write(`token radar ${MODEL_VERSION} — build the best token launch radar\n`);
  process.stdout.write(`\n`);
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  node main.ts [--input <snapshot.json|directory>] [--output <directory>]\n`);
  process.stdout.write(`  node main.ts --help\n`);
  process.stdout.write(`  node main.ts --version\n`);
  process.stdout.write(`\n`);
  process.stdout.write(`Input:\n`);
  process.stdout.write(`  --input, or /input by default: snapshot.json, the sealed DefiLlama protocol list\n`);
  process.stdout.write(`  MAKEFUN_OUTPUT_DIR, or /output by default, is where the board goes\n`);
  process.stdout.write(`\n`);
  process.stdout.write(`Output:\n`);
  process.stdout.write(`  board.json: the ranked board, watchlist first, then the early rows\n`);
  process.stdout.write(`  data.js: the same board for the dashboard, with no network fetch\n`);
  process.stdout.write(`  dashboard/: the static page, copied unchanged\n`);
  process.stdout.write(`  screenshots/: the three screenshots, the board, a detail view, a filtered view\n`);
  process.stdout.write(`  dossier.json: the summary the judge reads, built last\n`);
  process.stdout.write(`\n`);
  process.stdout.write(`Model ${MODEL_VERSION}:\n`);
  process.stdout.write(`  implied value is TVL times ${MODEL.base_multiple}, times a growth multiplier\n`);
  process.stdout.write(`  that caps the 7-day change at +${MODEL.growth_cap}%, times an age multiplier that\n`);
  process.stdout.write(`  peaks between ${MODEL.age_young_days} and ${MODEL.age_peak_days} days, times a farmability\n`);
  process.stdout.write(`  multiplier set by category only, never by name, times a chain multiplier\n`);
  process.stdout.write(`  of 1 plus 0.01 per chain, capped at 5 chains\n`);
  process.stdout.write(`\n`);
  process.stdout.write(`The board never changes the snapshot: it only scores what the snapshot records.\n`);
}

/** --help and --version answer before any snapshot is read, so they never need /input. */
if (hasFlag('--help') || hasFlag('-h')) {
  printUsage();
  process.exit(0);
}
if (hasFlag('--version') || hasFlag('-v')) {
  printVersion();
  process.exit(0);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);

/** The run summary, on stderr so the stdout report above stays machine-readable. */
const topRow = board[0];
const coveredSlugs = snapshot.watchlist.filter((slug) => board.some((row) => row.slug === slug)).length;
process.stderr.write(`token radar summary: ${board.length} rows written, ${coveredSlugs} of ${snapshot.watchlist.length} watchlist protocols covered\n`);
if (topRow !== undefined) {
  process.stderr.write(`token radar summary: top-ranked ${topRow.slug} at ${formatUsd(topRow.implied_value_usd)} implied value\n`);
}
