/* ------------------------------------------------------------------
   ACTORS: 8-direction animated agent sprites, the shared 7-move kit,
   atlas-driven FX, projectiles, statuses, summons
------------------------------------------------------------------- */
const G = {
  mode: 'title', hero: null, p: null, floor: 1, time: 0, enemies: [], corpses: [], runSeed: 0, sector: null, summons: [], fx: [], pickups: [], shards: [], lines: [], delayed: [], telegraphs: [], hazards: [],
  kills: 0, score: 0, dmgDealt: 0, runTime: 0, hitstop: 0, shake: 0, flow: null, flowTile: -1, portalOpen: false, paused: false, bosses: [], rival: null,
  stage: 'wings', secretsFound: 0, settings: { shake: true, autofire: false },
};
const input = { up: 0, down: 0, left: 0, right: 0, fire: false, aimX: 1, aimZ: 0, mouseX: 0, mouseY: 0, mouseIn: false, dash: false, stickMove: [0, 0], stickAim: [0, 0], stickAimOn: false, autoFire: false, moves: {}, interact: false };
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.1);
const raycaster = new THREE.Raycaster();
const SPR_SCALE = 3.5;              // world units per agent atlas cell
function after(t, fn) { G.delayed.push({ t, fn }); }
function updateDelayed(dt) { for (const d of G.delayed) { d.t -= dt; if (d.t <= 0 && !d.done) { d.done = true; d.fn(); } } G.delayed = G.delayed.filter(d => !d.done); }

/* ---------- helpers ---------- */
function spriteMat(tex, opts = {}) {
  return new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: opts.additive ? 0 : 0.02, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, color: opts.color ?? 0xffffff, opacity: opts.opacity ?? 1, fog: true });
}
function makeShadow(r) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.scale.set(r * 2.6, r * 1.8, 1); m.renderOrder = 1; scene.add(m); return m;
}
/* screen-space angle (radians, y up) of a world direction, for sprite rotation */
function screenAngleFix(x, z, dx, dz) {
  tmpV.set(x, 1, z).project(camera); tmpV2.set(x + dx, 1, z + dz).project(camera);
  return Math.atan2((tmpV2.y - tmpV.y), (tmpV2.x - tmpV.x) * camera.aspect);
}
/* 8-way facing index in atlas row order E,SE,S,SW,W,NW,N,NE (clockwise on screen) */
function dirIndex(x, z, dx, dz) { const a = -screenAngleFix(x, z, dx, dz); return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; }

/* ---------- DOM damage numbers ---------- */
const dmgLayer = document.getElementById('dmg');
const dmgPool = [];
for (let i = 0; i < 56; i++) { const d = document.createElement('div'); d.className = 'dn'; dmgLayer.appendChild(d); dmgPool.push({ el: d, t: 0, x: 0, y: 0, z: 0 }); }
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

/* ---------- animated agent sprite (shared by player, rivals and clones) ---------- */
function makeAgentSprite(id, scale = SPR_SCALE, o = {}) {
  const L = BATCH.layout, rows = Math.ceil(148 / L.cols);
  const tex = AGENT_TEX[id].body.clone(); tex.needsUpdate = true;
  const mat = pixelSpriteMat(tex, o); const spr = new THREE.Sprite(mat);
  spr.center.set(L.anchor[0] / L.cell, 1 - L.anchor[1] / L.cell); spr.renderOrder = 5; spr.scale.set(scale, scale, 1); scene.add(spr);
  return { spr, mat, tex, rows, scale, frame: -1, flip: 1, lift: 0,
    set(idx, flip = 1) { if (idx !== this.frame) { frameUV(tex, L.cols, rows, idx); this.frame = idx; } this.flip = flip; this.spr.scale.set(this.scale * flip, this.scale, 1); },
    dispose() { scene.remove(spr); mat.dispose(); tex.dispose(); } };
}
/* frame index from an actor animation state */
function agentFrame(a, dt) {
  const L = BATCH.layout;
  a.animT += dt;
  const facingFlip = (a.dir >= 3 && a.dir <= 5) || a.dir === 6 ? -1 : 1;
  let idx, flip = 1, lift = 0;
  if (a.react) {
    const R = a.react, k = clamp(a.animT / R.dur, 0, 0.999);
    const f = R.loop ? Math.floor(a.animT * R.fps) % 4 : Math.min(3, Math.floor(k * 4));
    idx = L.react[R.name] + f; flip = R.flip ?? facingFlip;
    if (R.name === 'jump') lift = L.jumpDrop / L.cell * a.sprite.scale;
    if (!R.loop && a.animT >= R.dur && !R.hold) a.react = null;
  } else if (a.atk) {
    const k = clamp(a.animT / a.atk.dur, 0, 0.999);
    idx = L.sets[a.atk.set] + a.dir * 4 + Math.min(3, Math.floor(k * 4));
    if (a.animT >= a.atk.dur) a.atk = null;
  } else {
    const f = a.moving ? Math.floor(a.walkT) % 4 : 0;
    idx = L.sets.loco + a.dir * 4 + f;
  }
  return [idx, flip, lift];
}
function setReact(a, name, dur, o = {}) { a.react = { name, dur, ...o }; a.animT = 0; }
function setAttack(a, set, dur) { if (a.react && a.react.name !== 'run') return; a.react = null; a.atk = { set, dur }; a.animT = 0; }

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
/* the 7-move kit for any agent */
function heroKit(h) {
  const echo = h.cohort === 'echo', E = echo ? BATCH.agents[h.id] : null;
  const kit = {};
  for (const k of MOVE_KEYS) {
    const name = k === 'primary_shot' ? (echo ? E.moves[k].displayName : h.weapon.name.split('·').pop().trim())
      : k === 'ultimate' ? (echo ? E.moves[k].displayName : h.special.name)
      : echo ? E.moves[k].displayName : h.moveNames[k];
    const base = MOVE_BASE[k] || {};
    let cd = base.cd || 0;
    if (k === 'ultimate' && !echo) cd = h.special.cd;
    kit[k] = { key: k, name, cd, slot: MOVE_SLOT[k], hotkey: base.key || 'LMB', kind: echo ? E.moves[k].kind : ({ primary_shot: 'projectile', rapid_fire: 'projectile', sweeping_arc: 'sector', piercing_beam: 'ray', area_pulse: 'area', summon: 'deployable', ultimate: 'special' })[k] };
  }
  if (echo) {
    const pr = E.moves.primary_shot;
    kit.primary_shot.rate = clamp(1000 / pr.cooldownMs, 2.6, 5.5) * (h.rateMul || 1);
    kit.primary_shot.desc = `Primary · ${kit.primary_shot.rate.toFixed(1)}/s`;
    kit.ultimate.desc = `Heavy piercing round that detonates for area damage and ${STATUS[h.hitStatus].label.toLowerCase()} status.`;
  } else {
    kit.primary_shot.rate = h.weapon.rate; kit.primary_shot.desc = `Primary · ${h.weapon.rate}/s`; kit.ultimate.desc = h.special.desc;
  }
  kit.rapid_fire.desc = 'Three-round burst, short cooldown';
  kit.sweeping_arc.desc = 'Frontal melee sweep that also cuts enemy bullets';
  kit.piercing_beam.desc = 'Piercing beam through every enemy in a line';
  kit.area_pulse.desc = 'Shockwave around you that knocks enemies back and erases bullets';
  kit.summon.desc = 'Deploys a hovering helper that fires homing rounds';
  return kit;
}
function createPlayer(h) {
  const st = derive(h);
  const a = makeAgentSprite(h.id);
  const light = new THREE.PointLight(h.color, 30, 18, 1.2); scene.add(light);
  const p = {
    x: 0, z: 0, vx: 0, vz: 0, r: 0.5, hero: h, st, hp: st.maxHp, maxHp: st.maxHp, kit: heroKit(h),
    mods: { dmg: 1, rate: 1, count: 0, pierce: 0, spd: 1, cd: 1, crit: 0, regen: 0, range: 1, magnet: 1, pspeed: 1, status: 0, burst: 0, armor: 1 },
    cds: {}, cdMax: {}, fireT: 0, dashT: 0, dashCd: 0, inv: 0, level: 1, xp: 0, xpNext: 12, buffs: { power: 0, haste: 0, citation: 0, homing: 0 },
    shots: 0, slowT: 0, glm: 'zh', rooted: 0, castT: 0, castFn: null, sprite: a, light, shadow: makeShadow(0.6),
    dir: 2, animT: 0, walkT: 0, moving: false, atk: null, react: null, aimX: 1, aimZ: 0, picks: {}, hurtFlash: 0, dead: false, st8: {},
  };
  for (const k of MOVE_KEYS) { p.cds[k] = 0; p.cdMax[k] = 1; }
  return p;
}
function cdMul(p) { return (p.hero.cdMul || 1) * p.mods.cd; }
function heroDamage(p, mul, target) {
  let d = p.st.dmg * mul * p.mods.dmg * (p.hero.dmgMul || 1);
  if (p.buffs.power > 0) d *= 2;
  if (p.buffs.citation > 0) d *= 1.4;
  if (target) {
    d *= enemyDamageTaken(target);
    if (p.hero.bossMul && (target.def.elite || target.def.boss)) d *= p.hero.bossMul;
  }
  let crit = false;
  if (p.hero.variance) d *= rr(p.hero.variance[0], p.hero.variance[1]);
  if (rand() < (p.hero.crit || 0) + p.mods.crit) { d *= (p.hero.critMul || 2); crit = true; }
  return [d, crit];
}
function enemyDamageTaken(e) {
  const s = e.st || {}; let m = 1;
  if (s.mark > 0) m *= 1.25; if (e.reveal > 0) m *= 1.2;
  if (s.fracture > 0) m *= 1 + 0.15 * (s.fractureN || 1);
  return m;
}

