/* ------------------------------------------------------------------
   UI: title, roster select, HUD, level-up draft, pause, results,
   minimap, input (keyboard / mouse / touch twin-sticks), main loop
------------------------------------------------------------------- */
const $ = s => document.querySelector(s);
const screens = ['#title', '#select', '#hud', '#levelup', '#pause', '#results', '#loading'];
function show(...ids) { for (const s of screens) $(s).hidden = !ids.includes(s); $('#touch').hidden = !(IS_TOUCH && ids.includes('#hud')); }

function statBar(v, max = 7, cls = '') { let s = '<span class="bar ' + cls + '">'; for (let i = 0; i < max; i++) s += `<i class="${i < v ? 'on' : ''}"></i>`; return s + '</span>'; }

/* ---------- roster select ---------- */
let selected = 'claude';
try { selected = localStorage.getItem('ad_hero') || selected; if (!HERO_BY_ID[selected]) selected = 'claude'; } catch (e) { }
function buildRoster() {
  const grid = $('#roster'); grid.innerHTML = '';
  for (const h of HEROES) {
    const b = document.createElement('button'); b.className = 'tile'; b.id = 'hero-' + h.id; b.style.setProperty('--hc', h.css);
    b.innerHTML = `<img src="${artURL(h.id, 'idle')}" alt=""><span>${h.name}</span>`;
    b.onclick = () => { selected = h.id; AUDIO.init(); AUDIO.sfx.ui(); renderDetail(); };
    b.ondblclick = () => startRun();
    grid.appendChild(b);
  }
  renderDetail();
}
function renderDetail() {
  const h = HERO_BY_ID[selected]; const d = derive(h);
  document.querySelectorAll('.tile').forEach(t => t.classList.toggle('sel', t.id === 'hero-' + h.id));
  try { localStorage.setItem('ad_hero', h.id); } catch (e) { }
  $('#detail').style.setProperty('--hc', h.css); document.documentElement.style.setProperty('--hero', h.css);
  $('#detail').innerHTML = `
    <div class="d-art"><img src="${artURL(h.id, 'portrait_bg')}" alt="${h.name} artwork"></div>
    <div class="d-body">
      <div class="d-head"><h2>${h.name}</h2><span class="maker">${h.maker}</span></div>
      <p class="role">${h.role}</p>
      <div class="stats">
        <div><b>HP</b>${statBar(h.stats.hp, 7, 'hp')}<em>${d.maxHp}</em></div>
        <div><b>ATK</b>${statBar(h.stats.atk, 7, 'atk')}<em>${d.dmg.toFixed(1)}</em></div>
        <div><b>SPD</b>${statBar(h.stats.spd, 7, 'spd')}<em>${d.spd.toFixed(1)}</em></div>
        <div><b>DEF</b>${statBar(h.stats.def, 7, 'def')}<em>${Math.round(d.def * 100)}%</em></div>
        <div><b>${h.x.label}</b>${statBar(h.x.v, 7, 'x')}<em>×${d.pow.toFixed(2)}</em></div>
      </div>
      <div class="abil">
        <div class="ab"><img src="${artURL(h.id, 'icon_weapon')}" alt=""><div><b>${h.weapon.name}</b><span>Primary · ${h.weapon.rate}/s</span></div></div>
        <div class="ab"><img src="${artURL(h.id, 'icon_special')}" alt=""><div><b>${h.special.name}</b><span>${h.special.desc} <i>${(h.special.cd * (h.cdMul || 1)).toFixed(1)}s</i></span></div></div>
      </div>
      <div class="pc">
        <div class="pro"><h4>In the real world</h4><ul>${h.pros.map(x => `<li>${x}</li>`).join('')}</ul></div>
        <div class="con"><h4>Limits</h4><ul>${h.cons.map(x => `<li>${x}</li>`).join('')}</ul></div>
      </div>
      <div class="pf"><p><span class="tag up">Perk</span>${h.perk}</p><p><span class="tag down">Flaw</span>${h.flaw}</p></div>
    </div>`;
}

