/* ------------------------------------------------------------------
   ENEMIES: glitch fauna (procedural PBR meshes), the CPU faction
   (Batch 08 pixel sprites, 12 tactical archetypes + Batch 09 squad
   director), telegraphed attacks, 10 bosses with Batch 09 state
   animation, Four Locks rival guardians, enemy fire and player harm.
------------------------------------------------------------------- */
const sectorScale = () => 1 + (G.floor - 1) * 0.28;
const dmgScale = () => 1 + (G.floor - 1) * 0.12;

/* ---------- enemy bullets ---------- */
const EPOOL = [];
const eBulletMat = c => new THREE.SpriteMaterial({ map: TEX.glow, color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
function fireEnemyBullet(x, z, ang, speed, dmg, color = 0xff3df0, size = 0.9, o = {}) {
  let b = EPOOL.find(b => !b.alive);
  if (!b) { const s = new THREE.Sprite(eBulletMat(color)); s.renderOrder = 7; scene.add(s); const core = new THREE.Sprite(eBulletMat(0xffffff)); core.scale.setScalar(0.38); s.add(core); b = { s, alive: false }; EPOOL.push(b); }
  b.alive = true; b.s.visible = true; b.s.material.color.set(color);
  b.x = x; b.z = z; b.vx = Math.cos(ang) * speed; b.vz = Math.sin(ang) * speed; b.dmg = dmg; b.life = 5; b.size = size; b.status = o.status || null; b.t = 0;
  b.s.scale.setScalar(size); b.s.position.set(x, 1.05, z);
}
function clearEnemyBullets(x, z, R, a0 = null, half = 0) {
  for (const b of EPOOL) {
    if (!b.alive) continue; const dx = b.x - x, dz = b.z - z, d = Math.hypot(dx, dz); if (d > R) continue;
    if (a0 !== null) { let da = Math.atan2(dz, dx) - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; if (Math.abs(da) > half + 0.25) continue; }
    b.alive = false; b.s.visible = false; particles.emit(b.x, 1, b.z, 0xffffff, 4, { speed: 3, life: 0.25, size: 0.2 });
  }
}
function updateEnemyBullets(dt) {
  const p = G.p;
  for (const b of EPOOL) {
    if (!b.alive) continue;
    b.life -= dt; b.t += dt; b.x += b.vx * dt; b.z += b.vz * dt;
    if (solidAt(b.x, b.z) || b.life <= 0) { b.alive = false; b.s.visible = false; particles.emit(b.x, 1, b.z, b.s.material.color, 4, { speed: 2, life: 0.2 }); continue; }
    if (G.shield && Math.hypot(b.x - p.x, b.z - p.z) < 3.3) { b.alive = false; b.s.visible = false; particles.emit(b.x, 1, b.z, 0xffb050, 6, { speed: 3, life: 0.3 }); continue; }
    if (G.vortex && Math.hypot(b.x - G.vortex.x, b.z - G.vortex.z) < G.vortex.r) { b.alive = false; b.s.visible = false; particles.emit(b.x, 1, b.z, 0x8fa8ff, 4, { speed: 2, life: 0.3 }); continue; }
    if (Math.hypot(b.x - p.x, b.z - p.z) < p.r + b.size * 0.25) { b.alive = false; b.s.visible = false; hurtPlayer(b.dmg); if (b.status) applyPlayerStatus(b.status, 1.6); continue; }
    b.s.position.set(b.x, 1.05, b.z); b.s.scale.setScalar(b.size * (1 + Math.sin(b.t * 20) * 0.08));
  }
}

/* ---------- glitch fauna: procedural meshes ---------- */
const enemyGeo = {};
function eMat(color, emissive, ei = 1.2, opts = {}) {
  return new THREE.MeshStandardMaterial({ map: TEX.metal.map, roughnessMap: TEX.metal.roughnessMap, normalMap: TEX.metal.normalMap, color, emissive, emissiveIntensity: ei, metalness: opts.metal ?? 0.75, roughness: 1, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 });
}
function initEnemyGeo() {
  enemyGeo.sphere = new THREE.SphereGeometry(1, 18, 12); enemyGeo.box = new THREE.BoxGeometry(1, 1, 1); enemyGeo.cyl = new THREE.CylinderGeometry(1, 1, 1, 6);
  enemyGeo.ico = new THREE.IcosahedronGeometry(1, 1); enemyGeo.tet = new THREE.TetrahedronGeometry(1); enemyGeo.cone = new THREE.ConeGeometry(1, 1, 6);
  enemyGeo.hex = new THREE.CylinderGeometry(1, 1.15, 1, 6); enemyGeo.torus = new THREE.TorusGeometry(0.7, 0.07, 8, 32); enemyGeo.oct = new THREE.OctahedronGeometry(1, 0);
}
function buildFaunaMesh(type) {
  const root = new THREE.Group(); const mats = []; const parts = {};
  const M = (c, e, ei, o) => { const m = eMat(c, e, ei, o); mats.push(m); return m; };
  if (type === 'bug') {
    const shell = M(0x5a1820, 0x200004, 0.4);
    const body = new THREE.Mesh(enemyGeo.sphere, shell); body.scale.set(0.55, 0.38, 0.75); body.position.y = 0.5; root.add(body);
    const head = new THREE.Mesh(enemyGeo.sphere, shell); head.scale.set(0.32, 0.26, 0.3); head.position.set(0, 0.5, 0.72); root.add(head);
    const eye = M(0x000000, 0xff2a3a, 4, { metal: 0 });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(enemyGeo.sphere, eye); e.scale.setScalar(0.07); e.position.set(s * 0.13, 0.58, 0.95); root.add(e); }
    const st = new THREE.Mesh(enemyGeo.box, M(0x111111, 0xff3344, 2.2, { metal: 0.2 })); st.scale.set(0.06, 0.04, 1.1); st.position.set(0, 0.86, 0); root.add(st);
    parts.legs = []; const legMat = M(0x2a1a1a, 0x000000, 0);
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
    parts.frags = []; for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(enemyGeo.tet, m); f.scale.setScalar(0.18); root.add(f); parts.frags.push(f); }
  } else if (type === 'worm') {
    parts.segs = []; const m = M(0x163a2a, 0x10ff80, 0.55), band = M(0x061008, 0x40ff9a, 2.6, { metal: 0.2 });
    for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(enemyGeo.sphere, i % 2 ? band : m); const sc = 0.48 - i * 0.05; s.scale.setScalar(sc); s.position.set(0, sc, -i * 0.45); root.add(s); parts.segs.push(s); }
    const j = new THREE.Mesh(enemyGeo.cone, M(0x000000, 0xb8ffd8, 4, { metal: 0 })); j.scale.set(0.25, 0.4, 0.25); j.rotation.x = Math.PI / 2; j.position.set(0, 0.48, 0.5); root.add(j);
  } else if (type === 'sentinel') {
    const m = M(0x3b3f4c, 0x000000, 0, { metal: 0.9 });
    const base = new THREE.Mesh(enemyGeo.hex, m); base.scale.set(0.85, 0.7, 0.85); base.position.y = 0.35; root.add(base);
    const r = new THREE.Mesh(enemyGeo.torus, M(0x111111, 0xffb020, 2.6)); r.rotation.x = Math.PI / 2; r.position.y = 1.15; root.add(r); parts.ring = r;
    const core = new THREE.Mesh(enemyGeo.oct, M(0x221100, 0xffc040, 3.2, { metal: 0.2 })); core.scale.setScalar(0.42); core.position.y = 1.55; root.add(core); parts.core = core;
  }
  return { root, mats, parts };
}

