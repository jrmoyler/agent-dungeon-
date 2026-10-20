/* ------------------------------------------------------------------
   WORLD: branching sector layout (Batch 09 Deep Dungeon structure),
   biome PBR tiles, procedural prop kits that mimic the Batch 08
   dungeon sheets, energy gates, sealed secret annex, circuit switches,
   biome traps, crystal pylons with pooled lights, exit portal.
------------------------------------------------------------------- */
const TILE = 2;
const WALL_H = 2.2;
const T_FLOOR = 0, T_WALL = 1, T_GATE = 2, T_SEAL = 3;
const world = {
  W: 0, H: 0, grid: null, rooms: [], group: null, start: null, vault: null, pylons: [], lights: [], explored: null, portal: null,
  biome: 'core_facility', sector: null, gateCells: [], sealCells: [], switches: [], traps: [], secret: null, anim: [], gateOpen: false, sealOpen: false,
};

/* ---------- layout ---------- */
function genSector(sec, seed) {
  const R = mulberry(seed);
  const W = 78, H = 58, g = new Uint8Array(W * H).fill(T_WALL), rooms = [];
  const carve = (x0, y0, w, h, v = T_FLOOR) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x > 0 && y > 0 && x < W - 1 && y < H - 1) g[y * W + x] = v; };
  const free = (x, y, w, h, pad) => !rooms.some(r => x < r.x + r.w + pad && x + w + pad > r.x && y < r.y + r.h + pad && y + h + pad > r.y);
  const mid = Math.floor(H / 2);
  const start = { x: 3, y: mid - 5, w: 11, h: 10, zone: 'threshold' }; rooms.push(start);
  const vault = { x: 56, y: mid - 13, w: 19, h: 26, zone: 'vault' }; rooms.push(vault);
  for (const zone of ['north', 'south']) {
    let made = 0;
    for (let t = 0; t < 600 && made < 4; t++) {
      const w = 8 + Math.floor(R() * 7), h = 7 + Math.floor(R() * 5);
      const x = 17 + Math.floor(R() * (50 - 17 - w));
      const y = zone === 'north' ? 2 + Math.floor(R() * (mid - 5 - h)) : mid + 4 + Math.floor(R() * (H - mid - 6 - h));
      if (y < 2 || y + h > H - 2 || !free(x, y, w, h, 3)) continue;
      rooms.push({ x, y, w, h, zone }); made++;
    }
  }
  rooms.forEach(r => carve(r.x, r.y, r.w, r.h));
  const c = r => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
  const corridor = (a, b, bend) => {
    const [ax, ay] = c(a), [bx, by] = c(b);
    if (bend) { carve(Math.min(ax, bx), ay - 1, Math.abs(ax - bx) + 1, 3); carve(bx - 1, Math.min(ay, by), 3, Math.abs(ay - by) + 1); }
    else { carve(ax - 1, Math.min(ay, by), 3, Math.abs(ay - by) + 1); carve(Math.min(ax, bx), by - 1, Math.abs(ax - bx) + 1, 3); }
  };
  // each wing is an MST of its rooms, rooted at the threshold
  for (const zone of ['north', 'south']) {
    const wing = rooms.filter(r => r.zone === zone); if (!wing.length) continue;
    const linked = [start], rest = wing.slice();
    while (rest.length) {
      let best = null, bd = 1e9;
      for (const a of linked) for (const b of rest) { const [ax, ay] = c(a), [bx, by] = c(b); const d = Math.abs(ax - bx) + Math.abs(ay - by); if (d < bd) { bd = d; best = [a, b]; } }
      corridor(best[0], best[1], zone === 'north'); linked.push(best[1]); rest.splice(rest.indexOf(best[1]), 1);
    }
    if (wing.length > 2) corridor(wing[0], wing[wing.length - 1], R() < 0.5); // a loop so wings aren't pure trees
  }
  // a lateral link between the wings (the "both passages" crossing)
  const nw = rooms.filter(r => r.zone === 'north'), sw = rooms.filter(r => r.zone === 'south');
  // wings -> vault through sealed gates
  const gateCells = [];
  const gateLink = (wing, gy) => {
    if (!wing.length) return;
    const far = wing.reduce((a, b) => (b.x + b.w > a.x + a.w ? b : a));
    const [fx, fy] = c(far); const vx = vault.x;
    carve(fx - 1, Math.min(fy, gy) - 1, 3, Math.abs(fy - gy) + 3); carve(fx - 1, gy - 1, vx - fx + 2, 3);
    for (let y = gy - 1; y <= gy + 1; y++) for (let x = vx - 3; x <= vx - 1; x++) { g[y * W + x] = T_GATE; gateCells.push([x, y]); }
  };
  gateLink(nw, vault.y + 5); gateLink(sw, vault.y + vault.h - 6);
  // secret annex sealed behind a cracked wall
  let secret = null;
  for (const r of [...nw, ...sw].sort(() => R() - 0.5)) {
    const up = r.zone === 'north';
    const aw = 7, ah = 5, ax = Math.floor(r.x + r.w / 2 - aw / 2), ay = up ? r.y - ah - 3 : r.y + r.h + 3;
    if (ay < 2 || ay + ah > H - 2) continue;
    let clear = true;
    for (let y = ay - 1; y < ay + ah + 1 && clear; y++) for (let x = ax - 1; x < ax + aw + 1; x++) if (g[y * W + x] !== T_WALL) { clear = false; break; }
    if (!clear) continue;
    carve(ax, ay, aw, ah);
    const cx = ax + 2, y0 = up ? ay + ah : r.y + r.h, y1 = up ? r.y : ay;
    const seal = [];
    for (let y = y0; y < y1; y++) for (let x = cx; x < cx + 3; x++) { g[y * W + x] = T_SEAL; seal.push([x, y]); }
    secret = { room: { x: ax, y: ay, w: aw, h: ah, zone: 'secret' }, seal, from: r };
    break;
  }
  // circuit switches: one per wing, in the wing room farthest from the threshold
  const switches = [];
  for (const [wing, id] of [[nw, 'north'], [sw, 'south']]) {
    if (!wing.length) continue;
    const r = wing.reduce((a, b) => (Math.hypot(c(b)[0] - c(start)[0], c(b)[1] - c(start)[1]) > Math.hypot(c(a)[0] - c(start)[0], c(a)[1] - c(start)[1]) ? b : a));
    const [sx, sy] = [r.x + 2, r.y + 2];
    switches.push({ id, tx: sx, ty: sy, room: r }); g[sy * W + sx] = T_WALL;
  }
  // cover pillars in large wing rooms and the vault
  for (const r of rooms) {
    if (r === start) continue;
    if (r === vault) { for (const [x, y] of [[r.x + 4, r.y + 6], [r.x + r.w - 5, r.y + 6], [r.x + 4, r.y + r.h - 7], [r.x + r.w - 5, r.y + r.h - 7]]) g[y * W + x] = T_WALL; continue; }
    if (r.w >= 11 && r.h >= 9 && R() < 0.75) for (const [x, y] of [[r.x + 3, r.y + 3], [r.x + r.w - 4, r.y + r.h - 4]]) if (g[y * W + x] === T_FLOOR) g[y * W + x] = T_WALL;
  }
  // traps on floor cells inside the wings
  const traps = [];
  for (const zone of ['north', 'south']) {
    const wing = rooms.filter(r => r.zone === zone);
    for (let k = 0, t = 0; k < 3 && t < 60; t++) {
      const r = wing[Math.floor(R() * wing.length)]; if (!r) break;
      const tx = r.x + 2 + Math.floor(R() * (r.w - 4)), ty = r.y + 2 + Math.floor(R() * (r.h - 4));
      if (g[ty * W + tx] !== T_FLOOR || traps.some(q => Math.abs(q.tx - tx) + Math.abs(q.ty - ty) < 6) || switches.some(s => Math.abs(s.tx - tx) + Math.abs(s.ty - ty) < 4)) continue;
      traps.push({ tx, ty, zone, phase: R() * 3, period: 3.2 + R() * 0.8 }); k++;
    }
  }
  if (secret) rooms.push(secret.room);
  return { W, H, grid: g, rooms, start, vault, gateCells, secret, switches, traps };
}
const isWall = (tx, ty) => tx < 0 || ty < 0 || tx >= world.W || ty >= world.H || world.grid[ty * world.W + tx] !== T_FLOOR;
const worldToTile = v => Math.floor(v / TILE);
const solidAt = (x, z) => isWall(worldToTile(x), worldToTile(z));
const roomCenter = r => [(r.x + r.w / 2) * TILE, (r.y + r.h / 2) * TILE];
const inRoom = (r, x, z) => x >= r.x * TILE && x <= (r.x + r.w) * TILE && z >= r.y * TILE && z <= (r.y + r.h) * TILE;
function zoneAt(x, z) { for (const r of world.rooms) if (inRoom(r, x, z)) return r.zone; return 'corridor'; }

