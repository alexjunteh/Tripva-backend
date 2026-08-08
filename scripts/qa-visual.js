#!/usr/bin/env node

// Visual QA gate for Tripva releases.
// Usage: node scripts/qa-visual.js [backend-preview-url]
// Env:   FRONTEND_URL (default: https://tripva.app)
//        QA_SCREENSHOT_DIR (default: /tmp/tripva-qa)

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const FRONTEND = process.env.FRONTEND_URL || 'https://tripva.app';
const BACKEND  = process.argv[2] || '';
const OUTDIR   = process.env.QA_SCREENSHOT_DIR || '/tmp/tripva-qa';

const BLOCKED_IMG_PATTERNS = [
  'loremflickr.com',
  'lorempixel.com',
  'placekitten.com',
  'placeimg.com',
];

const PAGES = [
  { path: '/',                    name: 'homepage' },
  { path: '/plan.html',           name: 'plan' },
  { path: '/mytrips.html',        name: 'mytrips' },
  { path: '/about.html',          name: 'about' },
  { path: '/trip-v2.html?demo=1', name: 'trip-demo' },
  { path: '/press.html',          name: 'press' },
];

let total = 0, passed = 0;
const failures = [];

function pass(label) {
  total++; passed++;
  console.log(`\x1b[32m  PASS\x1b[0m [${label}]`);
}

function fail(label, detail) {
  total++;
  failures.push({ label, detail });
  console.log(`\x1b[31m  FAIL\x1b[0m [${label}] ${detail}`);
}

mkdirSync(OUTDIR, { recursive: true });

let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (e) {
  console.error(`Cannot launch browser: ${e.message}`);
  console.error('Run: npx playwright install chromium');
  process.exit(1);
}

const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
});

// ── Frontend Visual QA ──────────────────────────────────────────────

console.log(`\x1b[1m=== Frontend Visual QA (${FRONTEND}) ===\x1b[0m\n`);

for (const pg of PAGES) {
  const url = `${FRONTEND}${pg.path}`;
  console.log(`\x1b[1m── ${pg.name} ──\x1b[0m`);

  const page = await ctx.newPage();
  const consoleErrors = [];
  const blockedUrls = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  page.on('response', resp => {
    if (BLOCKED_IMG_PATTERNS.some(p => resp.url().includes(p))) {
      blockedUrls.push(resp.url());
    }
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
  } catch (e) {
    fail(`${pg.name}/load`, e.message.slice(0, 120));
    await page.close();
    continue;
  }

  await page.screenshot({
    path: `${OUTDIR}/${pg.name}.png`,
    fullPage: true,
  });

  // Check 1: broken images (visible <img> with naturalWidth === 0)
  const brokenInDOM = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img'))
      .filter(img => {
        const s = getComputedStyle(img);
        const r = img.getBoundingClientRect();
        return r.width > 0 && r.height > 0 &&
          s.display !== 'none' && s.visibility !== 'hidden';
      })
      .filter(img => !img.complete || img.naturalWidth === 0)
      .map(img => img.src || img.dataset?.src || '(no src)');
  });

  if (brokenInDOM.length === 0) {
    pass(`${pg.name}/images`);
  } else {
    fail(`${pg.name}/images`,
      `${brokenInDOM.length} broken: ${brokenInDOM.slice(0, 3).join(', ')}`);
  }

  // Check 2: blocked URL patterns (loremflickr etc.)
  if (blockedUrls.length === 0) {
    pass(`${pg.name}/no-blocked-urls`);
  } else {
    fail(`${pg.name}/no-blocked-urls`, blockedUrls.join(', '));
  }

  // Check 3: JS console errors (filter benign noise)
  const realErrors = consoleErrors.filter(e =>
    !e.includes('favicon') &&
    !e.includes('net::ERR_BLOCKED_BY_CLIENT') &&
    !e.includes('net::ERR_FAILED') &&
    !e.includes('Failed to load resource') &&
    !e.includes('status of 401') &&
    !e.includes('status of 403')
  );
  if (realErrors.length === 0) {
    pass(`${pg.name}/console`);
  } else {
    fail(`${pg.name}/console`,
      `${realErrors.length} error(s): ${realErrors[0].slice(0, 120)}`);
  }

  // Check 4: page has meaningful content
  const textLen = await page.evaluate(() =>
    document.body.innerText.trim().length
  );
  if (textLen > 50) {
    pass(`${pg.name}/content`);
  } else {
    fail(`${pg.name}/content`,
      `Only ${textLen} chars — page may be blank`);
  }

  // Check 5: CSS background-image URLs are loadable and not blocked
  const bgUrls = await page.evaluate((blocked) => {
    const urls = [];
    for (const el of document.querySelectorAll('*')) {
      const bg = getComputedStyle(el).backgroundImage;
      if (!bg || bg === 'none') continue;
      const m = bg.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/);
      if (!m) continue;
      const url = m[1];
      if (blocked.some(p => url.includes(p))) {
        urls.push({ url, status: 'blocked' });
      } else {
        urls.push({ url, status: 'pending' });
      }
    }
    return urls;
  }, BLOCKED_IMG_PATTERNS);

  const brokenBgs = [];
  for (const entry of bgUrls) {
    if (entry.status === 'blocked') {
      brokenBgs.push(entry.url);
      continue;
    }
    try {
      const r = await page.request.head(entry.url, { timeout: 8000 });
      if (r.status() >= 400) brokenBgs.push(entry.url);
    } catch {
      brokenBgs.push(entry.url);
    }
  }

  if (bgUrls.length === 0 && pg.name === 'trip-demo') {
    fail(`${pg.name}/bg-images`, 'No background-image URLs found — day cards may not be rendering');
  } else if (brokenBgs.length > 0) {
    fail(`${pg.name}/bg-images`,
      `${brokenBgs.length} broken: ${brokenBgs.slice(0, 3).join(', ')}`);
  } else if (bgUrls.length > 0) {
    pass(`${pg.name}/bg-images`);
  }

  await page.close();
}

