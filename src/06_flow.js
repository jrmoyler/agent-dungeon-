/* ------------------------------------------------------------------
   FLOW: pickups, traps, circuit switches, secret cache, sector
   progression (wings -> vault gate -> bosses -> portal), player
   controller, camera
------------------------------------------------------------------- */

/* ---------- pickups & xp: icons from the props sheet ---------- */
function iconSprite(name, w, glowCol) {
  const m = pixelSpriteMat(PROPS[name].tex, { gain: 1.1 }); const s = new THREE.Sprite(m);
  s.center.set(0.5, 0.5); s.scale.set(w, w * PROPS[name].h / PROPS[name].w, 1); s.renderOrder = 5; scene.add(s); return s;
}
function spawnShard(x, z, val) {
  const m = iconSprite('ic_hex', 0.42); m.position.set(x, 0.4, z);
  const a = rand() * 6.28; G.shards.push({ m, x, z, val, vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, t: 0 });
}
function spawnPickup(x, z) {
  const h = G.p.hero, k = Math.floor(rand() * 4), it = ITEM_KINDS[k];
  const g = iconSprite(it.icon, 0.85); g.position.set(x, 1, z);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, depthTest: false, color: it.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.45 })); halo.scale.setScalar(1.8); scene.add(halo);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 20), new THREE.MeshBasicMaterial({ color: it.color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.05, z); scene.add(ring);
  const trap = h.trapChance && rand() < h.trapChance;
  G.pickups.push({ g, halo, ring, x, z, k, t: rand() * 6, trap, life: 25 });
}
function updatePickups(dt) {
  const p = G.p, mag = 3.2 * (p.hero.magnet || 1) * p.mods.magnet;
  for (const s of G.shards) {
    s.t += dt; const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz) || 0.01;
    if (d < mag || s.t > 9) { const sp = 14 + s.t * 4; s.x += dx / d * sp * dt; s.z += dz / d * sp * dt; }
    else { s.vx *= Math.exp(-dt * 4); s.vz *= Math.exp(-dt * 4); s.x += s.vx * dt; s.z += s.vz * dt; }
    s.m.position.set(s.x, 0.45 + Math.sin(s.t * 5) * 0.1, s.z);
    if (d < 0.7) { s.dead = true; scene.remove(s.m); s.m.material.dispose(); gainXP(s.val); AUDIO.sfx.xp(); particles.emit(s.x, 0.6, s.z, 0x7fe8ff, 2, { speed: 1.5, life: 0.2, size: 0.16 }); }
  }
  G.shards = G.shards.filter(s => !s.dead);
  for (const it of G.pickups) {
    it.t += dt; it.life -= dt;
    it.g.position.set(it.x, 1 + Math.sin(it.t * 3) * 0.15, it.z); it.halo.position.copy(it.g.position); it.ring.scale.setScalar(1 + Math.sin(it.t * 4) * 0.1);
    it.g.visible = it.life < 4 ? Math.sin(it.t * 18) > 0 : true;
    const d = Math.hypot(p.x - it.x, p.z - it.z);
    if (d < 1.1 || it.life <= 0) {
      it.dead = true; scene.remove(it.g, it.halo, it.ring); it.g.material.dispose();
      if (it.life <= 0) continue;
      if (it.trap) { floatText(p.x, p.z, 'Malicious skill!', 'hurt', 3.2); p.inv = 0; hurtPlayer(14 + G.floor * 2); particles.emit(it.x, 1, it.z, 0xff0000, 20, { speed: 6, life: 0.5 }); continue; }
      applyItem(p, it.k); particles.emit(it.x, 1, it.z, ITEM_KINDS[it.k].color, 24, { speed: 6, life: 0.5 });
    }
  }
  G.pickups = G.pickups.filter(i => !i.dead);
  if (G.cache && !G.cache.claimed && world.sealOpen) {
    const c = G.cache; c.g.visible = true; c.t += dt; c.halo.material.opacity = 0.5 + Math.sin(c.t * 3) * 0.2; c.spr.position.y = Math.sin(c.t * 2) * 0.06;
    if (Math.hypot(p.x - c.x, p.z - c.z) < 1.8) claimCache();
  }
}
function applyItem(p, k) {
  const ik = ITEM_KINDS[k]; AUDIO.sfx.pickup(); floatText(p.x, p.z, ik.label, 'info', 3.2);
  if (ik.key === 'heal') healPlayer(p, p.maxHp * 0.3);
  if (ik.key === 'power') p.buffs.power = 8;
  if (ik.key === 'haste') p.buffs.haste = 8;
  if (ik.key === 'charge') for (const k2 of MOVE_KEYS) p.cds[k2] = 0;
  toast(`<b>${ik.label}</b><span>${ik.sub}</span>`, ik.icon);
}
function gainXP(v) {
  const p = G.p; p.xp += v;
  while (p.xp >= p.xpNext) { p.xp -= p.xpNext; p.level++; p.xpNext = Math.round(12 * Math.pow(1.28, p.level - 1)) + 4; G.pendingLevels = (G.pendingLevels || 0) + 1; }
}

