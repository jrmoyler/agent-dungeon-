/* Headless playtest: drives one agent through real input paths and every system.
   usage: node qa/play.js [desktop|mobile] [heroId] [sectors=2] [outDir=qa]  */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..'), NM = path.resolve(ROOT, 'node_modules');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const [mode = 'desktop', hero = 'caret', sectorsArg = '2', outDir = path.join(ROOT, 'qa')] = process.argv.slice(2);
const mobile = mode === 'mobile', SECTORS = +sectorsArg;
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));
  await page.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.hostname === 'cdn.jsdelivr.net') return r.fulfill({ path: path.join(NM, u.pathname.replace(/^\/npm\/([^@/]+)@[^/]+/, '$1')), contentType: 'text/javascript' });
    if (u.hostname === 'game.local') { const p = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname); const f = path.join(ROOT, p); if (fs.existsSync(f)) return r.fulfill({ path: f, contentType: mime[path.extname(f)] || 'application/octet-stream' }); return r.fulfill({ status: 404 }); }
    if (u.hostname.includes('fonts.g')) return r.fulfill({ status: 200, body: '', contentType: 'text/css' });
    return r.abort();
  });
  const tag = `${mobile ? 'm' : 'd'}_${hero}`;
  const shot = n => page.screenshot({ path: path.join(outDir, `shot_${tag}_${n}.png`) });
  const ev = (fn, a) => page.evaluate(fn, a);
  const wait = ms => page.waitForTimeout(ms);
  await page.goto('http://game.local/');
  await page.waitForFunction(() => window.__AD && window.__AD.G.mode === 'title', null, { timeout: 90000 });
  await wait(1200); await shot('1_title');
  await page.click('#btnPlay'); await ev(h => { window.__AD.selected = h; }, hero);
  await page.click(`#hero-${hero}`); await wait(1800); await shot('2_select');
  await page.click('#btnStart');
  await page.waitForFunction(() => window.__AD.G.mode === 'play', null, { timeout: 60000 });
  await wait(1500);
  const log = [];
  // fight: aim at nearest, cycle every move through the real input flags
  const fight = async (rounds, label) => {
    for (let i = 0; i < rounds; i++) {
      await ev(i => {
        const A = window.__AD, G = A.G, p = G.p; p.hp = p.maxHp; A.input.autoFire = true; A.input.mouseIn = false;
        const e = G.enemies.filter(e => e.alive).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
        if (e) {
          let dx = e.x - p.x, dz = e.z - p.z, l = Math.hypot(dx, dz);
          if (l > 7) { const W = A.world; for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283, nx = e.x + Math.cos(a) * 5, nz = e.z + Math.sin(a) * 5; if (!W.grid[Math.floor(nz / 2) * W.W + Math.floor(nx / 2)]) { p.x = nx; p.z = nz; break; } } dx = e.x - p.x; dz = e.z - p.z; l = Math.hypot(dx, dz); }
          p.aimX = dx / l; p.aimZ = dz / l;
        }
        const ks = ['rapid_fire', 'sweeping_arc', 'piercing_beam', 'area_pulse', 'summon', 'ultimate']; A.input.moves[ks[i % ks.length]] = true;
        if (i % 5 === 0) A.input.dash = true;
        if (G.mode === 'levelup') document.querySelector('.card').click();
      }, i);
      await wait(260);
    }
  };
  for (let s = 1; s <= SECTORS; s++) {
    await fight(14, 's' + s);
    await shot(`3_s${s}_combat`);
    await ev(() => window.__AD.solve());
    for (let k = 0; k < 8; k++) { await ev(() => window.__AD.killAll()); await fight(4); const left = await ev(() => window.__AD.G.enemies.filter(e => e.alive && !e.boss).length); if (!left) break; }
    await wait(400);
    const st1 = await ev(() => ({ stage: window.__AD.G.stage, gate: window.__AD.world.gateOpen, seal: window.__AD.world.sealOpen }));
    await ev(() => window.__AD.toVault()); await wait(900);
    await fight(10); await shot(`4_s${s}_boss`);
    for (let k = 0; k < 12; k++) { await ev(() => window.__AD.damageBoss(0.12)); await fight(2); const done = await ev(() => window.__AD.G.stage); if (done === 'portal') break; }
    await wait(1800);
    const st2 = await ev(() => { const G = window.__AD.G; return { sector: G.floor, stage: G.stage, kills: G.kills, lvl: G.p.level, score: Math.round(G.score), fx: G.fx.length, summons: G.summons.length, tele: G.telegraphs.length }; });
    log.push({ s, ...st1, ...st2 });
    if (s < SECTORS) { await ev(() => window.__AD.toPortal()); await page.waitForFunction(n => window.__AD.G.floor === n && window.__AD.G.mode === 'play', s + 1, { timeout: 20000 }); await wait(1200); }
  }
  await ev(() => { window.__AD.G.p.hp = 1; window.__AD.G.p.inv = 0; });
  await page.keyboard.press('Escape'); await wait(300); await shot('5_pause'); await page.keyboard.press('Escape');
  console.log(hero, mode, JSON.stringify(log));
  console.log('ERRORS', errs.length, errs.slice(0, 12).join('\n'));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
