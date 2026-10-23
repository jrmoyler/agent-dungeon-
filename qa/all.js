/* Roster + kit smoke test: every agent loads its atlases, fires every move, and survives a sector loop.
   Also asserts that no two agents share a name or a stat line.
   usage: node qa/all.js [id,id,...] */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..'), NM = path.resolve(ROOT, 'node_modules');
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await b.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message + ' ' + e.stack));
  await page.route('**/*', async r => { const u = new URL(r.request().url());
    if (u.hostname === 'cdn.jsdelivr.net') return r.fulfill({ path: path.join(NM, u.pathname.replace(/^\/npm\/([^@/]+)@[^/]+/, '$1')), contentType: 'text/javascript' });
    if (u.hostname === 'game.local') { const f = path.join(ROOT, u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname)); return fs.existsSync(f) ? r.fulfill({ path: f }) : r.fulfill({ status: 404 }); }
    return r.fulfill({ status: 200, body: '' }); });
  await page.goto('http://game.local/');
  await page.waitForFunction(() => window.__AD && window.__AD.G.mode === 'title', null, { timeout: 90000 });
  const roster = await page.evaluate(() => window.__AD.HEROES.map(h => ({ id: h.id, name: h.name, cohort: h.cohort, line: [h.stats.hp, h.stats.atk, h.stats.spd, h.stats.def, h.x.label, h.x.v].join('/') })));
  const fail = [];
  const dup = (k) => roster.filter((r, i) => roster.findIndex(o => o[k] === r[k]) !== i).map(r => r[k]);
  if (roster.length !== 28) fail.push('expected 28 agents, got ' + roster.length);
  if (dup('name').length) fail.push('duplicate names: ' + dup('name'));
  if (dup('line').length) fail.push('duplicate stat lines: ' + dup('line'));
  const echoLines = roster.filter(r => r.cohort === 'echo').map(r => r.line.split('/').slice(0, 4).join('/'));
  for (const r of roster.filter(r => r.cohort === 'origin')) if (echoLines.includes(r.line.split('/').slice(0, 4).join('/'))) fail.push('echo agent copies stats of ' + r.name);
  const ids = process.argv[2] ? process.argv[2].split(',') : roster.map(r => r.id);
  for (const id of ids) {
    await page.evaluate(id => { window.__AD.selected = id; return window.__AD.startRun(); }, id);
    await page.waitForFunction(() => window.__AD.G.mode === 'play', null, { timeout: 60000 });
    const res = await page.evaluate(async () => {
      const A = window.__AD, G = A.G, p = G.p, sleep = ms => new Promise(r => setTimeout(r, ms));
      A.god(); A.input.autoFire = true; const used = {};
      for (const k of ['rapid_fire', 'sweeping_arc', 'piercing_beam', 'area_pulse', 'summon', 'ultimate']) { p.cds[k] = 0; used[k] = A.move(k); await sleep(120); }
      for (let i = 0; i < 6; i++) { A.killAll(); await sleep(150); if (G.mode === 'levelup') document.querySelector('.card').click(); }
      A.solve(); for (let i = 0; i < 40 && G.stage !== 'gate'; i++) { A.killAll(); await sleep(100); }
      A.toVault(); for (let i = 0; i < 40 && G.stage !== 'boss'; i++) await sleep(100);
      for (let i = 0; i < 12 && G.bosses.some(b => b.alive); i++) { A.damageBoss(0.2); await sleep(150); }
      for (let i = 0; i < 60 && G.stage === 'boss'; i++) await sleep(100); // headless frames are slow; let the stage advance
      return { used, stage: G.stage, frame: p.sprite.frame };
    });
    const bad = Object.entries(res.used).filter(([, v]) => !v).map(([k]) => k);
    console.log(id.padEnd(12), JSON.stringify(res));
    if (bad.length) fail.push(`${id}: moves did not fire: ${bad}`);
    if (res.stage !== 'portal') fail.push(`${id}: sector loop ended at ${res.stage}`);
    await page.evaluate(() => { const A = window.__AD; A.G.mode = 'results'; });
  }
  if (errs.length) fail.push(...errs.slice(0, 10));
  console.log(fail.length ? 'FAIL\n' + fail.join('\n') : `PASS · ${ids.length} agents, 28 unique names and stat lines`);
  await b.close(); process.exit(fail.length ? 1 : 0);
})();