/* ---------- HUD ---------- */
const hud = {};
function initHud() {
  ['hpFill', 'hpText', 'xpFill', 'lvl', 'floorTxt', 'killTxt', 'scoreTxt', 'spIcon', 'spCd', 'dashCd', 'buffs', 'bossbar', 'bossFill', 'bossName', 'portrait', 'heroName', 'objective', 'quota', 'modeTag'].forEach(k => hud[k] = document.getElementById(k));
}
function setupHudForHero(h) {
  hud.portrait.src = artURL(h.id, 'portrait_bg'); hud.heroName.textContent = h.name;
  hud.spIcon.src = artURL(h.id, 'icon_special'); document.documentElement.style.setProperty('--hero', h.css);
  $('#tSpecial').style.backgroundImage = `url(${artURL(h.id, 'icon_special')})`;
  hud.quota.hidden = !h.quota; hud.modeTag.hidden = h.id !== 'glm';
}
let hudT = 0;
function updateHud(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.05;
  const p = G.p;
  hud.hpFill.style.transform = `scaleX(${p.hp / p.maxHp})`; hud.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  hud.xpFill.style.transform = `scaleX(${p.xp / p.xpNext})`; hud.lvl.textContent = p.level;
  hud.floorTxt.textContent = `${G.floor}/${FLOORS}`; hud.killTxt.textContent = G.kills; hud.scoreTxt.textContent = Math.round(G.score).toLocaleString();
  const spf = p.spMax ? p.spT / p.spMax : 0; hud.spCd.style.setProperty('--p', spf); hud.spCd.dataset.t = p.spT > 0 ? p.spT.toFixed(1) : '';
  $('#tSpecial').style.setProperty('--p', spf); $('#tSpecial').classList.toggle('ready', p.spT <= 0);
  hud.spCd.parentElement.classList.toggle('ready', p.spT <= 0);
  const dcf = p.dashCd / (1.1 / (p.hero.dashMul || 1) * (p.hero.cdMul || 1)); hud.dashCd.style.setProperty('--p', clamp(dcf, 0, 1)); $('#tDash').style.setProperty('--p', clamp(dcf, 0, 1));
  const b = []; if (p.buffs.power > 0) b.push(['Overclock', p.buffs.power]); if (p.buffs.haste > 0) b.push(['Burst', p.buffs.haste]); if (p.buffs.citation > 0) b.push(['Cited', p.buffs.citation]); if (p.buffs.homing > 0) b.push(['Lock-on', p.buffs.homing]); if (G.shield) b.push(['Dome', G.shield.t]); if (p.slowT > 0) b.push(['Slow pool', p.slowT]);
  hud.buffs.innerHTML = b.map(([n, t]) => `<span class="${n === 'Slow pool' ? 'bad' : ''}">${n} ${t.toFixed(1)}s</span>`).join('');
  if (p.hero.quota) hud.quota.innerHTML = `<b>Requests</b><span style="--q:${1 - p.shots / p.hero.quota}"></span>`;
  if (p.hero.id === 'glm') hud.modeTag.textContent = p.glm === 'zh' ? '中 · spread' : 'EN · pierce';
  if (G.boss && G.boss.aggro) { hud.bossbar.hidden = false; hud.bossName.textContent = G.boss.name; hud.bossFill.style.transform = `scaleX(${Math.max(0, G.boss.hp / G.boss.maxHp)})`; } else hud.bossbar.hidden = true;
  const left = G.enemies.length;
  hud.objective.textContent = G.portalOpen ? 'Portal open — reach it' : (G.floor % 3 === 0 ? (G.boss ? 'Defeat the boss' : 'Clear the arena') : `Threats left: ${left}`);
  drawMinimap();
}
const mm = document.getElementById('minimap'), mmc = mm.getContext('2d');
function drawMinimap() {
  const W = world.W, H = world.H; const S = mm.width; const p = G.p; const R = 26; const cell = S / (R * 2);
  const ptx = p.x / TILE, ptz = p.z / TILE;
  mmc.clearRect(0, 0, S, S); mmc.fillStyle = 'rgba(6,9,16,0.82)'; mmc.fillRect(0, 0, S, S);
  for (let y = Math.floor(ptz - R); y < ptz + R; y++) for (let x = Math.floor(ptx - R); x < ptx + R; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = y * W + x; if (!world.explored[i] || world.grid[i]) continue;
    mmc.fillStyle = 'rgba(120,150,210,0.32)'; mmc.fillRect((x - ptx + R) * cell, (y - ptz + R) * cell, cell + 0.5, cell + 0.5);
  }
  for (const e of G.enemies) { const ex = e.x / TILE - ptx + R, ez = e.z / TILE - ptz + R; if (ex < 0 || ez < 0 || ex > R * 2 || ez > R * 2) continue; if (!world.explored[worldToTile(e.z) * W + worldToTile(e.x)]) continue; mmc.fillStyle = e.def.boss ? '#ff4f9a' : '#ff4a5a'; mmc.fillRect(ex * cell - (e.def.boss ? 3 : 1.5), ez * cell - (e.def.boss ? 3 : 1.5), e.def.boss ? 6 : 3, e.def.boss ? 6 : 3); }
  if (G.portalOpen) {
    let px = world.portal.x / TILE - ptx + R, pz = world.portal.z / TILE - ptz + R;
    const inside = px > 1 && pz > 1 && px < R * 2 - 1 && pz < R * 2 - 1;
    px = clamp(px, 1.5, R * 2 - 1.5); pz = clamp(pz, 1.5, R * 2 - 1.5);
    mmc.fillStyle = '#7dfcff'; mmc.beginPath(); mmc.arc(px * cell, pz * cell, inside ? 4 : 3, 0, 7); mmc.fill();
  }
  mmc.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--hero') || '#fff';
  mmc.beginPath(); mmc.arc(R * cell, R * cell, 3.5, 0, 7); mmc.fill();
}
let toastT = null;
function toast(html) { const t = $('#toast'); t.innerHTML = html; t.classList.remove('on'); void t.offsetWidth; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); }
let bannerT = null;
function showBanner(a, b) { const el = $('#banner'); el.innerHTML = `<h3>${a}</h3><p>${b}</p>`; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('on'), 2600); }