/* ---------- spawning ---------- */
let enemyUid = 0;
function baseEnemy(o) {
  return Object.assign({ uid: ++enemyUid, vx: 0, vz: 0, alive: true, t: rand() * 10, aggro: false, fireT: rr(0.6, 2), stateT: 0, state: 'idle', reveal: 0, flash: 0, knock: [0, 0], st: {}, facing: rand() * 6.28, home: [o.x, o.z], group: 0, shadow: makeShadow(o.r || 0.5) }, o);
}
function spawnFauna(type, x, z, group = 0) {
  const def = ENEMY_DEFS[type];
  const { root, mats, parts } = buildFaunaMesh(type); root.position.set(x, 0, z); scene.add(root);
  const hp = def.hp * sectorScale();
  const e = baseEnemy({ fam: 'fauna', type, def, x, z, r: def.radius, hp, maxHp: hp, root, mats, parts, touch: def.touch * dmgScale(), group });
  mats.forEach(m => m.userData.baseEI = m.emissiveIntensity);
  G.enemies.push(e); return e;
}
function spawnCPU(type, x, z, group = 0) {
  const def = CPU_DEFS[type], meta = BATCH.enemies.find(m => m.id === type);
  const tex = SHEETS.enemies.tex.clone(); tex.needsUpdate = true;
  const mat = pixelSpriteMat(tex, { dissolveCol: hexInt(meta.color) }); const spr = new THREE.Sprite(mat);
  spr.center.set(0.5, 1 - 59 / 64); spr.renderOrder = 5; spr.scale.setScalar(def.scale); scene.add(spr);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: hexInt(meta.color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.22 })); glow.scale.setScalar(def.scale * 0.9); scene.add(glow);
  const hp = def.hp * sectorScale();
  const e = baseEnemy({ fam: 'cpu', type, def: { ...def, name: meta.name }, meta, x, z, r: def.radius, hp, maxHp: hp, spr, mat, tex, glow, touch: def.touch * dmgScale(), group, color: hexInt(meta.color), frame: -1, seed: Math.floor(rand() * 1000), ai: CPU_AI[type] });
  G.enemies.push(e); return e;
}
function spawnEnemy(type, x, z, group = 0) { return ENEMY_DEFS[type] ? spawnFauna(type, x, z, group) : spawnCPU(type, x, z, group); }

function damageEnemy(e, d, crit, kx = 0, kz = 0, o = {}) {
  if (!e.alive || e.hidden || e.invuln > 0) return;
  if (e.def.frontal && (kx || kz)) { const fa = Math.atan2(G.p.z - e.z, G.p.x - e.x), ha = Math.atan2(-kz, -kx); let da = fa - ha; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; if (Math.abs(da) < 0.9 && e.state !== 'stagger') { d *= 0.35; if (!e._sh || e._sh < G.time) { e._sh = G.time + 0.2; particles.emit(e.x, 1.1, e.z, 0x9cdbfa, 5, { speed: 3, life: 0.2, size: 0.25 }); } } }
  e.hp -= d; G.dmgDealt += d; e.flash = 0.09; alertGroup(e);
  if (!e.def.boss && !e.def.heavy) { const l = Math.hypot(kx, kz) || 1, kb = (o.knock ?? 3.5) * (e.def.elite ? 0.4 : 1); e.knock[0] += kx / l * kb; e.knock[1] += kz / l * kb; }
  floatText(e.x, e.z, Math.round(d) + (crit ? '!' : ''), crit ? 'crit' : '', e.def.boss ? 5.5 : 2.2);
  particles.emit(e.x, 1, e.z, G.p.hero.color, crit ? 10 : 5, { speed: 4, life: 0.3, size: 0.22 });
  AUDIO.sfx.hit();
  if (crit) G.hitstop = Math.max(G.hitstop, 0.035);
  if (e.boss) bossOnHit(e, d);
  if (e.hp <= 0) killEnemy(e);
}
function alertGroup(e) {
  if (e.aggro) return; e.aggro = true;
  if (e.group) for (const o of G.enemies) if (o.group === e.group && !o.aggro && !o.boss) { o.aggro = true; o.fireT = rr(0.4, 1.4); }
}
function killEnemy(e) {
  e.alive = false; G.kills++; G.score += (e.def.score || 30) * (1 + G.floor * 0.2);
  const c = e.color ?? (e.type === 'ghost' ? 0xb07aff : e.type === 'worm' ? 0x40ff9a : e.type === 'sentinel' ? 0xffb020 : e.type === 'spam' ? 0xffaa33 : 0xff3344);
  particles.emit(e.x, 0.9, e.z, c, e.boss ? 180 : 26, { speed: e.boss ? 14 : 7, life: e.boss ? 1.4 : 0.6, size: e.boss ? 0.5 : 0.3, up: 1.6 });
  AUDIO.sfx.kill(); shakeAdd(e.boss ? 1.2 : 0.18);
  if (e.boss || e.rival) { AUDIO.sfx.boom(); G.hitstop = 0.25; }
  // dissolve out instead of popping
  G.corpses.push({ e, t: 0, dur: e.boss || e.rival ? 1.3 : 0.45 });
  if (e.st && e.st.construct > 0 || G.p.hero.hitStatus === 'construct') {
    const mine = G.summons.filter(s => s.kind === 'turret' && !s.mine);
    if (mine.length < 3 && G.p.hero.id === 'forgewright') spawnTurret(e.x, e.z, 7, false, true);
    else if (mine.length < 2 && rand() < 0.25) spawnTurret(e.x, e.z, 5, false, true);
  }
  const n = e.def.xp || 3; for (let i = 0; i < Math.min(n, 8); i++) spawnShard(e.x + rr(-0.5, 0.5), e.z + rr(-0.5, 0.5), n / Math.min(n, 8));
  const chance = e.boss ? 1 : e.rival ? 1 : e.def.elite ? 0.3 : 0.06;
  if (rand() < chance) spawnPickup(e.x, e.z);
  if (e.boss || e.rival) for (let i = 0; i < 2; i++) spawnPickup(e.x + rr(-2, 2), e.z + rr(-2, 2));
}
function removeEnemyVisuals(e) {
  if (e.root) { scene.remove(e.root); e.mats.forEach(m => m.dispose()); }
  if (e.spr) { scene.remove(e.spr); e.mat.dispose(); e.tex.dispose(); }
  if (e.glow) scene.remove(e.glow);
  if (e.agent) e.agent.dispose();
  if (e.extra) e.extra.forEach(o => scene.remove(o));
  scene.remove(e.shadow);
}
function updateCorpses(dt) {
  for (const c of G.corpses) {
    c.t += dt; const k = c.t / c.dur, e = c.e;
    if (e.mat) { e.mat.userData.u.uDissolve.value = k; e.mat.userData.u.uFlash.value = Math.max(0, 0.6 - k); }
    if (e.agent) e.agent.mat.userData.u.uDissolve.value = Math.max(0, k * 1.2 - 0.2);
    if (e.root) { e.root.scale.setScalar(Math.max(0.01, 1 - k)); e.root.position.y = k * 0.5; }
    if (e.glow) e.glow.material.opacity *= 0.9;
    if (e.boss && e.spr) bossSetFrame(e, 16 + Math.min(3, Math.floor(k * 4)));
    if (k >= 1) { removeEnemyVisuals(e); c.done = true; }
  }
  G.corpses = G.corpses.filter(c => !c.done);
}