/* ---------- FX sprites from the agent FX atlas ---------- */
const FX_ROW = { primary_shot: 0, rapid_fire: 1, sweeping_arc: 2, piercing_beam: 3, area_pulse: 4, summon: 5, ultimate: 6 };
const FX_COL = { projectile: 0, muzzle: 4, trail: 8, impact: 12 };
const FX_POOL = [];
function getFxSprite(heroId) {
  let f = FX_POOL.find(q => !q.alive && q.hid === heroId);
  if (!f) {
    const tex = AGENT_TEX[heroId].fx.clone(); tex.needsUpdate = true;
    const mat = pixelSpriteMat(tex, { gain: 1.25 }); mat.depthTest = false;
    const s = new THREE.Sprite(mat); s.renderOrder = 8; scene.add(s); s.visible = false;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 })); glow.renderOrder = 7; scene.add(glow); glow.visible = false;
    f = { hid: heroId, s, mat, tex, glow, alive: false, frame: -1 }; FX_POOL.push(f);
  }
  return f;
}
function fxFrame(f, row, col) { const i = row * 16 + col; if (f.frame !== i) { frameUV(f.tex, 16, 7, i); f.frame = i; } }
/* one-shot animated effect: kind = muzzle|impact|projectile|trail */
function spawnAtlasFx(heroId, move, kind, x, z, o = {}) {
  if (!AGENT_TEX[heroId]) return;
  const f = getFxSprite(heroId); f.alive = true; f.s.visible = true;
  Object.assign(f, { x, z, y: o.y ?? 1.15, t: 0, dur: o.dur ?? 0.28, size: o.size ?? 1.6, rot: o.rot ?? 0, row: FX_ROW[move], col: FX_COL[kind], follow: o.follow, grow: o.grow ?? 0, stretch: o.stretch, loop: o.loop });
  f.mat.rotation = f.rot; f.glow.visible = !!o.glow; if (o.glow) { f.glow.material.color.set(o.glow); }
  G.fx.push(f); tickAtlasFx(f, 0); return f;
}
function tickAtlasFx(f, dt) {
  f.t += dt; const k = f.t / f.dur;
  if (f.follow) { f.x = f.follow.x; f.z = f.follow.z; }
  const fr = f.loop ? Math.floor(f.t * 12) % 4 : Math.min(3, Math.floor(k * 4));
  fxFrame(f, f.row, f.col + fr);
  const sc = f.size * (1 + f.grow * k);
  if (f.stretch) f.s.scale.set(f.stretch[0], f.stretch[1], 1); else f.s.scale.set(sc, sc, 1);
  f.s.position.set(f.x, f.y, f.z);
  f.mat.opacity = Math.min(1, (1 - k) * 4);
  if (f.glow.visible) { f.glow.position.set(f.x, f.y, f.z); f.glow.scale.setScalar(sc * 1.4); f.glow.material.opacity = 0.45 * (1 - k); }
  if (k >= 1) { f.alive = false; f.s.visible = false; f.glow.visible = false; f.dead = true; }
}
/* legacy sprite FX (card art) */
function spawnFx(tex, x, z, o = {}) {
  const ar = tex.image.width / tex.image.height;
  const m = spriteMat(tex, { additive: o.additive ?? true, color: o.color ?? 0xffffff });
  m.depthTest = false; const s = new THREE.Sprite(m); s.renderOrder = o.order ?? 8; scene.add(s);
  const f = { legacy: true, s, m, x, z, y: o.y ?? 1.2, t: 0, dur: o.dur ?? 0.8, size: o.size ?? 4, ar, grow: o.grow ?? 0.3, spin: o.spin ?? 0, follow: o.follow, rot: o.rot ?? 0, fadeIn: o.fadeIn ?? 0.08, pulse: o.pulse ?? 0, onEnd: o.onEnd, stretch: o.stretch };
  G.fx.push(f); tickLegacyFx(f, 0); return f;
}
function tickLegacyFx(f, dt) {
  f.t += dt; const k = f.t / f.dur;
  if (f.follow) { f.x = f.follow.x; f.z = f.follow.z; }
  const sc = f.size * (1 + f.grow * k) * (1 + Math.sin(f.t * 10) * f.pulse);
  if (f.stretch) f.s.scale.set(f.stretch[0], f.stretch[1], 1); else f.s.scale.set(sc * Math.sqrt(f.ar), sc / Math.sqrt(f.ar), 1);
  f.s.position.set(f.x, f.y, f.z); f.m.rotation = f.rot + f.spin * f.t;
  f.m.opacity = Math.min(1, f.t / f.fadeIn) * Math.min(1, (1 - k) * 3.5);
  if (f.t >= f.dur) { scene.remove(f.s); f.m.dispose(); f.dead = true; f.onEnd && f.onEnd(); }
}
function updateFxAll(dt) { for (const f of G.fx) f.legacy ? tickLegacyFx(f, dt) : tickAtlasFx(f, dt); G.fx = G.fx.filter(f => !f.dead); }
/* additive shock ring on the floor */
const ringPool = [];
function shockRing(x, z, r, color, dur = 0.45, y = 0.08) {
  let g = ringPool.find(o => !o.alive);
  if (!g) { const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.renderOrder = 3; scene.add(m); g = { m }; ringPool.push(g); }
  Object.assign(g, { alive: true, x, z, r, t: 0, dur, y }); g.m.visible = true; g.m.material.color.set(color);
}
function updateRings(dt) { for (const g of ringPool) { if (!g.alive) continue; g.t += dt; const k = g.t / g.dur; g.m.position.set(g.x, g.y, g.z); g.m.scale.setScalar(g.r * (0.25 + 0.75 * (1 - (1 - k) ** 3))); g.m.material.opacity = (1 - k) * 0.9; if (k >= 1) { g.alive = false; g.m.visible = false; } } }
const lineMats = {};
function zap(points, color, y = 1.2) {
  const geo = new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x, y, z)));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const l = new THREE.Line(geo, mat); scene.add(l); G.lines.push({ l, t: 0.3 });
  for (let i = 0; i < points.length - 1; i++) { const [ax, az] = points[i], [bx, bz] = points[i + 1]; for (let k = 0; k < 6; k++) { const t = k / 6; particles.emit(lerp(ax, bx, t), y, lerp(az, bz, t), color, 1, { speed: 1, life: 0.35, size: 0.35, grav: 0, lift: 0 }); } }
}
function jagged(ax, az, bx, bz, n = 6, amp = 0.5) { const pts = [[ax, az]]; const px = -(bz - az), pz = bx - ax, l = Math.hypot(px, pz) || 1; for (let i = 1; i < n; i++) { const t = i / n, o = rr(-amp, amp); pts.push([lerp(ax, bx, t) + px / l * o, lerp(az, bz, t) + pz / l * o]); } pts.push([bx, bz]); return pts; }
function updateLines(dt) { for (const L of G.lines) { L.t -= dt; L.l.material.opacity = Math.max(0, L.t / 0.3); if (L.t <= 0) { scene.remove(L.l); L.l.geometry.dispose(); L.l.material.dispose(); } } G.lines = G.lines.filter(L => L.t > 0); }

