/* ------------------------------------------------------------------
   FLOW: pickups, traps, circuit switches, secret cache, sector
   progression (wings -> vault gate -> bosses -> portal), player
   controller, camera
------------------------------------------------------------------- */

/* ---------- pickups & xp ---------- */
let shardGeo, shardMat; const pickGeo = {};
function spawnShard(x, z, val) {
  if (!shardGeo) { shardGeo = new THREE.OctahedronGeometry(0.16, 0); shardMat = new THREE.MeshStandardMaterial({ color: 0x9ff7ff, emissive: 0x38e8ff, emissiveIntensity: 2.6, metalness: 0.2, roughness: 0.2 }); }
  const m = new THREE.Mesh(shardGeo, shardMat); m.position.set(x, 0.4, z); scene.add(m);
  const a = rand() * 6.28; G.shards.push({ m, x, z, val, vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, t: 0 });
}
function pickupMesh(k) {
  const it = ITEM_KINDS[k], g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: it.color, emissiveIntensity: 2.4, metalness: 0.4, roughness: 0.25 });
  const shell = new THREE.MeshStandardMaterial({ color: 0x2a3142, metalness: 0.9, roughness: 0.3, map: TEX.metal.map });
  if (it.key === 'heal') { const a = new THREE.Mesh(G3.box, mat); a.scale.set(0.55, 0.18, 0.18); const b = a.clone(); b.scale.set(0.18, 0.55, 0.18); g.add(a, b); const f = new THREE.Mesh(G3.box, shell); f.scale.set(0.7, 0.7, 0.1); f.position.z = -0.1; g.add(f); }
  else if (it.key === 'power') { const a = new THREE.Mesh(G3.oct, mat); a.scale.set(0.5, 0.8, 0.5); g.add(a); const r = new THREE.Mesh(G3.torus, mat); r.scale.setScalar(1.1); r.rotation.x = Math.PI / 2; g.add(r); }
  else if (it.key === 'haste') { for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(G3.cone4, mat); c.scale.set(0.45, 0.3, 0.12); c.rotation.z = -Math.PI / 2; c.position.x = (i - 1) * 0.22; g.add(c); } }
  else { const a = new THREE.Mesh(G3.ico, mat); a.scale.setScalar(0.55); g.add(a); const r = new THREE.Mesh(G3.torus, shell); r.scale.setScalar(1.0); g.add(r); }
  g.userData.mat = mat; return g;
}
function spawnPickup(x, z) {
  const h = G.p.hero, k = Math.floor(rand() * 4), it = ITEM_KINDS[k];
  const g = pickupMesh(k); g.position.set(x, 1, z); scene.add(g);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: it.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 })); halo.scale.setScalar(2.2); scene.add(halo);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: it.color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
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
    s.m.position.set(s.x, 0.45 + Math.sin(s.t * 5) * 0.1, s.z); s.m.rotation.y += dt * 4;
    if (d < 0.7) { s.dead = true; scene.remove(s.m); gainXP(s.val); AUDIO.sfx.xp(); }
  }
  G.shards = G.shards.filter(s => !s.dead);
  for (const it of G.pickups) {
    it.t += dt; it.life -= dt;
    it.g.position.set(it.x, 1 + Math.sin(it.t * 3) * 0.15, it.z); it.g.rotation.y += dt * 2; it.halo.position.copy(it.g.position); it.ring.scale.setScalar(1 + Math.sin(it.t * 4) * 0.1);
    it.g.visible = it.life < 4 ? Math.sin(it.t * 18) > 0 : true;
    const d = Math.hypot(p.x - it.x, p.z - it.z);
    if (d < 1.1 || it.life <= 0) {
      it.dead = true; scene.remove(it.g, it.halo, it.ring);
      if (it.life <= 0) continue;
      if (it.trap) { floatText(p.x, p.z, 'Malicious skill!', 'hurt', 3.2); p.inv = 0; hurtPlayer(14 + G.floor * 2); particles.emit(it.x, 1, it.z, 0xff0000, 20, { speed: 6, life: 0.5 }); continue; }
      applyItem(p, it.k); particles.emit(it.x, 1, it.z, ITEM_KINDS[it.k].color, 24, { speed: 6, life: 0.5 });
    }
  }
  G.pickups = G.pickups.filter(i => !i.dead);
  if (G.cache && !G.cache.claimed && world.sealOpen) {
    const c = G.cache; c.g.visible = true; c.t += dt; c.lid.rotation.x = -Math.min(1.2, c.t * 0.4) * 0 ; c.halo.material.opacity = 0.5 + Math.sin(c.t * 3) * 0.2;
    if (Math.hypot(p.x - c.x, p.z - c.z) < 1.8) claimCache();
  }
}
function applyItem(p, k) {
  const ik = ITEM_KINDS[k]; AUDIO.sfx.pickup(); floatText(p.x, p.z, ik.label, 'info', 3.2);
  if (ik.key === 'heal') healPlayer(p, p.maxHp * 0.3);
  if (ik.key === 'power') p.buffs.power = 8;
  if (ik.key === 'haste') p.buffs.haste = 8;
  if (ik.key === 'charge') for (const k2 of MOVE_KEYS) p.cds[k2] = 0;
  toast(`<i class="tdot" style="--c:#${ik.color.toString(16).padStart(6, '0')}"></i><b>${ik.label}</b><span>${ik.sub}</span>`);
}
function gainXP(v) {
  const p = G.p; p.xp += v;
  while (p.xp >= p.xpNext) { p.xp -= p.xpNext; p.level++; p.xpNext = Math.round(12 * Math.pow(1.28, p.level - 1)) + 4; G.pendingLevels = (G.pendingLevels || 0) + 1; }
}

