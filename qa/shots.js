/* Visual pass: one gameplay frame per sector (and a boss frame) for art review.
   usage: node qa/shots.js [desktop|mobile] [heroId] [sectors=1,2,...] [outDir=qa] */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..'), TN = path.resolve(ROOT, 'node_modules', 'three');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
const [mode = 'desktop', hero = 'caret', secArg = '1,2,3,4,5,6,7,8', outDir = path.join(ROOT, 'qa')] = process.argv.slice(2);
const mobile = mode === 'mobile';
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage(); const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.hostname === 'cdn.jsdelivr.net') return r.fulfill({ path: path.join(TN, u.pathname.replace('/npm/three@0.170.0', '')), contentType: 'text/javascript' });
    if (u.hostname === 'game.local') { const f = path.join(ROOT, u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname)); return fs.existsSync(f) ? r.fulfill({ path: f, contentType: mime[path.extname(f)] || 'application/octet-stream' }) : r.fulfill({ status: 404 }); }
    return r.fulfill({ status: 200, body: '', contentType: 'text/css' });
  });
  await page.goto('http://game.local/');
  await page.waitForFunction(() => window.__AD && window.__AD.G.mode === 'title', null, { timeout: 90000 });
  await page.evaluate(h => { window.__AD.selected = h; return window.__AD.startRun(); }, hero);
  await page.waitForFunction(() => window.__AD.G.mode === 'play', null, { timeout: 60000 });
  for (const n of secArg.split(',').map(Number)) {
    await page.evaluate(n => { const A = window.__AD; A.god(); A.sector(n); }, n);
    await page.waitForTimeout(3600);
    // stand in the first wing room with something to shoot at
    await page.evaluate(() => {
      const A = window.__AD, G = A.G, W = A.world, r = W.rooms.find(r => r.zone === 'north') || W.rooms[0];
      G.p.x = (r.x + r.w / 2) * 2; G.p.z = (r.y + r.h / 2) * 2 + 2; G.p.hp = G.p.maxHp; A.input.autoFire = true;
    });
    await page.waitForTimeout(1600);
    await page.evaluate(() => { const A = window.__AD; A.move('sweeping_arc'); A.input.dash = true; });
    await page.waitForTimeout(160);
    await page.screenshot({ path: path.join(outDir, `look_${mobile ? 'm' : 'd'}_s${n}.png`) });
  }
  await page.evaluate(() => { const A = window.__AD; A.solve(); A.killAll(); });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__AD.toVault());
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(outDir, `look_${mobile ? 'm' : 'd'}_boss0.png`) });
  await page.evaluate(() => { const A = window.__AD; A.move('piercing_beam'); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, `look_${mobile ? 'm' : 'd'}_boss.png`) });
  console.log('ERRORS', errs.length, errs.slice(0, 8).join('\n'));
  await b.close(); process.exit(errs.length ? 1 : 0);
})();