/* ---------- level-up draft ---------- */
function openLevelUp() {
  G.mode = 'levelup'; AUDIO.sfx.level();
  const p = G.p; const pool = UPGRADES.filter(u => (p.picks[u.id] || 0) < u.max);
  const pick = []; while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  $('#lvlNum').textContent = p.level;
  const box = $('#cards'); box.innerHTML = '';
  pick.forEach((u, i) => {
    const b = document.createElement('button'); b.className = 'card'; b.id = 'up-' + u.id;
    const have = p.picks[u.id] || 0;
    b.innerHTML = `<kbd>${i + 1}</kbd><h4>${u.name}</h4><p>${u.desc}</p><span class="pips">${'◆'.repeat(have)}${'◇'.repeat(u.max - have)}</span>`;
    b.onclick = () => chooseUpgrade(u);
    box.appendChild(b);
  });
  G.levelChoices = pick;
  show('#hud', '#levelup');
}
function chooseUpgrade(u) {
  const p = G.p; u.apply(p); p.picks[u.id] = (p.picks[u.id] || 0) + 1; AUDIO.sfx.pickup();
  G.pendingLevels--; G.levelChoices = null;
  if (G.pendingLevels > 0) openLevelUp(); else { G.mode = 'play'; show('#hud'); }
}