// ── Backend API Quality ─────────────────────────────────────────────

if (BACKEND) {
  console.log(
    `\n\x1b[1m=== Backend API Quality (${BACKEND}) ===\x1b[0m\n`
  );
  const page = await ctx.newPage();

  // OG image renders
  try {
    const r = await page.request.get(
      `${BACKEND}/api/og?title=QA+Test&destination=Tokyo`
    );
    const ct = r.headers()['content-type'] || '';
    if (r.status() === 200 && ct.includes('image')) {
      pass('api/og-image');
    } else {
      fail('api/og-image', `status=${r.status()}, type=${ct}`);
    }
  } catch (e) {
    fail('api/og-image', e.message.slice(0, 100));
  }

  // Stats returns valid JSON object
  try {
    const r = await page.request.get(`${BACKEND}/api/stats`);
    if (r.status() === 200) {
      const j = await r.json();
      if (j && typeof j === 'object') pass('api/stats');
      else fail('api/stats', 'Not a JSON object');
    } else {
      fail('api/stats', `status=${r.status()}`);
    }
  } catch (e) {
    fail('api/stats', e.message.slice(0, 100));
  }

  // Health returns "ok"
  try {
    const r = await page.request.get(`${BACKEND}/api/health`);
    const t = await r.text();
    if (r.status() === 200 && t.includes('"ok"')) pass('api/health');
    else fail('api/health', `status=${r.status()}`);
  } catch (e) {
    fail('api/health', e.message.slice(0, 100));
  }

  // Plan endpoint rejects GET with 405
  try {
    const r = await page.request.get(`${BACKEND}/api/plan`);
    if (r.status() === 405) pass('api/plan-method-guard');
    else fail('api/plan-method-guard', `expected 405, got ${r.status()}`);
  } catch (e) {
    fail('api/plan-method-guard', e.message.slice(0, 100));
  }

  // User endpoint requires auth (401)
  try {
    const r = await page.request.get(`${BACKEND}/api/user/me`);
    if (r.status() === 401) pass('api/user-auth-guard');
    else fail('api/user-auth-guard', `expected 401, got ${r.status()}`);
  } catch (e) {
    fail('api/user-auth-guard', e.message.slice(0, 100));
  }

  // CORS headers present on API response
  try {
    const r = await page.request.get(`${BACKEND}/api/health`, {
      headers: { 'Origin': 'https://tripva.app' },
    });
    const acao = r.headers()['access-control-allow-origin'] || '';
    if (acao.includes('tripva.app') || acao === '*') pass('api/cors-headers');
    else fail('api/cors-headers', `Access-Control-Allow-Origin: "${acao}"`);
  } catch (e) {
    fail('api/cors-headers', e.message.slice(0, 100));
  }

  // Security headers (X-Content-Type-Options, X-Frame-Options)
  try {
    const r = await page.request.get(`${BACKEND}/api/stats`);
    const xcto = r.headers()['x-content-type-options'] || '';
    const xfo = r.headers()['x-frame-options'] || '';
    const missing = [];
    if (!xcto.includes('nosniff')) missing.push('X-Content-Type-Options');
    if (!xfo) missing.push('X-Frame-Options');
    if (missing.length === 0) pass('api/security-headers');
    else fail('api/security-headers', `missing: ${missing.join(', ')}`);
  } catch (e) {
    fail('api/security-headers', e.message.slice(0, 100));
  }

  await page.close();
}

await browser.close();

// ── Summary ─────────────────────────────────────────────────────────

console.log(
  `\n\x1b[1m=== QA: ${passed}/${total} passed, ${failures.length} failed ===\x1b[0m`
);

if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  \x1b[31m✗\x1b[0m ${f.label}: ${f.detail}`);
  }
}

console.log(`\nScreenshots saved to ${OUTDIR}/`);
process.exit(failures.length > 0 ? 1 : 0);