/* ---------- player projectiles ---------- */
const PPOOL = [];
function getPProj() {
  for (const q of PPOOL) if (!q.alive) return q;
  const mat = pixelSpriteMat(null, { gain: 1.15 }); mat.depthTest = true; const s = new THREE.Sprite(mat); s.renderOrder = 6; scene.add(s); s.visible = false;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 })); glow.renderOrder = 5; scene.add(glow); glow.visible = false;
  const q = { alive: false, s, mat, glow, ownTex: {} }; PPOOL.push(q); return q;
}
/* opt.mode 'legacy' uses card projectile art; 'atlas' uses the agent FX atlas row */
function firePlayerProj(p, ang, opt = {}) {
  const h = p.hero, q = getPProj(); q.alive = true; q.s.visible = true; q.glow.visible = true;
  const legacy = opt.mode === 'legacy';
  if (legacy) {
    const art = ART[opt.art || h.id];
    if (q.mat.map !== art.proj.tex) { q.mat.map = art.proj.tex; q.mat.needsUpdate = true; }
    const ar = art.proj.w / art.proj.h, size = (opt.size ?? 1) * 1.0; q.sw = size * Math.sqrt(ar); q.sh = size / Math.sqrt(ar); q.atlas = false;
  } else {
    const hid = opt.hid || h.id;
    let tex = q.ownTex[hid]; if (!tex) { tex = q.ownTex[hid] = AGENT_TEX[hid].fx.clone(); tex.needsUpdate = true; }
    if (q.mat.map !== tex) { q.mat.map = tex; q.mat.needsUpdate = true; }
    q.atlas = true; q.row = FX_ROW[opt.move || 'primary_shot']; q.frame = -1; q.sw = q.sh = (opt.size ?? 1) * 1.7;
  }
  q.mat.color.set(opt.tint ?? 0xffffff); q.mat.opacity = 1; q.glow.material.color.set(opt.glowCol ?? h.color);
  const spd = (opt.speed ?? 20) * p.mods.pspeed * (h.pspeedMul || 1);
  q.x = opt.x ?? p.x + Math.cos(ang) * 0.7; q.z = opt.z ?? p.z + Math.sin(ang) * 0.7; q.y = opt.y ?? 1.15;
  q.vx = Math.cos(ang) * spd; q.vz = Math.sin(ang) * spd;
  q.life = (opt.life ?? 1) * p.mods.range * (h.rangeMul || 1); q.max = q.life;
  q.dmgMul = opt.dmg ?? 1; q.pierce = (opt.pierce ?? 0) + p.mods.pierce + (h.pierceBonus || 0); q.hit = new Set();
  q.home = (opt.home ?? 0) + (h.home || 0) + (p.buffs.homing > 0 ? 9 : 0); q.rot = opt.rot ?? 'face'; q.artAngle = opt.artAngle || 0;
  q.bounce = opt.bounce ?? 0; q.spin = rr(-1, 1); q.t = 0; q.color = opt.glowCol ?? h.color; q.move = opt.move || 'primary_shot';
  q.status = opt.status ?? h.hitStatus; q.statusChance = opt.statusChance ?? 1; q.splitLeft = opt.split ?? 0; q.onEnd = opt.onEnd || null; q.trailT = 0; q.hid = opt.hid || h.id; q.knock = opt.knock ?? 3.5;
  q.s.scale.set(q.sw, q.sh, 1); q.s.position.set(q.x, q.y, q.z);
  return q;
}
function nearestEnemy(x, z, maxD, exclude) {
  let best = null, bd = maxD * maxD;
  for (const e of G.enemies) { if (!e.alive || e.hidden || (exclude && exclude.has(e))) continue; const d = (e.x - x) ** 2 + (e.z - z) ** 2; if (d < bd) { bd = d; best = e; } }
  return best;
}
function killProj(q) { q.alive = false; q.s.visible = false; q.glow.visible = false; if (q.onEnd) { const f = q.onEnd; q.onEnd = null; f(q.x, q.z); } }
function updatePlayerProj(dt) {
  for (const q of PPOOL) {
    if (!q.alive) continue;
    q.life -= dt; q.t += dt;
    if (q.home > 0) {
      const t = nearestEnemy(q.x, q.z, 9, q.hit);
      if (t) {
        const sp = Math.hypot(q.vx, q.vz), want = Math.atan2(t.z - q.z, t.x - q.x), cur = Math.atan2(q.vz, q.vx);
        let da = want - cur; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const na = cur + clamp(da, -q.home * dt, q.home * dt); q.vx = Math.cos(na) * sp; q.vz = Math.sin(na) * sp;
      }
    }
    const nx = q.x + q.vx * dt, nz = q.z + q.vz * dt;
    if (solidAt(nx, nz)) {
      if (q.bounce > 0) { q.bounce--; if (solidAt(nx, q.z)) q.vx = -q.vx; if (solidAt(q.x, nz)) q.vz = -q.vz; particles.emit(q.x, q.y, q.z, q.color, 5, { speed: 3, life: 0.25, size: 0.2 }); }
      else { q.life = 0; spawnAtlasFx(q.hid, q.move, 'impact', q.x, q.z, { size: 1.6, dur: 0.24 }); particles.emit(q.x, q.y, q.z, q.color, 6, { speed: 4, life: 0.3, size: 0.22 }); }
    } else { q.x = nx; q.z = nz; }
    if (q.life > 0) for (const e of G.enemies) {
      if (!e.alive || e.hidden || q.hit.has(e)) continue;
      const rr2 = e.r + q.sh * 0.3; if ((e.x - q.x) ** 2 + (e.z - q.z) ** 2 > rr2 * rr2) continue;
      q.hit.add(e);
      const [d, crit] = heroDamage(G.p, q.dmgMul, e);
      damageEnemy(e, d, crit, q.vx, q.vz, { knock: q.knock });
      spawnAtlasFx(q.hid, q.move, 'impact', q.x, q.z, { size: crit ? 2.4 : 1.8, dur: 0.26 });
      onHitStatus(e, q.status, q.statusChance, q.x, q.z, d);
      if (q.splitLeft > 0 || (q.status === 'split' && q.move === 'primary_shot' && !q.child)) {
        const a = Math.atan2(q.vz, q.vx);
        for (const s of [-0.55, 0.55]) { const c = firePlayerProj(G.p, a + s, { mode: q.atlas ? 'atlas' : 'legacy', move: q.move, dmg: q.dmgMul * 0.5, size: q.sw / 1.7 * 0.7, life: 0.35, x: q.x, z: q.z, status: null, glowCol: q.color }); c.child = true; c.hit = new Set(q.hit); }
        q.splitLeft = 0;
      }
      if (q.pierce-- <= 0) { q.life = 0; break; }
    }
    if (q.life <= 0) { killProj(q); continue; }
    q.s.position.set(q.x, q.y + (q.rot === 'bob' ? Math.sin(q.t * 12) * 0.12 : 0), q.z);
    q.glow.position.copy(q.s.position); q.glow.scale.setScalar(Math.max(q.sw, q.sh) * 1.3);
    q.mat.opacity = Math.min(1, q.life / 0.08);
    if (q.atlas) { const fi = Math.floor(q.t * 14) % 4; if (fi !== q.frame) { frameUV(q.mat.map, 16, 7, q.row * 16 + fi); q.frame = fi; } q.mat.rotation = screenAngleFix(q.x, q.z, q.vx, q.vz); }
    else if (q.rot === 'spin') q.mat.rotation += dt * 9 * (q.spin > 0 ? 1 : -1);
    else if (q.rot === 'face') q.mat.rotation = screenAngleFix(q.x, q.z, q.vx, q.vz) - q.artAngle;
    else if (q.rot === 'wobble') q.mat.rotation = Math.sin(q.t * 14) * 0.25;
    else if (q.rot === 'flip') { const g = 1 + (1 - q.life / q.max) * 0.5; q.s.scale.set((q.vx < 0 ? -1 : 1) * q.sw * g, q.sh * g, 1); }
    q.trailT -= dt;
    if (q.trailT <= 0) { q.trailT = 0.045; particles.emit(q.x, q.y, q.z, q.color, 1, { speed: 0.6, life: 0.28, size: 0.22, grav: 0, lift: 0 }); }
  }
}

