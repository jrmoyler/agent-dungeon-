/* ------------------------------------------------------------------
   GAME: player, enemies (procedural PBR meshes), projectiles,
   specials, summons, pickups, floors, camera
------------------------------------------------------------------- */
const G = {
  mode: 'title', hero: null, p: null, floor: 1, time: 0, enemies: [], pproj: [], eproj: [], summons: [], fx: [], pickups: [], shards: [], lines: [],
  kills: 0, score: 0, dmgDealt: 0, runTime: 0, hitstop: 0, shake: 0, flow: null, flowTile: -1, portalOpen: false, banner: null, paused: false, boss: null,
};
const input = { up: 0, down: 0, left: 0, right: 0, fire: false, aimX: 1, aimZ: 0, mouseX: 0, mouseY: 0, mouseIn: false, special: false, dash: false, stickMove: [0, 0], stickAim: [0, 0], stickAimOn: false, autoFire: false };
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.1);
const raycaster = new THREE.Raycaster();

/* ---------- sprite helpers ---------- */
function spriteMat(tex, opts = {}) {
  return new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: opts.additive ? 0 : 0.02, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, color: opts.color ?? 0xffffff, opacity: opts.opacity ?? 1, fog: true });
}
function makeShadow(r) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.scale.set(r * 2.6, r * 1.8, 1); m.renderOrder = 1; scene.add(m); return m;
}
/* angle on screen of a world-space direction, for sprite rotation */
function screenAngle(x, z, dx, dz) {
  tmpV.set(x, 1, z).project(camera); tmpV2.set(x + dx, 1, z + dz).project(camera);
  return Math.atan2((tmpV2.y - tmpV.y) / camera.aspect * 1, (tmpV2.x - tmpV.x)) ;
}
function screenAngleFix(x, z, dx, dz) { // compensate aspect of NDC
  tmpV.set(x, 1, z).project(camera); tmpV2.set(x + dx, 1, z + dz).project(camera);
  return Math.atan2((tmpV2.y - tmpV.y), (tmpV2.x - tmpV.x) * camera.aspect);
}