/* ---------- secret cache (unlocked by the circuit puzzle) ---------- */
function buildCache() {
  G.cache = null; if (!world.secret) return;
  const r = world.secret.room, [x, z] = roomCenter(r), col = new THREE.Color(BIOMES[world.biome].accent);
  const g = new THREE.Group(), spr = propSprite('chest', 0, 0); g.add(spr);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, depthTest: false, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 })); halo.scale.setScalar(4); halo.position.set(0, 1, 0); g.add(halo);
  g.add(padDecal(0, 0, 3)); g.position.set(x, 0, z); g.visible = false; scene.add(g);
  G.cache = { g, spr, halo, x, z, t: 0, claimed: false };
}
function claimCache() {
  const c = G.cache, p = G.p; c.claimed = true; G.secretsFound++;
  AUDIO.sfx.secret(); healPlayer(p, p.maxHp * 0.4); G.score += 600 * (1 + G.floor * 0.2); p.buffs.power = Math.max(p.buffs.power, 10);
  particles.emit(c.x, 1, c.z, BIOMES[world.biome].accent, 60, { speed: 8, life: 0.8, size: 0.4 }); shockRing(c.x, c.z, 4, 0xffffff, 0.5);
  G.pendingLevels = (G.pendingLevels || 0) + 1;
  showBanner('Secret cache', 'Shield restored · Overclocked · Free upgrade');
  scene.remove(c.g);
}