/* ---------- statuses ---------- */
function applyStatus(e, kind, dur = 2, o = {}) {
  if (!e.alive || !kind) return;
  const s = e.st || (e.st = {});
  if (e.def.boss) dur *= 0.4;
  switch (kind) {
    case 'fracture': s.fractureN = Math.min(3, (s.fracture > 0 ? (s.fractureN || 0) : 0) + 1); s.fracture = Math.max(s.fracture || 0, dur * 2); break;
    case 'bleed': case 'burn': case 'poison': s[kind] = Math.max(s[kind] || 0, dur * 1.6); s[kind + 'Dps'] = Math.max(s[kind + 'Dps'] || 0, o.dps ?? G.p.st.dmg * 0.35); break;
    case 'bind': case 'stun': if (!e.def.boss) s[kind] = Math.max(s[kind] || 0, dur * 0.45); break;
    case 'confuse': if (!e.def.boss) { s.confuse = Math.max(s.confuse || 0, dur * 1.4); e.confused = s.confuse; } break;
    default: s[kind] = Math.max(s[kind] || 0, dur);
  }
  if (!e._stFx || e._stFx < G.time) { e._stFx = G.time + 0.6; particles.emit(e.x, 1.4, e.z, STATUS[kind]?.color ?? 0xffffff, 5, { speed: 2, life: 0.4, size: 0.24, lift: 2 }); }
}
function onHitStatus(e, kind, chance, hx, hz, dmg) {
  const p = G.p, h = p.hero; if (!kind || !e.alive) return;
  const c = (h.statusChance ?? (['mark', 'slow', 'bleed', 'fracture', 'pierce', 'construct'].includes(kind) ? 1 : 0.3)) * chance + p.mods.status;
  if (rand() > c) return;
  switch (kind) {
    case 'refract': { const ex = new Set([e]); for (let i = 0; i < 2; i++) { const t = nearestEnemy(hx, hz, 8, ex); if (!t) break; ex.add(t); const a = Math.atan2(t.z - hz, t.x - hx); const c2 = firePlayerProj(p, a, { move: 'rapid_fire', dmg: 0.45, size: 0.7, life: 0.6, x: hx, z: hz, status: null, home: 6 }); c2.hit = new Set([e]); } break; }
    case 'queue': after(0.6, () => { if (e.alive) { damageEnemy(e, dmg * 0.5, false, 0, 0); spawnAtlasFx(h.id, 'primary_shot', 'impact', e.x, e.z, { size: 1.4, dur: 0.22 }); } }); applyStatus(e, 'queue', 0.6); break;
    case 'shock': { const t = nearestEnemy(e.x, e.z, 6.5, new Set([e])); if (t) { zap(jagged(e.x, e.z, t.x, t.z), 0xffe14f); damageEnemy(t, dmg * 0.4, false, 0, 0); applyStatus(t, 'shock', 0.6); } applyStatus(e, 'shock', 0.6); break; }
    case 'pull': for (const o of G.enemies) { if (!o.alive || o.def.boss || o.hidden) continue; const dx = hx - o.x, dz = hz - o.z, d = Math.hypot(dx, dz); if (d < 4.5 && d > 0.3) { o.knock[0] += dx / d * 5; o.knock[1] += dz / d * 5; } } applyStatus(e, 'pull', 1); break;
    case 'construct': applyStatus(e, 'construct', 3); break;
    case 'pierce': applyStatus(e, 'mark', 1); break;
    default: applyStatus(e, kind, STATUS_DUR[kind] ?? 2);
  }
}
const STATUS_DUR = { mark: 4, bind: 2, slow: 2.2, confuse: 2.5, silence: 1.5, bleed: 2.5, fracture: 3, burn: 2.5, poison: 3 };

