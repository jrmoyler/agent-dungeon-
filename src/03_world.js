/* ------------------------------------------------------------------
   WORLD: procedural dungeon (rooms + corridors), PBR instanced tiles,
   torch pylons with pooled lights, exit portal, tile collision
------------------------------------------------------------------- */
const TILE = 2;
const world = {
  W: 0, H: 0, grid: null, rooms: [], group: null, start: null, exit: null, pylons: [], lights: [],
  explored: null, portal: null, bossRoom: null,
};
const WALL_H = 2.1;

function genDungeon(floor, isBoss) {
  const W = isBoss ? 52 : 64 + Math.min(floor, 6) * 2, H = W;
  const g = new Uint8Array(W * H).fill(1);
  const rooms = [];
  const carve = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x > 0 && y > 0 && x < W - 1 && y < H - 1) g[y * W + x] = 0; };
  if (isBoss) {
    const s = { x: 4, y: Math.floor(H / 2) - 4, w: 9, h: 9 };
    const b = { x: 18, y: 8, w: 30, h: 34, boss: true };
    rooms.push(s, b); carve(s.x, s.y, s.w, s.h); carve(b.x, b.y, b.w, b.h);
    carve(s.x + s.w - 1, Math.floor(H / 2) - 1, b.x - s.x - s.w + 2, 3);
  } else {
    const target = 9 + Math.min(floor, 5);
    for (let tries = 0; tries < 400 && rooms.length < target; tries++) {
      const w = 7 + Math.floor(rand() * 8), h = 7 + Math.floor(rand() * 7);
      const x = 2 + Math.floor(rand() * (W - w - 4)), y = 2 + Math.floor(rand() * (H - h - 4));
      if (rooms.some(r => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y)) continue;
      rooms.push({ x, y, w, h });
    }
    rooms.forEach(r => carve(r.x, r.y, r.w, r.h));
    // connect: greedy MST on centers with L-shaped 3-wide corridors
    const c = r => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
    const linked = [0], rest = rooms.map((_, i) => i).slice(1);
    const corridor = (a, b) => {
      const [ax, ay] = c(a), [bx, by] = c(b);
      if (rand() < 0.5) { carve(Math.min(ax, bx), ay - 1, Math.abs(ax - bx) + 1, 3); carve(bx - 1, Math.min(ay, by), 3, Math.abs(ay - by) + 1); }
      else { carve(ax - 1, Math.min(ay, by), 3, Math.abs(ay - by) + 1); carve(Math.min(ax, bx), by - 1, Math.abs(ax - bx) + 1, 3); }
    };
    while (rest.length) {
      let best = null, bd = 1e9;
      for (const i of linked) for (const j of rest) { const [ax, ay] = c(rooms[i]), [bx, by] = c(rooms[j]); const d = Math.abs(ax - bx) + Math.abs(ay - by); if (d < bd) { bd = d; best = [i, j]; } }
      corridor(rooms[best[0]], rooms[best[1]]); linked.push(best[1]); rest.splice(rest.indexOf(best[1]), 1);
    }
    // a couple of loops so it isn't a pure tree
    for (let k = 0; k < 2; k++) { const a = rooms[Math.floor(rand() * rooms.length)], b = rooms[Math.floor(rand() * rooms.length)]; if (a !== b) corridor(a, b); }
    // inner pillars in big rooms for cover
    for (const r of rooms.slice(1)) if (r.w >= 11 && r.h >= 10 && rand() < 0.7) {
      const px = r.x + 3, py = r.y + 3, qx = r.x + r.w - 4, qy = r.y + r.h - 4;
      for (const [x, y] of [[px, py], [qx, py], [px, qy], [qx, qy]]) g[y * W + x] = 1;
    }
  }
  return { W, H, grid: g, rooms };
}
const isWall = (tx, ty) => tx < 0 || ty < 0 || tx >= world.W || ty >= world.H || world.grid[ty * world.W + tx] === 1;
const worldToTile = v => Math.floor(v / TILE);
const solidAt = (x, z) => isWall(worldToTile(x), worldToTile(z));
const roomCenter = r => [(r.x + r.w / 2) * TILE, (r.y + r.h / 2) * TILE];

