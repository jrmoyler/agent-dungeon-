/* ------------------------------------------------------------------
   UI: title, roster select with live animated previews, HUD, ability
   bar, minimap, level-up draft, pause, results, input (keyboard /
   mouse / touch twin-sticks + skill cluster), main loop, PWA, boot
------------------------------------------------------------------- */
const $ = s => document.querySelector(s);
const screens = ['#title', '#select', '#hud', '#levelup', '#pause', '#results', '#loading'];
function show(...ids) { for (const s of screens) $(s).hidden = !ids.includes(s); $('#touch').hidden = !(IS_TOUCH && ids.includes('#hud') && !ids.includes('#pause') && !ids.includes('#levelup')); }
function statBar(v, max = 7, cls = '') { let s = '<span class="bar ' + cls + '">'; for (let i = 0; i < max; i++) s += `<i class="${i < v ? 'on' : ''}"></i>`; return s + '</span>'; }
const KEY_LABEL = { primary_shot: 'LMB', rapid_fire: 'RMB', sweeping_arc: 'Q', piercing_beam: 'E', area_pulse: 'C', summon: 'F', ultimate: 'R' };

/* ---------- roster ---------- */
let selected = 'claude', cohort = 'all';
try { selected = localStorage.getItem('ad_hero') || selected; if (!HERO_BY_ID[selected]) selected = 'claude'; cohort = localStorage.getItem('ad_cohort') || 'all'; } catch (e) { }
function buildRoster() {
  const grid = $('#roster'); grid.innerHTML = '';
  document.querySelectorAll('.coh').forEach(b => { b.classList.toggle('on', b.dataset.c === cohort); b.setAttribute('aria-selected', b.dataset.c === cohort); b.onclick = () => { cohort = b.dataset.c; try { localStorage.setItem('ad_cohort', cohort); } catch (e) { } AUDIO.sfx.ui(); buildRoster(); }; });
  for (const h of HEROES) {
    if (cohort !== 'all' && h.cohort !== cohort) continue;
    const b = document.createElement('button'); b.className = 'tile'; b.id = 'hero-' + h.id; b.style.setProperty('--hc', h.css); b.setAttribute('role', 'option');
    b.innerHTML = `<img src="${agentThumbURL(h.id)}" alt=""><span>${h.name}</span><em class="ch">${h.cohort}</em>`;
    b.onclick = () => { selected = h.id; AUDIO.init(); AUDIO.sfx.ui(); renderDetail(); };
    b.ondblclick = () => startRun();
    grid.appendChild(b);
  }
  renderDetail();
}
const preview = { id: null, t: 0, canvas: null, ctx: null, seq: 0 };
const PREVIEW_SEQ = [['loco', 2, 'Walk'], ['shot', 1, 'Primary'], ['loco', 0, 'Walk'], ['arc', 3, 'Arc'], ['loco', 4, 'Walk'], ['cast', 2, 'Pulse'], ['loco', 6, 'Walk'], ['react', 'dash', 'Dash'], ['shot', 7, 'Beam'], ['react', 'hurt', 'Hurt'], ['react', 'jump', 'Jump'], ['loco', 5, 'Walk']];
function renderDetail() {
  const h = HERO_BY_ID[selected]; const d = derive(h);
  document.querySelectorAll('.tile').forEach(t => { t.classList.toggle('sel', t.id === 'hero-' + h.id); t.setAttribute('aria-selected', t.id === 'hero-' + h.id); });
  try { localStorage.setItem('ad_hero', h.id); } catch (e) { }
  $('#detail').style.setProperty('--hc', h.css); document.documentElement.style.setProperty('--hero', h.css);
  const best = (() => { try { return +localStorage.getItem('ad_best_' + h.id) || 0; } catch (e) { return 0; } })();
  const kitHtml = AGENT_TEX[h.id] ? kitList(h) : '<p class="role" style="opacity:.6">Loading kit…</p>';
  $('#detail').innerHTML = `
    <div class="d-prev"><canvas id="prevCanvas" width="336" height="336"></canvas>${h.cohort === 'origin' ? `<img class="card-art" src="${artURL(h.id, 'portrait_bg')}" alt="${h.name} card art">` : ''}<span class="anim-lbl" id="prevLbl"></span></div>
    <div class="d-body">
      <div class="d-head"><h2>${h.name}</h2><span class="maker">${h.cohort === 'echo' ? 'Echo · ' : 'Origin · '}${h.maker}</span></div>
      <p class="role">${h.role}</p>
      <div class="stats">
        <div><b>HP</b>${statBar(h.stats.hp, 7, 'hp')}<em>${d.maxHp}</em></div>
        <div><b>ATK</b>${statBar(h.stats.atk, 7, 'atk')}<em>${d.dmg.toFixed(1)}</em></div>
        <div><b>SPD</b>${statBar(h.stats.spd, 7, 'spd')}<em>${d.spd.toFixed(1)}</em></div>
        <div><b>DEF</b>${statBar(h.stats.def, 7, 'def')}<em>${Math.round(d.def * 100)}%</em></div>
        <div><b>${h.x.label}</b>${statBar(h.x.v, 7, 'x')}<em>×${d.pow.toFixed(2)}</em></div>
      </div>
      <div class="kit" id="kitList">${kitHtml}</div>
      <div class="pc">
        <div class="pro"><h4>${h.cohort === 'echo' ? 'Strengths' : 'In the real world'}</h4><ul>${h.pros.map(x => `<li>${x}</li>`).join('')}</ul></div>
        <div class="con"><h4>Limits</h4><ul>${h.cons.map(x => `<li>${x}</li>`).join('')}</ul></div>
      </div>
      <div class="pf"><p><span class="tag up">Perk</span>${h.perk}</p><p><span class="tag down">Flaw</span>${h.flaw}</p><p><span class="tag up" style="filter:hue-rotate(160deg)">Status</span>Hits apply <b>${STATUS[h.hitStatus].label}</b> — ${STATUS[h.hitStatus].desc}.${best ? ` <span style="color:var(--gold)">Best ${best.toLocaleString()}</span>` : ''}</p></div>
    </div>`;
  preview.canvas = $('#prevCanvas'); preview.ctx = preview.canvas.getContext('2d'); preview.id = h.id; preview.t = 0; preview.seq = 0;
  loadAgent(h.id).then(() => { if (preview.id === h.id && $('#kitList')) $('#kitList').innerHTML = kitList(h); }).catch(() => { });
}
function kitList(h) {
  const kit = heroKit(h);
  return MOVE_KEYS.map(k => `<div><img src="${moveIconURL(h.id, k)}" alt=""><span><b><kbd>${KEY_LABEL[k]}</kbd>${kit[k].name}</b><span>${k === 'primary_shot' ? kit[k].desc : k === 'ultimate' ? `Ultimate · ${(kit[k].cd * (h.cdMul || 1)).toFixed(0)}s` : `${({ rapid_fire: 'Burst', sweeping_arc: 'Arc', piercing_beam: 'Beam', area_pulse: 'Pulse', summon: 'Summon' })[k]} · ${(MOVE_BASE[k].cd * (h.cdMul || 1)).toFixed(1)}s`}</span></span></div>`).join('');
}
function drawPreview(dt) {
  if (!preview.ctx || G.mode !== 'select') return;
  const T = AGENT_TEX[preview.id]; const ctx = preview.ctx, W = preview.canvas.width;
  ctx.clearRect(0, 0, W, W); if (!T) return;
  preview.t += dt; if (preview.t > 1.15) { preview.t = 0; preview.seq = (preview.seq + 1) % PREVIEW_SEQ.length; }
  const [set, d, lbl] = PREVIEW_SEQ[preview.seq], L = BATCH.layout, C = L.cell;
  const f = Math.floor(preview.t * (set === 'loco' ? 8 : 5)) % 4;
  const idx = set === 'react' ? L.react[d] + Math.min(3, Math.floor(preview.t / 1.0 * 4)) : L.sets[set] + d * 4 + (set === 'loco' ? f : Math.min(3, Math.floor(preview.t / 0.5 * 4) % 4));
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(W / 2, W * 0.84, W * 0.2, W * 0.05, 0, 0, 7); ctx.fill();
  const dy = set === 'react' && d === 'jump' ? -L.jumpDrop * 2 : 0;
  ctx.drawImage(T.bodyImg, (idx % L.cols) * C, Math.floor(idx / L.cols) * C, C, C, W / 2 - L.anchor[0] * 2, W * 0.84 - L.anchor[1] * 2 + dy, C * 2, C * 2);
  const lb = $('#prevLbl'); if (lb) lb.textContent = lbl + (set === 'loco' || set === 'shot' || set === 'arc' || set === 'cast' ? ' · ' + BATCH.layout.dirs[d] : '');
}