/* ---------- moves ---------- */
function aimPoint(p, maxD) {
  let d = maxD;
  if (!IS_TOUCH && input.mouseIn) { raycaster.setFromCamera(new THREE.Vector2(input.mouseX, input.mouseY), camera); const hit = raycaster.ray.intersectPlane(groundPlane, tmpV); if (hit) d = Math.min(maxD, Math.hypot(hit.x - p.x, hit.z - p.z)); }
  else { const t = nearestEnemy(p.x, p.z, maxD); if (t) d = Math.hypot(t.x - p.x, t.z - p.z); }
  let x = p.x, z = p.z; const steps = Math.ceil(d / 0.5);
  for (let i = 1; i <= steps; i++) { const nx = p.x + p.aimX * d * i / steps, nz = p.z + p.aimZ * d * i / steps; if (solidAt(nx, nz)) break; x = nx; z = nz; }
  return [x, z];
}
/* point on the sprite's muzzle, in world space, for the current facing */
function muzzleWorld(p, set = 'shot') {
  const L = BATCH.layout, m = (p.hero.cohort === 'echo' ? BATCH.agents[p.hero.id] : BATCH.legacy[p.hero.id]).muzzle[set][p.dir];
  const k = p.sprite.scale / L.cell; tmpV3.set(0, 0, 0);
  const right = tmpV.setFromMatrixColumn(camera.matrixWorld, 0), upv = tmpV2.setFromMatrixColumn(camera.matrixWorld, 1);
  tmpV3.copy(right).multiplyScalar((m[0] - L.anchor[0]) * k).addScaledVector(upv, (L.anchor[1] - m[1]) * k);
  return [p.x + tmpV3.x, 0.2 + tmpV3.y, p.z + tmpV3.z];
}
function muzzleFlash(p, move) { const [mx, my, mz] = muzzleWorld(p); spawnAtlasFx(p.hero.id, move, 'muzzle', mx, mz, { y: my, size: 1.2, dur: 0.12 }); }
function playerShoot(p) {
  const h = p.hero, a0 = Math.atan2(p.aimZ, p.aimX);
  if (h.cohort === 'echo') {
    const n = 1 + p.mods.count, spread = n > 1 ? 0.14 * (n - 1) : 0;
    for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : i / (n - 1) - 0.5; firePlayerProj(p, a0 + t * spread, { move: 'primary_shot', dmg: 1, size: 1, life: 0.95, speed: 21 }); }
  } else {
    const w = h.weapon;
    let count = w.count + p.mods.count, spread = w.spread, dmg = w.dmg, pierce = w.pierce, size = w.size, speed = w.speed;
    if (h.id === 'glm') { if (p.glm === 'zh') { count += 2; dmg *= 0.75; } else { dmg *= 1.9; pierce += 3; size *= 1.3; speed *= 1.25; } }
    const legacy = { mode: 'legacy', rot: w.rot, artAngle: w.artAngle || 0, life: w.life, home: w.home, bounce: w.bounce || 0 };
    if (w.twin) {
      const px = -Math.sin(a0), pz = Math.cos(a0);
      for (let i = 0; i < count; i++) { const side = i % 2 ? 1 : -1, ring = Math.floor(i / 2), off = side * (0.35 + ring * 0.3), a = a0 + (ring ? side * 0.08 * ring : 0); firePlayerProj(p, a, { ...legacy, x: p.x + px * off + Math.cos(a0) * 0.6, z: p.z + pz * off + Math.sin(a0) * 0.6, tint: i % 2 ? 0xffb6ee : 0xb6d4ff, dmg, size, speed, pierce }); }
    } else {
      const total = spread + (count > 1 ? 0.14 * (count - 1) : 0);
      for (let i = 0; i < count; i++) { const t = count === 1 ? 0 : i / (count - 1) - 0.5; const jit = h.id === 'grok' ? rr(-spread, spread) : 0; firePlayerProj(p, a0 + t * total + jit, { ...legacy, dmg, pierce, size, speed }); }
    }
    if (h.quota) { p.shots++; if (p.shots >= h.quota) { p.shots = 0; p.slowT = 2.5; floatText(p.x, p.z, 'Slow pool', 'warn', 3); } }
  }
  AUDIO.sfx.shoot(1 + (h.stats.spd - 4) * 0.06);
  muzzleFlash(p, 'primary_shot');
  setAttack(p, 'shot', 0.2);
}
function moveReady(p, k) { return p.cds[k] <= 0 && p.rooted <= 0 && !p.dead && !(p.st8.silence > 0); }
function startCd(p, k, base) { p.cdMax[k] = base * cdMul(p); p.cds[k] = p.cdMax[k]; }
function useMove(p, k) {
  if (k === 'primary_shot' || !moveReady(p, k)) return false;
  const h = p.hero, kit = p.kit[k], pow = p.st.pow, a0 = Math.atan2(p.aimZ, p.aimX), echo = h.cohort === 'echo', rng = p.mods.range * (h.rangeMul || 1);
  switch (k) {
    case 'rapid_fire': {
      startCd(p, k, MOVE_BASE[k].cd); setAttack(p, 'shot', 0.32);
      const n = 3 + p.mods.burst;
      for (let i = 0; i < n; i++) after(i * 0.065, () => { if (p.dead) return; const a = Math.atan2(p.aimZ, p.aimX) + rr(-0.06, 0.06); echo ? firePlayerProj(p, a, { move: 'rapid_fire', dmg: MOVE_BASE[k].dmg, size: 0.85, speed: 27, life: 0.8 }) : firePlayerProj(p, a, { mode: 'legacy', rot: h.weapon.rot, artAngle: h.weapon.artAngle, dmg: MOVE_BASE[k].dmg * h.weapon.dmg, size: h.weapon.size * 0.8, speed: 26, life: 0.75 }); AUDIO.sfx.burst(); muzzleFlash(p, 'rapid_fire'); });
      break;
    }
    case 'sweeping_arc': {
      startCd(p, k, MOVE_BASE[k].cd); setAttack(p, 'arc', 0.34); AUDIO.sfx.arc();
      const R = MOVE_BASE[k].range * Math.sqrt(rng), half = MOVE_BASE[k].arc / 2;
      after(0.09, () => {
        const ax = Math.cos(a0), az = Math.sin(a0);
        spawnAtlasFx(h.id, 'sweeping_arc', 'projectile', p.x + ax * R * 0.55, p.z + az * R * 0.55, { size: R * 1.25, dur: 0.24, rot: screenAngleFix(p.x, p.z, ax, az), glow: h.color });
        for (let i = 0; i < 14; i++) { const a = a0 - half + (i / 13) * half * 2; particles.emit(p.x + Math.cos(a) * R * 0.85, 1.0, p.z + Math.sin(a) * R * 0.85, h.color, 2, { speed: 2, life: 0.3, size: 0.3, grav: 0, dir: [Math.cos(a + 1.57) * 3, Math.sin(a + 1.57) * 3] }); }
        let healed = 0;
        for (const e of G.enemies) {
          if (!e.alive || e.hidden) continue; const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
          if (d > R + e.r) continue; let da = Math.atan2(dz, dx) - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
          if (Math.abs(da) > half + 0.2) continue;
          const [dd, crit] = heroDamage(p, MOVE_BASE[k].dmg * (echo ? 1 : 1.1), e); damageEnemy(e, dd, crit, dx, dz, { knock: 7 }); onHitStatus(e, h.hitStatus, 1, e.x, e.z, dd);
          spawnAtlasFx(h.id, 'sweeping_arc', 'impact', e.x, e.z, { size: 2, dur: 0.25 }); healed += dd;
        }
        if (h.lifesteal && healed) healPlayer(p, healed * h.lifesteal);
        clearEnemyBullets(p.x, p.z, R, a0, half);
        G.hitstop = Math.max(G.hitstop, 0.03); shakeAdd(0.18);
      });
      break;
    }
    case 'piercing_beam': {
      startCd(p, k, MOVE_BASE[k].cd); setAttack(p, 'shot', 0.42); AUDIO.sfx.beam();
      after(0.12, () => {
        const a = Math.atan2(p.aimZ, p.aimX), dx = Math.cos(a), dz = Math.sin(a), [mx, my, mz] = muzzleWorld(p);
        const len = rayLength(p.x, p.z, dx, dz, MOVE_BASE[k].range * rng);
        // stretched beam built from the move's FX strip
        const steps = Math.max(1, Math.round(len / 1.6));
        for (let i = 0; i < steps; i++) { const t = (i + 0.5) / steps; spawnAtlasFx(h.id, 'piercing_beam', 'projectile', p.x + dx * len * t, p.z + dz * len * t, { size: len / steps * 1.15, dur: 0.32, rot: screenAngleFix(p.x, p.z, dx, dz), loop: true, glow: i % 2 ? h.color : null, y: 1.1 }); }
        spawnAtlasFx(h.id, 'piercing_beam', 'muzzle', mx, mz, { y: my, size: 2.2, dur: 0.2 });
        spawnAtlasFx(h.id, 'piercing_beam', 'impact', p.x + dx * len, p.z + dz * len, { size: 2.6, dur: 0.3 });
        for (const e of G.enemies) {
          if (!e.alive || e.hidden) continue; const ex = e.x - p.x, ez = e.z - p.z, pr = ex * dx + ez * dz; if (pr < 0 || pr > len) continue;
          if (Math.abs(ex * dz - ez * dx) < 1.0 + e.r) { const [dd, crit] = heroDamage(p, MOVE_BASE[k].dmg * pow, e); damageEnemy(e, dd, crit, dx, dz, { knock: 4 }); onHitStatus(e, h.hitStatus, 1, e.x, e.z, dd); spawnAtlasFx(h.id, 'piercing_beam', 'impact', e.x, e.z, { size: 2, dur: 0.25 }); }
        }
        for (let s = 0; s < len; s += 0.7) particles.emit(p.x + dx * s, 1.1, p.z + dz * s, h.color, 1, { speed: 1.5, life: 0.4, size: 0.3, grav: 0, lift: 0.5 });
        shakeAdd(0.35); G.hitstop = Math.max(G.hitstop, 0.04);
      });
      break;
    }
    case 'area_pulse': {
      startCd(p, k, MOVE_BASE[k].cd); setAttack(p, 'cast', 0.45); AUDIO.sfx.pulse();
      after(0.14, () => {
        const R = MOVE_BASE[k].range * Math.sqrt(rng);
        spawnAtlasFx(h.id, 'area_pulse', 'impact', p.x, p.z, { size: R * 2.1, dur: 0.34, y: 0.4, glow: h.color });
        shockRing(p.x, p.z, R, h.color, 0.4); shockRing(p.x, p.z, R * 0.6, 0xffffff, 0.3);
        particles.emit(p.x, 0.5, p.z, h.color, 40, { speed: R * 3, life: 0.45, size: 0.35, up: 0.2 });
        for (const e of G.enemies) { if (!e.alive || e.hidden) continue; const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz); if (d < R + e.r) { const [dd, crit] = heroDamage(p, MOVE_BASE[k].dmg * pow, e); damageEnemy(e, dd, crit, dx, dz, { knock: 10 }); onHitStatus(e, h.hitStatus, 1, e.x, e.z, dd); } }
        clearEnemyBullets(p.x, p.z, R);
        if (h.wardHeal) healPlayer(p, p.maxHp * h.wardHeal);
        shakeAdd(0.4); G.hitstop = Math.max(G.hitstop, 0.05);
      });
      break;
    }
    case 'summon': {
      startCd(p, k, MOVE_BASE[k].cd); setAttack(p, 'cast', 0.45); AUDIO.sfx.summon();
      const [x, z] = aimPoint(p, 6);
      after(0.15, () => {
        const mine = G.summons.filter(s => s.kind === 'turret' && s.mine); while (mine.length >= 2) mine.shift().life = 0;
        spawnTurret(x, z, MOVE_BASE[k].life * (h.summonMul || 1), true);
        shockRing(x, z, 2.2, h.color, 0.4); particles.emit(x, 1, z, h.color, 24, { speed: 5, life: 0.5 });
      });
      break;
    }
    case 'ultimate': {
      if (echo) {
        startCd(p, k, MOVE_BASE[k].cd); setAttack(p, 'shot', 0.5); AUDIO.sfx.special(); shakeAdd(0.3);
        after(0.16, () => {
          const a = Math.atan2(p.aimZ, p.aimX);
          spawnAtlasFx(h.id, 'ultimate', 'muzzle', p.x + Math.cos(a), p.z + Math.sin(a), { size: 3, dur: 0.3 });
          firePlayerProj(p, a, { move: 'ultimate', dmg: MOVE_BASE[k].dmg * 0.45 * pow, size: 2.6, speed: 15, life: 1.3, pierce: 99, statusChance: 1, knock: 8,
            onEnd: (x, z) => {
              const R = 4.8; spawnAtlasFx(h.id, 'ultimate', 'impact', x, z, { size: R * 2.2, dur: 0.5, glow: h.color }); shockRing(x, z, R, h.color, 0.5); shockRing(x, z, R * 0.55, 0xffffff, 0.35);
              particles.emit(x, 1, z, h.color, 70, { speed: 11, life: 0.7, size: 0.4 }); AUDIO.sfx.boom(); shakeAdd(0.8); G.hitstop = Math.max(G.hitstop, 0.08);
              for (const e of G.enemies) if (e.alive && !e.hidden && Math.hypot(e.x - x, e.z - z) < R + e.r) { const [dd, crit] = heroDamage(p, MOVE_BASE[k].dmg * pow, e); damageEnemy(e, dd, crit, e.x - x, e.z - z, { knock: 9 }); applyStatus(e, h.hitStatus === 'pierce' ? 'mark' : h.hitStatus, 4); }
            } });
        });
      } else { useLegacySpecial(p); }
      break;
    }
  }
  return true;
}
function healPlayer(p, amt) { if (amt <= 0) return; p.hp = Math.min(p.maxHp, p.hp + amt); }
function shakeAdd(v) { if (G.settings.shake) G.shake = Math.max(G.shake, v); }