/* ---------- DOM damage numbers ---------- */
const dmgLayer = document.getElementById('dmg');
const dmgPool = [];
for (let i = 0; i < 48; i++) { const d = document.createElement('div'); d.className = 'dn'; dmgLayer.appendChild(d); dmgPool.push({ el: d, t: 0, x: 0, y: 0, z: 0 }); }
let dmgIdx = 0;
function floatText(x, z, text, cls = '', y = 2.2) {
  const d = dmgPool[dmgIdx]; dmgIdx = (dmgIdx + 1) % dmgPool.length;
  d.t = 0.85; d.x = x + rr(-0.3, 0.3); d.z = z; d.y = y; d.el.textContent = text; d.el.className = 'dn show ' + cls;
}
function updateFloatText(dt) {
  const w = window.innerWidth, h = window.innerHeight;
  for (const d of dmgPool) {
    if (d.t <= 0) continue; d.t -= dt; d.y += dt * 1.6;
    tmpV.set(d.x, d.y, d.z).project(camera);
    const sx = (tmpV.x * 0.5 + 0.5) * w, sy = (-tmpV.y * 0.5 + 0.5) * h;
    d.el.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-50%) scale(${0.8 + Math.min(1, (0.85 - d.t) * 8) * 0.4})`;
    d.el.style.opacity = Math.min(1, d.t * 3);
    if (d.t <= 0) d.el.className = 'dn';
  }
}

/* ---------- player ---------- */
function derive(h) {
  return {
    maxHp: Math.round((70 + h.stats.hp * 18) * (h.hpMul || 1)),
    dmg: 6 + h.stats.atk * 2.4,
    spd: 4.6 + h.stats.spd * 0.42,
    def: h.stats.def * 0.055,
    pow: 0.7 + h.x.v * 0.08,
  };
}
function createPlayer(h) {
  const st = derive(h);
  const art = ART[h.id];
  const mat = spriteMat(art.idle.tex);
  const spr = new THREE.Sprite(mat); spr.center.set(0.5, 0.06); spr.renderOrder = 5; scene.add(spr);
  const light = new THREE.PointLight(h.color, 30, 18, 1.2); scene.add(light);
  const p = {
    x: 0, z: 0, vx: 0, vz: 0, r: 0.5, hero: h, st, hp: st.maxHp, maxHp: st.maxHp,
    mods: { dmg: 1, rate: 1, count: 0, pierce: 0, spd: 1, cd: 1, crit: 0, regen: 0, range: 1, magnet: 1, pspeed: 1 },
    fireT: 0, spT: 0, dashT: 0, dashCd: 0, inv: 0, level: 1, xp: 0, xpNext: 12, buffs: { power: 0, haste: 0, citation: 0, homing: 0 },
    shots: 0, slowT: 0, glm: 'zh', rooted: 0, castT: 0, castFn: null, sprite: spr, mat, light, shadow: makeShadow(0.6),
    frame: 'idle', frameT: 0, walkT: 0, facing: 1, aimX: 1, aimZ: 0, picks: {}, hurtFlash: 0, dead: false, alive: true,
  };
  setFrame(p, 'idle');
  return p;
}
function setFrame(p, f) {
  const art = ART[p.hero.id]; const fr = art[f], idle = art.idle;
  if (p.mat.map !== fr.tex) { p.mat.map = fr.tex; p.mat.needsUpdate = true; }
  p.frame = f;
  const baseH = 2.5; const hh = baseH * fr.h / idle.h * (f === 'special' ? 0.92 : 1);
  p.baseW = hh * fr.w / fr.h; p.baseH = hh;
}
function cdMul(p) { return (p.hero.cdMul || 1) * p.mods.cd; }
function heroDamage(p, mul, target) {
  let d = p.st.dmg * mul * p.mods.dmg;
  if (p.buffs.power > 0) d *= 2;
  if (p.buffs.citation > 0) d *= 1.4;
  if (target) {
    if (target.mark > 0) d *= 1.25;
    if (target.reveal > 0) d *= 1.2;
    if (p.hero.id === 'minimax' && target.def.elite) d *= 0.8;
  }
  let crit = false;
  if (p.hero.variance) d *= rr(p.hero.variance[0], p.hero.variance[1]);
  const cc = (p.hero.crit || 0) + p.mods.crit;
  if (rand() < cc) { d *= (p.hero.critMul || 2); crit = true; }
  return [d, crit];
}

/* ---------- player projectiles ---------- */
const PPOOL = [];
function getPProj() {
  for (const q of PPOOL) if (!q.alive) return q;
  const mat = spriteMat(null); const s = new THREE.Sprite(mat); s.renderOrder = 6; scene.add(s); s.visible = false;
  const q = { alive: false, s, mat }; PPOOL.push(q); return q;
}
function firePlayerProj(p, ang, opt = {}) {
  const h = p.hero, w = h.weapon, art = ART[opt.art || h.id];
  const q = getPProj();
  q.alive = true; q.s.visible = true;
  if (q.mat.map !== art.proj.tex) { q.mat.map = art.proj.tex; q.mat.needsUpdate = true; }
  q.mat.color.set(opt.tint ?? 0xffffff); q.mat.opacity = 1;
  const spd = (opt.speed ?? w.speed) * p.mods.pspeed;
  q.x = opt.x ?? p.x + Math.cos(ang) * 0.6; q.z = opt.z ?? p.z + Math.sin(ang) * 0.6; q.y = 1.15;
  q.vx = Math.cos(ang) * spd; q.vz = Math.sin(ang) * spd;
  q.life = (opt.life ?? w.life) * p.mods.range * (h.id === 'kimi' ? 1.25 : 1); q.max = q.life;
  q.dmgMul = opt.dmg ?? w.dmg; q.pierce = (opt.pierce ?? w.pierce) + p.mods.pierce; q.hit = new Set();
  q.home = opt.home ?? (w.home + (p.buffs.homing > 0 ? 9 : 0)); q.rot = w.rot; q.artAngle = w.artAngle || 0;
  q.bounce = opt.bounce ?? (w.bounce || 0); q.owner = opt.owner || 'player'; q.spin = rr(-1, 1);
  const size = (opt.size ?? w.size) * 1.0; const ar = art.proj.w / art.proj.h;
  q.sw = size * Math.sqrt(ar); q.sh = size / Math.sqrt(ar); q.t = 0; q.color = h.color;
  q.s.scale.set(q.sw, q.sh, 1); q.s.position.set(q.x, q.y, q.z);
  q.mark = h.id === 'hermes'; q.slow = h.id === 'antigravity';
  return q;
}
function playerShoot(p) {
  const h = p.hero, w = h.weapon;
  let count = w.count + p.mods.count, spread = w.spread, dmg = w.dmg, pierce = w.pierce, size = w.size, speed = w.speed;
  if (h.id === 'glm') {
    if (p.glm === 'zh') { count += 2; dmg *= 0.75; }
    else { dmg *= 1.9; pierce += 3; size *= 1.3; speed *= 1.25; }
  }
  const base = Math.atan2(p.aimZ, p.aimX);
  if (w.twin) {
    const px = -Math.sin(base), pz = Math.cos(base);
    const pairs = Math.max(1, Math.ceil(count / 2));
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1, ring = Math.floor(i / 2);
      const off = side * (0.35 + ring * 0.3), a = base + (ring ? side * 0.08 * ring : 0);
      firePlayerProj(p, a, { x: p.x + px * off + Math.cos(base) * 0.6, z: p.z + pz * off + Math.sin(base) * 0.6, tint: i % 2 ? 0xffb6ee : 0xb6d4ff });
    }
  } else {
    const totalSpread = spread + (count > 1 ? 0.14 * (count - 1) : 0);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      const jitter = h.id === 'grok' ? rr(-spread, spread) : 0;
      firePlayerProj(p, base + t * totalSpread + jitter, { dmg, pierce, size, speed });
    }
  }
  AUDIO.sfx.shoot(h.id === 'claude' ? 0.6 : h.id === 'devin' ? 0.5 : 1 + (h.stats.spd - 4) * 0.06);
  particles.emit(p.x + Math.cos(base) * 0.9, 1.15, p.z + Math.sin(base) * 0.9, h.color, 4, { speed: 3, life: 0.2, size: 0.25, grav: 0, dir: [Math.cos(base) * 4, Math.sin(base) * 4] });
  if (h.quota) { p.shots++; if (p.shots >= h.quota) { p.shots = 0; p.slowT = 2.5; floatText(p.x, p.z, 'Slow pool', 'warn', 3); } }
  p.frame !== 'special' && setFrame(p, 'attack'); p.frameT = 0.12;
}
function nearestEnemy(x, z, maxD, exclude) {
  let best = null, bd = maxD * maxD;
  for (const e of G.enemies) { if (!e.alive || (exclude && exclude.has(e))) continue; const d = (e.x - x) ** 2 + (e.z - z) ** 2; if (d < bd) { bd = d; best = e; } }
  return best;
}
function updatePlayerProj(dt) {
  for (const q of PPOOL) {
    if (!q.alive) continue;
    q.life -= dt; q.t += dt;
    if (q.home > 0) {
      const t = nearestEnemy(q.x, q.z, 9, q.hit);
      if (t) {
        const sp = Math.hypot(q.vx, q.vz); const want = Math.atan2(t.z - q.z, t.x - q.x), cur = Math.atan2(q.vz, q.vx);
        let da = want - cur; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const na = cur + clamp(da, -q.home * dt, q.home * dt); q.vx = Math.cos(na) * sp; q.vz = Math.sin(na) * sp;
      }
    }
    const nx = q.x + q.vx * dt, nz = q.z + q.vz * dt;
    if (solidAt(nx, nz)) {
      if (q.bounce > 0) {
        q.bounce--; if (solidAt(nx, q.z)) q.vx = -q.vx; if (solidAt(q.x, nz)) q.vz = -q.vz;
        particles.emit(q.x, q.y, q.z, q.color, 5, { speed: 3, life: 0.25, size: 0.2 });
      } else { q.life = 0; particles.emit(q.x, q.y, q.z, q.color, 7, { speed: 4, life: 0.3, size: 0.22 }); }
    } else { q.x = nx; q.z = nz; }
    // hit enemies
    if (q.life > 0) for (const e of G.enemies) {
      if (!e.alive || q.hit.has(e)) continue;
      const rr2 = e.r + q.sh * 0.35; if ((e.x - q.x) ** 2 + (e.z - q.z) ** 2 > rr2 * rr2) continue;
      q.hit.add(e);
      const [d, crit] = heroDamage(G.p, q.dmgMul, e);
      damageEnemy(e, d, crit, q.vx, q.vz);
      if (q.mark) e.mark = 4; if (q.slow) e.slow = 1.6;
      if (q.pierce-- <= 0) { q.life = 0; break; }
    }
    if (q.life <= 0) { q.alive = false; q.s.visible = false; continue; }
    q.s.position.set(q.x, q.y + (q.rot === 'bob' ? Math.sin(q.t * 12) * 0.12 : 0), q.z);
    const fade = Math.min(1, q.life / 0.08); q.mat.opacity = fade;
    if (q.rot === 'spin') q.mat.rotation += dt * 9 * (q.spin > 0 ? 1 : -1);
    else if (q.rot === 'face') q.mat.rotation = screenAngleFix(q.x, q.z, q.vx, q.vz) - q.artAngle;
    else if (q.rot === 'wobble') q.mat.rotation = Math.sin(q.t * 14) * 0.25;
    else if (q.rot === 'flip') { q.s.scale.x = q.vx < 0 ? -q.sw : q.sw; const g = 1 + (1 - q.life / q.max) * 0.5; q.s.scale.set((q.vx < 0 ? -1 : 1) * q.sw * g, q.sh * g, 1); }
    if (rand() < 0.35) particles.emit(q.x, q.y, q.z, q.color, 1, { speed: 0.6, life: 0.25, size: 0.18, grav: 0, lift: 0 });
  }
}

/* ---------- enemy bullets ---------- */
const EPOOL = [];
const eBulletMat = c => new THREE.SpriteMaterial({ map: TEX.glow, color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
function fireEnemyBullet(x, z, ang, speed, dmg, color = 0xff3df0, size = 0.9) {
  let b = EPOOL.find(b => !b.alive);
  if (!b) { const s = new THREE.Sprite(eBulletMat(color)); s.renderOrder = 7; scene.add(s); const core = new THREE.Sprite(eBulletMat(0xffffff)); core.scale.setScalar(0.35); s.add(core); b = { s, alive: false }; EPOOL.push(b); }
  b.alive = true; b.s.visible = true; b.s.material.color.set(color);
  b.x = x; b.z = z; b.vx = Math.cos(ang) * speed; b.vz = Math.sin(ang) * speed; b.dmg = dmg; b.life = 5; b.size = size;
  b.s.scale.setScalar(size); b.s.position.set(x, 1.05, z);
}
function updateEnemyBullets(dt) {
  const p = G.p;
  for (const b of EPOOL) {
    if (!b.alive) continue;
    b.life -= dt; b.x += b.vx * dt; b.z += b.vz * dt;
    if (solidAt(b.x, b.z) || b.life <= 0) { b.alive = false; b.s.visible = false; particles.emit(b.x, 1, b.z, b.s.material.color, 4, { speed: 2, life: 0.2 }); continue; }
    // shields / absorbers
    if (G.shield && Math.hypot(b.x - p.x, b.z - p.z) < 3.3) { b.alive = false; b.s.visible = false; particles.emit(b.x, 1, b.z, 0xffb050, 6, { speed: 3, life: 0.3 }); continue; }
    if (G.vortex && Math.hypot(b.x - G.vortex.x, b.z - G.vortex.z) < G.vortex.r) { b.alive = false; b.s.visible = false; particles.emit(b.x, 1, b.z, 0x8fa8ff, 4, { speed: 2, life: 0.3 }); continue; }
    if (Math.hypot(b.x - p.x, b.z - p.z) < p.r + b.size * 0.25) { b.alive = false; b.s.visible = false; hurtPlayer(b.dmg); continue; }
    b.s.position.set(b.x, 1.05, b.z);
  }
}

/* ---------- procedural enemy meshes ---------- */
const enemyGeo = {};
function eMat(color, emissive, ei = 1.2, opts = {}) {
  return new THREE.MeshStandardMaterial({ map: TEX.metal.map, roughnessMap: TEX.metal.roughnessMap, normalMap: TEX.metal.normalMap, color, emissive, emissiveIntensity: ei, metalness: opts.metal ?? 0.75, roughness: 1, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 });
}
function buildEnemyMesh(type, tier) {
  const root = new THREE.Group(); const mats = []; const parts = {};
  const M = (c, e, ei, o) => { const m = eMat(c, e, ei, o); mats.push(m); return m; };
  if (type === 'bug') {
    const shell = M(0x5a1820, 0x200004, 0.4);
    const body = new THREE.Mesh(enemyGeo.sphere, shell); body.scale.set(0.55, 0.38, 0.75); body.position.y = 0.5; root.add(body);
    const head = new THREE.Mesh(enemyGeo.sphere, shell); head.scale.set(0.32, 0.26, 0.3); head.position.set(0, 0.5, 0.72); root.add(head);
    const eye = M(0x000000, 0xff2a3a, 4, { metal: 0 });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(enemyGeo.sphere, eye); e.scale.setScalar(0.07); e.position.set(s * 0.13, 0.58, 0.95); root.add(e); }
    const stripe = M(0x111111, 0xff3344, 2.2, { metal: 0.2 });
    const st = new THREE.Mesh(enemyGeo.box, stripe); st.scale.set(0.06, 0.04, 1.1); st.position.set(0, 0.86, 0); root.add(st);
    parts.legs = [];
    const legMat = M(0x2a1a1a, 0x000000, 0);
    for (let i = 0; i < 6; i++) { const s = i < 3 ? -1 : 1, k = i % 3; const leg = new THREE.Mesh(enemyGeo.cyl, legMat); leg.scale.set(0.05, 0.55, 0.05); leg.position.set(s * 0.5, 0.28, (k - 1) * 0.38); leg.rotation.z = s * 0.9; root.add(leg); parts.legs.push(leg); }
  } else if (type === 'spam') {
    const m = M(0x2b2f3d, 0xff9a1f, 0.5);
    const b = new THREE.Mesh(enemyGeo.box, m); b.scale.setScalar(0.62); b.position.y = 0.55; root.add(b); parts.body = b;
    const face = M(0x000000, 0xffcc33, 3.5, { metal: 0 });
    const f = new THREE.Mesh(enemyGeo.box, face); f.scale.set(0.42, 0.18, 0.05); f.position.set(0, 0.6, 0.32); root.add(f);
    const ant = new THREE.Mesh(enemyGeo.cyl, m); ant.scale.set(0.03, 0.35, 0.03); ant.position.set(0, 1.02, 0); root.add(ant);
    const tip = new THREE.Mesh(enemyGeo.sphere, face); tip.scale.setScalar(0.07); tip.position.set(0, 1.2, 0); root.add(tip);
  } else if (type === 'ghost') {
    const m = M(0x7a4cff, 0x7a2cff, 1.1, { opacity: 0.78, metal: 0.1 });
    const b = new THREE.Mesh(enemyGeo.ico, m); b.scale.set(0.62, 0.72, 0.62); b.position.y = 1.2; root.add(b); parts.body = b;
    const eye = M(0x000000, 0xfff0ff, 5, { metal: 0 });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(enemyGeo.sphere, eye); e.scale.set(0.08, 0.14, 0.05); e.position.set(s * 0.2, 1.3, 0.55); root.add(e); }
    parts.frags = [];
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(enemyGeo.tet, m); f.scale.setScalar(0.18); root.add(f); parts.frags.push(f); }
  } else if (type === 'worm') {
    parts.segs = [];
    const m = M(0x163a2a, 0x10ff80, 0.55), band = M(0x061008, 0x40ff9a, 2.6, { metal: 0.2 });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(enemyGeo.sphere, i % 2 ? band : m); const sc = 0.48 - i * 0.05; s.scale.setScalar(sc); s.position.set(0, sc, -i * 0.45); root.add(s); parts.segs.push(s);
    }
    const jaw = M(0x000000, 0xb8ffd8, 4, { metal: 0 });
    const j = new THREE.Mesh(enemyGeo.cone, jaw); j.scale.set(0.25, 0.4, 0.25); j.rotation.x = Math.PI / 2; j.position.set(0, 0.48, 0.5); root.add(j);
  } else if (type === 'turret') {
    const m = M(0x3b3f4c, 0x000000, 0, { metal: 0.9 });
    const base = new THREE.Mesh(enemyGeo.hex, m); base.scale.set(0.85, 0.7, 0.85); base.position.y = 0.35; root.add(base);
    const ring = M(0x111111, 0xffb020, 2.6);
    const r = new THREE.Mesh(enemyGeo.torus, ring); r.rotation.x = Math.PI / 2; r.position.y = 1.15; root.add(r); parts.ring = r;
    const core = new THREE.Mesh(enemyGeo.oct, M(0x221100, 0xffc040, 3.2, { metal: 0.2 })); core.scale.setScalar(0.42); core.position.y = 1.55; root.add(core); parts.core = core;
  } else if (type === 'boss') {
    const hue = [0.92, 0.55, 0.12][(tier - 1) % 3];
    const c = new THREE.Color().setHSL(hue, 0.9, 0.55);
    const shell = M(0x1a1c26, 0x000000, 0, { metal: 0.95 });
    const core = M(0x000000, c, 1.5, { metal: 0 });
    const cs = new THREE.Mesh(enemyGeo.ico2, core); cs.scale.setScalar(1.25); cs.position.y = 2.4; root.add(cs); parts.core = cs;
    const cage = new THREE.Mesh(enemyGeo.ico, shell); cage.scale.setScalar(1.75); cage.position.y = 2.4; root.add(cage); parts.cage = cage;
    cage.material = shell.clone(); cage.material.wireframe = true; mats.push(cage.material); cage.material.emissive = c; cage.material.emissiveIntensity = 0.7;
    parts.rings = [];
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(enemyGeo.torusBig, M(0x111111, c, 1.1)); r.position.y = 2.4; r.scale.setScalar(1 + i * 0.28); root.add(r); parts.rings.push(r); }
    parts.orbs = [];
    for (let i = 0; i < 10; i++) { const o = new THREE.Mesh(enemyGeo.box, shell); o.scale.setScalar(0.38); root.add(o); parts.orbs.push(o); }
    const lt = new THREE.PointLight(c, 14, 16, 1.4); lt.position.y = 2.4; root.add(lt); parts.light = lt;
  }
  return { root, mats, parts };
}
function initEnemyGeo() {
  enemyGeo.sphere = new THREE.SphereGeometry(1, 18, 12);
  enemyGeo.box = new THREE.BoxGeometry(1, 1, 1);
  enemyGeo.cyl = new THREE.CylinderGeometry(1, 1, 1, 6);
  enemyGeo.ico = new THREE.IcosahedronGeometry(1, 1);
  enemyGeo.ico2 = new THREE.IcosahedronGeometry(1, 3);
  enemyGeo.tet = new THREE.TetrahedronGeometry(1);
  enemyGeo.cone = new THREE.ConeGeometry(1, 1, 6);
  enemyGeo.hex = new THREE.CylinderGeometry(1, 1.15, 1, 6);
  enemyGeo.torus = new THREE.TorusGeometry(0.7, 0.07, 8, 32);
  enemyGeo.torusBig = new THREE.TorusGeometry(2.3, 0.08, 8, 64);
  enemyGeo.oct = new THREE.OctahedronGeometry(1, 0);
}
function spawnEnemy(type, x, z, tier = 1) {
  const def = ENEMY_DEFS[type]; const f = G.floor;
  const { root, mats, parts } = buildEnemyMesh(type, tier);
  root.position.set(x, 0, z); scene.add(root);
  const hpScale = 1 + (f - 1) * 0.24;
  let hp = def.hp * hpScale; if (def.boss) hp = def.hp * (1 + (tier - 1) * 0.75);
  const e = {
    type, def, x, z, vx: 0, vz: 0, r: def.radius, hp, maxHp: hp, root, mats, parts, alive: true, t: rand() * 10, aggro: false,
    fireT: rr(0.5, 2), stateT: 0, state: 'idle', mark: 0, reveal: 0, slow: 0, confused: 0, flash: 0, knock: [0, 0], tier,
    touch: def.touch * (1 + (f - 1) * 0.1), shadow: makeShadow(def.radius * (def.boss ? 1.1 : 1)), facing: rand() * 6.28, dash: null, phase: 1, spiralA: 0, home: [x, z],
  };
  mats.forEach(m => m.userData.baseEI = m.emissiveIntensity);
  if (def.boss) { e.name = BOSS_NAMES[(tier - 1) % 3]; G.boss = e; }
  G.enemies.push(e); return e;
}
function damageEnemy(e, d, crit, kx = 0, kz = 0) {
  if (!e.alive) return;
  e.hp -= d; G.dmgDealt += d; e.flash = 0.09; e.aggro = true;
  if (!e.def.boss) { const l = Math.hypot(kx, kz) || 1; e.knock[0] += kx / l * 3.5; e.knock[1] += kz / l * 3.5; }
  floatText(e.x, e.z, Math.round(d) + (crit ? '!' : ''), crit ? 'crit' : '', e.def.boss ? 4.2 : 1.8);
  particles.emit(e.x, 1, e.z, G.p.hero.color, crit ? 10 : 5, { speed: 4, life: 0.3, size: 0.22 });
  AUDIO.sfx.hit();
  if (crit) G.hitstop = Math.max(G.hitstop, 0.035);
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.alive = false; G.kills++; G.score += e.def.score * (1 + G.floor * 0.2);
  const c = e.type === 'ghost' ? 0xb07aff : e.type === 'worm' ? 0x40ff9a : e.type === 'turret' ? 0xffb020 : e.type === 'spam' ? 0xffaa33 : e.type === 'boss' ? 0xffffff : 0xff3344;
  particles.emit(e.x, 0.9, e.z, c, e.def.boss ? 180 : 26, { speed: e.def.boss ? 14 : 7, life: e.def.boss ? 1.4 : 0.6, size: e.def.boss ? 0.5 : 0.3, up: 1.6 });
  AUDIO.sfx.kill(); G.shake = Math.max(G.shake, e.def.boss ? 1.2 : 0.18);
  if (e.def.boss) { AUDIO.sfx.boom(); G.hitstop = 0.25; G.boss = null; }
  scene.remove(e.root); scene.remove(e.shadow); e.mats.forEach(m => m.dispose());
  // drops
  const n = e.def.xp; for (let i = 0; i < Math.min(n, 8); i++) spawnShard(e.x + rr(-0.5, 0.5), e.z + rr(-0.5, 0.5), n / Math.min(n, 8));
  const chance = e.def.boss ? 1 : e.def.elite ? 0.35 : 0.07;
  if (rand() < chance) spawnPickup(e.x, e.z);
  if (e.def.boss) for (let i = 0; i < 3; i++) spawnPickup(e.x + rr(-2, 2), e.z + rr(-2, 2));
}

/* ---------- flow field for chasing around walls ---------- */
function updateFlow() {
  const p = G.p, tx = worldToTile(p.x), ty = worldToTile(p.z), id = ty * world.W + tx;
  if (id === G.flowTile && G.flow) return; G.flowTile = id;
  const W = world.W, H = world.H, dist = G.flow && G.flow.length === W * H ? G.flow : new Int16Array(W * H);
  dist.fill(-1); const qx = new Int16Array(W * H), qy = new Int16Array(W * H); let h = 0, t = 0;
  if (isWall(tx, ty)) { G.flow = dist; return; }
  dist[id] = 0; qx[t] = tx; qy[t++] = ty;
  while (h < t) {
    const x = qx[h], y = qy[h++], d = dist[y * W + x];
    if (d > 60) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = ny * W + nx; if (dist[ni] !== -1 || world.grid[ni]) continue; dist[ni] = d + 1; qx[t] = nx; qy[t++] = ny; }
  }
  G.flow = dist;
}
function flowDir(x, z) {
  const tx = worldToTile(x), ty = worldToTile(z), W = world.W; const f = G.flow; if (!f) return null;
  const here = f[ty * W + tx]; let best = null, bd = here < 0 ? 9999 : here;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const nx = tx + dx, ny = ty + dy; if (isWall(nx, ny)) continue;
    if (dx && dy && (isWall(tx + dx, ty) || isWall(tx, ty + dy))) continue;
    const v = f[ny * W + nx]; if (v >= 0 && v < bd) { bd = v; best = [dx, dy]; }
  }
  if (!best) return null;
  const cx = (tx + best[0] + 0.5) * TILE, cz = (ty + best[1] + 0.5) * TILE; const l = Math.hypot(cx - x, cz - z) || 1;
  return [(cx - x) / l, (cz - z) / l];
}

/* ---------- enemy AI ---------- */
function enemyTarget(e) {
  const decoys = G.summons.filter(s => s.kind === 'decoy' && s.alive);
  if (decoys.length) { let b = decoys[0], bd = 1e9; for (const d of decoys) { const dd = (d.x - e.x) ** 2 + (d.z - e.z) ** 2; if (dd < bd) { bd = dd; b = d; } } if (bd < 16 * 16) return b; }
  return G.p;
}
function updateEnemies(dt) {
  const p = G.p;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    e.t += dt; e.mark = Math.max(0, e.mark - dt); e.reveal = Math.max(0, e.reveal - dt); e.slow = Math.max(0, e.slow - dt); e.confused = Math.max(0, e.confused - dt);
    const tg = enemyTarget(e);
    const dx = tg.x - e.x, dz = tg.z - e.z, dist = Math.hypot(dx, dz);
    if (!e.aggro && dist < 15 && lineOfSight(e.x, e.z, p.x, p.z)) { e.aggro = true; if (e.def.boss) { AUDIO.sfx.boss(); AUDIO.startMusic(true); showBanner(e.name, 'Boss — floor ' + G.floor); } }
    let sp = e.def.speed * (e.slow > 0 ? 0.65 : 1); let mx = 0, mz = 0;
    const los = dist < 22 && lineOfSight(e.x, e.z, tg.x, tg.z);
    const chase = () => { if (los) { mx = dx / dist; mz = dz / dist; } else if (tg === p) { const f = flowDir(e.x, e.z); if (f) { mx = f[0]; mz = f[1]; } } };
    if (e.confused > 0) {
      e.facing += rr(-4, 4) * dt; mx = Math.cos(e.facing); mz = Math.sin(e.facing); sp *= 0.8;
      for (const o of G.enemies) if (o !== e && o.alive && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 < (o.r + e.r + 0.2) ** 2) { if (!o._ch || o._ch < G.time) { o._ch = G.time + 0.4; damageEnemy(o, heroDamage(p, 0.6, o)[0], false); } }
    } else if (!e.aggro) {
      mx = Math.cos(e.t * 0.6 + e.home[0]) * 0.25; mz = Math.sin(e.t * 0.5) * 0.25;
    } else switch (e.type) {
      case 'bug': case 'spam': chase(); break;
      case 'ghost': {
        if (dist > 8) chase(); else if (dist < 5.5) { mx = -dx / dist; mz = -dz / dist; } else { mx = -dz / dist * 0.7; mz = dx / dist * 0.7; }
        e.fireT -= dt; if (e.fireT <= 0 && los && dist < 13) { e.fireT = rr(1.8, 2.6); const a = Math.atan2(dz, dx); fireEnemyBullet(e.x, e.z, a, 7.5, 9 * (1 + (G.floor - 1) * 0.1), 0xc06bff); if (G.floor >= 4) { fireEnemyBullet(e.x, e.z, a + 0.25, 7.5, 7, 0xc06bff); fireEnemyBullet(e.x, e.z, a - 0.25, 7.5, 7, 0xc06bff); } AUDIO.sfx.eshot(); }
        break;
      }
      case 'worm': {
        if (e.state === 'wind') { e.stateT -= dt; mx = 0; mz = 0; if (e.stateT <= 0) { e.state = 'dash'; e.stateT = 0.45; const l = dist || 1; e.dash = [dx / l, dz / l]; } }
        else if (e.state === 'dash') { e.stateT -= dt; mx = e.dash[0]; mz = e.dash[1]; sp = 15; if (e.stateT <= 0) { e.state = 'idle'; e.fireT = rr(2.4, 3.6); } }
        else { chase(); e.fireT -= dt; if (e.fireT <= 0 && los && dist < 10) { e.state = 'wind'; e.stateT = 0.55; } }
        break;
      }
      case 'turret': {
        e.fireT -= dt;
        if (e.fireT <= 0 && los && dist < 16) {
          e.fireT = rr(1.8, 2.4); const a = Math.atan2(dz, dx), dmg = 8 * (1 + (G.floor - 1) * 0.1);
          if (rand() < (G.floor >= 3 ? 0.35 : 0.1)) for (let i = 0; i < 10; i++) fireEnemyBullet(e.x, e.z, i / 10 * 6.283, 6, dmg, 0xffb020);
          else for (let i = -1; i <= 1; i++) fireEnemyBullet(e.x, e.z, a + i * 0.18, 9, dmg, 0xffb020);
          AUDIO.sfx.eshot();
        }
        break;
      }
      case 'boss': bossAI(e, dt, dx, dz, dist, los); mx = e._mx || 0; mz = e._mz || 0; sp = e._sp ?? sp; break;
    }
    // separation
    if (e.type !== 'boss') for (const o of G.enemies) {
      if (o === e || !o.alive) continue; const ox = e.x - o.x, oz = e.z - o.z, d2 = ox * ox + oz * oz, min = e.r + o.r;
      if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2); mx += ox / d * 0.8; mz += oz / d * 0.8; }
    }
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    e.vx = lerp(e.vx, mx * sp, 1 - Math.exp(-dt * 8)); e.vz = lerp(e.vz, mz * sp, 1 - Math.exp(-dt * 8));
    const kd = Math.exp(-dt * 10); e.knock[0] *= kd; e.knock[1] *= kd;
    if (e.def.speed > 0) moveCircle(e, (e.vx + e.knock[0]) * dt, (e.vz + e.knock[1]) * dt, e.r);
    // vortex / gravity pulls
    for (const w of [G.vortex, G.well]) if (w && e.type !== 'turret') { const wx = w.x - e.x, wz = w.z - e.z, wd = Math.hypot(wx, wz); if (wd < w.r && wd > 0.4) moveCircle(e, wx / wd * w.pull * dt * (e.def.boss ? 0.15 : 1), wz / wd * w.pull * dt * (e.def.boss ? 0.15 : 1), e.r); }
    // touch damage
    if (e.touch > 0 && e.confused <= 0) {
      if (tg === p && dist < e.r + p.r + 0.1) hurtPlayer(e.touch);
      else if (tg !== p && dist < e.r + 1) { tg.hp -= e.touch * dt * 3; }
    }
    // visuals
    if (Math.hypot(e.vx, e.vz) > 0.3) e.facing = Math.atan2(e.vx, e.vz);
    e.root.position.set(e.x, 0, e.z);
    const ry = e.type === 'turret' || e.type === 'boss' ? 0 : e.facing;
    e.root.rotation.y = lerpAngle(e.root.rotation.y, ry, 1 - Math.exp(-dt * 12));
    animateEnemy(e, dt);
    e.shadow.position.set(e.x, 0.03, e.z);
    e.flash = Math.max(0, e.flash - dt);
    for (const m of e.mats) { m.emissiveIntensity = e.flash > 0 ? 6 : m.userData.baseEI * (e.confused > 0 ? 1.5 + Math.sin(G.time * 20) : 1) * (e.mark > 0 || e.reveal > 0 ? 1.4 : 1); if (e.flash > 0) m.emissive.offsetHSL(0, 0, 0); }
  }
  G.enemies = G.enemies.filter(e => e.alive);
}
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }
function animateEnemy(e, dt) {
  const P = e.parts, t = e.t;
  if (e.type === 'bug') P.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 16 + i * 2) * 0.5; });
  if (e.type === 'spam') { P.body.rotation.y = t * 3; e.root.position.y = Math.abs(Math.sin(t * 10)) * 0.25; }
  if (e.type === 'ghost') { P.body.position.y = 1.2 + Math.sin(t * 2.4) * 0.2; P.body.rotation.y = t; P.frags.forEach((f, i) => { const a = t * 1.8 + i * 1.57; f.position.set(Math.cos(a) * 0.95, 1.2 + Math.sin(a * 2) * 0.25, Math.sin(a) * 0.95); f.rotation.x = t * 3; }); }
  if (e.type === 'worm') P.segs.forEach((s, i) => { s.position.x = Math.sin(t * 9 - i * 0.9) * 0.22 * (e.state === 'wind' ? 2.5 : 1); });
  if (e.type === 'turret') { P.ring.rotation.z = t * 2.5; P.core.rotation.y = t * 1.5; P.core.position.y = 1.55 + Math.sin(t * 3) * 0.08; }
  if (e.type === 'boss') {
    const rage = e.phase; P.core.rotation.y = t * 0.6 * rage; P.cage.rotation.x = t * 0.3; P.cage.rotation.y = -t * 0.4;
    P.rings.forEach((r, i) => { r.rotation.x = t * (0.5 + i * 0.3) * rage + i; r.rotation.y = t * (0.3 + i * 0.2); });
    P.orbs.forEach((o, i) => { const a = t * 1.2 * rage + i * 0.628; o.position.set(Math.cos(a) * 3.4, 2.4 + Math.sin(a * 3) * 0.6, Math.sin(a) * 3.4); o.rotation.set(t * 2, t * 3, 0); });
    const s = 1.25 + Math.sin(t * 6) * 0.06 * rage; P.core.scale.setScalar(s);
  }
}
function bossAI(e, dt, dx, dz, dist, los) {
  const frac = e.hp / e.maxHp; const ph = frac < 0.33 ? 3 : frac < 0.66 ? 2 : 1;
  if (ph !== e.phase) { e.phase = ph; showBanner(e.name, ph === 3 ? 'Final phase' : 'Phase 2'); G.shake = 0.8; AUDIO.sfx.boss(); for (let i = 0; i < 2 + ph; i++) spawnEnemy('spam', e.x + rr(-3, 3), e.z + rr(-3, 3)); }
  const dmg = 10 * (1 + (e.tier - 1) * 0.3);
  e._mx = dist > 6 ? dx / dist : -dz / dist * 0.5; e._mz = dist > 6 ? dz / dist : dx / dist * 0.5; e._sp = 2.2 + ph * 0.5;
  e.fireT -= dt; e.stateT -= dt;
  if (e.state === 'spiral') {
    e._sp = 0.6; e.spiralA += dt * (2.2 + ph * 0.6);
    e.burstT = (e.burstT || 0) - dt;
    if (e.burstT <= 0) { e.burstT = ph === 3 ? 0.07 : 0.1; for (let k = 0; k < (ph === 3 ? 3 : 2); k++) fireEnemyBullet(e.x, e.z, e.spiralA + k * (6.283 / (ph === 3 ? 3 : 2)), 7, dmg * 0.8, 0xff4fd8, 1.0); AUDIO.sfx.eshot(); }
    if (e.stateT <= 0) { e.state = 'idle'; e.fireT = 1.2; }
  } else if (e.state === 'charge') {
    e._mx = e.dash[0]; e._mz = e.dash[1]; e._sp = 16;
    if (e.stateT <= 0) { e.state = 'idle'; e.fireT = 1; for (let i = 0; i < 16; i++) fireEnemyBullet(e.x, e.z, i / 16 * 6.283, 8, dmg, 0xffffff); G.shake = 0.6; AUDIO.sfx.boom(); }
  } else if (e.fireT <= 0) {
    const r = rand();
    if (ph >= 2 && r < 0.4) { e.state = 'spiral'; e.stateT = 2.6 + ph * 0.4; }
    else if (ph === 3 && r < 0.65) { e.state = 'charge'; e.stateT = 0.6; const l = dist || 1; e.dash = [dx / l, dz / l]; floatText(e.x, e.z, '!!', 'warn', 5); }
    else { const n = 12 + ph * 4, off = rand() * 6; for (let i = 0; i < n; i++) fireEnemyBullet(e.x, e.z, off + i / n * 6.283, 6 + ph, dmg, 0xff5577, 1.1); if (ph >= 2) setTimeout(() => { if (e.alive) for (let i = 0; i < n; i++) fireEnemyBullet(e.x, e.z, off + (i + 0.5) / n * 6.283, 6 + ph, dmg, 0xff5577, 1.1); }, 350); e.fireT = 1.9 - ph * 0.3; AUDIO.sfx.eshot(); }
  }
}

/* ---------- player damage ---------- */
function hurtPlayer(raw) {
  const p = G.p; if (p.inv > 0 || p.dashT > 0 || p.dead || G.mode !== 'play') return;
  if (G.shield) { particles.emit(p.x, 1, p.z, 0xffb050, 8, { speed: 3, life: 0.3 }); return; }
  const d = raw * (1 - p.st.def) * (p.hero.takenMul || 1);
  p.hp -= d; p.inv = 0.55; p.hurtFlash = 0.25; G.shake = Math.max(G.shake, 0.35);
  floatText(p.x, p.z, '-' + Math.round(d), 'hurt', 2.6); AUDIO.sfx.hurt();
  particles.emit(p.x, 1, p.z, 0xff2244, 14, { speed: 5, life: 0.4 });
  document.getElementById('hurt').classList.remove('on'); void document.getElementById('hurt').offsetWidth; document.getElementById('hurt').classList.add('on');
  if (p.hp <= 0) { p.hp = 0; playerDie(); }
}

/* ---------- FX sprites ---------- */
function spawnFx(tex, x, z, o = {}) {
  const ar = tex.image.width / tex.image.height;
  const m = spriteMat(tex, { additive: o.additive ?? true, color: o.color ?? 0xffffff });
  m.depthTest = false; const s = new THREE.Sprite(m); s.renderOrder = o.order ?? 8; scene.add(s);
  const f = { s, m, x, z, y: o.y ?? 1.2, t: 0, dur: o.dur ?? 0.8, size: o.size ?? 4, ar, grow: o.grow ?? 0.3, spin: o.spin ?? 0, follow: o.follow, rot: o.rot ?? 0, fadeIn: o.fadeIn ?? 0.08, pulse: o.pulse ?? 0, onEnd: o.onEnd, stretch: o.stretch };
  G.fx.push(f); updateFx(f, 0); return f;
}
function updateFx(f, dt) {
  f.t += dt; const k = f.t / f.dur;
  if (f.follow) { f.x = f.follow.x; f.z = f.follow.z; }
  const sc = f.size * (1 + f.grow * k) * (1 + Math.sin(f.t * 10) * f.pulse);
  if (f.stretch) f.s.scale.set(f.stretch[0], f.stretch[1], 1); else f.s.scale.set(sc * Math.sqrt(f.ar), sc / Math.sqrt(f.ar), 1);
  f.s.position.set(f.x, f.y, f.z);
  f.m.rotation = f.rot + f.spin * f.t;
  f.m.opacity = Math.min(1, f.t / f.fadeIn) * Math.min(1, (1 - k) * 3.5);
}
function updateFxAll(dt) {
  for (const f of G.fx) { updateFx(f, dt); if (f.t >= f.dur) { scene.remove(f.s); f.m.dispose(); f.dead = true; f.onEnd && f.onEnd(); } }
  G.fx = G.fx.filter(f => !f.dead);
}
const lineMatCache = {};
function zap(points, color) {
  const geo = new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x, 1.2, z)));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, linewidth: 2 });
  const l = new THREE.Line(geo, mat); scene.add(l); G.lines.push({ l, t: 0.3 });
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    for (let k = 0; k < 6; k++) { const t = k / 6; particles.emit(lerp(ax, bx, t), 1.2, lerp(az, bz, t), color, 1, { speed: 1, life: 0.35, size: 0.35, grav: 0, lift: 0 }); }
  }
}
function updateLines(dt) { for (const L of G.lines) { L.t -= dt; L.l.material.opacity = Math.max(0, L.t / 0.3); if (L.t <= 0) { scene.remove(L.l); L.l.geometry.dispose(); L.l.material.dispose(); } } G.lines = G.lines.filter(L => L.t > 0); }

/* ---------- summons ---------- */
function spawnSummon(kind, x, z, o = {}) {
  const h = G.p.hero, art = ART[o.art || h.id];
  const tex = o.tex || art.summon.tex;
  const m = spriteMat(tex, { color: o.tint ?? 0xffffff, opacity: o.opacity ?? 1 }); const s = new THREE.Sprite(m); s.center.set(0.5, 0.08); s.renderOrder = 5; scene.add(s);
  const H = o.height ?? 1.5; const imgW = tex.image.width, imgH = tex.image.height;
  const sm = { kind, x, z, s, m, life: o.life ?? 10, t: rand() * 5, fireT: rr(0.2, 0.6), h: H, w: H * imgW / imgH, y: o.y ?? 0, alive: true, hp: o.hp ?? 999, angle: o.angle ?? 0, shadow: o.noShadow ? null : makeShadow(0.4), tick: 0, r: 0.4 };
  G.summons.push(sm); return sm;
}
function updateSummons(dt) {
  const p = G.p;
  for (const s of G.summons) {
    s.t += dt; s.life -= dt; if (s.hp <= 0) s.life = 0;
    const tg = nearestEnemy(s.x, s.z, s.kind === 'clone' ? 14 : 11);
    if (s.kind === 'drone' || s.kind === 'agent') {
      let gx, gz;
      if (tg && s.kind === 'drone') { const a = s.t * 1.6 + s.angle; gx = tg.x + Math.cos(a) * 3; gz = tg.z + Math.sin(a) * 3; }
      else { const a = s.angle + s.t * 0.4; gx = p.x + Math.cos(a) * 2.4; gz = p.z + Math.sin(a) * 2.4; }
      const sp = s.kind === 'drone' ? 9 : 6.5; const dx = gx - s.x, dz = gz - s.z, d = Math.hypot(dx, dz);
      if (d > 0.1) { const st = Math.min(d, sp * dt); if (s.kind === 'drone') { s.x += dx / d * st; s.z += dz / d * st; } else moveCircle(s, dx / d * st, dz / d * st, 0.35); }
      s.fireT -= dt;
      if (tg && s.fireT <= 0 && lineOfSight(s.x, s.z, tg.x, tg.z)) {
        s.fireT = s.kind === 'drone' ? 0.75 : 0.85;
        const a = Math.atan2(tg.z - s.z, tg.x - s.x);
        firePlayerProj(p, a, { x: s.x, z: s.z, dmg: s.kind === 'drone' ? 0.85 : 0.75, size: 0.75, home: 5, life: 1.2, speed: 15, pierce: 0 });
      }
      if (s.kind === 'drone') s.y = 1.0 + Math.sin(s.t * 5) * 0.15;
    } else if (s.kind === 'clone') {
      const dx = tg ? tg.x - s.x : p.x - s.x, dz = tg ? tg.z - s.z : p.z - s.z, d = Math.hypot(dx, dz) || 1;
      if (d > (tg ? 1.2 : 2.5)) moveCircle(s, dx / d * 8.5 * dt, dz / d * 8.5 * dt, 0.4);
      s.fireT -= dt; s.facing = dx < 0 ? -1 : 1;
      if (tg && d < 2.2 && s.fireT <= 0) {
        s.fireT = 0.42;
        for (const e of G.enemies) if (e.alive && Math.hypot(e.x - s.x, e.z - s.z) < 2.3) damageEnemy(e, heroDamage(p, 1.3, e)[0], false, e.x - s.x, e.z - s.z);
        spawnFx(ART.openclaw.proj.tex, s.x + dx / d, s.z + dz / d, { size: 2.2, dur: 0.25, rot: screenAngleFix(s.x, s.z, dx, dz) });
        s.atk = 0.18;
      }
      s.atk = Math.max(0, (s.atk || 0) - dt);
      const want = s.atk > 0 ? ART.openclaw.attack.tex : (Math.floor(s.t * 8) % 2 ? ART.openclaw.move.tex : ART.openclaw.idle.tex);
      if (s.m.map !== want) { s.m.map = want; s.m.needsUpdate = true; }
    } else if (s.kind === 'orbit') {
      s.angle += dt * 3.4; s.x = p.x + Math.cos(s.angle) * 2.4; s.z = p.z + Math.sin(s.angle) * 2.4; s.y = 0.8 + Math.sin(s.t * 4) * 0.15;
      s.tick -= dt;
      if (s.tick <= 0) { s.tick = 0.18; for (const e of G.enemies) if (e.alive && Math.hypot(e.x - s.x, e.z - s.z) < e.r + 0.7) damageEnemy(e, heroDamage(p, 0.55 * p.st.pow, e)[0], false, e.x - p.x, e.z - p.z); }
      if (rand() < 0.5) particles.emit(s.x, s.y + 0.4, s.z, 0x2fe0b0, 1, { speed: 0.5, life: 0.3, grav: 0, lift: 0 });
    } else if (s.kind === 'decoy') {
      s.y = 0.2 + Math.sin(s.t * 3) * 0.15;
      if (s.life <= 0.01 && !s.burst) {
        s.burst = true;
        for (const e of G.enemies) if (e.alive && Math.hypot(e.x - s.x, e.z - s.z) < 3.4) damageEnemy(e, heroDamage(p, 2.2 * p.st.pow, e)[0], false, e.x - s.x, e.z - s.z);
        particles.emit(s.x, 1, s.z, 0xc084ff, 30, { speed: 7, life: 0.6 }); AUDIO.sfx.boom();
      }
    }
    // sprite
    const fl = s.kind === 'clone' ? (s.facing || 1) : 1;
    s.s.scale.set(s.w * fl, s.h, 1); s.s.position.set(s.x, s.y + (s.kind === 'agent' ? Math.abs(Math.sin(s.t * 8)) * 0.08 : 0), s.z);
    s.m.opacity = Math.min(1, s.life * 2) * (s.kind === 'clone' ? 0.85 : 1);
    if (s.shadow) s.shadow.position.set(s.x, 0.03, s.z);
    if (s.life <= 0) { s.alive = false; scene.remove(s.s); s.m.dispose(); if (s.shadow) scene.remove(s.shadow); particles.emit(s.x, 1, s.z, G.p.hero.color, 10, { speed: 3, life: 0.4 }); }
  }
  G.summons = G.summons.filter(s => s.alive);
}

/* ---------- specials ---------- */
function aimPoint(p, maxD) {
  let d = maxD;
  if (!IS_TOUCH && input.mouseIn) { raycaster.setFromCamera(new THREE.Vector2(input.mouseX, input.mouseY), camera); const hit = raycaster.ray.intersectPlane(groundPlane, tmpV); if (hit) d = Math.min(maxD, Math.hypot(hit.x - p.x, hit.z - p.z)); }
  else { const t = nearestEnemy(p.x, p.z, maxD); if (t) d = Math.hypot(t.x - p.x, t.z - p.z); }
  // stop at walls
  let x = p.x, z = p.z; const steps = Math.ceil(d / 0.5);
  for (let i = 1; i <= steps; i++) { const nx = p.x + p.aimX * d * i / steps, nz = p.z + p.aimZ * d * i / steps; if (solidAt(nx, nz)) break; x = nx; z = nz; }
  return [x, z];
}
function useSpecial(p) {
  const h = p.hero, sp = h.special, art = ART[h.id], pow = p.st.pow;
  if (p.spT > 0 || p.rooted > 0) return;
  p.spT = sp.cd * cdMul(p); p.spMax = p.spT;
  setFrame(p, 'special'); p.frameT = 0.65;
  AUDIO.sfx.special(); G.shake = Math.max(G.shake, 0.3);
  const fx = art.fx.tex;
  switch (sp.kind) {
    case 'chain': {
      spawnFx(fx, p.x, p.z, { size: 5.5, dur: 0.6, grow: 0.25, follow: p });
      const hit = new Set(); let cur = { x: p.x, z: p.z }; const pts = [[p.x, p.z]];
      for (let i = 0; i < 5; i++) { const t = nearestEnemy(cur.x, cur.z, i === 0 ? 11 : 7, hit); if (!t) break; hit.add(t); pts.push([t.x, t.z]); damageEnemy(t, heroDamage(p, 3.2 * pow, t)[0], true, t.x - cur.x, t.z - cur.z); cur = t; }
      if (pts.length > 1) zap(pts, 0x6fd0ff);
      p.buffs.homing = 2.5; break;
    }
    case 'swarm': {
      p.rooted = 0.9; spawnFx(fx, p.x, p.z, { size: 4.8, dur: 0.95, grow: 0.2, follow: p });
      p.castFn = () => { for (let i = 0; i < 4; i++) spawnSummon('drone', p.x + rr(-1, 1), p.z + rr(-1, 1), { life: 12, height: 1.2, angle: i * 1.57, y: 1 }); particles.emit(p.x, 1.2, p.z, 0xffb636, 30, { speed: 6, life: 0.5 }); };
      p.castT = 0.9; break;
    }
    case 'planner': {
      const [x, z] = aimPoint(p, 10);
      spawnFx(fx, x, z, { size: 6, dur: 0.75, grow: 0.15, y: 0.8, onEnd: null });
      setTimeout(() => {
        if (G.mode !== 'play') return;
        for (const e of G.enemies) if (e.alive && Math.hypot(e.x - x, e.z - z) < 4.8) damageEnemy(e, heroDamage(p, 4 * pow, e)[0], false, e.x - x, e.z - z);
        particles.emit(x, 1, z, 0xff3b4a, 60, { speed: 10, life: 0.6, size: 0.35 }); G.shake = 0.6; AUDIO.sfx.boom();
        spawnFx(TEX.ring, x, z, { size: 9, dur: 0.35, grow: 0.6, y: 0.6, color: 0xff4455 });
      }, 380);
      p.dashCd = 0; break;
    }
    case 'vortex': {
      const v = { x: p.x, z: p.z, r: 6, pull: 4.5, t: 4.5, tick: 0 }; G.vortex = v;
      spawnFx(fx, p.x, p.z, { size: 11, dur: 4.5, grow: 0.1, spin: -2.4, follow: p, y: 0.8, fadeIn: 0.3, order: 4 });
      break;
    }
    case 'orchestrate': {
      spawnFx(fx, p.x, p.z, { size: 4.6, dur: 0.8, grow: 0.25, follow: p });
      const n = 3; for (let i = 0; i < n; i++) spawnSummon('agent', p.x + Math.cos(i * 2.1) * 1.5, p.z + Math.sin(i * 2.1) * 1.5, { life: 14, height: 1.4, angle: i * 2.1 });
      const ag = G.summons.filter(s => s.kind === 'agent'); while (ag.length > 6) ag.shift().life = 0;
      break;
    }
    case 'bilingual': {
      p.glm = p.glm === 'zh' ? 'en' : 'zh';
      spawnFx(fx, p.x, p.z, { size: 5.5, dur: 0.6, grow: 0.4, follow: p });
      for (let i = 0; i < 14; i++) firePlayerProj(p, i / 14 * 6.283, { dmg: 1.2 * pow, pierce: 1, life: 0.9 });
      floatText(p.x, p.z, p.glm === 'zh' ? '中 mode' : 'EN mode', 'info', 3.2); break;
    }
    case 'citation': {
      spawnFx(fx, p.x, p.z, { size: 5, dur: 1.1, grow: 0.3, spin: 1.2, follow: p });
      p.buffs.citation = 6;
      for (const e of G.enemies) if (e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 13) { e.mark = 8; zap([[p.x, p.z], [e.x, e.z]], 0x2ec8ff); }
      break;
    }
    case 'fork': {
      spawnFx(fx, p.x, p.z, { size: 5.5, dur: 0.7, grow: 0.2 });
      spawnSummon('clone', p.x - p.aimX, p.z - p.aimZ, { life: 10, height: 2.2, tex: ART.openclaw.idle.tex, tint: 0xff8a80 });
      break;
    }
    case 'gravity': {
      const [x, z] = aimPoint(p, 11);
      const w = { x, z, r: 6.5, pull: 7, t: 3, tick: 0 }; G.well = w;
      spawnFx(fx, x, z, { size: 6, dur: 3, grow: 0.15, spin: 3, y: 0.9, fadeIn: 0.2, order: 4,
        onEnd: () => { if (G.mode !== 'play') return; for (const e of G.enemies) if (e.alive && Math.hypot(e.x - x, e.z - z) < 4) damageEnemy(e, heroDamage(p, 3.2 * pow, e)[0], false); particles.emit(x, 1, z, 0xa070ff, 70, { speed: 11, life: 0.7, size: 0.35 }); G.shake = 0.7; AUDIO.sfx.boom(); } });
      break;
    }
    case 'hottake': {
      spawnFx(fx, p.x, p.z, { size: 6, dur: 0.7, grow: 0.9 });
      for (const e of G.enemies) if (e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 6.5) { e.confused = 3.5; damageEnemy(e, heroDamage(p, 2.4 * pow, e)[0], false, e.x - p.x, e.z - p.z); if (e.alive) floatText(e.x, e.z, '?!', 'info', 2.6); }
      G.shake = 0.6; break;
    }
    case 'orbit': {
      spawnFx(fx, p.x, p.z, { size: 5, dur: 0.7, grow: 0.3, follow: p });
      for (let i = 0; i < 6; i++) spawnSummon('orbit', p.x, p.z, { life: 8, height: 0.9, angle: i * 1.047, tex: art.proj.tex, noShadow: true });
      p.healOver = { t: 8, amt: p.maxHp * 0.2 }; break;
    }
    case 'shield': {
      G.shield = { t: 5 };
      spawnFx(fx, p.x, p.z, { size: 7.5, dur: 5, grow: 0.03, follow: p, y: 0.6, fadeIn: 0.25, pulse: 0.02, order: 4 });
      p.healOver = { t: 2.5, amt: p.maxHp * 0.25 };
      for (const e of G.enemies) if (e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 16) e.reveal = 8;
      break;
    }
    case 'beam': {
      const a = Math.atan2(p.aimZ, p.aimX), L = 18, dx = Math.cos(a), dz = Math.sin(a);
      let len = L; for (let s = 0.5; s < L; s += 0.5) if (solidAt(p.x + dx * s, p.z + dz * s)) { len = s; break; }
      const mx = p.x + dx * len / 2, mz = p.z + dz * len / 2;
      tmpV.set(p.x, 1.2, p.z).project(camera); tmpV2.set(p.x + dx * len, 1.2, p.z + dz * len).project(camera);
      const screenLen = Math.hypot((tmpV2.x - tmpV.x) * camera.aspect, tmpV2.y - tmpV.y); const worldPerNdc = len / Math.max(0.01, screenLen);
      const f = spawnFx(fx, mx, mz, { dur: 0.55, rot: screenAngleFix(p.x, p.z, dx, dz), stretch: [screenLen * worldPerNdc * 1.05, 2.4 * 1.0] });
      for (const e of G.enemies) if (e.alive) { const ex = e.x - p.x, ez = e.z - p.z, proj = ex * dx + ez * dz; if (proj < 0 || proj > len) continue; const perp = Math.abs(ex * dz - ez * dx); if (perp < 1.1 + e.r) damageEnemy(e, heroDamage(p, 5 * pow, e)[0], true, dx, dz); }
      G.shake = 0.7; break;
    }
    case 'decoy': {
      const [x, z] = aimPoint(p, 9);
      spawnFx(fx, x, z, { size: 6, dur: 0.8, grow: 0.3 });
      for (let i = 0; i < 3; i++) { const a = i * 2.094; spawnSummon('decoy', x + Math.cos(a) * 1.8, z + Math.sin(a) * 1.8, { life: 6, height: 1.6, tex: ART.meta.icon_special.tex }); }
      break;
    }
  }
}
function updateSpecialAreas(dt) {
  const p = G.p;
  if (G.vortex) {
    const v = G.vortex; v.t -= dt; v.x = p.x; v.z = p.z; v.tick -= dt;
    if (v.tick <= 0) { v.tick = 0.25; for (const e of G.enemies) if (e.alive && Math.hypot(e.x - v.x, e.z - v.z) < v.r) damageEnemy(e, heroDamage(p, 0.65 * p.st.pow, e)[0], false); }
    if (v.t <= 0) G.vortex = null;
  }
  if (G.well) {
    const w = G.well; w.t -= dt; w.tick -= dt;
    if (w.tick <= 0) { w.tick = 0.3; for (const e of G.enemies) if (e.alive && Math.hypot(e.x - w.x, e.z - w.z) < w.r) { damageEnemy(e, heroDamage(p, 0.4 * p.st.pow, e)[0], false); e.slow = 1; } }
    if (w.t <= 0) G.well = null;
  }
  if (G.shield) { G.shield.t -= dt; if (G.shield.t <= 0) G.shield = null; }
}

/* ---------- pickups & xp ---------- */
let shardGeo, shardMat;
function spawnShard(x, z, val) {
  if (!shardGeo) { shardGeo = new THREE.OctahedronGeometry(0.16, 0); shardMat = new THREE.MeshStandardMaterial({ color: 0x9ff7ff, emissive: 0x38e8ff, emissiveIntensity: 2.6, metalness: 0.2, roughness: 0.2 }); }
  const m = new THREE.Mesh(shardGeo, shardMat); m.position.set(x, 0.4, z); scene.add(m);
  const a = rand() * 6.28; G.shards.push({ m, x, z, val, vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, t: 0 });
}
function spawnPickup(x, z) {
  const h = G.p.hero; const k = Math.floor(rand() * 4);
  const tex = ART[h.id]['item' + k].tex;
  const s = new THREE.Sprite(spriteMat(tex)); s.renderOrder = 5; const ar = tex.image.width / tex.image.height; s.scale.set(1.1 * Math.sqrt(ar), 1.1 / Math.sqrt(ar), 1); scene.add(s);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: h.color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.05, z); scene.add(ring);
  const trap = h.trapChance && rand() < h.trapChance;
  G.pickups.push({ s, ring, x, z, k, t: rand() * 6, trap, life: 25 });
}
function updatePickups(dt) {
  const p = G.p, mag = 3.2 * (p.hero.magnet || 1) * p.mods.magnet;
  for (const s of G.shards) {
    s.t += dt; const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz);
    if (d < mag || s.t > 9) { const sp = 14 + s.t * 4; s.x += dx / d * sp * dt; s.z += dz / d * sp * dt; }
    else { s.vx *= Math.exp(-dt * 4); s.vz *= Math.exp(-dt * 4); s.x += s.vx * dt; s.z += s.vz * dt; }
    s.m.position.set(s.x, 0.45 + Math.sin(s.t * 5) * 0.1, s.z); s.m.rotation.y += dt * 4;
    if (d < 0.7) { s.dead = true; scene.remove(s.m); gainXP(s.val); AUDIO.sfx.xp(); }
  }
  G.shards = G.shards.filter(s => !s.dead);
  for (const it of G.pickups) {
    it.t += dt; it.life -= dt;
    it.s.position.set(it.x, 1 + Math.sin(it.t * 3) * 0.15, it.z); it.ring.scale.setScalar(1 + Math.sin(it.t * 4) * 0.1);
    it.s.material.opacity = it.life < 4 ? (Math.sin(it.t * 18) > 0 ? 1 : 0.3) : 1;
    const d = Math.hypot(p.x - it.x, p.z - it.z);
    if (d < 1.1 || it.life <= 0) {
      it.dead = true; scene.remove(it.s); scene.remove(it.ring);
      if (it.life <= 0) continue;
      if (it.trap) { floatText(p.x, p.z, 'Malicious skill!', 'hurt', 3.2); p.inv = 0; hurtPlayer(14 + G.floor * 2); particles.emit(it.x, 1, it.z, 0xff0000, 20, { speed: 6, life: 0.5 }); continue; }
      applyItem(p, it.k); particles.emit(it.x, 1, it.z, p.hero.color, 24, { speed: 6, life: 0.5 });
    }
  }
  G.pickups = G.pickups.filter(i => !i.dead);
}
function applyItem(p, k) {
  const ik = ITEM_KINDS[k]; AUDIO.sfx.pickup(); floatText(p.x, p.z, ik.label, 'info', 3.2);
  if (ik.key === 'heal') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3);
  if (ik.key === 'power') p.buffs.power = 8;
  if (ik.key === 'haste') p.buffs.haste = 8;
  if (ik.key === 'charge') p.spT = 0;
  toast(`<img src="${artURL(p.hero.id, 'item' + k)}" alt=""><b>${ik.label}</b><span>${ik.sub}</span>`);
}
function gainXP(v) {
  const p = G.p; p.xp += v;
  while (p.xp >= p.xpNext) { p.xp -= p.xpNext; p.level++; p.xpNext = Math.round(12 * Math.pow(1.28, p.level - 1)) + 4; G.pendingLevels = (G.pendingLevels || 0) + 1; }
}

/* ---------- floors ---------- */
function clearEntities() {
  for (const e of G.enemies) { scene.remove(e.root); scene.remove(e.shadow); }
  for (const s of G.summons) { scene.remove(s.s); if (s.shadow) scene.remove(s.shadow); }
  for (const f of G.fx) scene.remove(f.s);
  for (const s of G.shards) scene.remove(s.m);
  for (const i of G.pickups) { scene.remove(i.s); scene.remove(i.ring); }
  for (const L of G.lines) scene.remove(L.l);
  PPOOL.forEach(q => { q.alive = false; q.s.visible = false; }); EPOOL.forEach(b => { b.alive = false; b.s.visible = false; });
  G.enemies = []; G.summons = []; G.fx = []; G.shards = []; G.pickups = []; G.lines = []; G.vortex = G.well = G.shield = null; G.boss = null;
  particles.clear();
}
function startFloor(n) {
  clearEntities(); G.floor = n; G.flow = null; G.flowTile = -1; G.portalOpen = false;
  const isBoss = n % 3 === 0;
  buildWorld(n, isBoss, G.p.hero.color);
  const [sx, sz] = roomCenter(world.start); G.p.x = sx; G.p.z = sz;
  camState.x = sx; camState.z = sz;
  const tier = n / 3;
  const mix = n === 1 ? ['bug', 'bug', 'spam', 'spam', 'bug', 'ghost'] : n === 2 ? ['bug', 'spam', 'ghost', 'worm', 'bug', 'spam', 'turret'] : ['bug', 'spam', 'ghost', 'worm', 'turret', 'ghost', 'worm', 'spam'];
  if (isBoss) {
    const [bx, bz] = roomCenter(world.bossRoom); spawnEnemy('boss', bx + 4, bz, tier);
    const r = world.bossRoom;
    for (const [tx, ty] of [[r.x + 4, r.y + 4], [r.x + r.w - 5, r.y + r.h - 5]]) if (!isWall(tx, ty)) spawnEnemy('turret', (tx + 0.5) * TILE, (ty + 0.5) * TILE);
    world.exit = world.bossRoom; world.portal.x = bx; world.portal.z = bz; world.portal.grp.position.set(bx, 0, bz);
  } else {
    const count = 16 + n * 5; let placed = 0, guard = 0;
    const rooms = world.rooms.slice(1);
    while (placed < count && guard++ < 2000) {
      const r = rooms[Math.floor(rand() * rooms.length)];
      const tx = r.x + 1 + Math.floor(rand() * (r.w - 2)), ty = r.y + 1 + Math.floor(rand() * (r.h - 2));
      if (isWall(tx, ty)) continue;
      const type = mix[Math.floor(rand() * mix.length)];
      if (type === 'spam') { for (let k = 0; k < 3; k++) spawnEnemy('spam', (tx + 0.5) * TILE + rr(-0.8, 0.8), (ty + 0.5) * TILE + rr(-0.8, 0.8)); placed += 2; }
      else spawnEnemy(type, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
      placed++;
    }
  }
  G.totalOnFloor = G.enemies.length;
  showBanner(isBoss ? 'Boss Floor ' + n : 'Floor ' + n, isBoss ? 'A ' + BOSS_NAMES[(tier - 1) % 3] + ' waits below' : n === 1 ? 'Clear the stack. Find the portal.' : 'Deeper in the stack');
  AUDIO.startMusic(false);
  updateFlow();
}
function openPortal() {
  G.portalOpen = true; world.portal.active = true; world.portal.grp.visible = true; AUDIO.sfx.portal();
  showBanner('Portal open', G.floor >= FLOORS ? 'The stack is clear' : 'Find the glowing ring');
}

/* ---------- camera ---------- */
const camState = { x: 0, z: 0, ox: 0, oz: 0 };
function updateCamera(dt) {
  const p = G.p; const portrait = window.innerWidth < window.innerHeight;
  const look = 1.6; const tx = p.x + p.aimX * look, tz = p.z + p.aimZ * look;
  camState.x = lerp(camState.x, tx, 1 - Math.exp(-dt * 6)); camState.z = lerp(camState.z, tz, 1 - Math.exp(-dt * 6));
  const H = portrait ? 17 : 20, B = portrait ? 7.5 : 10;
  const sh = G.shake * 0.5; const sx = (rand() - 0.5) * sh, sz = (rand() - 0.5) * sh;
  camera.position.set(camState.x + sx, H, camState.z + B + sz);
  camera.lookAt(camState.x + sx * 0.5, 0, camState.z + sz * 0.5);
  G.shake = Math.max(0, G.shake - dt * 2.2);
}

/* ---------- player update ---------- */
function updatePlayer(dt) {
  const p = G.p, h = p.hero;
  // aim
  if (IS_TOUCH) {
    if (input.stickAimOn && Math.hypot(...input.stickAim) > 0.25) { const l = Math.hypot(...input.stickAim); p.aimX = input.stickAim[0] / l; p.aimZ = input.stickAim[1] / l; }
    else { const t = nearestEnemy(p.x, p.z, 14); if (t && lineOfSight(p.x, p.z, t.x, t.z)) { const dx = t.x - p.x, dz = t.z - p.z, l = Math.hypot(dx, dz) || 1; p.aimX = dx / l; p.aimZ = dz / l; } else if (Math.hypot(...input.stickMove) > 0.2) { const l = Math.hypot(...input.stickMove); p.aimX = input.stickMove[0] / l; p.aimZ = input.stickMove[1] / l; } }
  } else if (input.mouseIn) {
    raycaster.setFromCamera(new THREE.Vector2(input.mouseX, input.mouseY), camera);
    const hit = raycaster.ray.intersectPlane(groundPlane, tmpV);
    if (hit) { const dx = hit.x - p.x, dz = hit.z - p.z, l = Math.hypot(dx, dz); if (l > 0.2) { p.aimX = dx / l; p.aimZ = dz / l; } }
  }
  // move
  let mx = input.right - input.left, mz = input.down - input.up;
  if (IS_TOUCH) { mx = input.stickMove[0]; mz = input.stickMove[1]; }
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  let spd = p.st.spd * p.mods.spd * (p.buffs.citation > 0 ? 1.2 : 1);
  if (p.rooted > 0) { spd = 0; p.rooted -= dt; }
  p.dashCd = Math.max(0, p.dashCd - dt);
  if (input.dash && p.dashCd <= 0 && p.rooted <= 0) {
    input.dash = false; const dx = ml > 0.1 ? mx : p.aimX, dz = ml > 0.1 ? mz : p.aimZ, l = Math.hypot(dx, dz) || 1;
    p.dashDir = [dx / l, dz / l]; p.dashT = 0.17 * (h.dashMul || 1); p.dashCd = 1.1 / (h.dashMul || 1) * (h.cdMul || 1); AUDIO.sfx.dash();
  }
  input.dash = false;
  if (p.dashT > 0) {
    p.dashT -= dt; const ds = p.st.spd * 3.6;
    p.vx = p.dashDir[0] * ds; p.vz = p.dashDir[1] * ds;
    particles.emit(p.x, 0.8, p.z, h.color, 3, { speed: 1, life: 0.35, size: 0.4, grav: 0 });
  } else {
    p.vx = lerp(p.vx, mx * spd, 1 - Math.exp(-dt * 14)); p.vz = lerp(p.vz, mz * spd, 1 - Math.exp(-dt * 14));
  }
  moveCircle(p, p.vx * dt, p.vz * dt, p.r);
  // timers
  p.inv = Math.max(0, p.inv - dt); p.spT = Math.max(0, p.spT - dt); p.slowT = Math.max(0, p.slowT - dt);
  for (const k in p.buffs) p.buffs[k] = Math.max(0, p.buffs[k] - dt);
  if (p.castT > 0) { p.castT -= dt; if (p.castT <= 0 && p.castFn) { p.castFn(); p.castFn = null; } }
  const regen = (h.regen || 0) + p.mods.regen; if (regen > 0) p.hp = Math.min(p.maxHp, p.hp + regen * dt);
  if (p.healOver) { const r = p.healOver.amt / Math.max(0.1, p.healOver.t) * dt; p.hp = Math.min(p.maxHp, p.hp + r); p.healOver.amt -= r; p.healOver.t -= dt; if (p.healOver.t <= 0) p.healOver = null; }
  // fire
  const wantFire = IS_TOUCH ? (input.stickAimOn ? Math.hypot(...input.stickAim) > 0.25 : !!nearestEnemy(p.x, p.z, 14)) : (input.fire || input.autoFire);
  p.fireT -= dt;
  if (wantFire && p.fireT <= 0 && p.rooted <= 0 && p.dashT <= 0) {
    let rate = h.weapon.rate * p.mods.rate * (p.buffs.haste > 0 ? 1.5 : 1) * (p.buffs.citation > 0 ? 1.25 : 1) * (p.slowT > 0 ? 0.5 : 1);
    p.fireT = 1 / rate; playerShoot(p);
  }
  if (input.special) { input.special = false; useSpecial(p); }
  // sprite
  p.frameT -= dt; const moving = Math.hypot(p.vx, p.vz) > 0.6;
  if (p.frameT <= 0) {
    if (moving) { p.walkT += dt * Math.hypot(p.vx, p.vz) * 0.9; setFrame(p, Math.floor(p.walkT) % 2 ? 'move' : 'idle'); }
    else setFrame(p, 'idle');
  }
  if (p.aimX < -0.15) p.facing = -1; else if (p.aimX > 0.15) p.facing = 1;
  const bob = moving ? Math.abs(Math.sin(p.walkT * Math.PI)) * 0.12 : Math.sin(G.time * 2.5) * 0.04;
  const squash = 1 + (moving ? Math.sin(p.walkT * Math.PI * 2) * 0.03 : Math.sin(G.time * 2.5) * 0.015);
  p.sprite.scale.set(p.baseW * p.facing / squash, p.baseH * squash, 1);
  p.sprite.position.set(p.x, bob, p.z);
  p.mat.color.setScalar(1); if (p.hurtFlash > 0) { p.hurtFlash -= dt; p.mat.color.setRGB(1, 0.45, 0.45); }
  p.mat.opacity = p.inv > 0 && Math.floor(G.time * 20) % 2 ? 0.55 : p.dashT > 0 ? 0.7 : 1;
  p.light.position.set(p.x, 2.4, p.z); p.light.intensity = 30 + (p.buffs.power > 0 ? 18 : 0);
  p.shadow.position.set(p.x, 0.03, p.z);
  // portal
  if (G.portalOpen && Math.hypot(p.x - world.portal.x, p.z - world.portal.z) < 1.7) nextFloor();
}