/* ---------- HUD ---------- */
const T_DASH = document.getElementById('tDash');
const hud = {};
function initHud() { ['hpFill', 'hpText', 'xpFill', 'lvl', 'floorTxt', 'killTxt', 'scoreTxt', 'buffs', 'portrait', 'heroName', 'objective', 'quota', 'modeTag', 'chips', 'bossbars', 'sectorName', 'sectorLock', 'prompt', 'abil', 'combo'].forEach(k => hud[k] = document.getElementById(k)); }
function setupHudForHero(h) {
  hud.portrait.src = agentThumbURL(h.id); hud.heroName.textContent = h.name;
  document.documentElement.style.setProperty('--hero', h.css);
  hud.quota.hidden = !h.quota; hud.modeTag.hidden = h.id !== 'glm';
  const kit = G.p.kit;
  hud.abil.innerHTML = `<div class="slot dash" id="slot-dash"><div class="cd"></div>DASH<label>SPC</label></div>` + MOVE_KEYS.map(k => `<div class="slot${k === 'ultimate' ? ' ult' : ''}" id="slot-${k}" title="${kit[k].name}"><img src="${moveIconURL(h.id, k)}" alt="${kit[k].name}"><div class="cd"></div><label>${KEY_LABEL[k]}</label><span class="nm2">${kit[k].name}</span></div>`).join('');
  hud.slots = Object.fromEntries([...MOVE_KEYS, 'dash'].map(k => [k, document.getElementById('slot-' + k)]));
  // touch skill cluster arranged in an arc around the aim stick
  const tm = $('#tMoves'); tm.innerHTML = '';
  const order = ['rapid_fire', 'sweeping_arc', 'piercing_beam', 'area_pulse', 'summon', 'ultimate'];
  // arc around the aim stick: ultimate on top, skills sweeping left and down
  const ANG = { ultimate: [86, 100], rapid_fire: [150, 100], sweeping_arc: [118, 100], piercing_beam: [160, 166], area_pulse: [130, 166], summon: [104, 166] };
  order.forEach(k => {
    const a = ANG[k][0] * Math.PI / 180, R = ANG[k][1];
    const b = document.createElement('button'); b.className = 'tbtn' + (k === 'ultimate' ? ' ult' : ''); b.setAttribute('aria-label', kit[k].name);
    b.style.backgroundImage = `url(${moveIconURL(h.id, k)})`;
    b.style.transform = `translate(calc(${(Math.cos(a) * R).toFixed(1)}px - 50%), calc(${(-Math.sin(a) * R).toFixed(1)}px - 50%))`;
    b.addEventListener('pointerdown', e => { input.moves[k] = true; e.preventDefault(); }); b.dataset.k = k; tm.appendChild(b);
  });
  const dash = T_DASH, da = 186 * Math.PI / 180; tm.appendChild(dash); dash.style.transform = `translate(calc(${(Math.cos(da) * 100).toFixed(1)}px - 50%), calc(${(-Math.sin(da) * 100).toFixed(1)}px - 50%))`;
}
function setSectorHud() {
  const sec = G.sector, B = BIOMES[sec.id];
  document.documentElement.style.setProperty('--biome', B.flame[1]); // UI takes the sector's firelight colour
  hud.sectorName.textContent = `${String(G.floor).padStart(2, '0')} · ${sec.name}`; hud.sectorLock.textContent = `Lock ${sec.lock}`;
}
function showSectorCard(n) {
  const sec = SECTORS[n - 1], el = $('#sectorCard');
  el.style.setProperty('--biome', BIOMES[sec.id].flame[1]);
  el.innerHTML = `<div class="k">Sector ${String(n).padStart(2, '0')} / ${FLOORS} · Lock ${sec.lock}</div><h3>${sec.name}</h3><p>${sec.sub}</p><div class="bar2"></div>`;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  if (G.p) setSectorHud();
}
let hudT = 0, bossKey = '';
function updateHud(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.05;
  const p = G.p;
  const hf = clamp(p.hp / p.maxHp, 0, 1);
  hud.hpFill.style.clipPath = `inset(0 ${(100 - (2.1 + hf * 95.8)).toFixed(1)}% 0 0)`; hud.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  hud.hpFill.parentElement.classList.toggle('low', hf < 0.3);
  if (G.combo >= 3) { const t = '×' + G.combo; if (hud.combo.firstChild.textContent !== t) { hud.combo.firstChild.textContent = t; hud.combo.classList.remove('pop'); void hud.combo.offsetWidth; hud.combo.classList.add('pop'); } }
  hud.combo.classList.toggle('on', G.combo >= 3);
  hud.xpFill.style.transform = `scaleX(${p.xp / p.xpNext})`; hud.lvl.textContent = p.level;
  hud.floorTxt.textContent = `${G.floor}/${FLOORS}`; hud.killTxt.textContent = G.kills; hud.scoreTxt.textContent = Math.round(G.score).toLocaleString();
  for (const k of MOVE_KEYS) {
    const el = hud.slots[k]; if (!el) continue;
    if (k === 'primary_shot') { el.classList.toggle('ready', p.fireT <= 0); continue; }
    const f = p.cds[k] > 0 ? p.cds[k] / p.cdMax[k] : 0, cd = el.querySelector('.cd');
    cd.style.setProperty('--p', f); cd.dataset.t = p.cds[k] > 0 ? (p.cds[k] >= 10 ? p.cds[k].toFixed(0) : p.cds[k].toFixed(1)) : '';
    el.classList.toggle('ready', p.cds[k] <= 0);
  }
  hud.slots.dash.querySelector('.cd').style.setProperty('--p', clamp(p.dashCd / (p.dashMax || 1), 0, 1));
  document.querySelectorAll('#tMoves .tbtn').forEach(b => { const k = b.dataset.k, f = p.cds[k] > 0 ? p.cds[k] / p.cdMax[k] : 0; b.style.setProperty('--p', f); b.classList.toggle('ready', f === 0); });
  T_DASH.style.setProperty('--p', clamp(p.dashCd / (p.dashMax || 1), 0, 1));
  const b = []; if (p.buffs.power > 0) b.push(['Overclock', p.buffs.power, 0, 'ic_flame']); if (p.buffs.haste > 0) b.push(['Burst', p.buffs.haste, 0, 'ic_round']); if (p.buffs.citation > 0) b.push(['Cited', p.buffs.citation, 0, 'ic_lock']); if (p.buffs.homing > 0) b.push(['Lock-on', p.buffs.homing, 0, 'ic_ember']); if (G.shield) b.push(['Dome', G.shield.t, 0, 'ic_guard']); if (p.slowT > 0) b.push(['Slow pool', p.slowT, 1, 'ic_void']);
  const ST_ICON = { burn: 'ic_flame', poison: 'ic_toxin' };
  for (const k of ['slow', 'burn', 'poison', 'confuse', 'stun', 'timeslow', 'mark', 'fracture']) if (p.st8[k] > 0) b.push([STATUS[k].label, p.st8[k], 1, ST_ICON[k] || 'ic_void']);
  hud.buffs.innerHTML = b.map(([n, t, bad, ic]) => `<span class="${bad ? 'bad' : ''}" title="${n}"><img src="${iconURL(ic)}" alt="">${t.toFixed(1)}s</span>`).join('');
  if (p.hero.quota) hud.quota.innerHTML = `<b>Requests</b><span style="--q:${1 - p.shots / p.hero.quota}"></span>`;
  if (p.hero.id === 'glm') hud.modeTag.textContent = p.glm === 'zh' ? '中 · spread' : 'EN · pierce';
  // objective + chips
  const left = G.enemies.filter(e => e.alive && !e.boss).length, P = world.puzzle;
  hud.objective.textContent = G.stage === 'wings' ? (G.rival && G.rival.alive ? `Defeat ${G.rival.name} and clear both passages · ${left} hostiles` : `Clear both passages · ${left} hostiles left`)
    : G.stage === 'gate' ? 'Vault unsealed — enter the boss vault' : G.stage === 'boss' ? `Defeat ${G.bosses.filter(b => b.alive).map(b => b.name).join(' + ')}` : G.floor >= FLOORS ? 'The Override is broken — enter the portal' : 'Portal open — descend';
  const chips = [];
  chips.push(`<span class="${P.solved ? 'ok' : P.idx ? 'hot' : ''}">Circuit ${P.idx}/${P.steps.length} · ${P.steps.map((s, i) => `<b style="color:${i < P.idx ? 'var(--good)' : 'inherit'}">${s === 'north' ? 'N' : 'S'}</b>`).join('→')}</span>`);
  chips.push(`<span class="${world.trapsOff ? 'ok' : 'hot'}">${world.trapsOff ? 'Traps offline' : G.sector.trap[0].toUpperCase() + G.sector.trap.slice(1) + ' traps live'}</span>`);
  if (world.secret) chips.push(`<span class="${G.cache && G.cache.claimed ? 'ok' : world.sealOpen ? 'hot' : ''}">${G.cache && G.cache.claimed ? 'Cache claimed' : world.sealOpen ? 'Secret open' : 'Sealed annex'}</span>`);
  chips.push(`<span class="${world.gateOpen ? 'ok' : ''}">Vault ${world.gateOpen ? 'open' : 'sealed'}</span>`);
  hud.chips.innerHTML = chips.join('');
  // boss bars (bosses + rival)
  const bars = [...G.bosses.filter(e => e.alive), ...(G.rival && G.rival.alive && G.rival.aggro ? [G.rival] : [])];
  const key = bars.map(e => e.uid).join(',');
  if (key !== bossKey) { bossKey = key; hud.bossbars.innerHTML = bars.map(e => `<div class="bb" style="--bc:#${e.color.toString(16).padStart(6, '0')}"><b>${e.name}</b><small>${e.sub || ''}</small><div class="track"><i id="bf${e.uid}"></i>${e.boss ? '<em style="left:66%"></em><em style="left:33%"></em>' : ''}</div></div>`).join(''); }
  for (const e of bars) { const el = document.getElementById('bf' + e.uid); if (el) el.style.transform = `scaleX(${Math.max(0, e.hp / e.maxHp)})`; }
  // interaction prompt
  const sw = G.nearSwitch;
  hud.prompt.hidden = !sw; $('#tUse').hidden = !(sw && IS_TOUCH);
  if (sw) hud.prompt.querySelector('span').textContent = P.solved ? 'Circuit solved' : `Use ${sw.id === 'north' ? 'upper' : 'lower'} relay`;
  drawMinimap();
}
const mm = document.getElementById('minimap'), mmc = mm.getContext('2d');
function drawMinimap() {
  const W = world.W, H = world.H, S = mm.width, p = G.p, R = 26, cell = S / (R * 2), ptx = p.x / TILE, ptz = p.z / TILE;
  const B = BIOMES[world.biome];
  mmc.clearRect(0, 0, S, S); mmc.fillStyle = 'rgba(23,18,15,0.9)'; mmc.fillRect(0, 0, S, S);
  for (let y = Math.floor(ptz - R); y < ptz + R; y++) for (let x = Math.floor(ptx - R); x < ptx + R; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = y * W + x; if (!world.explored[i]) continue;
    const g = world.grid[i];
    if (g === T_FLOOR) mmc.fillStyle = 'rgba(214,190,150,0.42)'; else if (g === T_GATE) mmc.fillStyle = B.accent; else if (g === T_SEAL) mmc.fillStyle = 'rgba(255,209,102,.5)'; else continue;
    mmc.fillRect((x - ptx + R) * cell, (y - ptz + R) * cell, cell + 0.5, cell + 0.5);
  }
  const dot = (wx, wz, c, r, always) => { let x = wx / TILE - ptx + R, z = wz / TILE - ptz + R; if (!always && (x < 0 || z < 0 || x > R * 2 || z > R * 2)) return; x = clamp(x, 1.5, R * 2 - 1.5); z = clamp(z, 1.5, R * 2 - 1.5); mmc.fillStyle = c; mmc.beginPath(); mmc.arc(x * cell, z * cell, r, 0, 7); mmc.fill(); };
  for (const tr of world.traps) if (world.explored[tr.ty * W + tr.tx]) { mmc.strokeStyle = world.trapsOff ? 'rgba(120,120,120,.5)' : '#ff8a5a'; mmc.beginPath(); mmc.arc((tr.x / TILE - ptx + R) * cell, (tr.z / TILE - ptz + R) * cell, 2.5, 0, 7); mmc.stroke(); }
  for (const sw of world.switches) dot(sw.x, sw.z, sw.on ? '#3ff0a8' : B.accent, 3, true);
  for (const e of G.enemies) { if (!e.alive) continue; const ex = worldToTile(e.x), ez = worldToTile(e.z); if (!e.boss && !world.explored[ez * W + ex]) continue; dot(e.x, e.z, e.boss ? '#ff4f9a' : e.rival ? '#ffd166' : '#ff4a5a', e.boss ? 3.5 : e.rival ? 3 : 1.6, e.boss); }
  if (G.cache && world.sealOpen && !G.cache.claimed) dot(G.cache.x, G.cache.z, '#ffd166', 3, true);
  if (G.portalOpen) dot(world.portal.x, world.portal.z, '#f2cf6a', 4, true);
  else if (world.gateOpen && G.stage === 'gate') { const [vx, vz] = roomCenter(world.vault); dot(vx, vz, B.glow, 3.5, true); }
  mmc.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--hero') || '#fff';
  mmc.beginPath(); mmc.arc(R * cell, R * cell, 3.5, 0, 7); mmc.fill();
  const a = Math.atan2(p.aimZ, p.aimX); mmc.strokeStyle = mmc.fillStyle; mmc.beginPath(); mmc.moveTo(R * cell, R * cell); mmc.lineTo(R * cell + Math.cos(a) * 9, R * cell + Math.sin(a) * 9); mmc.stroke();
}
let toastT = null;
function toast(html, icon = 'ic_lock') { const t = $('#toast'); t.innerHTML = `<img class="ti" src="${iconURL(icon)}" alt="">` + html; t.classList.remove('on'); void t.offsetWidth; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); }
let bannerT = null;
function showBanner(a, b) { const el = $('#banner'); el.innerHTML = `<h3>${a}</h3><p>${b}</p>`; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('on'), 2600); }