/* circle vs tile grid */
function moveCircle(o, dx, dz, r) { o.x += dx; resolveAxis(o, r); o.z += dz; resolveAxis(o, r); }
function resolveAxis(o, r) {
  const tx0 = worldToTile(o.x - r), tx1 = worldToTile(o.x + r), tz0 = worldToTile(o.z - r), tz1 = worldToTile(o.z + r);
  for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
    if (!isWall(tx, tz)) continue;
    const minx = tx * TILE, maxx = minx + TILE, minz = tz * TILE, maxz = minz + TILE;
    const cx = clamp(o.x, minx, maxx), cz = clamp(o.z, minz, maxz);
    const ddx = o.x - cx, ddz = o.z - cz, d2 = ddx * ddx + ddz * ddz;
    if (d2 < r * r) {
      if (d2 > 1e-8) { const d = Math.sqrt(d2), p = r - d; o.x += ddx / d * p; o.z += ddz / d * p; }
      else { const l = o.x - minx, rg = maxx - o.x, t = o.z - minz, b = maxz - o.z, m = Math.min(l, rg, t, b);
        if (m === l) o.x = minx - r; else if (m === rg) o.x = maxx + r; else if (m === t) o.z = minz - r; else o.z = maxz + r; }
    }
  }
}
function lineOfSight(x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0), steps = Math.ceil(d / 0.6);
  for (let i = 1; i < steps; i++) { const t = i / steps; if (solidAt(lerp(x0, x1, t), lerp(z0, z1, t))) return false; }
  return true;
}
/* ray march to first wall; returns distance */
function rayLength(x, z, dx, dz, maxD) { for (let s = 0.4; s < maxD; s += 0.4) if (solidAt(x + dx * s, z + dz * s)) return s; return maxD; }