/* circle vs tile grid: resolve penetration on both axes */
function moveCircle(o, dx, dz, r) {
  o.x += dx; resolveAxis(o, r);
  o.z += dz; resolveAxis(o, r);
}
function resolveAxis(o, r) {
  const tx0 = worldToTile(o.x - r), tx1 = worldToTile(o.x + r), tz0 = worldToTile(o.z - r), tz1 = worldToTile(o.z + r);
  for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
    if (!isWall(tx, tz)) continue;
    const minx = tx * TILE, maxx = minx + TILE, minz = tz * TILE, maxz = minz + TILE;
    const cx = clamp(o.x, minx, maxx), cz = clamp(o.z, minz, maxz);
    let ddx = o.x - cx, ddz = o.z - cz; const d2 = ddx * ddx + ddz * ddz;
    if (d2 < r * r) {
      if (d2 > 1e-8) { const d = Math.sqrt(d2), p = r - d; o.x += ddx / d * p; o.z += ddz / d * p; }
      else { // center inside tile: push out along the shallowest side
        const l = o.x - minx, rgt = maxx - o.x, t = o.z - minz, b = maxz - o.z, m = Math.min(l, rgt, t, b);
        if (m === l) o.x = minx - r; else if (m === rgt) o.x = maxx + r; else if (m === t) o.z = minz - r; else o.z = maxz + r;
      }
    }
  }
}
function lineOfSight(x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0), steps = Math.ceil(d / 0.6);
  for (let i = 1; i < steps; i++) { const t = i / steps; if (solidAt(lerp(x0, x1, t), lerp(z0, z1, t))) return false; }
  return true;
}

let floorMat, wallMats, pylonMat, crystalMat;
function buildMaterials() {
  floorMat = new THREE.MeshStandardMaterial({ ...TEX.floor, color: 0xd6deef, metalness: 0.15, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.35, normalScale: new THREE.Vector2(1.1, 1.1) });
  const side = new THREE.MeshStandardMaterial({ ...TEX.wall, color: 0xaab3cc, metalness: 0.05, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.9 });
  const top = new THREE.MeshStandardMaterial({ map: TEX.floor.map, normalMap: TEX.floor.normalMap, roughnessMap: TEX.floor.roughnessMap, color: 0x59627a, roughness: 1, metalness: 0.3, emissive: 0x0a1020, emissiveIntensity: 1 });
  wallMats = [side, side, top, top, side, side];
  pylonMat = new THREE.MeshStandardMaterial({ ...TEX.metal, color: 0x3a4255, metalness: 0.85, roughness: 1 });
  crystalMat = new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x2fbfff, emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
}