/* ---------- flow field ---------- */
function updateFlow() {
  const p = G.p, tx = worldToTile(p.x), ty = worldToTile(p.z), id = ty * world.W + tx;
  if (id === G.flowTile && G.flow && !G.flowDirty) return; G.flowTile = id; G.flowDirty = false;
  const W = world.W, H = world.H, dist = G.flow && G.flow.length === W * H ? G.flow : new Int16Array(W * H);
  dist.fill(-1); const qx = new Int16Array(W * H), qy = new Int16Array(W * H); let h = 0, t = 0;
  if (isWall(tx, ty)) { G.flow = dist; return; }
  dist[id] = 0; qx[t] = tx; qy[t++] = ty;
  while (h < t) {
    const x = qx[h], y = qy[h++], d = dist[y * W + x]; if (d > 70) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = ny * W + nx; if (dist[ni] !== -1 || world.grid[ni] !== T_FLOOR) continue; dist[ni] = d + 1; qx[t] = nx; qy[t++] = ny; }
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

/* ---------- telegraphs (Batch 07 geometry: lane, ring, circle, cone) ---------- */
const tgGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function telegraphMat(color, kind, inner, spread) {
  return new THREE.ShaderMaterial({
    uniforms: { prog: { value: 0 }, flash: { value: 0 }, col: { value: new THREE.Color(color) }, kind: { value: kind }, inner: { value: inner }, spread: { value: spread }, t: SHARED_T },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float prog; uniform float flash; uniform vec3 col; uniform float kind; uniform float inner; uniform float spread; uniform float t;
      void main(){ vec2 p=vUv*2.0-1.0; float r=length(p); float a=abs(atan(p.y,p.x)); float inside=0.0, fill=0.0, border=0.0;
        if(kind<0.5){ inside=1.0; fill=step(vUv.x,prog); border=smoothstep(0.86,1.0,abs(p.y))+smoothstep(0.97,1.0,abs(p.x)); }
        else if(kind<1.5){ inside=step(r,1.0); fill=step(r,prog); border=smoothstep(0.9,0.98,r)*inside; }
        else if(kind<2.5){ inside=step(inner,r)*step(r,1.0); fill=step(r,inner+(1.0-inner)*prog); border=(smoothstep(0.9,0.98,r)+smoothstep(inner+0.08,inner,r))*inside; }
        else { inside=step(r,1.0)*step(a,spread); fill=step(r,prog); border=(smoothstep(0.9,0.98,r)+smoothstep(spread-0.06,spread,a))*inside; }
        if(inside<0.5) discard;
        float stripes=step(0.5,fract((p.x+p.y)*4.0-t*3.0))*0.12;
        float v=0.16+stripes+fill*0.38+border*0.85+flash;
        gl_FragColor=vec4(col*(1.2+flash*2.0+fill*0.6), clamp(v,0.0,1.0)*(1.0-flash*0.3)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
/* kind: lane | circle | ring | cone */
function telegraph(kind, x, z, o) {
  const k = { lane: 0, circle: 1, ring: 2, cone: 3 }[kind];
  const R = o.r ?? 3, mesh = new THREE.Mesh(tgGeo, telegraphMat(o.color ?? 0xff3355, k, o.inner ?? 0.5, o.spread ?? 0.6)); mesh.renderOrder = 2;
  if (kind === 'lane') { const L = o.len ?? 20, W = o.w ?? 2.4; mesh.scale.set(L, 1, W); mesh.rotation.y = -o.ang; mesh.position.set(x + Math.cos(o.ang) * L / 2, 0.07, z + Math.sin(o.ang) * L / 2); }
  else { mesh.scale.set(R * 2, 1, R * 2); mesh.position.set(x, 0.07, z); if (kind === 'cone') mesh.rotation.y = -o.ang; }
  scene.add(mesh);
  const tg = { kind, x, z, mesh, t: 0, wind: o.wind ?? 1, dmg: o.dmg ?? 20, status: o.status, ang: o.ang ?? 0, len: o.len ?? 20, w: o.w ?? 2.4, r: R, inner: (o.inner ?? 0.5) * R, spread: o.spread ?? 0.6, owner: o.owner, onFire: o.onFire, fired: false, color: o.color ?? 0xff3355, follow: o.follow };
  G.telegraphs.push(tg); AUDIO.sfx.warn(); return tg;
}
function inTelegraph(tg, px, pz, pr = 0.4) {
  const dx = px - tg.x, dz = pz - tg.z;
  if (tg.kind === 'lane') { const ca = Math.cos(tg.ang), sa = Math.sin(tg.ang), along = dx * ca + dz * sa, perp = Math.abs(-dx * sa + dz * ca); return along > -pr && along < tg.len + pr && perp < tg.w / 2 + pr; }
  const d = Math.hypot(dx, dz);
  if (tg.kind === 'circle') return d < tg.r + pr;
  if (tg.kind === 'ring') return d < tg.r + pr && d > tg.inner - pr;
  let da = Math.atan2(dz, dx) - tg.ang; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  return d < tg.r + pr && Math.abs(da) < tg.spread;
}
function updateTelegraphs(dt) {
  const p = G.p;
  for (const tg of G.telegraphs) {
    tg.t += dt; const u = tg.mesh.material.uniforms;
    if (!tg.fired) {
      u.prog.value = clamp(tg.t / tg.wind, 0, 1);
      if (tg.t >= tg.wind) {
        tg.fired = true; tg.t = 0; u.flash.value = 1; AUDIO.sfx.telegraph(); shakeAdd(0.25);
        if (inTelegraph(tg, p.x, p.z)) { hurtPlayer(tg.dmg); if (tg.status) applyPlayerStatus(tg.status, 2.4, tg); }
        burstTelegraph(tg); tg.onFire && tg.onFire(tg);
      }
    } else { u.flash.value = Math.max(0, 1 - tg.t / 0.3); if (tg.t > 0.3) tg.done = true; }
    if (tg.done) { scene.remove(tg.mesh); tg.mesh.material.dispose(); }
  }
  G.telegraphs = G.telegraphs.filter(t => !t.done);
}
function burstTelegraph(tg) {
  const c = tg.color;
  if (tg.kind === 'lane') { for (let s = 0; s < tg.len; s += 1.2) particles.emit(tg.x + Math.cos(tg.ang) * s, 0.5, tg.z + Math.sin(tg.ang) * s, c, 3, { speed: 4, life: 0.45, size: 0.35, up: 2 }); }
  else if (tg.kind === 'cone') { for (let i = 0; i < 30; i++) { const a = tg.ang + rr(-tg.spread, tg.spread), d = rr(0.5, tg.r); particles.emit(tg.x + Math.cos(a) * d, 0.5, tg.z + Math.sin(a) * d, c, 1, { speed: 3, life: 0.45, size: 0.35, up: 2 }); } }
  else { shockRing(tg.x, tg.z, tg.r, c, 0.4); particles.emit(tg.x, 0.5, tg.z, c, 30, { speed: tg.r * 2.5, life: 0.5, size: 0.35, up: 0.6 }); }
  if (tg.owner && tg.owner.boss) bossSigFx(tg.owner, tg.kind === 'lane' ? tg.x + Math.cos(tg.ang) * tg.len * 0.5 : tg.x, tg.kind === 'lane' ? tg.z + Math.sin(tg.ang) * tg.len * 0.5 : tg.z, tg.kind === 'circle' ? tg.r * 1.6 : 4);
}

/* ---------- player harm + statuses ---------- */
function hurtPlayer(raw) {
  const p = G.p; if (p.inv > 0 || p.dashT > 0 || p.dead || G.mode !== 'play') return;
  if (G.shield) { particles.emit(p.x, 1, p.z, 0xffb050, 8, { speed: 3, life: 0.3 }); return; }
  let d = raw * (1 - p.st.def * (p.st8.fracture > 0 ? 0.5 : 1)) * (p.hero.takenMul || 1) * p.mods.armor;
  if (p.st8.mark > 0) d *= 1.25;
  p.hp -= d; p.inv = 0.55; p.hurtFlash = 0.25; shakeAdd(0.35);
  floatText(p.x, p.z, '-' + Math.round(d), 'hurt', 2.8); AUDIO.sfx.hurt();
  particles.emit(p.x, 1, p.z, 0xff2244, 14, { speed: 5, life: 0.4 });
  if (!p.atk) setReact(p, 'hurt', 0.28);
  const hEl = document.getElementById('hurt'); hEl.classList.remove('on'); void hEl.offsetWidth; hEl.classList.add('on');
  if (p.hp <= 0) { p.hp = 0; playerDie(); }
}
function applyPlayerStatus(kind, dur, src) {
  const p = G.p; if (!kind || p.dead) return;
  if (kind === 'pull' && src) { const dx = (src.owner ? src.owner.x : src.x) - p.x, dz = (src.owner ? src.owner.z : src.z) - p.z, d = Math.hypot(dx, dz) || 1; p.vx += dx / d * 14; p.vz += dz / d * 14; }
  if (kind === 'stun') dur = Math.min(dur, 0.7);
  p.st8[kind] = Math.max(p.st8[kind] || 0, dur);
  if (kind === 'burn' || kind === 'poison') p.st8[kind + 'Dps'] = 4 * dmgScale();
  floatText(p.x, p.z, STATUS[kind]?.label || kind, 'warn', 3.4); AUDIO.sfx.status();
}
function updatePlayerStatus(dt) {
  const p = G.p, s = p.st8;
  for (const k of Object.keys(s)) if (!k.endsWith('Dps') && s[k] > 0) s[k] = Math.max(0, s[k] - dt);
  for (const k of ['burn', 'poison']) if (s[k] > 0) { p.hp -= (s[k + 'Dps'] || 4) * dt * p.mods.armor; if (rand() < dt * 8) particles.emit(p.x, 1, p.z, STATUS[k].color, 1, { speed: 1, life: 0.4, size: 0.25, lift: 2 }); if (p.hp <= 0 && !p.dead) { p.hp = 0; playerDie(); } }
}

/* ---------- CPU tactics (Batch 08 archetypes) + squad director (Batch 09) ---------- */
const SQUAD = { state: 'advance', t: 0, orders: new Map() };
function squadOrders(dt) {
  SQUAD.t -= dt; if (SQUAD.t > 0) return; SQUAD.t = 0.4;
  const p = G.p, now = G.time * 1000;
  const living = G.enemies.filter(e => e.alive && e.fam === 'cpu' && e.aggro && !e.boss).sort((a, b) => a.uid - b.uid);
  const injured = living.filter(e => e.hp < e.maxHp * 0.48).length, healers = living.filter(e => e.type === 'healer').length;
  const st = injured > living.length * 0.38 && healers ? 'recover' : now % 12500 < 2500 ? 'pin' : now % 12500 < 6900 ? 'encircle' : now % 12500 < 9500 ? 'advance' : 'rush';
  SQUAD.state = st; SQUAD.orders.clear();
  living.forEach((e, i) => {
    const role = SQUAD_ROLES[i % SQUAD_ROLES.length]; let rx = e.x - p.x, rz = e.z - p.z; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    let tx = p.x, tz = p.z;
    if (role === 'flanker_left' || role === 'flanker_right') { const s = role === 'flanker_left' ? 1 : -1; tx = p.x + rz * s * 2.6; tz = p.z - rx * s * 2.6; }
    else if (role === 'suppressor') { tx = p.x + rx * 6.4; tz = p.z + rz * 6.4; }
    else if (role === 'support') { const f = living.find(a => a.type === 'brute' || a.type === 'shield') || living[0]; tx = f.x + rx * 1.4; tz = f.z + rz * 1.4; }
    else if (role === 'reserve') { tx = p.x + rx * 5; tz = p.z + rz * 5; }
    else { const d = st === 'rush' ? 1.4 : 2.4; tx = p.x + rx * d; tz = p.z + rz * d; }
    if (st === 'recover' && role !== 'support') { tx = p.x + rx * 7; tz = p.z + rz * 7; }
    SQUAD.orders.set(e.uid, { role, tx, tz, weight: st === 'encircle' ? 0.8 : st === 'recover' ? 0.9 : st === 'pin' ? 0.3 : 0.55 });
  });
}
function cpuFire(e, kind, ang, dist) {
  const d = 8 * dmgScale(), c = e.color, st = e.st || {};
  if (st.silence > 0) return;
  switch (kind) {
    case 'shot': fireEnemyBullet(e.x, e.z, ang, 9, d, c, 0.85); break;
    case 'burst': for (let i = 0; i < 3; i++) after(i * 0.09, () => { if (e.alive) fireEnemyBullet(e.x, e.z, ang + rr(-0.08, 0.08), 11, d * 0.6, c, 0.7); }); break;
    case 'spread': for (let i = -1; i <= 1; i++) fireEnemyBullet(e.x, e.z, ang + i * 0.2, 9, d * 0.8, c, 0.8); break;
    case 'beam': telegraph('lane', e.x, e.z, { ang, len: Math.min(24, rayLength(e.x, e.z, Math.cos(ang), Math.sin(ang), 24)), w: 1.1, wind: e.type === 'sniper' ? 0.9 : 0.65, dmg: d * 2, color: c, owner: e }); break;
    case 'arc': telegraph('cone', e.x, e.z, { ang, r: e.type === 'brute' ? 3.2 : 2.4, spread: e.type === 'brute' ? 1.0 : 0.8, wind: e.type === 'brute' ? 0.6 : 0.38, dmg: d * (e.type === 'brute' ? 2.2 : 1.4), color: c, owner: e }); break;
    case 'pulse': telegraph('circle', G.p.x + G.p.vx * 0.4, G.p.z + G.p.vz * 0.4, { r: 2.2, wind: 0.95, dmg: d * 1.6, color: c, owner: e, status: G.floor > 3 ? 'slow' : null }); break;
  }
  AUDIO.sfx.eshot(); e.atkT = 0.3;
}
function cpuAI(e, dt, dx, dz, dist, los) {
  const p = G.p, ux = dx / (dist || 1), uz = dz / (dist || 1), side = e.seed % 2 ? 1 : -1, sx = -uz * side, sz = ux * side;
  let mx = 0, mz = 0; const ap = (a = 1) => { mx = ux * a; mz = uz * a; }, rt = () => { mx = -ux; mz = -uz; }, orb = b => { mx = sx + b * ux; mz = sz + b * uz; };
  e.fireT -= dt;
  const ready = e.fireT <= 0 && los;
  switch (e.ai) {
    case 'orbit': orb(dist > 3.4 ? 0.45 : -0.2); if (ready && dist < 11) { e.fireT = rr(1.1, 1.5); cpuFire(e, 'burst', Math.atan2(dz, dx)); } break;
    case 'rifle': if (dist > 6.5) ap(); else if (dist < 4) rt(); else orb(0); if (ready && dist < 12) { e.fireT = rr(1, 1.4); cpuFire(e, G.floor > 2 ? 'spread' : 'shot', Math.atan2(dz, dx)); } break;
    case 'turret': if (ready && dist < 18) { e.fireT = rr(2.3, 2.9); cpuFire(e, 'beam', Math.atan2(dz, dx)); } break;
    case 'melee': ap(1.5); if (ready && dist < 2.4) { e.fireT = 0.85; cpuFire(e, 'arc', Math.atan2(dz, dx)); } break;
    case 'brute': ap(dist > 1.6 ? 0.7 : 0); if (ready && dist < 3.2) { e.fireT = 1.5; cpuFire(e, 'arc', Math.atan2(dz, dx)); } break;
    case 'caster': orb(dist > 5 ? 0.55 : -0.5); if (ready && dist < 11) { e.fireT = rr(2.4, 3); cpuFire(e, 'pulse', 0); } break;
    case 'sniper': if (dist < 6) rt(); else if (dist > 10) ap(); if (ready && dist < 20) { e.fireT = rr(2.2, 2.8); cpuFire(e, 'beam', Math.atan2(dz, dx)); } break;
    case 'shield': ap(dist > 3 ? 0.75 : 0); if (ready && dist < 7) { e.fireT = rr(1.5, 1.9); cpuFire(e, 'shot', Math.atan2(dz, dx)); } break;
    case 'healer': {
      const hurt = G.enemies.filter(a => a.alive && a !== e && a.hp < a.maxHp * 0.8 && !a.boss).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt) { const hx = hurt.x - e.x, hz = hurt.z - e.z, hd = Math.hypot(hx, hz) || 1; if (hd > 2.6) { mx = hx / hd; mz = hz / hd; } if (e.fireT <= 0 && hd < 7) { e.fireT = 1.8; hurt.hp = Math.min(hurt.maxHp, hurt.hp + hurt.maxHp * 0.22); zap(jagged(e.x, e.z, hurt.x, hurt.z, 4, 0.2), 0x77ef9e, 1.3); particles.emit(hurt.x, 1.2, hurt.z, 0x77ef9e, 10, { speed: 2, life: 0.5, lift: 2 }); floatText(hurt.x, hurt.z, '+heal', 'info', 2.4); } }
      else if (dist < 5) rt();
      break;
    }
    case 'bomber':
      if (e.state === 'fuse') { e.stateT -= dt; e.flash = Math.sin(e.stateT * 40) > 0 ? 0.06 : 0; if (e.stateT <= 0) { e.hp = 0; const x = e.x, z = e.z; shockRing(x, z, 2.8, e.color, 0.4); particles.emit(x, 0.8, z, 0xffae44, 50, { speed: 9, life: 0.5, size: 0.4 }); AUDIO.sfx.boom(); shakeAdd(0.5); if (Math.hypot(G.p.x - x, G.p.z - z) < 2.9) hurtPlayer(22 * dmgScale()); for (const o of G.enemies) if (o !== e && o.alive && Math.hypot(o.x - x, o.z - z) < 2.8) { o.hp -= 20; } killEnemy(e); } }
      else { ap(1.9); if (dist < 1.8) { e.state = 'fuse'; e.stateT = 0.8; floatText(e.x, e.z, '!!', 'warn', 2.6); AUDIO.sfx.warn(); } }
      break;
    case 'elite': orb(dist > 5 ? 0.8 : -0.3); if (ready && dist < 14) { e.fireT = (G.time % 4.8) < 2.3 ? 0.9 : 1.4; cpuFire(e, (G.time % 4.8) < 2.3 ? 'burst' : 'beam', Math.atan2(dz, dx)); } break;
  }
  // blend with squad orders (heal / detonate / turret keep their own policy)
  const o = SQUAD.orders.get(e.uid);
  if (o && e.ai !== 'healer' && e.ai !== 'turret' && e.state !== 'fuse') {
    const ox = o.tx - e.x, oz = o.tz - e.z, od = Math.hypot(ox, oz);
    if (od > 0.4) { mx = mx * (1 - o.weight) + ox / od * o.weight; mz = mz * (1 - o.weight) + oz / od * o.weight; }
    e.role = o.role;
  }
  if (!los && dist > 2) { const f = flowDir(e.x, e.z); if (f) { mx = f[0]; mz = f[1]; } }
  return [mx, mz];
}

/* ---------- glitch fauna AI ---------- */
function faunaAI(e, dt, dx, dz, dist, los, tg) {
  let mx = 0, mz = 0, sp = e.def.speed;
  const chase = () => { if (los) { mx = dx / dist; mz = dz / dist; } else { const f = flowDir(e.x, e.z); if (f) { mx = f[0]; mz = f[1]; } } };
  switch (e.type) {
    case 'bug': case 'spam': chase(); break;
    case 'ghost': {
      if (dist > 8) chase(); else if (dist < 5.5) { mx = -dx / dist; mz = -dz / dist; } else { mx = -dz / dist * 0.7; mz = dx / dist * 0.7; }
      e.fireT -= dt; if (e.fireT <= 0 && los && dist < 13 && !(e.st.silence > 0)) { e.fireT = rr(1.8, 2.6); const a = Math.atan2(dz, dx); fireEnemyBullet(e.x, e.z, a, 7.5, 9 * dmgScale(), 0xc06bff); if (G.floor >= 4) { fireEnemyBullet(e.x, e.z, a + 0.25, 7.5, 7, 0xc06bff); fireEnemyBullet(e.x, e.z, a - 0.25, 7.5, 7, 0xc06bff); } AUDIO.sfx.eshot(); }
      break;
    }
    case 'worm': {
      if (e.state === 'wind') { e.stateT -= dt; if (e.stateT <= 0) { e.state = 'dash'; e.stateT = 0.45; const l = dist || 1; e.dash = [dx / l, dz / l]; } }
      else if (e.state === 'dash') { e.stateT -= dt; mx = e.dash[0]; mz = e.dash[1]; sp = 15; if (e.stateT <= 0) { e.state = 'idle'; e.fireT = rr(2.4, 3.6); } }
      else { chase(); e.fireT -= dt; if (e.fireT <= 0 && los && dist < 10) { e.state = 'wind'; e.stateT = 0.55; } }
      break;
    }
    case 'sentinel': {
      e.fireT -= dt;
      if (e.fireT <= 0 && los && dist < 16 && !(e.st.silence > 0)) {
        e.fireT = rr(1.8, 2.4); const a = Math.atan2(dz, dx), dmg = 8 * dmgScale();
        if (rand() < (G.floor >= 3 ? 0.35 : 0.1)) for (let i = 0; i < 10; i++) fireEnemyBullet(e.x, e.z, i / 10 * 6.283, 6, dmg, 0xffb020);
        else for (let i = -1; i <= 1; i++) fireEnemyBullet(e.x, e.z, a + i * 0.18, 9, dmg, 0xffb020);
        AUDIO.sfx.eshot();
      }
      break;
    }
  }
  return [mx, mz, sp];
}
function animateFauna(e) {
  const P = e.parts, t = e.t;
  if (e.type === 'bug') P.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 16 + i * 2) * 0.5; });
  if (e.type === 'spam') { P.body.rotation.y = t * 3; e.root.position.y = Math.abs(Math.sin(t * 10)) * 0.25; }
  if (e.type === 'ghost') { P.body.position.y = 1.2 + Math.sin(t * 2.4) * 0.2; P.body.rotation.y = t; P.frags.forEach((f, i) => { const a = t * 1.8 + i * 1.57; f.position.set(Math.cos(a) * 0.95, 1.2 + Math.sin(a * 2) * 0.25, Math.sin(a) * 0.95); f.rotation.x = t * 3; }); }
  if (e.type === 'worm') P.segs.forEach((s, i) => { s.position.x = Math.sin(t * 9 - i * 0.9) * 0.22 * (e.state === 'wind' ? 2.5 : 1); });
  if (e.type === 'sentinel') { P.ring.rotation.z = t * 2.5; P.core.rotation.y = t * 1.5; P.core.position.y = 1.55 + Math.sin(t * 3) * 0.08; }
}
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }
function enemyTarget(e) {
  const decoys = G.summons.filter(s => s.kind === 'decoy' && s.alive);
  if (decoys.length) { let b = decoys[0], bd = 1e9; for (const d of decoys) { const dd = (d.x - e.x) ** 2 + (d.z - e.z) ** 2; if (dd < bd) { bd = dd; b = d; } } if (bd < 16 * 16) return b; }
  return G.p;
}

/* ---------- master enemy update ---------- */
function updateEnemies(dt) {
  const p = G.p; squadOrders(dt);
  for (const e of G.enemies) {
    if (!e.alive || e.hidden) continue;
    e.t += dt; e.reveal = Math.max(0, e.reveal - dt); if (e.invuln > 0) e.invuln -= dt;
    const s = e.st;
    for (const k in s) if (!k.endsWith('Dps') && !k.endsWith('N') && s[k] > 0) s[k] = Math.max(0, s[k] - dt);
    for (const k of ['bleed', 'burn', 'poison']) if (s[k] > 0) { e.dotT = (e.dotT || 0) - dt; if (e.dotT <= 0) { e.dotT = 0.5; damageEnemy(e, (s[k + 'Dps'] || 4) * 0.5, false); if (!e.alive) break; } }
    if (!e.alive) continue;
    e.confused = s.confuse || 0;
    if (e.boss) { bossUpdate(e, dt); continue; }
    if (e.rival) { rivalUpdate(e, dt); continue; }
    const tg = enemyTarget(e);
    const dx = tg.x - e.x, dz = tg.z - e.z, dist = Math.hypot(dx, dz) || 0.01;
    if (!e.aggro && dist < 13 && lineOfSight(e.x, e.z, p.x, p.z)) alertGroup(e);
    const los = dist < 22 && lineOfSight(e.x, e.z, tg.x, tg.z);
    let mx = 0, mz = 0, sp = e.def.speed;
    if (s.stun > 0 || s.bind > 0) { sp = 0; }
    else if (e.confused > 0) {
      e.facing += rr(-4, 4) * dt; mx = Math.cos(e.facing); mz = Math.sin(e.facing); sp *= 0.8;
      for (const o of G.enemies) if (o !== e && o.alive && !o.boss && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 < (o.r + e.r + 0.25) ** 2) { if (!o._ch || o._ch < G.time) { o._ch = G.time + 0.4; damageEnemy(o, heroDamage(p, 0.6 * (p.hero.confuseMul || 1), o)[0], false); } }
    } else if (!e.aggro) { mx = Math.cos(e.t * 0.6 + e.home[0]) * 0.25; mz = Math.sin(e.t * 0.5) * 0.25; }
    else if (e.fam === 'cpu') [mx, mz] = cpuAI(e, dt, dx, dz, dist, los);
    else { const r = faunaAI(e, dt, dx, dz, dist, los, tg); mx = r[0]; mz = r[1]; sp = r[2]; }
    if (s.slow > 0 || s.timeslow > 0) sp *= 0.6;
    if (e.type !== 'boss') for (const o of G.enemies) {
      if (o === e || !o.alive || o.hidden) continue; const ox = e.x - o.x, oz = e.z - o.z, d2 = ox * ox + oz * oz, min = e.r + o.r;
      if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2); mx += ox / d * 0.8; mz += oz / d * 0.8; }
    }
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    e.vx = lerp(e.vx, mx * sp, 1 - Math.exp(-dt * 8)); e.vz = lerp(e.vz, mz * sp, 1 - Math.exp(-dt * 8));
    const kd = Math.exp(-dt * 10); e.knock[0] *= kd; e.knock[1] *= kd;
    if (e.def.speed > 0 || Math.abs(e.knock[0]) + Math.abs(e.knock[1]) > 0.1) moveCircle(e, (e.vx + e.knock[0]) * dt, (e.vz + e.knock[1]) * dt, e.r);
    for (const w of [G.vortex, G.well]) if (w && e.def.speed > 0) { const wx = w.x - e.x, wz = w.z - e.z, wd = Math.hypot(wx, wz); if (wd < w.r && wd > 0.4) moveCircle(e, wx / wd * w.pull * dt, wz / wd * w.pull * dt, e.r); }
    if (e.touch > 0 && e.confused <= 0 && !(s.stun > 0)) {
      if (tg === p && dist < e.r + p.r + 0.1) hurtPlayer(e.touch);
      else if (tg !== p && dist < e.r + 1) tg.hp -= e.touch * dt * 3;
    }
    // visuals
    if (Math.hypot(e.vx, e.vz) > 0.3) e.facing = Math.atan2(e.vx, e.vz);
    e.flash = Math.max(0, e.flash - dt);
    if (e.fam === 'fauna') {
      e.root.position.set(e.x, 0, e.z);
      e.root.rotation.y = lerpAngle(e.root.rotation.y, e.type === 'sentinel' ? 0 : e.facing, 1 - Math.exp(-dt * 12));
      animateFauna(e);
      for (const m of e.mats) m.emissiveIntensity = e.flash > 0 ? 6 : m.userData.baseEI * (e.confused > 0 ? 1.5 + Math.sin(G.time * 20) : 1) * (s.mark > 0 || e.reveal > 0 ? 1.4 : 1);
    } else {
      const fi = e.meta.base + (Math.floor(e.t * (e.def.speed > 0 && Math.hypot(e.vx, e.vz) > 0.4 ? 8 : 4)) % 4);
      if (fi !== e.frame) { frameUV(e.tex, 8, 6, fi); e.frame = fi; }
      const face = (e.aggro ? dx : e.vx) < 0 ? -1 : 1, bob = e.def.flying ? 0.5 + Math.sin(e.t * 4) * 0.15 : 0;
      const atk = (e.atkT = Math.max(0, (e.atkT || 0) - dt)) > 0 ? 1.08 : 1;
      e.spr.scale.set(e.def.scale * face * atk, e.def.scale / atk ** 0.5, 1); e.spr.position.set(e.x, bob, e.z);
      e.glow.position.set(e.x, 0.9 + bob, e.z);
      const u = e.mat.userData.u; u.uFlash.value = e.flash > 0 ? 0.85 : e.state === 'fuse' ? 0.4 : 0;
      u.uFlashCol.value.set(e.flash > 0 ? 0xffffff : e.color);
      e.mat.color.setScalar(1); if (e.confused > 0) e.mat.color.setRGB(1, 0.7, 1); else if (s.slow > 0) e.mat.color.setRGB(0.75, 0.85, 1.2); else if (s.mark > 0) e.mat.color.setRGB(1.15, 1.1, 0.8);
    }
    e.shadow.position.set(e.x, 0.03, e.z);
  }
  G.enemies = G.enemies.filter(e => e.alive);
}

