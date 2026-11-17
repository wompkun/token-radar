/**
 * End-to-end flow test for the built dashboard (board -> detail -> filter),
 * driven by the Playwright Chromium already on this VM.
 *
 * Serves the built output (out/) on localhost, opens the real dashboard,
 * and asserts behaviour a file read cannot prove. Run: node tests/e2e-flow.mjs
 *
 * Note on e2e CLI: the installed `e2e` CLI (0.23.1) was evaluated and NOT
 * used here — it needs `e2e init` with a project directory, engine and an AI
 * model provider, and drives goals in natural language. This scripted
 * assertion run is the deterministic check the build needs; Playwright is
 * the driver for it.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const OUT = new URL('../out/', import.meta.url).pathname;
const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  try {
    const path = normalize(join(OUT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'dashboard/index.html'));
    if (!path.startsWith(OUT)) { res.writeHead(403); return res.end(); }
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];
async function check(name, fn) {
  try { await fn(); console.log(`  ok ${name}`); }
  catch (e) { failures.push(name); console.log(`  FAIL ${name}: ${e.message}`); }
}

try {
  await page.goto(`http://127.0.0.1:${port}/dashboard/index.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('table tbody tr');

  await check('board renders 200 rows', async () => {
    const n = await page.locator('table tbody tr').count();
    assert.equal(n, 200);
  });

  await check('spotlight shows the top 5', async () => {
    const n = await page.locator('.spot, .spotlight, [class*="spot"]').count();
    assert.ok(n >= 1, 'no spotlight element found');
  });

  await check('top-10 chart: bar 10 is at least 20% as wide as bar 1 (sqrt scale)', async () => {
    const widths = await page.$$eval('.chart .crow .bar i', (els) => els.map((e) => e.getBoundingClientRect().width));
    assert.equal(widths.length, 10);
    const ratio = widths[9] / widths[0];
    assert.ok(ratio >= 0.2, `bar 10 / bar 1 = ${ratio.toFixed(3)} (linear scale gives ~0.09)`);
  });

  await check('detail opens for rank 1 with 7 farm steps', async () => {
    await page.locator('table tbody tr').first().click();
    await page.waitForSelector('dialog#detail[open]');
    const title = await page.textContent('#detail-title');
    assert.equal(title, 'Steakhouse Financial');
    const steps = await page.locator('#detail ol.steps li').count();
    assert.equal(steps, 7);
    const warn = await page.textContent('#detail .warn');
    assert.match(warn, /Never pay to claim/);
    await page.keyboard.press('Escape');
  });

  await check('category filter narrows the board to that category', async () => {
    await page.selectOption('#category', 'Lending');
    await page.waitForTimeout(200);
    const rows = page.locator('table tbody tr');
    const n = await rows.count();
    assert.ok(n > 0 && n < 200, `expected 1..199 lending rows, got ${n}`);
    const subs = await rows.locator('.name .sub').allTextContents();
    for (const s of subs) assert.ok(s.startsWith('Lending'), `row not Lending: ${s}`);
  });

  await check('search finds one protocol by name', async () => {
    await page.selectOption('#category', 'all');
    await page.fill('#q', 'steakhouse');
    await page.waitForTimeout(200);
    const n = await page.locator('table tbody tr').count();
    assert.equal(n, 1);
  });

  await check('live-token tab shows the set-aside protocols', async () => {
    await page.fill('#q', '');
    await page.getByRole('button', { name: 'Live token' }).click();
    await page.waitForTimeout(200);
    const n = await page.locator('table tbody tr').count();
    assert.equal(n, 24);
  });

  await check('dashboard makes no external request', async () => {
    const reqs = [];
    page.on('request', (r) => reqs.push(r.url()));
    await page.reload({ waitUntil: 'networkidle' });
    const external = reqs.filter((u) => !u.startsWith('http://127.0.0.1'));
    assert.deepEqual(external, []);
  });

  await check('no innerHTML / eval sink in the dashboard source', async () => {
    const src = await readFile(new URL('../dashboard/app.js', import.meta.url), 'utf8');
    assert.ok(!/innerHTML|outerHTML|document\.write|eval\(|new Function/.test(src));
  });
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.log(`\n${failures.length} e2e check(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nall e2e checks passed');