/* ---------- traps (Batch 09 timed sector hazards) ---------- */
const TRAP_COLOR = { laser: 0xff3355, rift: 0xd27bff, electric: 0x7fe0ff, flame: 0xff7a2a, ice: 0xbff4ff, toxin: 0x9be84a, gravity: 0xb48bff, clock: 0xf7d27a };
function updateTraps(dt) {
  const p = G.p;
  for (const tr of world.traps) {
    const u = tr.plate.material.uniforms;
    if (world.trapsOff) { u.on.value = 0; u.warn.value = 0; tr.plate.material.opacity = 0.2; continue; }
    const c = (G.time + tr.phase) % tr.period, on = c < 0.95, warn = c > tr.period - 0.7;
    u.on.value = on ? 1 : 0; u.warn.value = warn ? 0.5 + 0.5 * Math.sin(G.time * 30) : 0;
    if (on && !tr.active) { tr.active = true; trapBurst(tr); }
    if (!on) tr.active = false;
    if (!on) continue;
    tr.hitT -= dt;
    if (tr.hitT <= 0) {
      tr.hitT = 0.45;
      const dmg = (8 + G.floor * 2) * 0.6;
      if (Math.hypot(p.x - tr.x, p.z - tr.z) < tr.r + 0.3) { hurtPlayer(dmg); const st = TRAP_STATUS[tr.type]; if (st) applyPlayerStatus(st, st === 'stun' ? 0.5 : 1.6, tr); }
      for (const e of G.enemies) if (e.alive && !e.boss && !e.def.flying && Math.hypot(e.x - tr.x, e.z - tr.z) < tr.r) { damageEnemy(e, dmg * 1.5, false); if (TRAP_STATUS[tr.type]) applyStatus(e, TRAP_STATUS[tr.type] === 'timeslow' ? 'slow' : TRAP_STATUS[tr.type], 1.2); }
    }
    if (rand() < dt * 30) trapParticle(tr);
  }
}
function trapBurst(tr) {
  const c = TRAP_COLOR[tr.type]; shockRing(tr.x, tr.z, tr.r, c, 0.35); if (Math.hypot(G.p.x - tr.x, G.p.z - tr.z) < 14) AUDIO.sfx.trap();
  if (tr.type === 'electric') for (let i = 0; i < 4; i++) { const a = rand() * 6.28; zap(jagged(tr.x, tr.z, tr.x + Math.cos(a) * tr.r, tr.z + Math.sin(a) * tr.r, 5, 0.4), c, 0.4); }
  if (tr.type === 'laser') for (let i = 0; i < 3; i++) { const a = rand() * 6.28; zap([[tr.x - Math.cos(a) * tr.r, tr.z - Math.sin(a) * tr.r], [tr.x + Math.cos(a) * tr.r, tr.z + Math.sin(a) * tr.r]], c, 0.9); }
}
function trapParticle(tr) {
  const c = TRAP_COLOR[tr.type], a = rand() * 6.28, d = rand() * tr.r, x = tr.x + Math.cos(a) * d, z = tr.z + Math.sin(a) * d;
  switch (tr.type) {
    case 'flame': particles.emit(x, 0.2, z, rand() < 0.5 ? 0xff7a2a : 0xffd060, 1, { speed: 0.8, life: 0.7, size: 0.5, grav: -5, lift: 2 }); break;
    case 'ice': particles.emit(x, 0.3, z, 0xd4f9ff, 1, { speed: 1.5, life: 0.6, size: 0.3, grav: 2, lift: 3 }); break;
    case 'toxin': particles.emit(x, 0.1, z, 0x9be84a, 1, { speed: 0.3, life: 1, size: 0.45, grav: -1.5, lift: 1 }); break;
    case 'gravity': particles.emit(tr.x + Math.cos(a) * tr.r, 0.4, tr.z + Math.sin(a) * tr.r, c, 1, { speed: 0.2, life: 0.5, size: 0.3, grav: 0, dir: [-Math.cos(a) * 5, -Math.sin(a) * 5] }); break;
    default: particles.emit(x, 0.3, z, c, 1, { speed: 1, life: 0.5, size: 0.3, grav: -2, lift: 2 });
  }
}

/* ---------- circuit switches (Batch 09 puzzle) ---------- */
function nearestSwitch() { const p = G.p; let best = null, bd = 2.6; for (const s of world.switches) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; best = s; } } return best; }
function interactSwitch(sw) {
  const P = world.puzzle; if (P.solved) { toast('<b>Circuit solved</b><span>Traps are offline</span>'); return; }
  if (G.rival && G.rival.alive && Math.hypot(G.rival.x - sw.x, G.rival.z - sw.z) < 16) { AUDIO.sfx.switchBad(); toast(`<b>Locked</b><span>${G.rival.name} guards this circuit</span>`); return; }
  const expected = P.steps[P.idx];
  if (sw.id === expected) {
    P.idx++; sw.on = true; sw.coreM.emissiveIntensity = 4; AUDIO.sfx.switchOn(); shockRing(sw.x, sw.z, 3, BIOMES[world.biome].accent, 0.4);
    if (P.idx >= P.steps.length) {
      P.solved = true; world.trapsOff = true; openSeal(); G.flowDirty = true; AUDIO.sfx.gate();
      showBanner('Circuit solved', world.secret ? 'Traps offline · A sealed wall cracks open' : 'Traps offline'); G.score += 300;
    } else toast(`<b>Relay ${P.idx}/${P.steps.length}</b><span>Next: ${P.steps[P.idx] === 'north' ? 'upper' : 'lower'} passage</span>`);
  } else {
    P.idx = sw.id === P.steps[0] ? 1 : 0; AUDIO.sfx.switchBad();
    for (const s of world.switches) { s.on = false; s.coreM.emissiveIntensity = 1.2; }
    if (P.idx === 1) { sw.on = true; sw.coreM.emissiveIntensity = 4; }
    toast('<b>Sequence reset</b><span>The relay order matters</span>');
  }
}