function buildWorld(floor, isBoss, accent) {
  if (world.group) { scene.remove(world.group); world.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  world.lights.forEach(l => scene.remove(l)); world.lights = [];
  const d = genDungeon(floor, isBoss);
  Object.assign(world, d);
  world.explored = new Uint8Array(d.W * d.H);
  const grp = new THREE.Group(); world.group = grp; scene.add(grp);

  // tint per floor so each depth reads differently
  const hues = [0.6, 0.55, 0.75, 0.62, 0.05, 0.8, 0.5, 0.95, 0.68];
  const tint = new THREE.Color().setHSL(hues[(floor - 1) % hues.length], 0.25, 0.75);
  floorMat.color.copy(tint).lerp(new THREE.Color(0xbcc6dd), 0.4);
  const runeCol = new THREE.Color().setHSL(hues[(floor - 1) % hues.length], 0.85, 0.55);
  floorMat.emissive.copy(runeCol); wallMats[0].emissive.copy(runeCol);
  crystalMat.color.copy(runeCol).offsetHSL(0, 0, 0.15); crystalMat.emissive.copy(runeCol);

  // floor tiles
  let nf = 0, nw = 0;
  for (let i = 0; i < d.W * d.H; i++) if (!d.grid[i]) nf++;
  const fgeo = new THREE.PlaneGeometry(TILE, TILE); fgeo.rotateX(-Math.PI / 2);
  const floors = new THREE.InstancedMesh(fgeo, floorMat, nf);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), col = new THREE.Color();
  let k = 0;
  for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) if (!d.grid[y * d.W + x]) {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.floor(rand() * 4) * Math.PI / 2);
    m.compose(p.set((x + 0.5) * TILE, 0, (y + 0.5) * TILE), q, s); floors.setMatrixAt(k, m);
    col.setScalar(0.82 + rand() * 0.28); floors.setColorAt(k, col); k++;
  }
  floors.receiveShadow = false; grp.add(floors);

  // walls: only those touching floor
  const wallCells = [];
  for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) if (d.grid[y * d.W + x]) {
    let touch = false;
    for (let dy = -1; dy <= 1 && !touch; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < d.W && yy < d.H && !d.grid[yy * d.W + xx]) { touch = true; break; } }
    if (touch) wallCells.push([x, y]);
  }
  const wgeo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
  // brick UVs: scale side faces so bricks stay square
  const uv = wgeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (WALL_H / TILE));
  const walls = new THREE.InstancedMesh(wgeo, wallMats, wallCells.length);
  wallCells.forEach(([x, y], i) => {
    const hj = 1 + (rand() - 0.5) * 0.08;
    m.compose(p.set((x + 0.5) * TILE, WALL_H * hj / 2, (y + 0.5) * TILE), q.identity(), s.set(1, hj, 1)); walls.setMatrixAt(i, m);
    col.setScalar(0.78 + rand() * 0.3); walls.setColorAt(i, col);
  });
  s.set(1, 1, 1);
  grp.add(walls);

  // pylons (crystal torches) in rooms; lights are pooled to the nearest ones
  world.pylons = [];
  const pg = new THREE.CylinderGeometry(0.28, 0.42, 1.4, 8), cg = new THREE.OctahedronGeometry(0.42, 0);
  const halo = new THREE.SpriteMaterial({ map: TEX.glow, color: runeCol, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });
  for (const r of d.rooms) {
    const spots = [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]];
    for (const [tx, ty] of spots) {
      if (rand() < (r.boss ? 1 : 0.55)) {
        const base = new THREE.Mesh(pg, pylonMat); const x = (tx + 0.5) * TILE, z = (ty + 0.5) * TILE;
        base.position.set(x, 0.7, z); grp.add(base);
        const cr = new THREE.Mesh(cg, crystalMat); cr.position.set(x, 1.85, z); grp.add(cr);
        const h = new THREE.Sprite(halo); h.position.set(x, 1.85, z); h.scale.setScalar(3.2); grp.add(h);
        world.pylons.push({ x, z, crystal: cr, t: rand() * 6 });
        world.grid[ty * d.W + tx] = 1; // blocks movement
      }
    }
  }
  for (let i = 0; i < (IS_TOUCH ? 4 : 7); i++) {
    const l = new THREE.PointLight(runeCol, 0, 16, 1.2); scene.add(l); world.lights.push(l);
  }
  // debris / bones scattered for texture
  const rockGeo = new THREE.DodecahedronGeometry(0.22, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, pylonMat, 160); let rc = 0;
  for (let t = 0; t < 900 && rc < 160; t++) {
    const x = Math.floor(rand() * d.W), y = Math.floor(rand() * d.H);
    if (d.grid[y * d.W + x]) continue;
    const nearWall = isWall(x + 1, y) || isWall(x - 1, y) || isWall(x, y + 1) || isWall(x, y - 1);
    if (!nearWall) continue;
    q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
    const sc = 0.5 + rand() * 1.4;
    m.compose(p.set((x + rand()) * TILE, 0.08 * sc, (y + rand()) * TILE), q, s.set(sc, sc * 0.6, sc)); rocks.setMatrixAt(rc++, m);
  }
  s.set(1, 1, 1); rocks.count = rc; grp.add(rocks);

  world.start = d.rooms[0];
  if (isBoss) world.bossRoom = d.rooms[1];
  // exit = farthest room from start
  let far = d.rooms[1] || d.rooms[0], fd = 0; const [sx, sz] = roomCenter(world.start);
  for (const r of d.rooms) { const [cx, cz] = roomCenter(r); const dd = Math.hypot(cx - sx, cz - sz); if (dd > fd) { fd = dd; far = r; } }
  world.exit = far;
  buildPortal(runeCol);
  return d;
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
  const [x, z] = roomCenter(world.exit); grp.position.set(x, 0, z); grp.visible = false;
  world.group.add(grp);
  world.portal = { grp, r1, r2, beam, x, z, active: false, light: null };
}

function updateWorld(dt, px, pz, time) {
  // pooled lights follow nearest pylons
  const near = world.pylons.map(p => [p, (p.x - px) ** 2 + (p.z - pz) ** 2]).sort((a, b) => a[1] - b[1]);
  world.lights.forEach((l, i) => {
    const e = near[i]; if (!e) { l.intensity = 0; return; }
    const p = e[0]; l.position.set(p.x, 2.2, p.z);
    l.intensity = (26 + Math.sin(time * 3 + p.t) * 4) * clamp(1.4 - Math.sqrt(e[1]) / 30, 0, 1);
  });
  for (const p of world.pylons) { p.crystal.rotation.y += dt; p.crystal.position.y = 1.85 + Math.sin(time * 2 + p.t) * 0.1; }
  const P = world.portal;
  if (P && P.active) { P.r1.rotation.z += dt * 1.2; P.r2.rotation.z -= dt * 2; P.beam.material.opacity = 0.1 + Math.sin(time * 4) * 0.05; }
  // fog of war for minimap
  const tx = worldToTile(px), ty = worldToTile(pz), R = 7;
  for (let y = ty - R; y <= ty + R; y++) for (let x = tx - R; x <= tx + R; x++) if (x >= 0 && y >= 0 && x < world.W && y < world.H && (x - tx) ** 2 + (y - ty) ** 2 <= R * R) world.explored[y * world.W + x] = 1;
}