/* ---------- secret cache (unlocked by the circuit puzzle) ---------- */
function buildCache() {
  G.cache = null; if (!world.secret) return;
  const r = world.secret.room, [x, z] = roomCenter(r), col = new THREE.Color(BIOMES[world.biome].accent);
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x3a3020, metalness: 0.8, roughness: 0.35, map: TEX.metal.map });
  const trim = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 2.5 });
  const body = new THREE.Mesh(G3.box, shell); body.scale.set(1.6, 0.8, 1.0); body.position.y = 0.4; g.add(body);
  const lid = new THREE.Mesh(G3.box, shell); lid.scale.set(1.65, 0.3, 1.05); lid.position.y = 0.95; g.add(lid);
  for (const y of [0.15, 0.82]) { const b = new THREE.Mesh(G3.box, trim); b.scale.set(1.66, 0.06, 1.06); b.position.y = y; g.add(b); }
  const gem = new THREE.Mesh(G3.oct, trim); gem.scale.setScalar(0.3); gem.position.set(0, 0.55, 0.52); g.add(gem);
  g.position.set(x, 0, z); g.visible = false; scene.add(g);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 })); halo.scale.setScalar(4); halo.position.set(x, 1, z); g.add(halo); halo.position.set(0, 1, 0);
  G.cache = { g, lid, halo, x, z, t: 0, claimed: false };
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
const camState = { x: 0, z: 0, h: 20 };
function updateCamera(dt) {
  const p = G.p;
  if (G.camOverride) { const o = G.camOverride; camera.position.set(p.x + o[0], o[1], p.z + o[2]); camera.lookAt(p.x + o[3], o[4], p.z + o[5]); return; } const portrait = window.innerWidth < window.innerHeight;
  const look = 1.6; let tx = p.x + p.aimX * look, tz = p.z + p.aimZ * look;
  // boss fights: frame the agent and the nearest guardian together
  const b = G.bosses.filter(b => b.alive).sort((a, c) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(c.x - p.x, c.z - p.z))[0];
  if (b && Math.hypot(b.x - p.x, b.z - p.z) < 22) { tx = lerp(tx, b.x, 0.4); tz = lerp(tz, b.z - 4, 0.45); }
  camState.x = lerp(camState.x, tx, 1 - Math.exp(-dt * 6)); camState.z = lerp(camState.z, tz, 1 - Math.exp(-dt * 6));
  const want = (portrait ? 17 : 20) + (G.stage === 'boss' ? 5 : 0); camState.h = lerp(camState.h, want, 1 - Math.exp(-dt * 2));
  const H = camState.h, B = H * (portrait ? 0.44 : 0.5);
  const tr = G.shake * G.shake, sx = (rand() - 0.5) * tr * 1.2, sz = (rand() - 0.5) * tr * 1.2;
  camera.position.set(camState.x + sx, H, camState.z + B + sz);
  camera.lookAt(camState.x + sx * 0.5, 0, camState.z + sz * 0.5);
  G.shake = Math.max(0, G.shake - dt * 1.6);
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
    if (hit) { const dx = hit.x - p.x, dz = hit.z - p.z, l = Math.hypot(dx, dz); if (l > 0.2) { p.aimX = dx / l; p.aimZ = dz / l; } }
  }
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
  }
  input.dash = false; p.dashMax = dashCdBase;
  if (p.dashT > 0) {
    p.dashT -= dt; const ds = p.st.spd * 3.6; p.vx = p.dashDir[0] * ds; p.vz = p.dashDir[1] * ds;
    particles.emit(p.x, 0.8, p.z, h.color, 3, { speed: 1, life: 0.35, size: 0.4, grav: 0 });
  } else { p.vx = lerp(p.vx, mx * spd, 1 - Math.exp(-dt * 14)); p.vz = lerp(p.vz, mz * spd, 1 - Math.exp(-dt * 14)); }
  moveCircle(p, p.vx * dt, p.vz * dt, p.r);
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
  if (!p.react && p.buffs.haste > 0 && p.moving && !p.atk) setReact(p, 'run', 0.2, { loop: true, fps: 12, flip: p.vx < -0.1 ? -1 : 1 });
  if (p.react && p.react.name === 'run' && (!p.moving || p.buffs.haste <= 0 || p.atk)) p.react = null;
  if (p.react && p.react.name === 'run') p.react.flip = p.vx < -0.1 ? -1 : 1;
  if (p.react && p.react.name === 'dash' && p.dashT <= 0) p.react = null;
  p.dir = dirIndex(p.x, p.z, p.aimX, p.aimZ);
  const [idx, flip, lift] = agentFrame(p, dt);
  p.sprite.set(idx, flip);
  const breathe = !p.moving && !p.atk && !p.react ? 1 + Math.sin(G.time * 2.4) * 0.012 : 1;
  p.sprite.spr.scale.y = p.sprite.scale * breathe;
  p.sprite.spr.position.set(p.x, lift, p.z);
  const u = p.sprite.mat.userData.u;
  if (p.hurtFlash > 0) { p.hurtFlash -= dt; u.uFlash.value = 0.6; u.uFlashCol.value.setRGB(1, 0.25, 0.3); }
  else if (s8.burn > 0 || s8.poison > 0) { u.uFlash.value = 0.25 + Math.sin(G.time * 12) * 0.1; u.uFlashCol.value.set(STATUS[s8.burn > 0 ? 'burn' : 'poison'].color); }
  else if (p.buffs.power > 0) { u.uFlash.value = 0.12 + Math.sin(G.time * 8) * 0.08; u.uFlashCol.value.set(0xff6a5a); }
  else u.uFlash.value = 0;
  p.sprite.mat.opacity = p.inv > 0 && Math.floor(G.time * 20) % 2 ? 0.6 : 1;
  p.light.position.set(p.x, 2.4, p.z); p.light.intensity = 30 + (p.buffs.power > 0 ? 18 : 0);
  p.shadow.position.set(p.x, 0.03, p.z);
  if (G.portalOpen && Math.hypot(p.x - world.portal.x, p.z - world.portal.z) < 1.7) nextFloor();
}