/* ---------- entities & sectors ---------- */
function clearEntities() {
  for (const e of G.enemies) removeEnemyVisuals(e);
  for (const c of G.corpses) removeEnemyVisuals(c.e);
  for (const s of G.summons) { scene.remove(s.s); if (s.shadow) scene.remove(s.shadow); if (s.glow) scene.remove(s.glow, s.ring); }
  for (const f of G.fx) { if (f.legacy) scene.remove(f.s); else { f.alive = false; f.s.visible = false; f.glow.visible = false; } }
  for (const s of G.shards) scene.remove(s.m);
  for (const i of G.pickups) scene.remove(i.g, i.halo, i.ring);
  for (const L of G.lines) scene.remove(L.l);
  for (const t of G.telegraphs) scene.remove(t.mesh);
  if (G.cache) scene.remove(G.cache.g);
  PPOOL.forEach(q => { q.alive = false; q.s.visible = false; q.glow.visible = false; q.onEnd = null; }); EPOOL.forEach(b => { b.alive = false; b.s.visible = false; });
  ringPool.forEach(r => { r.alive = false; r.m.visible = false; });
  G.enemies = []; G.corpses = []; G.summons = []; G.fx = []; G.shards = []; G.pickups = []; G.lines = []; G.telegraphs = []; G.delayed = []; G.bosses = []; G.rival = null;
  G.vortex = G.well = G.shield = null; G.cache = null;
  particles.clear();
}
let groupSeq = 1;
function startSector(n) {
  clearEntities(); G.floor = n; G.sector = SECTORS[n - 1]; G.flow = null; G.flowTile = -1; G.portalOpen = false; G.stage = 'wings';
  buildWorld(n - 1, (G.runSeed * 131 + n * 7919) | 0);
  const [sx, sz] = roomCenter(world.start); const p = G.p; p.x = sx; p.z = sz; p.vx = p.vz = 0;
  camState.x = sx; camState.z = sz;
  setReact(p, 'jump', 0.7); after(0.55, () => { AUDIO.sfx.land(); shockRing(p.x, p.z, 2.4, p.hero.color, 0.35); particles.emit(p.x, 0.2, p.z, p.hero.color, 20, { speed: 5, life: 0.4, up: 0.3 }); });
  // CPU squads + glitch fauna in every wing room
  const sec = G.sector, size = 3 + Math.floor(n / 2);
  for (const r of world.rooms) {
    if (r.zone !== 'north' && r.zone !== 'south') continue;
    const gid = groupSeq++; const k = size + Math.floor(rand() * 2) + (r.w * r.h > 110 ? 1 : 0);
    for (let i = 0; i < k; i++) {
      for (let t = 0; t < 20; t++) {
        const tx = r.x + 1 + Math.floor(rand() * (r.w - 2)), ty = r.y + 1 + Math.floor(rand() * (r.h - 2));
        if (isWall(tx, ty)) continue;
        const x = (tx + 0.5) * TILE, z = (ty + 0.5) * TILE;
        if (rand() < 0.28) { const f = pick(sec.fauna); if (f === 'spam') for (let j = 0; j < 3; j++) spawnEnemy('spam', x + rr(-0.8, 0.8), z + rr(-0.8, 0.8), gid); else spawnEnemy(f, x, z, gid); }
        else spawnEnemy(pick(sec.cpu), x, z, gid);
        break;
      }
    }
  }
  // Four Locks rival guards the upper circuit
  const rc = RIVALS.find(r => r.sector === n);
  if (rc) { const sw = world.switches.find(s => s.id === 'north') || world.switches[0]; if (sw) { const [rx, rz] = roomCenter(sw.room); spawnRival(rc, rx, rz).then(e => { if (e) e.group = 999; }); } }
  buildCache();
  G.totalOnFloor = G.enemies.length;
  showSectorCard(n);
  AUDIO.startMusic(false, MUSIC_KEYS[sec.id]);
  updateFlow();
}
function wingEnemiesLeft() { let n = 0; for (const e of G.enemies) if (e.alive && !e.boss) n++; return n + (G.rival && G.rival.alive ? 0 : 0); }
function updateProgress() {
  const p = G.p;
  if (G.stage === 'wings' && wingEnemiesLeft() === 0 && !(G.rival && G.rival.alive)) {
    G.stage = 'gate'; openGates(); G.flowDirty = true; AUDIO.sfx.gate(); shakeAdd(0.5);
    showBanner('Vault unsealed', `${G.sector.bosses.length > 1 ? 'Two guardians wait' : 'The guardian waits'} beyond the gate`);
  }
  if (G.stage === 'gate' && zoneAt(p.x, p.z) === 'vault') {
    G.stage = 'boss'; const [vx, vz] = roomCenter(world.vault), ids = G.sector.bosses;
    ids.forEach((id, i) => spawnBoss(id, vx + 3 + (ids.length > 1 ? (i ? 4 : -4) : 0) * 0.2, vz + (ids.length > 1 ? (i ? 5 : -5) : 0), i, ids.length));
    const first = G.bosses[0]; showBanner(ids.length > 1 ? `${G.bosses[0].name} & ${G.bosses[1].name}` : first.name, ids.length > 1 ? 'Dual guardians' : first.sub);
    AUDIO.sfx.boss(); AUDIO.startMusic(true, MUSIC_KEYS[G.sector.id]); shakeAdd(0.8);
  }
  if (G.stage === 'boss' && G.bosses.every(b => !b.alive)) { G.stage = 'portal'; openPortal(); }
}
function openPortal() {
  G.portalOpen = true; world.portal.active = true; world.portal.grp.visible = true; AUDIO.sfx.portal();
  showBanner('Portal open', G.floor >= FLOORS ? 'The Override is broken' : 'Step through to descend');
}

