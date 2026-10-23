/* ------------------------------------------------------------------
   WORLD: branching sector layout (Batch 09 Deep Dungeon structure),
   stone pixel tiles, torches, braziers, banners and ground tufts that
   live on the Pixi atlas, painted props, portcullis gates, sealed
   secret annex, circuit switches, biome traps, exit portal.
------------------------------------------------------------------- */
const TILE = 2;
const WALL_H = 2.2;
const T_FLOOR = 0, T_WALL = 1, T_GATE = 2, T_SEAL = 3;
const world = {
  W: 0, H: 0, grid: null, rooms: [], group: null, start: null, vault: null, pylons: [], lights: [], lightSrc: [], cards: null, explored: null, portal: null,
  biome: 'core_facility', sector: null, gateCells: [], sealCells: [], switches: [], traps: [], secret: null, anim: [], gateOpen: false, sealOpen: false, props: [], propAt: new Map(),
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
/* iron portcullis; open slides the grille up into the ceiling */
function gateMat(col) {
  return new THREE.ShaderMaterial({
    uniforms: { t: SHARED_T, c: { value: new THREE.Color(col) }, open: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float t; uniform vec3 c; uniform float open;
      void main(){ vec2 p=vec2(vUv.x, vUv.y-open); if(p.y<0.0) discard;
        float bx=fract(p.x*9.0), by=fract(p.y*5.0); bool bar=bx<0.26, cross=by<0.1 && p.y>0.06;
        if(!bar && !cross) discard;
        vec3 col=vec3(0.13,0.14,0.17)*(bar ? (bx<0.08 ? 2.2 : 1.0) : 1.5);
        if(bar && cross) col+=c*(0.35+0.15*sin(t*3.0));
        if(bar && p.y<0.06) col*=1.6;
        gl_FragColor=vec4(col,1.0); }`,
    side: THREE.DoubleSide,
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
        float v=(ring+tick+rune)*(0.55+0.3*sin(t*2.0))*0.4; gl_FragColor=vec4(c*1.3*v, v*0.7); }`, // a faint carved summoning circle, not a neon sign
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
  const B = BIOMES[bk], glow = new THREE.Color(B.flame[1]), acc = new THREE.Color(B.accent);
  const std = (c, e = 0x000000, ei = 0, o = {}) => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: ei, roughness: o.r ?? 0.6, metalness: o.m ?? 0.4, map: o.map ?? null, transparent: !!o.op, opacity: o.op ?? 1 });
  const metal = std(0x3a4252, 0, 0, { m: 0.85, r: 0.4, map: TEX.metal.map });
  // kit glows stay modest: the scene is lit by fire now, so a strong emissive reads as a neon sign
  const lum = glow.getHSL({}).l, glowM = std(0x111111, glow, (2.2 - lum) * 0.5, { m: 0.1, r: 0.3 }), accM = std(0x111111, acc, (1.9 - lum * 0.6) * 0.4, { m: 0.1, r: 0.3 });
  const darkM = std(new THREE.Color(B.dark).multiplyScalar(1.6), 0, 0, { r: 0.8, m: 0.2 });
  const baseM = std(new THREE.Color(B.base), 0, 0, { r: 0.7, m: 0.2 });
  const woodM = std(0x6b3f22, 0, 0, { r: 0.85, m: 0.05 }), ironM = std(0x3a3e48, 0, 0, { r: 0.5, m: 0.7 });
  const k = { wall: [], feature: [], pool: null, mats: [glowM, accM] };
  switch (bk) {
    case 'core_facility':
      k.wall.push([[G3.dod, baseM, [0, 0.3, 0], [0.8, 0.6, 0.7]], [G3.dod, darkM, [0.4, 0.2, 0.25], [0.45, 0.4, 0.45]], [G3.dod, baseM, [-0.35, 0.18, 0.3], [0.35, 0.3, 0.35]]]); // rubble
      k.wall.push([[G3.cyl, woodM, [0, 0.5, 0], [0.75, 1.0, 0.75]], [G3.torus, ironM, [0, 0.25, 0], [0.75, 0.75, 0.75], [Math.PI / 2, 0, 0]], [G3.torus, ironM, [0, 0.78, 0], [0.75, 0.75, 0.75], [Math.PI / 2, 0, 0]]]); // barrel
      k.feature.push([[G3.cyl6, darkM, [0, 0.2, 0], [1.3, 0.4, 1.3]], [G3.cyl, baseM, [0, 1.2, 0], [0.75, 1.8, 0.75]], [G3.dod, baseM, [0.15, 2.2, 0], [0.7, 0.45, 0.6]]]); // broken column
      break;
    case 'shadow_realm':
      k.wall.push([[G3.oct, std(0x2a1450, glow, 1.6, { r: 0.15, m: 0.1 }), [0, 0.8, 0], [0.5, 1.6, 0.5]], [G3.oct, std(0x2a1450, glow, 1.2, { r: 0.15 }), [0.35, 0.45, 0.1], [0.3, 0.9, 0.3], [0, 0, 0.5]], [G3.oct, std(0x2a1450, acc, 1.2, { r: 0.15 }), [-0.3, 0.4, -0.1], [0.25, 0.8, 0.25], [0, 0, -0.4]]]); // crystal cluster
      k.feature.push([[G3.box, darkM, [0, 1.3, 0], [0.7, 2.6, 0.7]], [G3.cone4, darkM, [0, 2.85, 0], [0.7, 0.5, 0.7]], [G3.box, glowM, [0, 1.6, 0.36], [0.12, 1.4, 0.02]]]); // obelisk
      break;
    case 'voltage_foundry':
      k.wall.push([[G3.box, woodM, [0, 0.4, 0], [0.8, 0.8, 0.8]], [G3.box, ironM, [0, 0.4, 0.41], [0.8, 0.1, 0.01]], [G3.box, woodM, [0.1, 1.05, 0], [0.55, 0.5, 0.55], [0, 0.4, 0]]]); // crates
      k.wall.push([[G3.cyl, std(0xb87333, 0, 0, { r: 0.4, m: 0.8 }), [0, 0.8, 0], [0.3, 1.6, 0.3]], [G3.torus, ironM, [0, 1.4, 0], [0.6, 0.6, 0.6], [Math.PI / 2, 0, 0]], [G3.sph, glowM, [0, 1.75, 0], [0.32, 0.32, 0.32]]]); // spark rod
      k.feature.push([[G3.box, darkM, [0, 0.9, 0], [1.5, 1.8, 1.2]], [G3.box, glowM, [0, 0.55, 0.61], [0.8, 0.5, 0.02]], [G3.cyl, ironM, [0, 2.2, 0], [0.45, 0.9, 0.45]]]); // furnace
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
      k.wall.push([[G3.cyl, std(0xd8ccae, 0, 0, { r: 0.8, m: 0 }), [0, 0.45, 0], [0.22, 0.9, 0.22]], [G3.sph, std(0x2a3a14, glow, 1.2, { r: 0.4, m: 0.1 }), [0, 0.95, 0], [0.9, 0.4, 0.9]], [G3.cyl, std(0xd8ccae, 0, 0, { r: 0.8, m: 0 }), [0.4, 0.25, 0.2], [0.14, 0.5, 0.14]], [G3.sph, std(0x2a3a14, glow, 1.0, { r: 0.4 }), [0.4, 0.52, 0.2], [0.5, 0.24, 0.5]]]); // glowcaps
      k.feature.push([[G3.cyl, darkM, [0, 1.0, 0], [0.5, 2.0, 0.5], [0.15, 0, 0.1]], [G3.sph, std(0x2a3a14, glow, 2, { r: 0.4 }), [0, 2.1, 0], [0.7, 0.7, 0.7]]]); // stalk
      k.pool = animatedPoolMat(0x2e6a10, 0xd8ff6a, 0.6);
      break;
    case 'astral_rift':
      k.wall.push([[G3.dod, darkM, [0, 0.35, 0], [0.9, 0.6, 0.9]], [G3.oct, std(0x150a30, acc, 2, { r: 0.1 }), [0, 0.95, 0], [0.3, 0.6, 0.3]]]); // shard rock
      k.feature.push([[G3.cyl, darkM, [0, 0.15, 0], [1.4, 0.3, 1.4]], [G3.torus, glowM, [0, 1.3, 0], [1.4, 1.4, 1.4], [Math.PI / 2.4, 0, 0]], [G3.sph, std(0x000000, 0x000000, 0, { r: 1, m: 0 }), [0, 1.3, 0], [0.55, 0.55, 0.55]]]); // rift beacon
      break;
    case 'chrono_spire':
      k.wall.push([[G3.cyl, baseM, [0, 1.1, 0], [0.6, 2.2, 0.6]], [G3.box, baseM, [0, 2.25, 0], [0.8, 0.12, 0.8]], [G3.box, baseM, [0, 0.08, 0], [0.8, 0.16, 0.8]]]); // marble column
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
  MAT.pylon = new THREE.MeshStandardMaterial({ map: TEX.metal.map, normalMap: TEX.metal.normalMap, color: 0x6a6660, metalness: 0.05, roughness: 0.9 });
  MAT.iron = new THREE.MeshStandardMaterial({ color: 0x2a2c32, metalness: 0.7, roughness: 0.5 });
  MAT.wood = new THREE.MeshStandardMaterial({ color: 0x5a3420, metalness: 0, roughness: 0.9 });
  MAT.crystal = new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x2fbfff, emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
}
/* rock tops glow faintly with their own texture so the mass between rooms never drops to black; the
   per-instance depth shade also dims that glow, so rock far from the rooms still sinks into shadow */
function rockTop(m) {
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n\ttotalEmissiveRadiance *= vColor.rgb;\n#endif'); };
  m.customProgramCacheKey = () => 'rockTop'; return m;
}
function biomeSurface(bk) {
  const B = BIOMES[bk], T = biomeMaps(bk), acc = new THREE.Color(B.accent);
  const std = (maps, o = {}) => new THREE.MeshStandardMaterial({ ...maps, color: 0xffffff, roughness: o.r ?? 0.8, metalness: Math.min(0.45, B.metal), emissive: 0xffffff, emissiveIntensity: o.ei ?? 1.3 });
  const tops = {};
  return {
    floors: T.floor.map(m => std(m, { r: 0.7, ei: 1 })),
    side: std(T.side, { ei: 1 }),
    top: (mask, v = 0) => (tops[mask + '.' + v] ||= rockTop(std({ map: wallTopMaps(bk, mask, v).map, emissiveMap: wallTopMaps(bk, mask, v).map }, { ei: 0.3, r: 0.9 }))),
    seal: new THREE.MeshStandardMaterial({ map: T.side.map, color: 0xd8c08a, roughness: 0.6, metalness: 0.3, emissive: acc, emissiveIntensity: 0.35 }),
  };
}

/* ---------- painted props: standing billboards painted by the Pixi layer (02b_pixel.js) ---------- */
const PROP_KIT = {
  core_facility:   { wall: ['shelf', 'statue', 'rack', 'urn'], crates: 2, barrels: 1 },
  shadow_realm:    { wall: ['statue', 'bigshroom', 'crystal', 'shelf'], crates: 2, barrels: 1 },
  voltage_foundry: { wall: ['anvil', 'rack', 'urn', 'anvil'], crates: 2, barrels: 2 },
  inferno_depths:  { wall: ['statue', 'urn', 'rack', 'anvil'], crates: 2, barrels: 2 },
  glacial_vault:   { wall: ['statue', 'crystal', 'urn', 'shelf'], crates: 2, barrels: 1 },
  toxic_hive:      { wall: ['bigshroom', 'urn', 'bigshroom', 'statue'], crates: 1, barrels: 3 },
  astral_rift:     { wall: ['crystal', 'statue', 'crystal', 'urn'], crates: 2, barrels: 1 },
  chrono_spire:    { wall: ['hourglass', 'shelf', 'statue', 'urn'], crates: 2, barrels: 1 },
};
/* soft contact shadow on the floor, so painted billboards stand on the tiles instead of floating */
let shadowMat = null;
function groundShadow(x, z, w, parent = world.group) {
  shadowMat ||= new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false, opacity: 0.8 });
  const m = new THREE.Mesh(G3.plane, shadowMat); m.scale.set(w, 1, w * 0.5); m.position.set(x, 0.03, z); m.renderOrder = 1; parent.add(m); return m;
}
function propSprite(name, x, z, o = {}) {
  const T = PROPS[name], w = (o.w ?? T.ww ?? 1.5), h = w * T.h / T.w;
  const m = pixelSpriteMat(T.tex, { gain: o.gain ?? 1 }); m.alphaTest = 0.5; m.depthWrite = true; m.transparent = false;
  const s = new THREE.Sprite(m); s.center.set(0.5, o.cy ?? 0.04); s.scale.set(w, h, 1); s.position.set(x, 0, z); s.renderOrder = 2;
  return s;
}
/* crates and barrels: solid cover that breaks; barrels blow up */
function addBreakable(name, tx, ty) {
  const x = (tx + 0.5) * TILE, z = (ty + 0.5) * TILE, explosive = name === 'keg';
  const s = propSprite(name, x, z); world.group.add(s); const sh = groundShadow(x, z + 0.1, s.scale.x * 1.15);
  const hp = (explosive ? 10 : 34) * (1 + (G.floor - 1) * 0.25);
  const pr = { name, tx, ty, x, z, s, sh, mat: s.material, hp, maxHp: hp, explosive, flash: 0, wob: 0, alive: true, fuse: -1 };
  world.props.push(pr); world.propAt.set(ty * world.W + tx, pr); world.grid[ty * world.W + tx] = T_WALL;
  return pr;
}
function propAtPoint(x, z) { return world.propAt.get(worldToTile(z) * world.W + worldToTile(x)); }
function damageProp(pr, d, kx = 0, kz = 0) {
  if (!pr || !pr.alive || pr.fuse >= 0) return;
  pr.hp -= d; pr.flash = 0.08; pr.wob = 1; AUDIO.sfx.hit();
  particles.emit(pr.x, 0.8, pr.z, pr.explosive ? 0xffb050 : 0xc58a4c, 4, { speed: 4, life: 0.3, size: 0.18 });
  if (pr.hp <= 0) { if (pr.explosive) { pr.fuse = 0.42; AUDIO.sfx.warn(); } else breakProp(pr); }
}
function propsNear(x, z, R) { return world.props.filter(pr => pr.alive && Math.hypot(pr.x - x, pr.z - z) < R + 0.9); }
function breakProp(pr) {
  if (!pr.alive) return; pr.alive = false; world.group.remove(pr.s, pr.sh); pr.mat.dispose();
  world.grid[pr.ty * world.W + pr.tx] = T_FLOOR; world.propAt.delete(pr.ty * world.W + pr.tx); G.flowDirty = true;
  const B = BIOMES[world.biome], acc = pr.explosive ? (world.biome === 'toxic_hive' ? 0x9bea52 : 0xff8a3a) : 0xc58a4c;
  debrisBurst(pr.x, pr.z, [0x43261a, 0x6b3f22, acc], pr.explosive ? 16 : 12);
  particles.emit(pr.x, 0.9, pr.z, acc, 18, { speed: 6, life: 0.45, size: 0.22, up: 1.4 });
  AUDIO.sfx.kill(); shakeAdd(0.2);
  if (pr.explosive) explodeBarrel(pr);
  else { for (let i = 0; i < 3; i++) spawnShard(pr.x + rr(-0.5, 0.5), pr.z + rr(-0.5, 0.5), 1); if (rand() < 0.22) spawnPickup(pr.x, pr.z); }
}
function explodeBarrel(pr) {
  const R = 3.6, x = pr.x, z = pr.z, toxic = world.biome !== 'inferno_depths', col = toxic ? 0x9bea52 : 0xff7a2a, st = toxic ? 'poison' : 'burn';
  flashLight(x, 1.2, z, col, 90, 0.35); shockRing(x, z, R, col, 0.45); shockRing(x, z, R * 0.55, 0xffffff, 0.3);
  particles.emit(x, 0.8, z, col, 70, { speed: 10, life: 0.7, size: 0.32, up: 1.2 });
  particles.emit(x, 0.5, z, 0xffffff, 20, { speed: 6, life: 0.25, size: 0.25 });
  AUDIO.sfx.boom(); shakeAdd(0.75, 0, 0); G.hitstop = Math.max(G.hitstop, 0.06);
  const dmg = 45 * (1 + (G.floor - 1) * 0.3);
  for (const e of G.enemies) if (e.alive && !e.hidden && Math.hypot(e.x - x, e.z - z) < R + e.r) { damageEnemy(e, e.boss ? dmg * 0.5 : dmg, true, e.x - x, e.z - z, { knock: 12 }); applyStatus(e, st, 3, { dps: dmg * 0.12 }); }
  const p = G.p; if (Math.hypot(p.x - x, p.z - z) < R) { hurtPlayer(16 + G.floor * 2); applyPlayerStatus(st, 1.4); }
  for (const o of propsNear(x, z, R)) if (o !== pr) after(0.1, () => damageProp(o, 999));
}
function updateProps(dt) {
  for (const pr of world.props) {
    if (!pr.alive) continue;
    const u = pr.mat.userData.u; pr.flash = Math.max(0, pr.flash - dt); pr.wob = Math.max(0, pr.wob - dt * 6);
    if (pr.fuse >= 0) { pr.fuse -= dt; u.uFlash.value = Math.sin(G.time * 50) > 0 ? 0.85 : 0.2; u.uFlashCol.value.set(0xff3030); if (pr.fuse <= 0) breakProp(pr); }
    else { u.uFlash.value = pr.flash > 0 ? 1 : 0; u.uFlashCol.value.set(0xffffff); }
    const sq = Math.sin(pr.wob * 9) * pr.wob * 0.08, w = pr.s.userData.w ??= pr.s.scale.x, h = pr.s.userData.h ??= pr.s.scale.y;
    pr.s.scale.set(w * (1 + sq), h * (1 - sq), 1);
  }
}

function clearWorld() {
  if (world.group) { scene.remove(world.group); world.group.traverse(o => { if (o.geometry && !Object.values(G3).includes(o.geometry)) o.geometry.dispose(); }); }
  world.lights.forEach(l => scene.remove(l)); world.lights = []; world.lightSrc = []; world.braziers = [];
  world.anim = []; world.props = []; world.propAt = new Map();
}
/* ---------- living cards: flames, banners and tufts cut from the Pixi live atlas ----------
   Upright quads stretched by 1/cos(pitch) so their texels land square on screen. Grass leans in
   a slow wind, flames burn at full brightness, everything else picks up the pooled torch lights. */
const CARD_H = 1 / Math.cos(CAM_PITCH), CARD_LIGHTS = 8;
let cardMat = null;
function getCardMat() {
  if (cardMat) return cardMat;
  cardMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: PIX.liveTex }, t: SHARED_T, uAtlas: { value: new THREE.Vector2(LIVE_W, LIVE_H) }, uAmb: { value: new THREE.Color(0.4, 0.4, 0.4) },
      uLP: { value: Array.from({ length: CARD_LIGHTS }, () => new THREE.Vector3(0, -99, 0)) }, uLC: { value: Array.from({ length: CARD_LIGHTS }, () => new THREE.Color(0, 0, 0)) } },
    vertexShader: `attribute vec4 aRect; attribute vec4 aP; uniform float t; uniform vec2 uAtlas;
      varying vec2 vUv; varying float vGlow; varying vec3 vW;
      void main(){ vec3 p=position; float top=uv.y;
        p.x+=(sin(t*(1.1+aP.y)+aP.x)+0.4*sin(t*2.7+aP.x*1.7))*aP.y*0.06*top*top;
        float u=aP.w>0.5 ? 1.0-uv.x : uv.x;
        vUv=vec2((aRect.x+u*aRect.z)/uAtlas.x, 1.0-(aRect.y+(1.0-uv.y)*aRect.w)/uAtlas.y);
        vGlow=aP.z; vec4 w=modelMatrix*instanceMatrix*vec4(p,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 uAmb; uniform vec3 uLP[${CARD_LIGHTS}]; uniform vec3 uLC[${CARD_LIGHTS}];
      varying vec2 vUv; varying float vGlow; varying vec3 vW;
      void main(){ vec4 c=texture2D(map,vUv); if(c.a<0.5) discard;
        vec3 L=uAmb; for(int i=0;i<${CARD_LIGHTS};i++){ float d=distance(vW,uLP[i]); L+=uLC[i]*pow(clamp(1.0-d/10.0,0.0,1.0),1.5); }
        gl_FragColor=vec4(c.rgb*mix(L,vec3(0.72),vGlow),1.0); }`,
  });
  return cardMat;
}
function cardLayer(grp, items) {
  if (!items.length) return null;
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), n = items.length, rectA = new Float32Array(n * 4), pA = new Float32Array(n * 4);
  const im = new THREE.InstancedMesh(geo, getCardMat(), n), m = new THREE.Matrix4();
  items.forEach((it, i) => {
    const [cx, cy, cw, ch] = LIVE_CELLS[it.cell];
    m.makeScale(cw / PROP_TEXELS, ch / PROP_TEXELS * CARD_H, 1); m.setPosition(it.x, it.y, it.z); im.setMatrixAt(i, m);
    rectA.set([cx, cy, cw, ch], i * 4); pA.set([Math.random() * 6.3, it.sway || 0, it.glow ? 1 : 0, it.flip ? 1 : 0], i * 4);
  });
  geo.setAttribute('aRect', new THREE.InstancedBufferAttribute(rectA, 4)); geo.setAttribute('aP', new THREE.InstancedBufferAttribute(pA, 4));
  im.frustumCulled = false; im.renderOrder = 2; grp.add(im); return im;
}
function buildWorld(secIndex, seed = (Math.random() * 1e9) | 0) {
  clearWorld();
  const sec = SECTORS[secIndex], bk = sec.id, B = BIOMES[bk];
  const d = genSector(sec, seed);
  Object.assign(world, { W: d.W, H: d.H, grid: d.grid, rooms: d.rooms, start: d.start, vault: d.vault, biome: bk, sector: sec, gateOpen: false, sealOpen: false });
  world.explored = new Uint8Array(d.W * d.H);
  const grp = new THREE.Group(); world.group = grp; scene.add(grp);
  pixBiome(bk); // repaint the Pixi live atlas + props for this biome
  scene.fog.color.setHex(B.fog); scene.background.setHex(B.fog);
  // dimmer fill so the torches and braziers carry the scene
  hemi.color.setHex(B.hemi[0]); hemi.groundColor.setHex(B.hemi[1]); hemi.intensity = 1.6; moon.intensity = 0.75; moon.color.set(B.hemi[0]).lerp(new THREE.Color(0xffffff), 0.4);
  const surf = biomeSurface(bk), glow = new THREE.Color(B.glow), acc = new THREE.Color(B.accent);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  const R = mulberry(seed + 9);

  // floor tiles in four painted variants (gate + seal cells get floor under them too)
  const fgeo = new THREE.PlaneGeometry(TILE, TILE); fgeo.rotateX(-Math.PI / 2);
  const byVariant = [[], [], [], []];
  for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) if (d.grid[y * d.W + x] !== T_WALL) { const r = R(); byVariant[r < 0.6 ? 0 : r < 0.92 ? 1 : r < 0.97 ? 2 : 3].push([x, y]); }
  byVariant.forEach((cells, v) => {
    if (!cells.length) return; const im = new THREE.InstancedMesh(fgeo, surf.floors[v], cells.length);
    cells.forEach(([x, y], k) => { m.compose(p.set((x + 0.5) * TILE, 0, (y + 0.5) * TILE), q.identity(), s); im.setMatrixAt(k, m); col.setScalar(0.9 + R() * 0.1); im.setColorAt(k, col); });
    grp.add(im);
  });
  // wall blocks, grouped by which sides face open floor so the cap trim follows the maze
  const open = (x, y) => x >= 0 && y >= 0 && x < d.W && y < d.H && d.grid[y * d.W + x] !== T_WALL;
  const byMask = {};
  for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) if (d.grid[y * d.W + x] === T_WALL) {
    const mask = (open(x, y - 1) ? 1 : 0) | (open(x + 1, y) ? 2 : 0) | (open(x, y + 1) ? 4 : 0) | (open(x - 1, y) ? 8 : 0);
    (byMask[mask + '.' + (mask ? 0 : (x * 7 + y * 13) % 3)] ||= []).push([x, y]); // solid rock gets three variants against tiling
  }
  // rock far from any floor sinks into shadow: BFS distance from open cells
  const deep = new Uint8Array(d.W * d.H).fill(9), bfs = [];
  for (let i = 0; i < d.W * d.H; i++) if (d.grid[i] !== T_WALL) { deep[i] = 0; bfs.push(i); }
  for (let h = 0; h < bfs.length; h++) { const i = bfs[h], x = i % d.W, y = (i - x) / d.W; if (deep[i] >= 6) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, j = ny * d.W + nx; if (nx >= 0 && ny >= 0 && nx < d.W && ny < d.H && deep[j] > deep[i] + 1) { deep[j] = deep[i] + 1; bfs.push(j); } } }
  const wgeo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
  for (const [key, cells] of Object.entries(byMask)) {
    const [mask, tv] = key.split('.').map(Number), top = surf.top(mask, tv), im = new THREE.InstancedMesh(wgeo, [surf.side, surf.side, top, top, surf.side, surf.side], cells.length);
    cells.forEach(([x, y], i) => { m.compose(p.set((x + 0.5) * TILE, WALL_H / 2, (y + 0.5) * TILE), q.identity(), s); im.setMatrixAt(i, m); const k = deep[y * d.W + x]; col.setScalar((0.9 + R() * 0.1) * (k <= 1 ? 1 : Math.max(0.5, 1 - (k - 1) * 0.11))); im.setColorAt(i, col); });
    grp.add(im);
  }

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
    for (const gy of [y0, y1]) { const post = new THREE.Mesh(G3.box, MAT.pylon); post.scale.set((x1 - x0) * TILE, WALL_H * 1.3, 0.35); post.position.set((x0 + x1) / 2 * TILE, WALL_H * 0.65, gy * TILE); grp.add(post); }
  }
  // sealed secret wall
  world.secret = d.secret ? { ...d.secret, found: false, claimed: false } : null; world.sealMeshes = [];
  if (d.secret) for (const [x, y] of d.secret.seal) { const b = new THREE.Mesh(wgeo, [surf.seal, surf.seal, surf.top(0), surf.top(0), surf.seal, surf.seal]); b.position.set((x + 0.5) * TILE, WALL_H / 2, (y + 0.5) * TILE); grp.add(b); world.sealMeshes.push(b); }

  // biome props: wall decor and free-standing features
  const kit = propKit(bk); world.kitMats = kit.mats;
  const wallSpots = [], featureSpots = [];
  for (let t = 0; t < 2200; t++) {
    const x = 1 + Math.floor(R() * (d.W - 2)), y = 1 + Math.floor(R() * (d.H - 2));
    if (d.grid[y * d.W + x] !== T_FLOOR) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => d.grid[(y + dy) * d.W + x + dx] === T_WALL);
    if (n.length !== 1 || [...wallSpots, ...featureSpots].some(o => Math.abs(o.tx - x) + Math.abs(o.ty - y) < 3)) continue;
    if (d.switches.some(sw => Math.abs(sw.tx - x) + Math.abs(sw.ty - y) < 3) || d.traps.some(tr => Math.abs(tr.tx - x) + Math.abs(tr.ty - y) < 3)) continue;
    if (!d.rooms.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) continue; // rooms only, corridors stay clear
    const [dx, dy] = n[0];
    if (dy === -1 && R() < 0.45) continue; // leave room on north walls for torches and banners
    wallSpots.push({ tx: x, ty: y, dx, dy, x: (x + 0.5 + dx * 0.22) * TILE, z: (y + 0.5 + dy * 0.22) * TILE, ry: Math.atan2(-dx, -dy), s: 0.9 + R() * 0.35, kind: Math.floor(R() * kit.wall.length) });
    if (wallSpots.length > 120) break;
  }
  for (const r of d.rooms) {
    if (r.zone === 'threshold' || r.zone === 'secret' || r.w < 9) continue;
    const spots = r.zone === 'vault' ? [] : [[r.x + Math.floor(r.w / 2), r.y + 2]];
    for (const [x, y] of spots) if (d.grid[y * d.W + x] === T_FLOOR && kit.feature.length) { featureSpots.push({ tx: x, ty: y, x: (x + 0.5) * TILE, z: (y + 0.5) * TILE, ry: R() * 6, s: 1, kind: Math.floor(R() * kit.feature.length) }); d.grid[y * d.W + x] = T_WALL; }
  }
  // spots on a north wall face the camera: they get painted props; side walls keep 3D kit pieces
  const sheet = PROP_KIT[bk];
  for (const w of wallSpots) {
    d.grid[w.ty * d.W + w.tx] = T_WALL;
    if (w.dy !== -1) continue;
    const name = sheet.wall[Math.floor(R() * sheet.wall.length)];
    const ps = propSprite(name, (w.tx + 0.5) * TILE, (w.ty + 0.5 - 0.28) * TILE); grp.add(ps); groundShadow(ps.position.x, ps.position.z + 0.1, ps.scale.x * 1.1);
  }
  kit.wall.forEach((parts, k) => instanceParts(grp, parts, wallSpots.filter(w => w.kind === k && w.dy !== -1)));
  kit.feature.forEach((parts, k) => instanceParts(grp, parts, featureSpots.filter(w => w.kind === k)));
  // breakable cover: crates and explosive barrels in the wing rooms
  world.props = []; world.propAt = new Map();
  const taken = [...wallSpots, ...featureSpots, ...d.switches, ...d.traps];
  for (const r of d.rooms) {
    if (r.zone !== 'north' && r.zone !== 'south') continue;
    const want = [...Array(sheet.crates + (R() < 0.5 ? 1 : 0)).fill('crate'), ...Array(Math.round(sheet.barrels * (0.5 + R()))).fill('keg')];
    for (const name of want) for (let t = 0; t < 30; t++) {
      const tx = r.x + 2 + Math.floor(R() * (r.w - 4)), ty = r.y + 2 + Math.floor(R() * (r.h - 4));
      let clear = true; for (let yy = ty - 1; yy <= ty + 1 && clear; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) if (d.grid[yy * d.W + xx] !== T_FLOOR) { clear = false; break; }
      if (!clear || taken.some(o => Math.abs(o.tx - tx) + Math.abs(o.ty - ty) < 3)) continue;
      addBreakable(name, tx, ty); taken.push({ tx, ty }); break;
    }
  }
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
      else { mesh = new THREE.Mesh(G3.box, MAT.wood); mesh.scale.set(TILE * (3 + R() * 6), 0.5, 0.5); mesh.position.set(x, WALL_H + 0.6, z); } // rafters
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
  { const [vx, vz] = roomCenter(d.vault); const dec = new THREE.Mesh(G3.plane, decalRingMat(new THREE.Color(B.flame[1]), 12)); dec.scale.setScalar(16); dec.position.set(vx, 0.05, vz); dec.renderOrder = 1; grp.add(dec); }

  // braziers in room corners: stone pedestal, iron bowl, a Pixi flame card and a light
  world.pylons = []; world.lightSrc = []; const cards = [];
  const pg = new THREE.CylinderGeometry(0.3, 0.42, 1, 6), bg = new THREE.CylinderGeometry(0.62, 0.42, 0.3, 10);
  for (const r of d.rooms) {
    if (r.zone === 'secret') continue;
    for (const [tx, ty] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) {
      if (d.grid[ty * d.W + tx] !== T_FLOOR || R() > (r.zone === 'vault' ? 1 : 0.6)) continue;
      const x = (tx + 0.5) * TILE, z = (ty + 0.5) * TILE;
      const ped = new THREE.Mesh(pg, MAT.pylon); ped.position.set(x, 0.5, z); grp.add(ped);
      const bowl = new THREE.Mesh(bg, MAT.iron); bowl.position.set(x, 1.1, z); grp.add(bowl);
      cards.push({ cell: 'brazier', x, y: 1.12, z: z + 0.1, glow: true });
      world.pylons.push({ x, z, t: R() * 6 }); world.lightSrc.push({ x, y: 2.6, z, k: 1.15, t: R() * 9 }); d.grid[ty * d.W + tx] = T_WALL;
    }
  }
  // torches and banners along the north walls of rooms: the faces the camera looks at
  const torchParts = [[G3.box, MAT.iron, [0, 1.2, 0.12], [0.16, 0.16, 0.28]], [G3.cyl, MAT.wood, [0, 1.38, 0.27], [0.12, 0.42, 0.12], [0.3, 0, 0]]], torchAt = [];
  for (const r of d.rooms) {
    let next = r.x + 1 + Math.floor(R() * 3);
    for (let tx = r.x; tx < r.x + r.w; tx++) {
      const ty = r.y; if (tx < next || d.grid[ty * d.W + tx] !== T_FLOOR || d.grid[(ty - 1) * d.W + tx] !== T_WALL) continue;
      const x = (tx + 0.5) * TILE, z = ty * TILE;
      if (R() < 0.72) { torchAt.push({ x, z, ry: 0, s: 1 }); cards.push({ cell: 'torch', x, y: 1.5, z: z + 0.34, glow: true }); world.lightSrc.push({ x, y: 2.5, z: z + 0.8, k: 0.9, t: R() * 9 }); }
      else cards.push({ cell: 'banner', x, y: 0.12, z: z + 0.04 });
      next = tx + 3 + Math.floor(R() * 3);
    }
  }
  instanceParts(grp, torchParts, torchAt);
  // ground cover: grass, fungus, pebbles and bones, thickest where floor meets wall
  const cover = BIOMES[bk].cover, maxTufts = IS_TOUCH ? 420 : 760, near = (x, y, list) => list.some(o => Math.abs(o.tx - x) <= 1 && Math.abs(o.ty - y) <= 1);
  let tufts = 0;
  for (let y = 1; y < d.H - 1 && tufts < maxTufts; y++) for (let x = 1; x < d.W - 1 && tufts < maxTufts; x++) {
    if (d.grid[y * d.W + x] !== T_FLOOR || near(x, y, d.traps) || near(x, y, d.switches)) continue;
    const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => d.grid[(y + dy) * d.W + x + dx] === T_WALL);
    if (R() > (walls.length ? 0.6 : 0.1)) continue;
    for (let k = 0, n = 1 + (R() < 0.45 ? 1 : 0) + (walls.length && R() < 0.4 ? 1 : 0); k < n; k++) {
      let fx = 0.15 + R() * 0.7, fz = 0.15 + R() * 0.7;
      for (const [dx, dy] of walls) { if (dx) fx = dx > 0 ? 0.62 + R() * 0.3 : 0.08 + R() * 0.3; if (dy) fz = dy > 0 ? 0.62 + R() * 0.3 : 0.06 + R() * 0.25; }
      const i = Math.floor(R() * cover.length), kind = cover[i];
      cards.push({ cell: 'tuft' + i, x: (x + fx) * TILE, y: 0, z: (y + fz) * TILE, sway: kind === 'grass' || kind === 'straw' || kind === 'flower' ? 0.6 + R() * 0.6 : 0, glow: GLOW_TUFTS.has(kind), flip: R() < 0.5 }); tufts++;
    }
  }
  world.cards = cardLayer(grp, cards);
  for (let i = 0; i < (IS_TOUCH ? 5 : 8); i++) { const l = new THREE.PointLight(B.light, 0, 15, 1.2); scene.add(l); world.lights.push(l); }

  // circuit switches (Batch 09 puzzles)
  world.switches = d.switches.map(sw => {
    const x = (sw.tx + 0.5) * TILE, z = (sw.ty + 0.5) * TILE, g = new THREE.Group();
    g.add(padDecal(0, 0, 3.4));
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

/* the painted rune plate, laid flat on the floor under relays, the cache and the exit */
function padDecal(x, z, size) {
  const T = PROPS.runeplate;
  const m = new THREE.Mesh(G3.plane, new THREE.MeshStandardMaterial({ map: T.tex, transparent: true, alphaTest: 0.3, depthWrite: false, roughness: 0.8, emissive: 0xffffff, emissiveMap: T.tex, emissiveIntensity: 0.15 }));
  m.scale.set(size, 1, size * T.h / T.w); m.position.set(x, 0.03, z); m.renderOrder = 1; return m;
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
  grp.add(padDecal(0, 0, 4.2), r1, r2, disc, beam);
  const [x, z] = roomCenter(world.vault); grp.position.set(x, 0, z); grp.visible = false;
  world.group.add(grp);
  world.portal = { grp, r1, r2, beam, x, z, active: false };
}

function updateWorld(dt, px, pz, time) {
  SHARED_T.value = time;
  // the nearest torches and braziers borrow the pooled lights; fire flickers on two beating sines
  const near = world.lightSrc.map(p => [p, (p.x - px) ** 2 + (p.z - pz) ** 2]).sort((a, b) => a[1] - b[1]);
  const cu = cardMat && cardMat.uniforms;
  world.lights.forEach((l, i) => {
    const e = near[i]; if (!e) { l.intensity = 0; if (cu && i < CARD_LIGHTS) cu.uLC.value[i].setRGB(0, 0, 0); return; }
    const p = e[0], fl = 0.82 + Math.sin(time * 9.3 + p.t) * 0.09 + Math.sin(time * 23.1 + p.t * 2) * 0.06 + (Math.sin(time * 3.1 + p.t) > 0.93 ? -0.12 : 0);
    l.position.set(p.x + Math.sin(time * 7 + p.t) * 0.05, p.y, p.z);
    l.intensity = 30 * p.k * fl * clamp(1.4 - Math.sqrt(e[1]) / 30, 0, 1);
    if (cu && i < CARD_LIGHTS) { cu.uLP.value[i].copy(l.position); cu.uLC.value[i].copy(l.color).multiplyScalar(l.intensity / 30 * 1.3); }
  });
  if (cu) { cu.uAmb.value.copy(hemi.color).multiplyScalar(hemi.intensity * 0.32); for (let i = world.lights.length; i < CARD_LIGHTS; i++) cu.uLC.value[i].setRGB(0, 0, 0); }
  // embers lift off the nearest fires
  const fc = BIOMES[world.biome].flame;
  for (let i = 0; i < Math.min(5, near.length); i++) { const p = near[i][0]; if (rand() < dt * 2.2) particles.emit(p.x + rr(-0.2, 0.2), p.y + 0.1, p.z, rand() < 0.5 ? fc[1] : fc[2], 1, { speed: 0.4, life: 1.1, size: 0.1, grav: -1.6, lift: 1.2, drag: 1 }); }
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