/* ---------- origin ultimates (each agent's card special) ---------- */
function useLegacySpecial(p) {
  const h = p.hero, sp = h.special, art = ART[h.id], pow = p.st.pow;
  startCd(p, 'ultimate', sp.cd);
  setAttack(p, 'cast', 0.6);
  AUDIO.sfx.special(); shakeAdd(0.3);
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
      spawnFx(fx, x, z, { size: 6, dur: 0.75, grow: 0.15, y: 0.8 });
      after(0.38, () => {
        for (const e of G.enemies) if (e.alive && Math.hypot(e.x - x, e.z - z) < 4.8) damageEnemy(e, heroDamage(p, 4 * pow, e)[0], false, e.x - x, e.z - z);
        particles.emit(x, 1, z, 0xff3b4a, 60, { speed: 10, life: 0.6, size: 0.35 }); shakeAdd(0.6); AUDIO.sfx.boom(); shockRing(x, z, 4.8, 0xff4455, 0.4);
      });
      p.dashCd = 0; break;
    }
    case 'vortex': {
      G.vortex = { x: p.x, z: p.z, r: 6, pull: 4.5, t: 4.5, tick: 0 };
      spawnFx(fx, p.x, p.z, { size: 11, dur: 4.5, grow: 0.1, spin: -2.4, follow: p, y: 0.8, fadeIn: 0.3, order: 4 }); break;
    }
    case 'orchestrate': {
      spawnFx(fx, p.x, p.z, { size: 4.6, dur: 0.8, grow: 0.25, follow: p });
      for (let i = 0; i < 3; i++) spawnSummon('agent', p.x + Math.cos(i * 2.1) * 1.5, p.z + Math.sin(i * 2.1) * 1.5, { life: 14, height: 1.4, angle: i * 2.1 });
      const ag = G.summons.filter(s => s.kind === 'agent'); while (ag.length > 6) ag.shift().life = 0;
      break;
    }
    case 'bilingual': {
      p.glm = p.glm === 'zh' ? 'en' : 'zh';
      spawnFx(fx, p.x, p.z, { size: 5.5, dur: 0.6, grow: 0.4, follow: p });
      for (let i = 0; i < 14; i++) firePlayerProj(p, i / 14 * 6.283, { mode: 'legacy', dmg: 1.2 * pow, pierce: 1, life: 0.9, speed: 19, rot: 'none' });
      floatText(p.x, p.z, p.glm === 'zh' ? '中 mode' : 'EN mode', 'info', 3.2); break;
    }
    case 'citation': {
      spawnFx(fx, p.x, p.z, { size: 5, dur: 1.1, grow: 0.3, spin: 1.2, follow: p });
      p.buffs.citation = 6;
      for (const e of G.enemies) if (e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 13) { applyStatus(e, 'mark', 8); zap([[p.x, p.z], [e.x, e.z]], 0x2ec8ff); }
      break;
    }
    case 'fork': {
      spawnFx(fx, p.x, p.z, { size: 5.5, dur: 0.7, grow: 0.2 });
      spawnSummon('clone', p.x - p.aimX, p.z - p.aimZ, { life: 10, height: 2.2, tex: ART.openclaw.idle.tex, tint: 0xff8a80 });
      break;
    }
    case 'gravity': {
      const [x, z] = aimPoint(p, 11);
      G.well = { x, z, r: 6.5, pull: 7, t: 3, tick: 0 };
      spawnFx(fx, x, z, { size: 6, dur: 3, grow: 0.15, spin: 3, y: 0.9, fadeIn: 0.2, order: 4,
        onEnd: () => { if (G.mode !== 'play') return; for (const e of G.enemies) if (e.alive && Math.hypot(e.x - x, e.z - z) < 4) damageEnemy(e, heroDamage(p, 3.2 * pow, e)[0], false); particles.emit(x, 1, z, 0xa070ff, 70, { speed: 11, life: 0.7, size: 0.35 }); shakeAdd(0.7); AUDIO.sfx.boom(); } });
      break;
    }
    case 'hottake': {
      spawnFx(fx, p.x, p.z, { size: 6, dur: 0.7, grow: 0.9 });
      for (const e of G.enemies) if (e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 6.5) { applyStatus(e, 'confuse', 3.5 / 1.4); damageEnemy(e, heroDamage(p, 2.4 * pow, e)[0], false, e.x - p.x, e.z - p.z); if (e.alive) floatText(e.x, e.z, '?!', 'info', 2.6); }
      shakeAdd(0.6); break;
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
      const len = rayLength(p.x, p.z, dx, dz, L);
      const mx = p.x + dx * len / 2, mz = p.z + dz * len / 2;
      tmpV.set(p.x, 1.2, p.z).project(camera); tmpV2.set(p.x + dx * len, 1.2, p.z + dz * len).project(camera);
      const screenLen = Math.hypot((tmpV2.x - tmpV.x) * camera.aspect, tmpV2.y - tmpV.y); const worldPerNdc = len / Math.max(0.01, screenLen);
      spawnFx(fx, mx, mz, { dur: 0.55, rot: screenAngleFix(p.x, p.z, dx, dz), stretch: [screenLen * worldPerNdc * 1.05, 2.4] });
      for (const e of G.enemies) if (e.alive) { const ex = e.x - p.x, ez = e.z - p.z, pr = ex * dx + ez * dz; if (pr < 0 || pr > len) continue; if (Math.abs(ex * dz - ez * dx) < 1.1 + e.r) damageEnemy(e, heroDamage(p, 5 * pow, e)[0], true, dx, dz); }
      shakeAdd(0.7); break;
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
    if (w.tick <= 0) { w.tick = 0.3; for (const e of G.enemies) if (e.alive && Math.hypot(e.x - w.x, e.z - w.z) < w.r) { damageEnemy(e, heroDamage(p, 0.4 * p.st.pow, e)[0], false); applyStatus(e, 'slow', 1); } }
    if (w.t <= 0) G.well = null;
  }
  if (G.shield) { G.shield.t -= dt; if (G.shield.t <= 0) G.shield = null; }
}