/* ---------- camera ---------- */
const camState = { x: 0, z: 0, kx: 0, kz: 0, kvx: 0, kvz: 0 }; // no zoom: pixel art keeps one scale
function updateCamera(dt) {
  const p = G.p;
  const look = 1.4; let tx = p.x + p.aimX * look, tz = p.z + p.aimZ * look;
  // boss fights: frame the agent and the nearest guardian together
  const b = G.bosses.filter(b => b.alive).sort((a, c) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(c.x - p.x, c.z - p.z))[0];
  if (b && Math.hypot(b.x - p.x, b.z - p.z) < 22) { tx = lerp(tx, b.x, 0.35); tz = lerp(tz, b.z, 0.35); }
  camState.x = lerp(camState.x, tx, 1 - Math.exp(-dt * 7)); camState.z = lerp(camState.z, tz, 1 - Math.exp(-dt * 7));
  // directional kick springs back; trauma shake uses smooth pseudo-noise so it rolls instead of buzzing
  camState.kvx += G.kick.x * 18; camState.kvz += G.kick.z * 18;
  camState.kvx += (-camState.kx * 260 - camState.kvx * 22) * dt; camState.kvz += (-camState.kz * 260 - camState.kvz * 22) * dt;
  camState.kx += camState.kvx * dt; camState.kz += camState.kvz * dt; G.kick.x = G.kick.z = 0;
  const tr = G.shake * G.shake * 0.9, T = G.time * 38;
  const sx = tr * (Math.sin(T * 1.1) + Math.sin(T * 2.3 + 1.7) * 0.5), sz = tr * (Math.sin(T * 1.37 + 0.6) + Math.sin(T * 2.9) * 0.5);
  placeCamera(camState.x + sx + camState.kx, camState.z + sz + camState.kz);
  G.shake = Math.max(0, G.shake - dt * 1.8);
}