/* ---------- level-up draft ---------- */
function openLevelUp() {
  G.mode = 'levelup'; AUDIO.sfx.level();
  const p = G.p; const pool = UPGRADES.filter(u => (p.picks[u.id] || 0) < u.max);
  const pick3 = []; while (pick3.length < 3 && pool.length) pick3.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  $('#lvlNum').textContent = p.level;
  const box = $('#cards'); box.innerHTML = '';
  pick3.forEach((u, i) => {
    const b = document.createElement('button'); b.className = 'card'; b.id = 'up-' + u.id;
    const have = p.picks[u.id] || 0;
    b.innerHTML = `<kbd>${i + 1}</kbd><h4>${u.name}</h4><p>${u.desc}</p><span class="pips">${'◆'.repeat(have)}${'◇'.repeat(u.max - have)}</span>`;
    b.onclick = () => chooseUpgrade(u); box.appendChild(b);
  });
  G.levelChoices = pick3; show('#hud', '#levelup');
}
function chooseUpgrade(u) {
  const p = G.p; u.apply(p); p.picks[u.id] = (p.picks[u.id] || 0) + 1; AUDIO.sfx.pickup();
  G.pendingLevels--; G.levelChoices = null;
  if (G.pendingLevels > 0) openLevelUp(); else { G.mode = 'play'; show('#hud'); }
}