/* ---------- summons ---------- */
function spawnSummon(kind, x, z, o = {}) {
  const h = G.p.hero, art = ART[o.art || h.id] || ART.devin;
  const tex = o.tex || art.summon.tex;
  const m = spriteMat(tex, { color: o.tint ?? 0xffffff, opacity: o.opacity ?? 1 }); const s = new THREE.Sprite(m); s.center.set(0.5, 0.08); s.renderOrder = 5; scene.add(s);
  const H = o.height ?? 1.5; const imgW = tex.image.width, imgH = tex.image.height;
  const sm = { kind, x, z, s, m, life: o.life ?? 10, t: rand() * 5, fireT: rr(0.2, 0.6), h: H, w: H * imgW / imgH, y: o.y ?? 0, alive: true, hp: o.hp ?? 999, angle: o.angle ?? 0, shadow: o.noShadow ? null : makeShadow(0.4), tick: 0, r: 0.4 };
  G.summons.push(sm); return sm;
}
/* deployable helper: the kit's summon move (atlas sprite) or a construct turret */
function spawnTurret(x, z, life, mine, small = false) {
  const p = G.p, h = p.hero;
  const tex = AGENT_TEX[h.id].fx.clone(); tex.needsUpdate = true; frameUV(tex, 16, 7, FX_ROW.summon * 16);
  const m = pixelSpriteMat(tex, { gain: 1.2 }); const s = new THREE.Sprite(m); s.renderOrder = 6; scene.add(s);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: h.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 })); glow.scale.setScalar(2.4); scene.add(glow);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: h.color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(ring);
  const sm = { kind: 'turret', mine, x, z, s, m, tex, glow, ring, life, max: life, t: rand() * 5, fireT: 0.3, alive: true, hp: 999, y: 1.4, r: 0.4, frame: 0, small, size: small ? 1.6 : 2.4 };
  G.summons.push(sm); return sm;
}
function updateSummons(dt) {
  const p = G.p;
  for (const s of G.summons) {
    s.t += dt; s.life -= dt; if (s.hp <= 0) s.life = 0;
    if (s.kind === 'turret') {
      const fi = Math.floor(s.t * 8) % 4; if (fi !== s.frame) { frameUV(s.tex, 16, 7, FX_ROW.summon * 16 + fi); s.frame = fi; }
      s.fireT -= dt; const tg = nearestEnemy(s.x, s.z, 11);
      if (tg && s.fireT <= 0 && lineOfSight(s.x, s.z, tg.x, tg.z)) {
        s.fireT = s.small ? 0.9 : 0.65; const a = Math.atan2(tg.z - s.z, tg.x - s.x);
        firePlayerProj(p, a, { move: 'summon', dmg: MOVE_BASE.summon.dmg * (s.small ? 0.7 : 1) * p.st.pow, size: 0.9, home: 6, life: 1.1, speed: 17, x: s.x, z: s.z, y: s.y, statusChance: 0.35 });
        AUDIO.sfx.eshot();
      }
      if (p.hero.swarmHeal && s.mine && Math.hypot(p.x - s.x, p.z - s.z) < 9) healPlayer(p, p.maxHp * 0.02 * dt);
      const y = s.y + Math.sin(s.t * 3) * 0.15;
      s.s.position.set(s.x, y, s.z); s.s.scale.setScalar(s.size); s.glow.position.set(s.x, y, s.z); s.ring.position.set(s.x, 0.06, s.z); s.ring.rotation.y += dt;
      s.m.opacity = Math.min(1, s.life * 2); s.glow.material.opacity = 0.45 * Math.min(1, s.life * 2);
      if (s.life <= 0) { s.alive = false; scene.remove(s.s, s.glow, s.ring); s.m.dispose(); s.tex.dispose(); particles.emit(s.x, 1, s.z, p.hero.color, 14, { speed: 4, life: 0.4 }); }
      continue;
    }
    const tg = nearestEnemy(s.x, s.z, s.kind === 'clone' ? 14 : 11);
    if (s.kind === 'drone' || s.kind === 'agent') {
      let gx, gz;
      if (tg && s.kind === 'drone') { const a = s.t * 1.6 + s.angle; gx = tg.x + Math.cos(a) * 3; gz = tg.z + Math.sin(a) * 3; }
      else { const a = s.angle + s.t * 0.4; gx = p.x + Math.cos(a) * 2.4; gz = p.z + Math.sin(a) * 2.4; }
      const sp = s.kind === 'drone' ? 9 : 6.5; const dx = gx - s.x, dz = gz - s.z, d = Math.hypot(dx, dz);
      if (d > 0.1) { const st = Math.min(d, sp * dt); if (s.kind === 'drone') { s.x += dx / d * st; s.z += dz / d * st; } else moveCircle(s, dx / d * st, dz / d * st, 0.35); }
      s.fireT -= dt;
      if (tg && s.fireT <= 0 && lineOfSight(s.x, s.z, tg.x, tg.z)) { s.fireT = s.kind === 'drone' ? 0.75 : 0.85; firePlayerProj(p, Math.atan2(tg.z - s.z, tg.x - s.x), { mode: 'legacy', rot: 'spin', dmg: s.kind === 'drone' ? 0.85 : 0.75, size: 0.75, home: 5, life: 1.2, speed: 15, x: s.x, z: s.z }); }
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
    const fl = s.kind === 'clone' ? (s.facing || 1) : 1;
    s.s.scale.set(s.w * fl, s.h, 1); s.s.position.set(s.x, s.y + (s.kind === 'agent' ? Math.abs(Math.sin(s.t * 8)) * 0.08 : 0), s.z);
    s.m.opacity = Math.min(1, s.life * 2) * (s.kind === 'clone' ? 0.85 : 1);
    if (s.shadow) s.shadow.position.set(s.x, 0.03, s.z);
    if (s.life <= 0) { s.alive = false; scene.remove(s.s); s.m.dispose(); if (s.shadow) scene.remove(s.shadow); particles.emit(s.x, 1, s.z, p.hero.color, 10, { speed: 3, life: 0.4 }); }
  }
  G.summons = G.summons.filter(s => s.alive);
}