/* ---------- player controller ---------- */
const MOVE_ORDER = ['rapid_fire', 'sweeping_arc', 'piercing_beam', 'area_pulse', 'summon', 'ultimate'];
function updatePlayer(dt) {
  const p = G.p, h = p.hero, s8 = p.st8;
  updatePlayerStatus(dt);
  const stunned = s8.stun > 0;
  // aim
  if (IS_TOUCH) {
    if (input.stickAimOn && Math.hypot(...input.stickAim) > 0.25) { const l = Math.hypot(...input.stickAim); p.aimX = input.stickAim[0] / l; p.aimZ = input.stickAim[1] / l; }
    else { const t = nearestEnemy(p.x, p.z, 14); if (t && lineOfSight(p.x, p.z, t.x, t.z)) { const dx = t.x - p.x, dz = t.z - p.z, l = Math.hypot(dx, dz) || 1; p.aimX = dx / l; p.aimZ = dz / l; } else if (Math.hypot(...input.stickMove) > 0.2) { const l = Math.hypot(...input.stickMove); p.aimX = input.stickMove[0] / l; p.aimZ = input.stickMove[1] / l; } }
  } else if (input.mouseIn) {
    raycaster.setFromCamera(new THREE.Vector2(input.mouseX, input.mouseY), camera);
    const hit = raycaster.ray.intersectPlane(groundPlane, tmpV);
    if (hit) { const dx = hit.x - p.x, dz = hit.z - p.z, l = Math.hypot(dx, dz); if (l > 0.2) { p.aimX = dx / l; p.aimZ = dz / l; } p.aimDist = clamp(l, 1.6, 14); }
  } else p.aimDist = 5;
  if (s8.confuse > 0) { const a = Math.atan2(p.aimZ, p.aimX) + Math.sin(G.time * 7) * 0.45; p.aimX = Math.cos(a); p.aimZ = Math.sin(a); }
  // move
  let mx = input.right - input.left, mz = input.down - input.up;
  if (IS_TOUCH) { mx = input.stickMove[0]; mz = input.stickMove[1]; }
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  let spd = p.st.spd * p.mods.spd * (p.buffs.citation > 0 ? 1.2 : 1) * (s8.slow > 0 ? 0.6 : 1) * (s8.timeslow > 0 ? 0.6 : 1);
  if (p.rooted > 0) { spd = 0; p.rooted -= dt; }
  if (stunned) spd = 0;
  p.dashCd = Math.max(0, p.dashCd - dt);
  const dashCdBase = 1.1 / (h.dashMul || 1) * (h.cdMul || 1) * (h.dashCdMul || 1);
  if (input.dash && p.dashCd <= 0 && p.rooted <= 0 && !stunned) {
    const dx = ml > 0.1 ? mx : p.aimX, dz = ml > 0.1 ? mz : p.aimZ, l = Math.hypot(dx, dz) || 1;
    p.dashDir = [dx / l, dz / l]; p.dashT = 0.17 * (h.dashMul || 1); p.dashCd = dashCdBase; AUDIO.sfx.dash();
    setReact(p, 'dash', p.dashT + 0.08, { loop: true, fps: 18, flip: p.dashDir[0] < -0.1 ? -1 : 1 });
    p.sq = -0.16; p.sqV = 0; p.ghostT = 0; shockRing(p.x, p.z, 1.3, h.color, 0.22); flashLight(p.x, 1, p.z, h.color, 25, 0.18);
    particles.emit(p.x, 0.15, p.z, 0xa8b4d8, 8, { speed: 3, life: 0.35, size: 0.22, up: 0.2, dir: [-p.dashDir[0] * 4, -p.dashDir[1] * 4] });
  }
  input.dash = false; p.dashMax = dashCdBase;
  if (p.dashT > 0) {
    p.dashT -= dt; const ds = p.st.spd * 3.6; p.vx = p.dashDir[0] * ds; p.vz = p.dashDir[1] * ds;
    p.ghostT -= dt; if (p.ghostT <= 0) { p.ghostT = 0.03; dropGhost(p); }
    particles.emit(p.x, 0.9, p.z, h.color, 2, { speed: 0.6, life: 0.3, size: 0.26, grav: 0 });
    if (p.dashT <= 0) { p.sq = 0.12; p.vx *= 0.45; p.vz *= 0.45; particles.emit(p.x, 0.15, p.z, 0xa8b4d8, 6, { speed: 2.5, life: 0.3, size: 0.2, up: 0.2 }); }
  } else {
    // quick to accelerate, a touch slower to stop: weight without sludge
    const rate = ml > 0.1 ? 16 : 11;
    p.vx = lerp(p.vx, mx * spd, 1 - Math.exp(-dt * rate)); p.vz = lerp(p.vz, mz * spd, 1 - Math.exp(-dt * rate));
  }
  moveCircle(p, p.vx * dt, p.vz * dt, p.r);
  updateGhosts(p, dt);
  // squash & stretch spring
  p.sqV += (-340 * p.sq - 20 * p.sqV) * dt; p.sq += p.sqV * dt;
  // timers
  p.inv = Math.max(0, p.inv - dt); p.slowT = Math.max(0, p.slowT - dt);
  for (const k of MOVE_KEYS) p.cds[k] = Math.max(0, p.cds[k] - dt);
  for (const k in p.buffs) p.buffs[k] = Math.max(0, p.buffs[k] - dt);
  if (p.castT > 0) { p.castT -= dt; if (p.castT <= 0 && p.castFn) { p.castFn(); p.castFn = null; } }
  const regen = (h.regen || 0) + p.mods.regen; if (regen > 0) healPlayer(p, regen * dt);
  if (p.healOver) { const r = p.healOver.amt / Math.max(0.1, p.healOver.t) * dt; healPlayer(p, r); p.healOver.amt -= r; p.healOver.t -= dt; if (p.healOver.t <= 0) p.healOver = null; }
  // primary fire
  const wantFire = IS_TOUCH ? (input.stickAimOn ? Math.hypot(...input.stickAim) > 0.25 : !!nearestEnemy(p.x, p.z, 14)) : (input.fire || input.autoFire);
  p.fireT -= dt;
  if (wantFire && p.fireT <= 0 && p.rooted <= 0 && p.dashT <= 0 && !stunned && !(s8.silence > 0)) {
    let rate = p.kit.primary_shot.rate * p.mods.rate * (p.buffs.haste > 0 ? 1.5 : 1) * (p.buffs.citation > 0 ? 1.25 : 1) * (p.slowT > 0 ? 0.5 : 1) * (s8.timeslow > 0 ? 0.6 : 1);
    if (h.movingRate && Math.hypot(p.vx, p.vz) > 1) rate *= h.movingRate;
    p.fireT = 1 / rate; playerShoot(p);
  }
  // skills
  if (!stunned) for (const k of MOVE_ORDER) if (input.moves[k]) { input.moves[k] = false; useMove(p, k); }
  for (const k of MOVE_ORDER) input.moves[k] = false;
  // interact
  G.nearSwitch = nearestSwitch();
  if (input.interact) { input.interact = false; if (G.nearSwitch) interactSwitch(G.nearSwitch); }
  // traps
  // animation
  p.moving = Math.hypot(p.vx, p.vz) > 0.6;
  if (p.moving) p.walkT += dt * Math.hypot(p.vx, p.vz) * 0.85;
  if (p.moving && p.dashT <= 0) { p.stepT -= dt * Math.hypot(p.vx, p.vz); if (p.stepT <= 0) { p.stepT = 2.1; particles.emit(p.x, 0.12, p.z, 0x8a96bc, 2, { speed: 0.8, life: 0.4, size: 0.2, grav: -0.6, up: 0.1, lift: 0.4 }); } }
  if (!p.react && p.buffs.haste > 0 && p.moving && !p.atk) setReact(p, 'run', 0.2, { loop: true, fps: 12, flip: p.vx < -0.1 ? -1 : 1 });
  if (p.react && p.react.name === 'run' && (!p.moving || p.buffs.haste <= 0 || p.atk)) p.react = null;
  if (p.react && p.react.name === 'run') p.react.flip = p.vx < -0.1 ? -1 : 1;
  if (p.react && p.react.name === 'dash' && p.dashT <= 0) p.react = null;
  p.dir = dirIndex(p.x, p.z, p.aimX, p.aimZ);
  const [idx, flip, lift] = agentFrame(p, dt);
  p.sprite.set(idx, flip);
  const breathe = !p.moving && !p.atk && !p.react ? 1 + Math.sin(G.time * 2.4) * 0.012 : 1;
  const sq = clamp(p.sq, -0.25, 0.25);
  p.sprite.spr.scale.set(p.sprite.scale * flip * (1 + sq), p.sprite.scale * breathe * (1 - sq * 0.9), 1);
  p.sprite.spr.position.set(p.x, lift, p.z);
  p.sil.position.copy(p.sprite.spr.position); p.sil.scale.copy(p.sprite.spr.scale);
  // aim marks: reticle on the floor where you aim, chevron at the feet
  const A = p.aim, aimLen = p.aimDist ?? 5;
  A.ret.position.set(p.x + p.aimX * aimLen, 0.06, p.z + p.aimZ * aimLen); A.ret.rotation.y = G.time * 1.5;
  A.chev.position.set(p.x + p.aimX * 1.05, 0.06, p.z + p.aimZ * 1.05); A.chev.rotation.y = -Math.atan2(p.aimZ, p.aimX);
  A.mat.opacity = p.dead ? 0 : 0.75 + Math.sin(G.time * 6) * 0.1;
  const u = p.sprite.mat.userData.u;
  if (p.hurtFlash > 0) { p.hurtFlash -= dt; u.uFlash.value = 0.6; u.uFlashCol.value.setRGB(1, 0.25, 0.3); }
  else if (s8.burn > 0 || s8.poison > 0) { u.uFlash.value = 0.25 + Math.sin(G.time * 12) * 0.1; u.uFlashCol.value.set(STATUS[s8.burn > 0 ? 'burn' : 'poison'].color); }
  else if (p.buffs.power > 0) { u.uFlash.value = 0.12 + Math.sin(G.time * 8) * 0.08; u.uFlashCol.value.set(0xff6a5a); }
  else u.uFlash.value = 0;
  p.sprite.mat.opacity = p.inv > 0 && Math.floor(G.time * 20) % 2 ? 0.6 : 1;
  p.light.position.set(p.x, 2.6, p.z); p.light.intensity = 14 + (p.buffs.power > 0 ? 10 : 0);
  p.shadow.position.set(p.x, 0.03, p.z);
  if (G.portalOpen && Math.hypot(p.x - world.portal.x, p.z - world.portal.z) < 1.7) nextFloor();
}