/* ---------- bosses ---------- */
function bossSetFrame(e, local) { const idx = e.meta.base + local; if (idx !== e.frame) { frameUV(e.tex, 16, 15, idx); e.frame = idx; } }
function spawnBoss(id, x, z, idx, count) {
  const meta = BATCH.bosses.find(b => b.id === id), col = hexInt(meta.color), acc = hexInt(meta.accent);
  const tex = SHEETS.bosses.tex.clone(); tex.needsUpdate = true;
  const mat = pixelSpriteMat(tex, { dissolveCol: acc, gain: 1 }); const spr = new THREE.Sprite(mat);
  spr.center.set(0.5, 1 - 116 / 128); spr.renderOrder = 5; const S = 7.5; spr.scale.setScalar(S); scene.add(spr);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 })); glow.scale.setScalar(S * 1.2); scene.add(glow);
  const light = new THREE.PointLight(col, 40, 22, 1.4); scene.add(light);
  const ring = new THREE.Mesh(G3.plane, decalRingMat(acc, 8)); ring.scale.setScalar(6.5); ring.renderOrder = 2; scene.add(ring);
  const sig = new THREE.Sprite(pixelSpriteMat((() => { const t = SHEETS.bosses.tex.clone(); t.needsUpdate = true; return t; })(), { gain: 1.3 })); sig.visible = false; sig.renderOrder = 8; scene.add(sig);
  const hp = (900 + (G.floor - 1) * 260) * (count > 1 ? 0.72 : 1) * (1 + idx * 0.08);
  const e = baseEnemy({ fam: 'boss', boss: true, type: id, meta, def: { name: meta.name, boss: true, elite: true, xp: 60, score: 1500, speed: 2.4, heavy: true }, x, z, r: 2, hp, maxHp: hp, spr, mat, tex, glow, light, ring, sig, sigT: 1, extra: [glow, light, ring, sig],
    color: col, accent: acc, name: meta.name, sub: meta.subtitle, phase: 1, cycle: idx, frame: -1, anim: 'idle', animT: 0, scaleS: S, touch: 18 * dmgScale(), atkT: 2.5 + idx * 1.2, volleyT: 1.5 + idx, intro: 1.6, status: BOSS_STATUS[id], spiralA: 0 });
  e.invuln = 1.6; bossSetFrame(e, 12);
  G.enemies.push(e); G.bosses.push(e); return e;
}
function bossAnim(e, name, dur) { e.anim = name; e.animT = 0; e.animDur = dur; }
function bossOnHit(e, d) { if (e.anim === 'idle' && d > e.maxHp * 0.012) bossAnim(e, 'stagger', 0.33); }
function bossSigFx(e, x, z, size) {
  const s = e.sig; if (!s) return; s.visible = true; e.sigT = 0; s.position.set(x, 1.4, z); s.scale.setScalar(size); e.sigPos = [x, z];
}
function bossUpdate(e, dt) {
  const p = G.p, dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz) || 0.01;
  e.t += 0; e.animT += dt;
  // animation
  if (e.intro > 0) { e.intro -= dt; bossSetFrame(e, 12 + Math.min(3, Math.floor((1.6 - e.intro) / 0.4))); }
  else if (e.anim !== 'idle') { const row = { attack: 4, stagger: 8, phase: 12 }[e.anim]; bossSetFrame(e, row + Math.min(3, Math.floor(e.animT / e.animDur * 4))); if (e.animT >= e.animDur) e.anim = 'idle'; }
  else bossSetFrame(e, Math.floor(G.time * 5.2 + e.cycle) % 4);
  // phases (Batch 09: 66% / 33%)
  const frac = e.hp / e.maxHp, ph = frac < 0.33 ? 3 : frac < 0.66 ? 2 : 1;
  if (ph !== e.phase) {
    e.phase = ph; bossAnim(e, 'phase', 1.25); e.invuln = 1.0; showBanner(e.name, ph === 3 ? 'Final phase' : 'Phase 2'); shakeAdd(0.9); AUDIO.sfx.boss();
    shockRing(e.x, e.z, 9, e.accent, 0.6); if (dist < 7) { p.vx += dx / dist * 18; p.vz += dz / dist * 18; }
    const adds = BOSS_ADDS[e.type]; for (let i = 0; i < 1 + ph; i++) { const a = rand() * 6.28; const sx = e.x + Math.cos(a) * 4, sz = e.z + Math.sin(a) * 4; if (!solidAt(sx, sz)) { const n = spawnEnemy(adds[i % adds.length], sx, sz, 900 + e.cycle); n.aggro = true; } }
  }
  if (e.intro > 0) { e.spr.position.set(e.x, 0, e.z); return; }
  // movement: hold mid-range, strafe
  const want = 7.5; let mx = 0, mz = 0;
  if (!(e.st.stun > 0)) { if (dist > want + 1.5) { mx = dx / dist; mz = dz / dist; } else if (dist < want - 2) { mx = -dx / dist; mz = -dz / dist; } else { mx = -dz / dist * 0.6; mz = dx / dist * 0.6; } }
  const sp = (2.1 + e.phase * 0.35) * (e.st.slow > 0 ? 0.7 : 1) * (e.anim === 'phase' ? 0 : 1);
  e.vx = lerp(e.vx, mx * sp, 1 - Math.exp(-dt * 4)); e.vz = lerp(e.vz, mz * sp, 1 - Math.exp(-dt * 4));
  moveCircle(e, e.vx * dt, e.vz * dt, 1.6);
  for (const w of [G.vortex, G.well]) if (w) { const wx = w.x - e.x, wz = w.z - e.z, wd = Math.hypot(wx, wz); if (wd < w.r && wd > 0.4) moveCircle(e, wx / wd * w.pull * 0.15 * dt, wz / wd * w.pull * 0.15 * dt, 1.6); }
  if (dist < e.r + p.r) hurtPlayer(e.touch);
  // attacks: telegraphed patterns + bullet volleys
  const dmg = 16 * dmgScale(), silenced = e.st.silence > 0;
  e.atkT -= dt; e.volleyT -= dt;
  if (e.atkT <= 0 && !silenced) {
    const pat = BOSS_PATTERNS[e.type][(e.cycle + (e.phase >= 2 ? 1 : 0)) % 3]; e.cycle++;
    e.atkT = [3.0, 2.4, 1.9][e.phase - 1]; bossAnim(e, 'attack', 0.65);
    const ang = Math.atan2(dz, dx), c = e.color, base = { dmg, status: e.status, color: c, owner: e };
    if (pat === 'lane') { const n = e.phase; for (let i = 0; i < n; i++) { const a = ang + (i - (n - 1) / 2) * 0.42; telegraph('lane', e.x, e.z, { ...base, ang: a, len: Math.min(26, rayLength(e.x, e.z, Math.cos(a), Math.sin(a), 26)), w: 2.6, wind: 1.0 }); } }
    else if (pat === 'ring') { telegraph('ring', e.x, e.z, { ...base, r: 9, inner: 0.32, wind: 1.1 }); if (e.phase === 3) after(0.6, () => e.alive && telegraph('ring', e.x, e.z, { ...base, r: 14, inner: 0.62, wind: 1.0 })); }
    else if (pat === 'circle') { const pts = [[p.x + p.vx * 0.5, p.z + p.vz * 0.5], [p.x + rr(-3, 3), p.z + rr(-3, 3)], [p.x + rr(-4, 4), p.z + rr(-4, 4)]]; pts.slice(0, 2 + (e.phase > 1 ? 1 : 0)).forEach(([x, z], i) => after(i * 0.18, () => e.alive && telegraph('circle', x, z, { ...base, r: 2.6, wind: 0.9 }))); }
    else { telegraph('cone', e.x, e.z, { ...base, ang, r: 11, spread: 0.55 + e.phase * 0.1, wind: 0.85 }); }
  }
  if (e.volleyT <= 0 && !silenced) {
    e.volleyT = [2.6, 2.0, 1.5][e.phase - 1];
    if (e.phase >= 2 && rand() < 0.45) { // spiral burst
      let n = 0; const iv = () => { if (!e.alive || n++ > 14) return; e.spiralA += 0.45; for (let k = 0; k < e.phase; k++) fireEnemyBullet(e.x, e.z, e.spiralA + k * 6.283 / e.phase, 7, dmg * 0.5, e.accent, 1.0); after(0.09, iv); }; iv();
    } else { const n = 10 + e.phase * 4, off = rand() * 6; for (let i = 0; i < n; i++) fireEnemyBullet(e.x, e.z, off + i / n * 6.283, 6 + e.phase, dmg * 0.55, e.color, 1.1); }
    AUDIO.sfx.eshot();
  }
  // visuals
  const flash = e.flash = Math.max(0, e.flash - dt), u = e.mat.userData.u;
  u.uFlash.value = flash > 0 ? 0.7 : e.invuln > 0 ? 0.25 + Math.sin(G.time * 30) * 0.15 : 0; u.uFlashCol.value.set(flash > 0 ? 0xffffff : e.accent);
  const face = dx < 0 ? -1 : 1, breathe = 1 + Math.sin(G.time * 2) * 0.015;
  e.spr.scale.set(e.scaleS * face, e.scaleS * breathe, 1); e.spr.position.set(e.x, 0.15 + Math.sin(G.time * 1.6) * 0.12, e.z);
  e.glow.position.set(e.x, 3, e.z); e.glow.material.opacity = 0.28 + Math.sin(G.time * 3) * 0.08 + (e.anim === 'attack' ? 0.2 : 0);
  e.light.position.set(e.x, 3.5, e.z); e.light.intensity = 36 + (e.anim === 'attack' ? 30 : 0) + Math.sin(G.time * 4) * 6;
  e.ring.position.set(e.x, 0.06, e.z); e.ring.scale.setScalar(6.5 + e.phase * 0.8);
  e.shadow.position.set(e.x, 0.03, e.z); e.shadow.scale.set(5.5, 3.6, 1);
  if (e.sig.visible) { e.sigT += dt; const f = Math.min(3, Math.floor(e.sigT / 0.09)); const t = e.sig.material.map; frameUV(t, 16, 15, e.meta.base + 20 + f); e.sig.material.opacity = 1 - e.sigT / 0.4; if (e.sigT > 0.4) e.sig.visible = false; }
  if (rand() < dt * 10) particles.emit(e.x + rr(-2, 2), rr(0.5, 4), e.z + rr(-1, 1), e.accent, 1, { speed: 0.6, life: 1, size: 0.3, grav: -1, lift: 0.6 });
}

