/**
 * Regression tests for the main.ts command-line flags added for the
 * thinking_reproduces fix: --help, --version, and the stderr run summary.
 * They only assert short fragments of the output, never the program's
 * own lines, and they run the real entry point as a child process.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const main = join(root, 'main.ts');
const snapshot = join(root, '..', 'token-radar-01-kit', 'input', 'snapshot.json');

function run(args: string[], env: Record<string, string> = {}): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [main, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('main.ts flags', () => {
  it('--help prints usage and the model name and exits 0 without reading a snapshot', () => {
    const r = run(['--help']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Usage:/);
    assert.match(r.stdout, /radar-2/);
    assert.match(r.stdout, /board\.json/);
  });

  it('--version prints radar-2 and exits 0', () => {
    const r = run(['--version']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /radar-2/);
  });

  it('a full run still writes 200 rows and prints the summary on stderr', () => {
    const out = mkdtempSync(join(tmpdir(), 'radar-cli-'));
    const r = run(['--input', snapshot], { MAKEFUN_OUTPUT_DIR: out });
    assert.equal(r.status, 0, r.stderr);
    const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8')) as { rows: { slug: string; implied_value_usd: number }[] };
    assert.equal(board.rows.length, 200);
    assert.equal(board.rows[0]!.slug, 'steakhouse-financial');
    assert.match(r.stderr, /200 rows written/);
    assert.match(r.stderr, /40 of 40 watchlist/);
    assert.match(r.stderr, /steakhouse-financial/);
  });
});