/* ---------- materials ---------- */
const MAT = {};
const SHARED_T = { value: 0 };
function animatedPoolMat(colA, colB, speed = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { t: SHARED_T, a: { value: new THREE.Color(colA) }, b: { value: new THREE.Color(colB) }, sp: { value: speed } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float t; uniform vec3 a; uniform vec3 b; uniform float sp;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){ vec2 p=vUv*4.0; float v=n(p+vec2(t*0.3*sp,t*0.17*sp))*0.6+n(p*2.3-vec2(t*0.21*sp,-t*0.3*sp))*0.4;
        float cell=smoothstep(0.35,0.75,v); float r=length(vUv-0.5)*2.0; float edge=smoothstep(1.0,0.82,r);
        vec3 c=mix(a,b,cell)*(0.9+cell*1.1); gl_FragColor=vec4(c, edge); }`,
    transparent: true, depthWrite: false,
  });
}
function gateMat(col) {
  return new THREE.ShaderMaterial({
    uniforms: { t: SHARED_T, c: { value: new THREE.Color(col) }, open: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float t; uniform vec3 c; uniform float open;
      void main(){ float scan=0.5+0.5*sin(vUv.y*60.0-t*6.0); float hex=step(0.92,fract(vUv.x*8.0+sin(vUv.y*20.0+t)*0.05))+step(0.92,fract(vUv.y*6.0));
        float edge=smoothstep(0.0,0.08,vUv.y)*smoothstep(1.0,0.9,vUv.y); float a=(0.18+scan*0.25+hex*0.5)*edge*(1.0-open);
        if(vUv.y>1.0-open) discard; gl_FragColor=vec4(c*(1.5+hex*2.0),a); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}
function decalRingMat(col, ticks = 12) {
  return new THREE.ShaderMaterial({
    uniforms: { t: SHARED_T, c: { value: new THREE.Color(col) }, k: { value: ticks } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float t; uniform vec3 c; uniform float k;
      void main(){ vec2 p=vUv-0.5; float r=length(p)*2.0; float a=atan(p.y,p.x);
        float ring=smoothstep(0.03,0.0,abs(r-0.92))+smoothstep(0.02,0.0,abs(r-0.7))*0.7+smoothstep(0.015,0.0,abs(r-0.45))*0.5;
        float tick=step(0.8,r)*step(r,0.9)*step(0.85,fract(a/6.2832*k*2.0+t*0.05));
        float rune=step(0.55,r)*step(r,0.66)*step(0.6,fract(a/6.2832*k*3.0-t*0.08))*0.6;
        float v=(ring+tick+rune)*(0.55+0.3*sin(t*2.0)); gl_FragColor=vec4(c*1.3*v, v*0.7); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

/* ---------- biome prop kits (authored low-poly forms + emissive detail) ---------- */
const G3 = {};
function initPropGeo() {
  G3.box = new THREE.BoxGeometry(1, 1, 1); G3.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12); G3.cyl6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
  G3.cone = new THREE.ConeGeometry(0.5, 1, 7); G3.cone4 = new THREE.ConeGeometry(0.5, 1, 4); G3.oct = new THREE.OctahedronGeometry(0.5, 0);
  G3.ico = new THREE.IcosahedronGeometry(0.5, 0); G3.sph = new THREE.SphereGeometry(0.5, 16, 12); G3.dod = new THREE.DodecahedronGeometry(0.5, 0);
  G3.torus = new THREE.TorusGeometry(0.5, 0.06, 8, 32); G3.gear = (() => { const s = new THREE.Shape(); const n = 14; for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * Math.PI * 2, r = i % 2 ? 0.5 : 0.42; const p = [Math.cos(a) * r, Math.sin(a) * r]; i ? s.lineTo(...p) : s.moveTo(...p); } const h = new THREE.Path(); h.absarc(0, 0, 0.18, 0, Math.PI * 2, true); s.holes.push(h); const gg = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 }); gg.center(); return gg; })();
  G3.plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  G3.disc = new THREE.CircleGeometry(0.5, 40).rotateX(-Math.PI / 2);
}
/* each kit: wall-hugging decor + free-standing feature, as lists of parts [geo, mat, pos, scale, rot] */
function propKit(bk) {
  const B = BIOMES[bk], glow = new THREE.Color(B.glow), acc = new THREE.Color(B.accent);
  const std = (c, e = 0x000000, ei = 0, o = {}) => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: ei, roughness: o.r ?? 0.6, metalness: o.m ?? 0.4, map: o.map ?? null, transparent: !!o.op, opacity: o.op ?? 1 });
  const metal = std(0x3a4252, 0, 0, { m: 0.85, r: 0.4, map: TEX.metal.map });
  const lum = glow.getHSL({}).l, glowM = std(0x111111, glow, 2.2 - lum, { m: 0.1, r: 0.3 }), accM = std(0x111111, acc, 1.9 - lum * 0.6, { m: 0.1, r: 0.3 });
  const darkM = std(new THREE.Color(B.dark).multiplyScalar(1.6), 0, 0, { r: 0.8, m: 0.2 });
  const baseM = std(new THREE.Color(B.base), 0, 0, { r: 0.7, m: 0.2 });
  const k = { wall: [], feature: [], pool: null, mats: [glowM, accM] };
  switch (bk) {
    case 'core_facility':
      k.wall.push([[G3.box, metal, [0, 0.95, 0], [0.9, 1.9, 0.55]], [G3.box, glowM, [0, 1.2, 0.29], [0.7, 0.05, 0.02]], [G3.box, glowM, [0, 0.8, 0.29], [0.7, 0.05, 0.02]], [G3.box, accM, [0.3, 1.6, 0.29], [0.06, 0.06, 0.02]]]); // server rack
      k.wall.push([[G3.cyl, metal, [0, 0.12, 0], [0.9, 0.24, 0.9]], [G3.torus, glowM, [0, 0.25, 0], [0.8, 0.8, 0.8], [Math.PI / 2, 0, 0]]]); // floor vent
      k.feature.push([[G3.cyl6, darkM, [0, 0.4, 0], [1.2, 0.8, 1.2]], [G3.box, metal, [0, 1.15, 0], [0.7, 0.9, 0.5]], [G3.box, glowM, [0, 1.3, 0.26], [0.55, 0.35, 0.01]]]); // terminal
      break;
    case 'shadow_realm':
      k.wall.push([[G3.oct, std(0x2a1450, glow, 1.6, { r: 0.15, m: 0.1 }), [0, 0.8, 0], [0.5, 1.6, 0.5]], [G3.oct, std(0x2a1450, glow, 1.2, { r: 0.15 }), [0.35, 0.45, 0.1], [0.3, 0.9, 0.3], [0, 0, 0.5]], [G3.oct, std(0x2a1450, acc, 1.2, { r: 0.15 }), [-0.3, 0.4, -0.1], [0.25, 0.8, 0.25], [0, 0, -0.4]]]); // crystal cluster
      k.feature.push([[G3.box, darkM, [0, 1.3, 0], [0.7, 2.6, 0.7]], [G3.cone4, darkM, [0, 2.85, 0], [0.7, 0.5, 0.7]], [G3.box, glowM, [0, 1.6, 0.36], [0.12, 1.4, 0.02]]]); // obelisk
      break;
    case 'voltage_foundry':
      k.wall.push([[G3.cyl, metal, [0, 1, 0], [0.35, 2, 0.35]], [G3.torus, accM, [0, 1.6, 0], [0.7, 0.7, 0.7], [Math.PI / 2, 0, 0]], [G3.torus, accM, [0, 1.2, 0], [0.6, 0.6, 0.6], [Math.PI / 2, 0, 0]], [G3.sph, glowM, [0, 2.1, 0], [0.45, 0.45, 0.45]]]); // tesla coil
      k.wall.push([[G3.box, std(0x4a3a20, 0, 0, { r: 0.8, m: 0.3 }), [0, 0.4, 0], [0.8, 0.8, 0.8]], [G3.box, accM, [0, 0.4, 0.41], [0.8, 0.12, 0.01]]]); // crate
      k.feature.push([[G3.cyl, metal, [0, 0.9, 0], [1.1, 1.8, 1.1]], [G3.cyl, glowM, [0, 1.85, 0], [0.9, 0.1, 0.9]], [G3.box, metal, [0.6, 0.6, 0], [0.4, 0.3, 0.3]]]); // generator
      break;
    case 'inferno_depths':
      k.wall.push([[G3.cone, darkM, [0, 1.0, 0], [0.8, 2.0, 0.8]], [G3.cone, std(0x221010, acc, 1.4), [0.3, 0.5, 0.2], [0.35, 1.0, 0.35]]]); // basalt spire
      k.wall.push([[G3.cyl6, metal, [0, 0.45, 0], [0.6, 0.9, 0.6]], [G3.sph, accM, [0, 1.0, 0], [0.45, 0.35, 0.45]]]); // brazier
      k.pool = animatedPoolMat(0xff4a10, 0xffd060, 1);
      break;
    case 'glacial_vault':
      k.wall.push([[G3.cone, std(0xbfefff, glow, 0.5, { r: 0.05, m: 0.1, op: 0.85 }), [0, 0.9, 0], [0.55, 1.8, 0.55]], [G3.cone, std(0xbfefff, glow, 0.4, { r: 0.05, op: 0.85 }), [0.35, 0.55, 0.1], [0.35, 1.1, 0.35]], [G3.cone, std(0xffffff, acc, 0.5, { r: 0.05, op: 0.9 }), [-0.3, 0.45, -0.15], [0.3, 0.9, 0.3]]]); // ice spikes
      k.feature.push([[G3.cyl6, std(0x9fdcf0, glow, 0.6, { r: 0.08, m: 0.1, op: 0.8 }), [0, 1.2, 0], [1.0, 2.4, 1.0]], [G3.ico, std(0xffffff, acc, 1.6, { r: 0.1 }), [0, 2.6, 0], [0.5, 0.5, 0.5]]]); // frozen pillar
      k.pool = animatedPoolMat(0x2a7ea0, 0xd4f9ff, 0.25);
      break;
    case 'toxic_hive':
      k.wall.push([[G3.sph, std(0x2a3a14, glow, 1.6, { r: 0.4, m: 0.1 }), [0, 0.55, 0], [0.8, 1.1, 0.8]], [G3.sph, std(0x2a3a14, acc, 1.3, { r: 0.4 }), [0.45, 0.35, 0.2], [0.45, 0.6, 0.45]], [G3.cone, darkM, [0, 0.12, 0], [1.2, 0.24, 1.2]]]); // egg pods
      k.feature.push([[G3.cyl, darkM, [0, 1.0, 0], [0.5, 2.0, 0.5], [0.15, 0, 0.1]], [G3.sph, std(0x2a3a14, glow, 2, { r: 0.4 }), [0, 2.1, 0], [0.7, 0.7, 0.7]]]); // stalk
      k.pool = animatedPoolMat(0x2e6a10, 0xd8ff6a, 0.6);
      break;
    case 'astral_rift':
      k.wall.push([[G3.dod, darkM, [0, 0.35, 0], [0.9, 0.6, 0.9]], [G3.oct, std(0x150a30, acc, 2, { r: 0.1 }), [0, 0.95, 0], [0.3, 0.6, 0.3]]]); // shard rock
      k.feature.push([[G3.cyl, darkM, [0, 0.15, 0], [1.4, 0.3, 1.4]], [G3.torus, glowM, [0, 1.3, 0], [1.4, 1.4, 1.4], [Math.PI / 2.4, 0, 0]], [G3.sph, std(0x000000, 0x000000, 0, { r: 1, m: 0 }), [0, 1.3, 0], [0.55, 0.55, 0.55]]]); // rift beacon
      break;
    case 'chrono_spire':
      k.wall.push([[G3.cyl, baseM, [0, 1.1, 0], [0.6, 2.2, 0.6]], [G3.box, accM.clone(), [0, 2.25, 0], [0.8, 0.12, 0.8]], [G3.box, std(0x302010, glow, 1.6), [0, 0.08, 0], [0.8, 0.16, 0.8]]]); // marble column
      k.feature.push([[G3.cyl, baseM, [0, 0.5, 0], [0.9, 1.0, 0.9]], [G3.sph, std(0xffe2a0, glow, 1.8, { r: 0.2, m: 0.6 }), [0, 1.3, 0], [0.55, 0.55, 0.55]], [G3.torus, glowM, [0, 1.3, 0], [1.0, 1.0, 1.0], [Math.PI / 2, 0, 0]]]); // hourglass orrery
      break;
  }
  return k;
}
function instanceParts(grp, parts, placements) {
  if (!placements.length) return;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pm = new THREE.Matrix4(), base = new THREE.Matrix4();
  for (const [geo, mat, pos, scl, rot] of parts) {
    const im = new THREE.InstancedMesh(geo, mat, placements.length);
    placements.forEach((P, i) => {
      base.compose(new THREE.Vector3(P.x, 0, P.z), q.setFromEuler(e.set(0, P.ry, 0)), new THREE.Vector3(P.s, P.s, P.s));
      pm.compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(e.set(...(rot || [0, 0, 0]))), new THREE.Vector3(...scl));
      im.setMatrixAt(i, m.multiplyMatrices(base, pm));
    });
    grp.add(im);
  }
}

function buildMaterials() {
  MAT.pylon = new THREE.MeshStandardMaterial({ ...TEX.metal, color: 0x3a4255, metalness: 0.85, roughness: 1 });
  MAT.crystal = new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x2fbfff, emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
}
function biomeSurface(bk) {
  const B = BIOMES[bk], maps = biomeMaps(bk), glow = new THREE.Color(B.glow);
  const floor = new THREE.MeshStandardMaterial({ ...maps.floor, color: 0xffffff, metalness: B.metal, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.55, normalScale: new THREE.Vector2(1.2, 1.2) });
  const side = new THREE.MeshStandardMaterial({ ...maps.wall, color: 0xffffff, metalness: B.metal * 0.6, roughness: 1, emissive: 0xffffff, emissiveIntensity: 1.1 });
  const top = new THREE.MeshStandardMaterial({ ...maps.wall, color: 0xd2d8e6, roughness: 1, metalness: B.metal * 0.4, emissive: 0xffffff, emissiveIntensity: 0.55, normalScale: new THREE.Vector2(0.8, 0.8) });
  const seal = new THREE.MeshStandardMaterial({ ...maps.wall, color: 0xb0b0b0, roughness: 1, emissive: glow, emissiveIntensity: 0.4 });
  return { floor, wall: [side, side, top, top, side, side], seal };
}

function clearWorld() {
  if (world.group) { scene.remove(world.group); world.group.traverse(o => { if (o.geometry && !Object.values(G3).includes(o.geometry)) o.geometry.dispose(); }); }
  world.lights.forEach(l => scene.remove(l)); world.lights = [];
  world.anim = [];
}
function buildWorld(secIndex, seed = (Math.random() * 1e9) | 0) {
  clearWorld();
  const sec = SECTORS[secIndex], bk = sec.id, B = BIOMES[bk];
  const d = genSector(sec, seed);
  Object.assign(world, { W: d.W, H: d.H, grid: d.grid, rooms: d.rooms, start: d.start, vault: d.vault, biome: bk, sector: sec, gateOpen: false, sealOpen: false });
  world.explored = new Uint8Array(d.W * d.H);
  const grp = new THREE.Group(); world.group = grp; scene.add(grp);
  scene.fog.color.setHex(B.fog); scene.fog.density = B.fogD * 0.85; scene.background.setHex(B.fog);
  hemi.color.setHex(B.hemi[0]); hemi.groundColor.setHex(B.hemi[1]); hemi.intensity = 1.7; moon.intensity = 1.2; moon.color.set(B.glow).lerp(new THREE.Color(0xffffff), 0.6);
  const surf = biomeSurface(bk), glow = new THREE.Color(B.glow), acc = new THREE.Color(B.accent);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  const R = mulberry(seed + 9);

  // floor tiles (gate + seal cells get floor under them too)
  const floorCells = []; for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) if (d.grid[y * d.W + x] !== T_WALL) floorCells.push([x, y]);
  const fgeo = new THREE.PlaneGeometry(TILE, TILE); fgeo.rotateX(-Math.PI / 2);
  const floors = new THREE.InstancedMesh(fgeo, surf.floor, floorCells.length);
  floorCells.forEach(([x, y], k) => { q.setFromAxisAngle(up, Math.floor(R() * 4) * Math.PI / 2); m.compose(p.set((x + 0.5) * TILE, 0, (y + 0.5) * TILE), q, s); floors.setMatrixAt(k, m); col.setScalar(0.85 + R() * 0.25); floors.setColorAt(k, col); });
  grp.add(floors);
  // walls touching open space
  const wallCells = [];
  for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) if (d.grid[y * d.W + x] === T_WALL) {
    let touch = false;
    for (let dy = -1; dy <= 1 && !touch; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < d.W && yy < d.H && d.grid[yy * d.W + xx] !== T_WALL) { touch = true; break; } }
    wallCells.push([x, y]); // interior rock is filled too, so solid masses never read as voids
  }
  const wgeo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
  const uv = wgeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (WALL_H / TILE));
  const walls = new THREE.InstancedMesh(wgeo, surf.wall, wallCells.length);
  wallCells.forEach(([x, y], i) => { const hj = 1 + (R() - 0.5) * 0.1; m.compose(p.set((x + 0.5) * TILE, WALL_H * hj / 2, (y + 0.5) * TILE), q.identity(), s.set(1, hj, 1)); walls.setMatrixAt(i, m); col.setScalar(0.8 + R() * 0.3); walls.setColorAt(i, col); });
  s.set(1, 1, 1); grp.add(walls);

  // energy gates sealing the vault
  world.gateCells = d.gateCells; world.gateMeshes = [];
  const gmat = gateMat(acc); world.gateMat = gmat;
  const gcols = {}; for (const [x, y] of d.gateCells) (gcols[y >= d.vault.y + d.vault.h / 2 ? 's' : 'n'] ||= []).push([x, y]);
  for (const cells of Object.values(gcols)) {
    const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
    for (const gx of [x0 + 0.5, x1 - 0.5]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry((y1 - y0) * TILE, WALL_H * 1.2), gmat);
      panel.rotation.y = Math.PI / 2; panel.position.set(gx * TILE, WALL_H * 0.6, (y0 + y1) / 2 * TILE); grp.add(panel); world.gateMeshes.push(panel);
    }
    for (const gy of [y0, y1]) { const post = new THREE.Mesh(G3.box, MAT.pylon); post.scale.set((x1 - x0) * TILE, WALL_H * 1.3, 0.35); post.position.set((x0 + x1) / 2 * TILE, WALL_H * 0.65, gy * TILE); grp.add(post); const strip = new THREE.Mesh(G3.box, new THREE.MeshBasicMaterial({ color: acc })); strip.scale.set((x1 - x0) * TILE, 0.08, 0.37); strip.position.set((x0 + x1) / 2 * TILE, WALL_H * 1.25, gy * TILE); grp.add(strip); }
  }
  // sealed secret wall
  world.secret = d.secret ? { ...d.secret, found: false, claimed: false } : null; world.sealMeshes = [];
  if (d.secret) for (const [x, y] of d.secret.seal) { const b = new THREE.Mesh(wgeo, surf.seal); b.position.set((x + 0.5) * TILE, WALL_H / 2, (y + 0.5) * TILE); grp.add(b); world.sealMeshes.push(b); }

  // biome props: wall decor and free-standing features
  const kit = propKit(bk); world.kitMats = kit.mats;
  const wallSpots = [], featureSpots = [];
  for (let t = 0; t < 2200; t++) {
    const x = 1 + Math.floor(R() * (d.W - 2)), y = 1 + Math.floor(R() * (d.H - 2));
    if (d.grid[y * d.W + x] !== T_FLOOR) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => d.grid[(y + dy) * d.W + x + dx] === T_WALL);
    if (n.length !== 1 || [...wallSpots, ...featureSpots].some(o => Math.abs(o.tx - x) + Math.abs(o.ty - y) < 3)) continue;
    if (d.switches.some(sw => Math.abs(sw.tx - x) + Math.abs(sw.ty - y) < 3) || d.traps.some(tr => Math.abs(tr.tx - x) + Math.abs(tr.ty - y) < 3)) continue;
    const [dx, dy] = n[0];
    wallSpots.push({ tx: x, ty: y, x: (x + 0.5 + dx * 0.22) * TILE, z: (y + 0.5 + dy * 0.22) * TILE, ry: Math.atan2(-dx, -dy), s: 0.9 + R() * 0.35, kind: Math.floor(R() * kit.wall.length) });
    if (wallSpots.length > 120) break;
  }
  for (const r of d.rooms) {
    if (r.zone === 'threshold' || r.zone === 'secret' || r.w < 9) continue;
    const spots = r.zone === 'vault' ? [] : [[r.x + Math.floor(r.w / 2), r.y + 2]];
    for (const [x, y] of spots) if (d.grid[y * d.W + x] === T_FLOOR && kit.feature.length) { featureSpots.push({ tx: x, ty: y, x: (x + 0.5) * TILE, z: (y + 0.5) * TILE, ry: R() * 6, s: 1, kind: Math.floor(R() * kit.feature.length) }); d.grid[y * d.W + x] = T_WALL; }
  }
  kit.wall.forEach((parts, k) => instanceParts(grp, parts, wallSpots.filter(w => w.kind === k)));
  kit.feature.forEach((parts, k) => instanceParts(grp, parts, featureSpots.filter(w => w.kind === k)));
  // molten / frozen / toxic pools (decorative, glowing)
  if (kit.pool) for (const r of d.rooms) {
    if (r.zone === 'threshold' || r.zone === 'secret' || R() < 0.35) continue;
    const pool = new THREE.Mesh(G3.disc, kit.pool); const sz = 2.4 + R() * 2.2;
    const px = (r.x + 2 + R() * (r.w - 4)) * TILE, pz = (r.y + 2 + R() * (r.h - 4)) * TILE;
    if (solidAt(px, pz)) continue;
    pool.scale.set(sz * 1.3, 1, sz); pool.position.set(px, 0.04, pz); pool.rotation.y = R() * 3; pool.renderOrder = 1; grp.add(pool);
  }
  // biome set pieces that move
  if (bk === 'chrono_spire' || bk === 'astral_rift' || bk === 'voltage_foundry') {
    for (let i = 0; i < 10; i++) {
      const r = d.rooms[Math.floor(R() * d.rooms.length)]; const x = (r.x + R() * r.w) * TILE, z = (r.y + R() * r.h) * TILE;
      let mesh;
      if (bk === 'chrono_spire') { mesh = new THREE.Mesh(G3.gear, new THREE.MeshStandardMaterial({ color: 0xc9a25c, metalness: 0.9, roughness: 0.3, emissive: glow, emissiveIntensity: 0.25 })); mesh.scale.setScalar(2 + R() * 2.5); mesh.position.set(x, 5 + R() * 3, z); mesh.rotation.x = -Math.PI / 2 + (R() - 0.5) * 0.4; }
      else if (bk === 'astral_rift') { mesh = new THREE.Mesh(G3.dod, new THREE.MeshStandardMaterial({ color: 0x2a2450, roughness: 0.8, metalness: 0.2, emissive: acc, emissiveIntensity: 0.15 })); mesh.scale.set(1.2 + R() * 1.5, 0.8 + R(), 1.2 + R() * 1.5); mesh.position.set(x, 4 + R() * 3, z); }
      else { mesh = new THREE.Mesh(G3.cyl, MAT.pylon); mesh.scale.set(0.5, 1, 0.5); mesh.rotation.z = Math.PI / 2; mesh.scale.set(0.45, TILE * (3 + R() * 6), 0.45); mesh.position.set(x, WALL_H + 0.6, z); }
      grp.add(mesh); world.anim.push({ mesh, kind: bk, t: R() * 6, y: mesh.position.y, sp: (R() - 0.5) * 0.6 });
    }
  }
  if (bk === 'astral_rift') { // a black hole looms over the vault
    const [vx, vz] = roomCenter(d.vault);
    const core = new THREE.Mesh(G3.sph, new THREE.MeshBasicMaterial({ color: 0x000000 })); core.scale.setScalar(4); core.position.set(vx, 11, vz - 6);
    const disk = new THREE.Mesh(new THREE.RingGeometry(2.4, 6, 64), new THREE.MeshBasicMaterial({ map: TEX.ring, color: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    disk.position.copy(core.position); disk.rotation.x = -1.2; grp.add(core, disk); world.anim.push({ mesh: disk, kind: 'disk', t: 0 });
  }
  // vault arena decal
  { const [vx, vz] = roomCenter(d.vault); const dec = new THREE.Mesh(G3.plane, decalRingMat(glow, 12)); dec.scale.setScalar(16); dec.position.set(vx, 0.05, vz); dec.renderOrder = 1; grp.add(dec); }

  // crystal pylons (light sources) tinted per biome
  world.pylons = [];
  const crystal = MAT.crystal; crystal.color.copy(glow); crystal.emissive.copy(glow); crystal.emissiveIntensity = Math.max(0.3, 2.2 - glow.getHSL({}).l * 2.6);
  const pg = new THREE.CylinderGeometry(0.28, 0.42, 1.4, 8), cg = new THREE.OctahedronGeometry(0.42, 0);
  const halo = new THREE.SpriteMaterial({ map: TEX.glow, color: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.38 });
  for (const r of d.rooms) {
    if (r.zone === 'secret') continue;
    for (const [tx, ty] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) {
      if (d.grid[ty * d.W + tx] !== T_FLOOR || R() > (r.zone === 'vault' ? 1 : 0.6)) continue;
      const base = new THREE.Mesh(pg, MAT.pylon); const x = (tx + 0.5) * TILE, z = (ty + 0.5) * TILE;
      base.position.set(x, 0.7, z); grp.add(base);
      const cr = new THREE.Mesh(cg, crystal); cr.position.set(x, 1.85, z); grp.add(cr);
      const h = new THREE.Sprite(halo); h.position.set(x, 1.85, z); h.scale.setScalar(3.2); grp.add(h);
      world.pylons.push({ x, z, crystal: cr, t: R() * 6 }); d.grid[ty * d.W + tx] = T_WALL;
    }
  }
  for (let i = 0; i < (IS_TOUCH ? 4 : 7); i++) { const l = new THREE.PointLight(B.light, 0, 17, 1.2); scene.add(l); world.lights.push(l); }

  // circuit switches (Batch 09 puzzles)
  world.switches = d.switches.map(sw => {
    const x = (sw.tx + 0.5) * TILE, z = (sw.ty + 0.5) * TILE, g = new THREE.Group();
    const ped = new THREE.Mesh(G3.cyl6, MAT.pylon); ped.scale.set(1.3, 0.9, 1.3); ped.position.y = 0.45; g.add(ped);
    const coreM = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: acc, emissiveIntensity: 1.2, roughness: 0.2 });
    const core = new THREE.Mesh(G3.oct, coreM); core.scale.setScalar(0.8); core.position.y = 1.5; g.add(core);
    const ring = new THREE.Mesh(G3.torus, new THREE.MeshBasicMaterial({ color: acc, transparent: true, opacity: 0.8 })); ring.scale.setScalar(2.4); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; g.add(ring);
    const l = new THREE.PointLight(acc, 10, 7, 1.5); l.position.y = 1.6; g.add(l);
    g.position.set(x, 0, z); grp.add(g);
    return { ...sw, x, z, g, core, coreM, ring, light: l, on: false };
  });
  world.puzzle = { steps: sec.steps, idx: 0, solved: false };
  // traps
  world.traps = d.traps.map(tr => {
    const x = (tr.tx + 0.5) * TILE, z = (tr.ty + 0.5) * TILE;
    const plate = new THREE.Mesh(G3.disc, trapMat(sec.trap)); plate.scale.setScalar(5.2); plate.position.set(x, 0.045, z); plate.renderOrder = 2; grp.add(plate);
    return { ...tr, x, z, r: 2.5, plate, active: false, type: sec.trap, hitT: 0 };
  });
  world.trapsOff = false;

  world.exit = world.vault;
  buildPortal(glow);
  return d;
}
function trapMat(type) {
  const c = { laser: 0xff3355, rift: 0xd27bff, electric: 0x7fe0ff, flame: 0xff7a2a, ice: 0xbff4ff, toxin: 0x9be84a, gravity: 0xb48bff, clock: 0xf7d27a }[type];
  return new THREE.ShaderMaterial({
    uniforms: { t: SHARED_T, c: { value: new THREE.Color(c) }, on: { value: 0 }, warn: { value: 0 }, kind: { value: ['laser', 'rift', 'electric', 'flame', 'ice', 'toxin', 'gravity', 'clock'].indexOf(type) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float t; uniform vec3 c; uniform float on; uniform float warn; uniform float kind;
      void main(){ vec2 p=vUv-0.5; float r=length(p)*2.0; float a=atan(p.y,p.x); if(r>1.0) discard;
        float rim=smoothstep(0.06,0.0,abs(r-0.95));
        float pat = kind<0.5 ? step(0.9,fract((p.x+p.y)*6.0+t)) :
                    kind<1.5 ? smoothstep(0.3,0.0,abs(fract(r*3.0-t*0.8+a*0.3)-0.5)) :
                    kind<2.5 ? step(0.85,fract(a*3.0+sin(r*20.0+t*12.0))) :
                    kind<3.5 ? smoothstep(0.2,0.8,sin(r*14.0-t*8.0)*0.5+0.5)*(1.0-r) :
                    kind<4.5 ? step(0.93,fract(a*6.0/6.2832*6.0))*step(0.2,r) :
                    kind<5.5 ? smoothstep(0.4,0.6,fract(sin(dot(floor(p*12.0),vec2(12.9,78.2)))*437.5+t*0.5)) :
                    kind<6.5 ? smoothstep(0.25,0.0,abs(fract(r*4.0+t*1.5)-0.5)) :
                               step(0.9,fract(a/6.2832*12.0))*step(0.75,r) + smoothstep(0.03,0.0,abs(fract(a/6.2832-t*0.1)-0.5)*r);
        float v = rim*(0.35+warn*0.65) + pat*(0.08+on*0.9) + on*(1.0-r)*0.35;
        gl_FragColor=vec4(c*(0.75+on*1.1), v*(0.5+on*0.3)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
function openGates() {
  if (world.gateOpen) return; world.gateOpen = true;
  for (const [x, y] of world.gateCells) world.grid[y * world.W + x] = T_FLOOR;
  world.gateOpenT = 0;
}
function openSeal() {
  if (!world.secret || world.sealOpen) return; world.sealOpen = true;
  for (const [x, y] of world.secret.seal) world.grid[y * world.W + x] = T_FLOOR;
  world.sealOpenT = 0;
}

function buildPortal(colr) {
  const grp = new THREE.Group();
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: colr, emissiveIntensity: 3, metalness: 0.6, roughness: 0.3 });
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 12, 48), ringMat); r1.rotation.x = -Math.PI / 2; r1.position.y = 0.15;
  const r2 = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.07, 10, 40), ringMat); r2.rotation.x = -Math.PI / 2; r2.position.y = 0.6;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 40), new THREE.MeshBasicMaterial({ map: TEX.glow, color: colr, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 7, 32, 1, true), new THREE.MeshBasicMaterial({ color: colr, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 3.5;
  grp.add(r1, r2, disc, beam);
  const [x, z] = roomCenter(world.vault); grp.position.set(x, 0, z); grp.visible = false;
  world.group.add(grp);
  world.portal = { grp, r1, r2, beam, x, z, active: false };
}

function updateWorld(dt, px, pz, time) {
  SHARED_T.value = time;
  const near = world.pylons.map(p => [p, (p.x - px) ** 2 + (p.z - pz) ** 2]).sort((a, b) => a[1] - b[1]);
  world.lights.forEach((l, i) => {
    const e = near[i]; if (!e) { l.intensity = 0; return; }
    const p = e[0]; l.position.set(p.x, 2.2, p.z);
    l.intensity = (26 + Math.sin(time * 3 + p.t) * 4) * clamp(1.4 - Math.sqrt(e[1]) / 30, 0, 1);
  });
  for (const p of world.pylons) { p.crystal.rotation.y += dt; p.crystal.position.y = 1.85 + Math.sin(time * 2 + p.t) * 0.1; }
  if (world.kitMats) world.kitMats.forEach((m, i) => { m.userData.ei ??= m.emissiveIntensity; m.emissiveIntensity = m.userData.ei * (1 + Math.sin(time * (1.6 + i) + i) * 0.25); });
  for (const a of world.anim) {
    a.t += dt;
    if (a.kind === 'chrono_spire') a.mesh.rotation.z += dt * a.sp;
    else if (a.kind === 'astral_rift') { a.mesh.position.y = a.y + Math.sin(a.t * 0.8) * 0.4; a.mesh.rotation.y += dt * a.sp * 0.5; }
    else if (a.kind === 'disk') a.mesh.rotation.z += dt * 0.3;
  }
  for (const sw of world.switches) { sw.core.rotation.y += dt * (sw.on ? 4 : 1); sw.core.position.y = 1.5 + Math.sin(time * 2.5 + sw.tx) * 0.12; sw.ring.material.opacity = 0.5 + Math.sin(time * 4) * 0.3; }
  if (world.gateOpen && world.gateOpenT < 1) { world.gateOpenT = Math.min(1, world.gateOpenT + dt * 0.8); world.gateMat.uniforms.open.value = world.gateOpenT; }
  if (world.sealOpen && world.sealOpenT < 1) { world.sealOpenT = Math.min(1, world.sealOpenT + dt * 0.7); for (const b of world.sealMeshes) { b.scale.y = 1 - world.sealOpenT; b.position.y = WALL_H * (1 - world.sealOpenT) / 2; } }
  const P = world.portal;
  if (P && P.active) { P.r1.rotation.z += dt * 1.2; P.r2.rotation.z -= dt * 2; P.beam.material.opacity = 0.1 + Math.sin(time * 4) * 0.05; }
  const tx = worldToTile(px), ty = worldToTile(pz), R = 7;
  for (let y = ty - R; y <= ty + R; y++) for (let x = tx - R; x <= tx + R; x++) if (x >= 0 && y >= 0 && x < world.W && y < world.H && (x - tx) ** 2 + (y - ty) ** 2 <= R * R) world.explored[y * world.W + x] = 1;
}