/* ---------- run flow ---------- */
async function startRun() {
  AUDIO.init(); AUDIO.sfx.ui();
  const h = HERO_BY_ID[selected]; G.hero = h;
  $('#btnStart').disabled = true; $('#btnStart').textContent = 'Loading…';
  try { await loadAgent(h.id); } catch (e) { $('#btnStart').textContent = 'Retry'; $('#btnStart').disabled = false; return; }
  $('#btnStart').disabled = false; $('#btnStart').textContent = 'Enter the dungeon';
  if (G.p) disposePlayer();
  G.p = createPlayer(h); G.combo = G.comboT = G.bestCombo = 0; G.kills = 0; G.score = 0; G.dmgDealt = 0; G.runTime = 0; G.pendingLevels = 0; G.secretsFound = 0; G.runSeed = (Math.random() * 1e6) | 0;
  input.autoFire = G.settings.autofire;
  setupHudForHero(h);
  startSector(1); G.mode = 'play'; show('#hud'); setSectorHud();
  fade();
}
function disposePlayer() {
  const p = G.p; p.sprite.dispose(); scene.remove(p.light, p.shadow, p.sil, p.aim.ret, p.aim.chev); p.silMat.dispose();
  for (const g of p.ghosts) { scene.remove(g.spr); g.mat.dispose(); g.tex.dispose(); }
  G.p = null;
}
function nextFloor() {
  if (G.mode !== 'play') return;
  if (G.floor >= FLOORS) { endRun(true); return; }
  G.mode = 'transition'; AUDIO.sfx.portal(); fade(); setReact(G.p, 'jump', 0.5);
  setTimeout(() => { startSector(G.floor + 1); G.p.hp = Math.min(G.p.maxHp, G.p.hp + G.p.maxHp * 0.2); G.mode = 'play'; }, 420);
}
function fade() { const f = $('#fade'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
function playerDie() {
  const p = G.p; p.dead = true; G.mode = 'dying'; AUDIO.sfx.boom(); AUDIO.stopMusic();
  setReact(p, 'death', 1.1, { hold: true }); particles.emit(p.x, 1, p.z, p.hero.color, 80, { speed: 9, life: 1 });
  setTimeout(() => endRun(false), 1600);
}
function endRun(won) {
  G.mode = 'results'; AUDIO.stopMusic();
  const h = G.hero; const m = Math.floor(G.runTime / 60), s = Math.floor(G.runTime % 60);
  let best = 0; try { best = +localStorage.getItem('ad_best_' + h.id) || 0; if (G.score > best) localStorage.setItem('ad_best_' + h.id, Math.round(G.score)); } catch (e) { }
  $('#results').style.setProperty('--hc', h.css);
  $('#resTitle').textContent = won ? 'Override broken' : 'Context lost';
  $('#resSub').textContent = won ? `${h.name} cleared all ${FLOORS} sectors and every guardian.` : `${h.name} fell in ${G.sector.name} (sector ${G.floor}).`;
  const c = $('#resArt'), g = c.getContext('2d'), L = BATCH.layout, T = AGENT_TEX[h.id]; g.clearRect(0, 0, 168, 168);
  const idx = won ? L.sets.cast + 2 * 4 + 2 : L.react.hurt + 1; g.drawImage(T.bodyImg, (idx % L.cols) * L.cell, Math.floor(idx / L.cols) * L.cell, L.cell, L.cell, 0, 0, 168, 168);
  $('#resStats').innerHTML = [['Sector', `${G.floor}/${FLOORS}`], ['Kills', G.kills], ['Damage', Math.round(G.dmgDealt).toLocaleString()], ['Level', G.p.level], ['Secrets', G.secretsFound], ['Best chain', '×' + G.bestCombo], ['Time', `${m}:${String(s).padStart(2, '0')}`], ['Score', Math.round(G.score).toLocaleString() + (G.score > best ? ' · best' : '')]].map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
  show('#results');
}
function pause(on) {
  if (G.mode === 'play' && on) {
    G.mode = 'paused'; show('#hud', '#pause'); $('#optAuto').checked = input.autoFire; $('#optShake').checked = G.settings.shake;
    $('#pauseSub').textContent = `${G.sector.name} · ${G.sector.lock}`; $('#pauseKit').innerHTML = `<div class="kit" style="--hc:${G.hero.css}">${kitList(G.hero)}</div>`;
  } else if (G.mode === 'paused' && !on) { G.mode = 'play'; show('#hud'); }
}
function quitToMenu() { clearEntities(); if (G.p) disposePlayer(); AUDIO.stopMusic(); G.mode = 'select'; show('#select'); buildWorld(Math.floor(rand() * SECTORS.length)); renderDetail(); }

/* ---------- input ---------- */
const keymap = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
const moveKeys = { KeyQ: 'sweeping_arc', KeyC: 'area_pulse', KeyF: 'summon', KeyR: 'ultimate', KeyX: 'ultimate', Digit2: 'rapid_fire', Digit3: 'sweeping_arc', Digit4: 'piercing_beam', Digit5: 'area_pulse', Digit6: 'summon', Digit7: 'ultimate' };
window.addEventListener('keydown', e => {
  if (keymap[e.code]) { input[keymap[e.code]] = 1; if (G.mode === 'play') e.preventDefault(); }
  if (G.mode === 'play') {
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { input.dash = true; e.preventDefault(); }
    if (moveKeys[e.code]) input.moves[moveKeys[e.code]] = true;
    if (e.code === 'KeyE') { if (G.nearSwitch) input.interact = true; else input.moves.piercing_beam = true; }
    if (e.code === 'KeyT') { input.autoFire = !input.autoFire; G.settings.autofire = input.autoFire; toast(`<b>Auto-fire ${input.autoFire ? 'on' : 'off'}</b><span>Press T to toggle</span>`); }
  }
  if (e.code === 'Escape' || e.code === 'KeyP') pause(G.mode === 'play');
  if (G.mode === 'levelup' && G.levelChoices && /Digit[123]/.test(e.code)) { const u = G.levelChoices[+e.code.slice(5) - 1]; if (u) chooseUpgrade(u); }
  if (G.mode === 'select' && e.code === 'Enter') startRun();
  if (G.mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) goSelect();
  if (G.mode === 'select' && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) { const list = HEROES.filter(h => cohort === 'all' || h.cohort === cohort); const i = list.findIndex(h => h.id === selected); selected = list[(i + (e.code === 'ArrowRight' ? 1 : list.length - 1)) % list.length].id; renderDetail(); document.getElementById('hero-' + selected)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
});
window.addEventListener('keyup', e => { if (keymap[e.code]) input[keymap[e.code]] = 0; });
canvas.addEventListener('mousemove', e => { input.cx = e.clientX; input.cy = e.clientY; input.mouseIn = true; });
canvas.addEventListener('mousedown', e => { if (e.button === 0) input.fire = true; if (e.button === 2) input.moves.rapid_fire = true; if (e.button === 1) { input.moves.ultimate = true; e.preventDefault(); } });
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
T_DASH.addEventListener('pointerdown', e => { input.dash = true; e.preventDefault(); });
$('#tUse').addEventListener('pointerdown', e => { input.interact = true; e.preventDefault(); });
$('#tPause').addEventListener('click', () => pause(true));
document.querySelector('.hud-tl').addEventListener('click', () => { if (IS_TOUCH) pause(true); });

/* buttons */
function goSelect() { AUDIO.init(); AUDIO.sfx.ui(); G.mode = 'select'; show('#select'); buildRoster(); document.getElementById('hero-' + selected)?.scrollIntoView({ block: 'nearest' }); }
$('#btnPlay').onclick = goSelect;
$('#btnStart').onclick = startRun;
$('#btnBack').onclick = () => { G.mode = 'title'; show('#title'); };
$('#btnResume').onclick = () => pause(false);
$('#btnQuit').onclick = quitToMenu;
$('#btnAgain').onclick = startRun;
$('#btnRoster').onclick = quitToMenu;
$('#optAuto').onchange = e => { input.autoFire = G.settings.autofire = e.target.checked; };
$('#optShake').onchange = e => { G.settings.shake = e.target.checked; try { localStorage.setItem('ad_shake', e.target.checked ? '1' : '0'); } catch (er) { } };
try { G.settings.shake = localStorage.getItem('ad_shake') !== '0'; } catch (e) { }
const muteBtns = document.querySelectorAll('.mute:not(#btnInstall)');
function syncMute() { muteBtns.forEach(b => { b.textContent = AUDIO.muted ? 'Sound off' : 'Sound on'; b.setAttribute('aria-pressed', AUDIO.muted ? 'true' : 'false'); }); }
muteBtns.forEach(b => b.onclick = () => { AUDIO.init(); AUDIO.toggleMute(); syncMute(); });
syncMute();

/* ---------- PWA: offline cache + install prompt ---------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#btnInstall').hidden = false; });
$('#btnInstall').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#btnInstall').hidden = true; };
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !navigator.webdriver) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));

/* ---------- title backdrop: drift slowly across a generated sector ---------- */
let titleAngle = 0;
function titleCamera(dt) {
  titleAngle += dt * 0.05; const r = world.rooms.find(r => r.zone === 'vault') || world.rooms[0]; const [cx, cz] = roomCenter(r);
  placeCamera(cx - 14 + Math.sin(titleAngle) * 16, cz + Math.sin(titleAngle * 0.7) * 6);
}

/* ---------- main loop ---------- */
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  G.time += dt;
  if (input.mouseIn) [input.mouseX, input.mouseY] = cssToNdc(input.cx, input.cy);
  if (G.mode === 'play' || G.mode === 'dying' || G.mode === 'transition') {
    let gdt = dt;
    if (G.hitstop > 0) { G.hitstop -= dt; gdt = dt * 0.15; }
    if (G.mode === 'play') {
      G.runTime += gdt;
      updatePlayer(gdt); updateFlow(); updateEnemies(gdt); updateSpecialAreas(gdt); updateTraps(gdt); updateTelegraphs(gdt); updateDelayed(gdt); updateProgress();
      if (G.pendingLevels > 0 && G.mode === 'play') openLevelUp();
    } else if (G.p) { const [idx, flip, lift] = agentFrame(G.p, gdt); G.p.sprite.set(idx, flip); G.p.sprite.spr.position.set(G.p.x, lift, G.p.z); }
    updatePlayerProj(gdt); updateEnemyBullets(G.mode === 'play' ? gdt : 0); updateSummons(gdt); updateFxAll(gdt); updateRings(gdt); updateLines(gdt); updatePickups(gdt); updateCorpses(gdt);
    updateSmears(gdt); updateFlashLights(gdt); updateProps(gdt); updateCombo(dt);
    particles.update(gdt); updateWorld(gdt, G.p.x, G.p.z, G.time); ambient(gdt, G.p.x, G.p.z); updateCamera(dt); updateFloatText(dt); updateHud(dt);
  } else if (G.mode === 'levelup' || G.mode === 'paused') {
    updateCamera(0); updateFloatText(0); SHARED_T.value = G.time;
  } else if (world.rooms.length) {
    titleCamera(dt); updateWorld(dt, camera.position.x, camera.position.z, G.time); particles.update(dt);
    const [cx, cz] = roomCenter(world.rooms.find(r => r.zone === 'vault') || world.rooms[0]); ambient(dt, cx, cz, 1.6);
    drawPreview(dt);
  }
  const pb = pixelBlit.material.uniforms.uHurt;
  pb.value = G.p && (G.mode === 'play' || G.mode === 'dying') ? Math.max((G.hurtT || 0) / 0.22 * 0.35, G.p.hp / G.p.maxHp < 0.3 ? 0.1 + Math.sin(G.time * 5) * 0.06 : 0) : 0;
  tickPix(dt); PIX.weather?.update(dt, G.time);
  renderFrame(dt);
}
/* biome atmosphere: embers, snow, spores, stars... */
function ambient(dt, x, z, k = 1) {
  const B = BIOMES[world.biome]; if (!B) return; const n = dt * 14 * k; // the Pixi weather layer carries the foreground
  for (let i = 0; i < n; i++) {
    const px = x + rr(-16, 16), pz = z + rr(-12, 12);
    switch (B.particle) {
      case 'embers': particles.emit(px, 0.2, pz, rand() < 0.5 ? 0xff7a2a : 0xffc860, 1, { speed: 0.4, life: 2.2, size: 0.18, grav: -0.9, lift: 0.6 }); break;
      case 'snow': particles.emit(px, 6, pz, 0xeaf8ff, 1, { speed: 0.3, life: 3.5, size: 0.16, grav: 1.2, lift: 0, drag: 1 }); break;
      case 'spores': particles.emit(px, 0.6, pz, rand() < 0.6 ? 0x9bea52 : 0xe1e87d, 1, { speed: 0.3, life: 3, size: 0.2, grav: -0.25, lift: 0.3 }); break;
      case 'stars': particles.emit(px, rr(0.5, 4), pz, rand() < 0.5 ? 0xb976ff : 0x68d7fe, 1, { speed: 0.1, life: 2.5, size: 0.14, grav: 0, lift: 0 }); break;
      case 'sparks': if (rand() < 0.4) particles.emit(px, 2, pz, 0xffd060, 1, { speed: 2, life: 0.7, size: 0.12, grav: 8, lift: 1 }); break;
      case 'dust': particles.emit(px, rr(0.3, 3), pz, 0xf0c77e, 1, { speed: 0.2, life: 3, size: 0.13, grav: -0.1, lift: 0.1 }); break;
      case 'wisps': particles.emit(px, 0.4, pz, 0xad6bfa, 1, { speed: 0.2, life: 2.5, size: 0.24, grav: -0.5, lift: 0.3 }); break;
      default: particles.emit(px, rr(0.3, 2.5), pz, 0x21c8f1, 1, { speed: 0.2, life: 2, size: 0.12, grav: -0.2, lift: 0.2 });
    }
  }
}

/* ---------- boot ---------- */
async function boot() {
  show('#loading'); resize();
  buildProceduralTextures(); buildMaterials(); initEnemyGeo(); initPropGeo(); initModelGeo(); initHud(); initFlashLights();
  try { await loadAtlases(f => { $('#loadFill').style.transform = `scaleX(${f})`; }); }
  catch (err) { $('#loadMsg').textContent = err.message + '. Reload the page to try again.'; return; }
  await initPix(); pixUiKit(); resize();
  buildWorld(Math.floor(rand() * SECTORS.length));
  $('#lineup').innerHTML = ['caret', 'claude', 'snarkbit', 'devin', 'prismara', 'openclaw', 'lunaris', 'cursor', 'rendclaw'].map((id, i) => `<img src="${agentThumbURL(id)}" alt="" style="--i:${i}">`).join('');
  G.mode = 'title'; show('#title');
  loadAgent(selected).catch(() => { });
  requestAnimationFrame(frame);
}
boot();
// debug / QA hooks
window.__AD = { G, input, startRun, HEROES, world, BATCH: () => BATCH, get selected() { return selected; }, set selected(v) { selected = v; },
  move: k => G.p && useMove(G.p, k), killAll: () => G.enemies.slice().forEach(e => { if (!e.boss && e.alive) killEnemy(e); }), next: () => nextFloor(),
  damageBoss: f => G.bosses.forEach(b => { if (b.alive) { b.invuln = 0; b.intro = 0; damageEnemy(b, b.maxHp * f, false); } }), toVault: () => { const [x, z] = roomCenter(world.vault); G.p.x = x - 6; G.p.z = z; },
  toPortal: () => { G.p.x = world.portal.x; G.p.z = world.portal.z; }, solve: () => { for (const s of world.puzzle.steps) interactSwitch(world.switches.find(w => w.id === s)); }, god: () => { G.p.maxHp = G.p.hp = 99999; }, sector: n => startSector(n), spawnBoss: (id, dx = 0, dz = -7) => { const b = spawnBoss(id, G.p.x + dx, G.p.z + dz, 0, 1); b.intro = 0; b.invuln = 0; b.hp = b.maxHp = 1e9; G.stage = 'boss'; return b.uid; }, spawnCPU: (t, dx, dz) => spawnEnemy(t, G.p.x + dx, G.p.z + dz).uid,
  hitProp: pr => damageProp(pr, 999),
  PIX,
  clearBosses: () => { G.enemies.filter(e => e.boss).forEach(removeEnemyVisuals); G.enemies = G.enemies.filter(e => !e.boss); G.bosses = []; G.corpses.forEach(c => removeEnemyVisuals(c.e)); G.corpses = []; ringPool.forEach(r => { r.alive = false; r.m.visible = false; }); } };