/* ---------- run flow ---------- */
function startRun() {
  AUDIO.init(); AUDIO.sfx.ui();
  const h = HERO_BY_ID[selected]; G.hero = h;
  if (G.p) { scene.remove(G.p.sprite); scene.remove(G.p.light); scene.remove(G.p.shadow); }
  G.p = createPlayer(h); G.kills = 0; G.score = 0; G.dmgDealt = 0; G.runTime = 0; G.pendingLevels = 0;
  setupHudForHero(h);
  startFloor(1); G.mode = 'play'; show('#hud');
  fade();
}
function nextFloor() {
  if (G.mode !== 'play') return;
  if (G.floor >= FLOORS) { endRun(true); return; }
  G.mode = 'transition'; AUDIO.sfx.portal(); fade();
  setTimeout(() => { startFloor(G.floor + 1); G.p.hp = Math.min(G.p.maxHp, G.p.hp + G.p.maxHp * 0.15); G.mode = 'play'; }, 380);
}
function fade() { const f = $('#fade'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
function playerDie() { G.p.dead = true; G.mode = 'dying'; AUDIO.sfx.boom(); particles.emit(G.p.x, 1, G.p.z, G.p.hero.color, 80, { speed: 9, life: 1 }); G.p.sprite.visible = false; setTimeout(() => endRun(false), 1300); }
function endRun(won) {
  G.mode = 'results'; AUDIO.stopMusic();
  const h = G.hero; const m = Math.floor(G.runTime / 60), s = Math.floor(G.runTime % 60);
  let best = 0; try { best = +localStorage.getItem('ad_best_' + h.id) || 0; if (G.score > best) localStorage.setItem('ad_best_' + h.id, Math.round(G.score)); } catch (e) { }
  $('#results').style.setProperty('--hc', h.css);
  $('#resTitle').textContent = won ? 'Stack cleared' : 'Context lost';
  $('#resSub').textContent = won ? `${h.name} reached the bottom of all ${FLOORS} floors.` : `${h.name} fell on floor ${G.floor}.`;
  $('#resArt').src = artURL(h.id, won ? 'special' : 'idle');
  $('#resStats').innerHTML = [['Floor', `${G.floor}/${FLOORS}`], ['Kills', G.kills], ['Damage', Math.round(G.dmgDealt).toLocaleString()], ['Level', G.p.level], ['Time', `${m}:${String(s).padStart(2, '0')}`], ['Score', Math.round(G.score).toLocaleString() + (G.score > best ? ' · best' : '')]].map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
  show('#results');
}
function pause(on) {
  if (G.mode === 'play' && on) { G.mode = 'paused'; show('#hud', '#pause'); }
  else if (G.mode === 'paused' && !on) { G.mode = 'play'; show('#hud'); }
}
function quitToMenu() { clearEntities(); if (G.p) { scene.remove(G.p.sprite); scene.remove(G.p.light); scene.remove(G.p.shadow); G.p = null; } AUDIO.stopMusic(); G.mode = 'select'; show('#select'); renderDetail(); }

/* ---------- input ---------- */
const keymap = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
window.addEventListener('keydown', e => {
  if (keymap[e.code]) { input[keymap[e.code]] = 1; if (G.mode === 'play') e.preventDefault(); }
  if (e.code === 'Space') { input.dash = true; e.preventDefault(); }
  if (e.code === 'KeyE' || e.code === 'ShiftLeft' || e.code === 'KeyQ') input.special = true;
  if (e.code === 'KeyF' && G.mode === 'play') { input.autoFire = !input.autoFire; toast(`<b>Auto-fire ${input.autoFire ? 'on' : 'off'}</b><span>Press F to toggle</span>`); }
  if (e.code === 'Escape' || e.code === 'KeyP') pause(G.mode === 'play');
  if (G.mode === 'levelup' && G.levelChoices && /Digit[123]/.test(e.code)) { const u = G.levelChoices[+e.code.slice(5) - 1]; if (u) chooseUpgrade(u); }
  if (G.mode === 'select' && e.code === 'Enter') startRun();
  if (G.mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) goSelect();
  if (G.mode === 'select' && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) { const i = HEROES.findIndex(h => h.id === selected); selected = HEROES[(i + (e.code === 'ArrowRight' ? 1 : HEROES.length - 1)) % HEROES.length].id; renderDetail(); }
});
window.addEventListener('keyup', e => { if (keymap[e.code]) input[keymap[e.code]] = 0; });
canvas.addEventListener('mousemove', e => { input.mouseX = e.clientX / innerWidth * 2 - 1; input.mouseY = -(e.clientY / innerHeight) * 2 + 1; input.mouseIn = true; });
canvas.addEventListener('mousedown', e => { if (e.button === 0) input.fire = true; if (e.button === 2) input.special = true; });
window.addEventListener('mouseup', e => { if (e.button === 0) input.fire = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('blur', () => { input.fire = false; input.up = input.down = input.left = input.right = 0; pause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });

/* twin-stick touch */
function stick(el, onMove, onEnd) {
  const knob = el.querySelector('.knob'); let id = null, cx = 0, cy = 0; const R = 52;
  el.addEventListener('pointerdown', e => { id = e.pointerId; el.setPointerCapture(id); const r = el.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(e); e.preventDefault(); });
  const move = e => { if (e.pointerId !== id) return; let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy); if (l > R) { dx = dx / l * R; dy = dy / l * R; } knob.style.transform = `translate(${dx}px,${dy}px)`; onMove(dx / R, dy / R); };
  el.addEventListener('pointermove', move);
  const end = e => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; onEnd(); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
stick($('#stickL'), (x, y) => { input.stickMove = [x, y]; }, () => { input.stickMove = [0, 0]; });
stick($('#stickR'), (x, y) => { input.stickAim = [x, y]; input.stickAimOn = true; }, () => { input.stickAim = [0, 0]; input.stickAimOn = false; });
$('#tSpecial').addEventListener('pointerdown', e => { input.special = true; e.preventDefault(); });
$('#tDash').addEventListener('pointerdown', e => { input.dash = true; e.preventDefault(); });
$('#tPause').addEventListener('click', () => pause(true));

/* buttons */
function goSelect() { AUDIO.init(); AUDIO.sfx.ui(); G.mode = 'select'; show('#select'); renderDetail(); document.getElementById('hero-' + selected)?.scrollIntoView({ block: 'nearest' }); }
$('#btnPlay').onclick = goSelect;
$('#btnStart').onclick = startRun;
$('#btnBack').onclick = () => { G.mode = 'title'; show('#title'); };
$('#btnResume').onclick = () => pause(false);
$('#btnQuit').onclick = quitToMenu;
$('#btnAgain').onclick = startRun;
$('#btnRoster').onclick = quitToMenu;
const muteBtns = document.querySelectorAll('.mute');
function syncMute() { muteBtns.forEach(b => { b.textContent = AUDIO.muted ? 'Sound off' : 'Sound on'; b.setAttribute('aria-pressed', AUDIO.muted ? 'true' : 'false'); }); }
muteBtns.forEach(b => b.onclick = () => { AUDIO.init(); AUDIO.toggleMute(); syncMute(); });
syncMute();

/* ---------- title backdrop: slowly orbit a generated floor ---------- */
let titleAngle = 0;
function titleCamera(dt) {
  titleAngle += dt * 0.06; const [cx, cz] = roomCenter(world.rooms[Math.min(2, world.rooms.length - 1)]);
  camera.position.set(cx + Math.cos(titleAngle) * 18, 15, cz + Math.sin(titleAngle) * 18); camera.lookAt(cx, 0, cz);
}

/* ---------- main loop ---------- */
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  G.time += dt;
  if (G.mode === 'play' || G.mode === 'dying' || G.mode === 'transition') {
    let gdt = dt;
    if (G.hitstop > 0) { G.hitstop -= dt; gdt = dt * 0.15; }
    if (G.mode === 'play') {
      G.runTime += gdt;
      updatePlayer(gdt); updateFlow(); updateEnemies(gdt); updateSpecialAreas(gdt);
      if (!G.portalOpen && G.enemies.length === 0 && G.totalOnFloor > 0) openPortal();
      if (G.pendingLevels > 0 && G.mode === 'play') openLevelUp();
    }
    updatePlayerProj(gdt); updateEnemyBullets(G.mode === 'play' ? gdt : 0); updateSummons(gdt); updateFxAll(gdt); updateLines(gdt); updatePickups(gdt);
    particles.update(gdt); updateWorld(gdt, G.p.x, G.p.z, G.time); updateCamera(dt); updateFloatText(dt); updateHud(dt);
  } else if (G.mode === 'levelup' || G.mode === 'paused') {
    updateCamera(0); updateFloatText(0);
  } else if (world.rooms.length) {
    titleCamera(dt); const [cx, cz] = roomCenter(world.rooms[0]); updateWorld(dt, camera.position.x, camera.position.z, G.time); particles.update(dt);
    if (rand() < 0.3) particles.emit(cx + rr(-12, 12), 0.2, cz + rr(-12, 12), 0x5fd8ff, 1, { speed: 0.4, life: 2.5, size: 0.25, grav: -0.6, lift: 0.4 });
  }
  composer.render();
}

/* ---------- boot ---------- */
async function boot() {
  show('#loading'); resize();
  buildProceduralTextures(); buildMaterials(); initEnemyGeo(); initHud();
  try {
    await loadAtlases(f => { $('#loadFill').style.transform = `scaleX(${f})`; });
  } catch (err) { $('#loadMsg').textContent = err.message + '. Reload the page to try again.'; return; }
  buildWorld(2, false, 0x3fa9ff);
  buildRoster();
  // title art: a lineup of the roster
  $('#lineup').innerHTML = ['cursor', 'claude', 'grok', 'devin', 'gemini', 'openclaw', 'kimi'].map((id, i) => `<img src="${artURL(id, 'idle')}" alt="" style="--i:${i}">`).join('');
  G.mode = 'title'; show('#title');
  requestAnimationFrame(frame);
}
boot();
// debug / QA hooks
window.__AD = { G, input, startRun, HEROES, world, get selected() { return selected; }, set selected(v) { selected = v; }, useSpecial: () => G.p && useSpecial(G.p), killAll: () => G.enemies.slice().forEach(e => { if (!e.def.boss) killEnemy(e); }), next: () => nextFloor(), damageBoss: f => G.boss && damageEnemy(G.boss, G.boss.maxHp * f, false) };