/* ---------- Four Locks rival guardians: corrupted agents ---------- */
async function spawnRival(cfg, x, z) {
  const others = HEROES.filter(h => h.id !== G.p.hero.id); const h = others[(G.floor * 7 + G.runSeed) % others.length];
  await loadAgent(h.id); if (G.mode === 'title' || G.mode === 'select') return null;
  const a = makeAgentSprite(h.id, SPR_SCALE * 1.45, { dissolveCol: cfg.tint });
  a.mat.color.setRGB(1, 0.78, 0.82);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: cfg.tint, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4 })); aura.scale.setScalar(5); scene.add(aura);
  const light = new THREE.PointLight(cfg.tint, 22, 14, 1.4); scene.add(light);
  const hp = 520 + G.floor * 110;
  const e = baseEnemy({ fam: 'rival', rival: true, type: 'rival', hero: h, cfg, agent: a, def: { name: cfg.name, elite: true, xp: 30, score: 900, speed: 4 }, x, z, r: 0.75, hp, maxHp: hp, name: `${cfg.name}`, sub: `Corrupted ${h.name} · ${cfg.sub}`, color: cfg.tint,
    extra: [aura, light], aura, light, dir: 2, animT: 0, walkT: 0, moving: false, atk: null, react: null, sprite: a, atkT: 2, shotT: 1, phase: 1, summoned: false, touch: 14 * dmgScale() });
  G.enemies.push(e); G.rival = e; return e;
}
function rivalUpdate(e, dt) {
  const p = G.p, dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz) || 0.01;
  if (!e.aggro) { if (dist < 12 && lineOfSight(e.x, e.z, p.x, p.z)) { e.aggro = true; showBanner(e.name, e.sub); AUDIO.sfx.boss(); } }
  const s = e.st, frac = e.hp / e.maxHp;
  if (frac < 0.6 && e.phase === 1) { e.phase = 2; showBanner(e.name, 'Escalating'); shakeAdd(0.5); }
  if (frac < 0.45 && !e.summoned) { e.summoned = true; for (let i = 0; i < 2; i++) { const t = G.sector.cpu[i % G.sector.cpu.length]; const n = spawnEnemy(t, e.x + rr(-3, 3), e.z + rr(-3, 3), e.group); n.aggro = true; } }
  let mx = 0, mz = 0;
  if (e.aggro && !(s.stun > 0) && !(s.bind > 0)) {
    const los = lineOfSight(e.x, e.z, p.x, p.z);
    if (!los) { const f = flowDir(e.x, e.z); if (f) { mx = f[0]; mz = f[1]; } }
    else if (dist > 7) { mx = dx / dist; mz = dz / dist; } else if (dist < 4.5) { mx = -dx / dist; mz = -dz / dist; } else { const sd = Math.sin(G.time * 0.7) > 0 ? 1 : -1; mx = -dz / dist * sd; mz = dx / dist * sd; }
    e.shotT -= dt; e.atkT -= dt;
    const ang = Math.atan2(dz, dx), d = 9 * dmgScale(), c = e.color;
    if (e.shotT <= 0 && los && !(s.silence > 0)) { e.shotT = e.phase === 2 ? 0.8 : 1.15; setAttack(e, 'shot', 0.3); for (let i = 0; i < 3; i++) after(i * 0.08, () => e.alive && fireEnemyBullet(e.x, e.z, ang + rr(-0.07, 0.07), 12, d * 0.6, c, 0.85)); AUDIO.sfx.eshot(); }
    if (e.atkT <= 0 && !(s.silence > 0)) {
      e.atkT = e.phase === 2 ? 2.2 : 3; const r = rand();
      if (dist < 4 || r < 0.33) { setAttack(e, 'cast', 0.5); telegraph('ring', e.x, e.z, { r: 6, inner: 0.2, wind: 0.85, dmg: d * 2, color: c, owner: e }); }
      else if (r < 0.66) { setAttack(e, 'arc', 0.5); telegraph('cone', e.x, e.z, { ang, r: 8, spread: 0.7, wind: 0.75, dmg: d * 2, color: c, owner: e }); }
      else { setAttack(e, 'cast', 0.5); [[p.x, p.z], [p.x + rr(-3, 3), p.z + rr(-3, 3)], [p.x + rr(-3, 3), p.z + rr(-3, 3)]].forEach(([x, z], i) => after(i * 0.15, () => e.alive && telegraph('circle', x, z, { r: 2.2, wind: 0.85, dmg: d * 1.6, color: c, owner: e }))); }
    }
  }
  const sp = e.def.speed * (s.slow > 0 ? 0.6 : 1);
  e.vx = lerp(e.vx, mx * sp, 1 - Math.exp(-dt * 8)); e.vz = lerp(e.vz, mz * sp, 1 - Math.exp(-dt * 8));
  const kd = Math.exp(-dt * 10); e.knock[0] *= kd; e.knock[1] *= kd;
  moveCircle(e, (e.vx + e.knock[0] * 0.3) * dt, (e.vz + e.knock[1] * 0.3) * dt, e.r);
  if (dist < e.r + p.r + 0.1) hurtPlayer(e.touch);
  e.moving = Math.hypot(e.vx, e.vz) > 0.5; e.walkT += dt * Math.hypot(e.vx, e.vz) * 0.9;
  e.dir = dirIndex(e.x, e.z, dx, dz);
  const [idx, flip, lift] = agentFrame(e, dt); e.agent.set(idx, flip);
  e.flash = Math.max(0, e.flash - dt); const u = e.agent.mat.userData.u; u.uFlash.value = e.flash > 0 ? 0.8 : 0.12 + Math.sin(G.time * 9) * 0.08; u.uFlashCol.value.set(e.flash > 0 ? 0xffffff : e.color);
  e.agent.spr.position.set(e.x, lift, e.z); e.aura.position.set(e.x, 1.6, e.z); e.light.position.set(e.x, 2.6, e.z);
  e.shadow.position.set(e.x, 0.03, e.z);
}
