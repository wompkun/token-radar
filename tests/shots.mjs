/**
 * Takes the 3 dossier screenshots of the actual built dashboard with the
 * Playwright Chromium on this VM (1440x900 viewport, PNG).
 * Run: node tests/shots.mjs   (build first: MAKEFUN_OUTPUT_DIR=out node main.ts ...)
 * Writes screenshots/1-board.png, 2-detail.png, 3-filtered.png and prints
 * each file's size and dimensions. Gate: each <= 512 KiB, long side <= 1440.
 */
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'out') + '/';
const SHOTS = join(ROOT, 'screenshots') + '/';
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
const base = `http://127.0.0.1:${port}/dashboard/index.html`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function shot(url, file, waitFor, scrollTo) {
  // A hash-only URL change is a same-document navigation: the page would not
  // reload and readHash() would never run. Go via about:blank first so each
  // shot is a fresh load.
  await page.goto('about:blank');
  await page.goto(url, { waitUntil: 'networkidle' });
  if (waitFor) await page.waitForSelector(waitFor);
  // The board table sits below the hero; a viewport shot of the top would
  // show no rows at all. Scroll so the filter controls sit at the top and
  // the table header + first rows fill the rest of the frame.
  if (scrollTo) {
    await page.evaluate(() => {
      const t = document.querySelector('table');
      window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 90);
    });
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, file) });
  const buf = await readFile(join(SHOTS, file));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const size = (await stat(join(SHOTS, file))).size;
  console.log(`${file}: ${w}x${h}, ${size} bytes (${(size / 1024).toFixed(1)} KiB)${size > 512 * 1024 ? '  OVER 512 KiB!' : ''}${Math.max(w, h) > 1440 ? '  LONG SIDE OVER 1440!' : ''}`);
}

try {
  await shot(base, '1-board.png', null, '.controls');
  await shot(base + '#p=steakhouse-financial', '2-detail.png', 'dialog#detail[open]');
  await shot(base + '#category=Lending', '3-filtered.png', null, '.controls');
} finally {
  await browser.close();
  server.close();
}
console.log('done');
