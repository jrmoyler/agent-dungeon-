/* ------------------------------------------------------------------
   ENGINE: renderer, post FX, biome-procedural PBR textures, pixel
   sprite shader, atlas loading, GPU particles, procedural audio
------------------------------------------------------------------- */
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const DPR = Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.5 : 2);
renderer.setPixelRatio(DPR);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060b);
scene.fog = new THREE.FogExp2(0x04060b, 0.026);
const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 140);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.55, 0.84);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w * DPR * 0.5, h * DPR * 0.5);
  camera.aspect = w / h;
  camera.fov = w < h ? 54 : 40; // keep a similar view width on portrait phones
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const hemi = new THREE.HemisphereLight(0x8a9cd0, 0x1a120e, 1.1);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xb0c0ff, 0.9);
moon.position.set(-8, 20, 6);
scene.add(moon);

/* ---------- RNG + math ---------- */
function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = Math.random;
const rr = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const pick = a => a[Math.floor(Math.random() * a.length)];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hexInt = s => parseInt(s.replace('#', ''), 16);

/* ---------- procedural texture building blocks ---------- */
function makeNoise(size, seed, octaves = 4) {
  const r = mulberry(seed);
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const g = 4 << o; const grid = [];
    for (let i = 0; i < (g + 1) * (g + 1); i++) grid.push(r());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const gx = x / size * g, gy = y / size * g;
      const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const xw = (x0 + 1) % g, yw = (y0 + 1) % g;
      const a = grid[y0 * (g + 1) + x0], b = grid[y0 * (g + 1) + xw], c = grid[yw * (g + 1) + x0], d = grid[yw * (g + 1) + xw];
      out[y * size + x] += lerp(lerp(a, b, sx), lerp(c, d, sx), sy) * amp;
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
/* tiling voronoi: F1, F2-F1 edge distance and cell id */
function makeVoronoi(S, seed, n) {
  const r = mulberry(seed), pts = [];
  for (let i = 0; i < n; i++) pts.push([r() * S, r() * S, r()]);
  const f1 = new Float32Array(S * S), edge = new Float32Array(S * S), id = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let k = 0; k < n; k++) {
      let dx = Math.abs(x - pts[k][0]), dy = Math.abs(y - pts[k][1]); dx = Math.min(dx, S - dx); dy = Math.min(dy, S - dy);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; best = k; } else if (d < d2) d2 = d;
    }
    const i = y * S + x; f1[i] = d1; edge[i] = d2 - d1; id[i] = pts[best][2];
  }
  return { f1, edge, id };
}
function heightToNormal(h, size, strength) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = h[y * size + ((x - 1 + size) % size)], xr = h[y * size + ((x + 1) % size)];
    const yu = h[((y - 1 + size) % size) * size + x], yd = h[((y + 1) % size) * size + x];
    let nx = (xl - xr) * strength, ny = (yu - yd) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4;
    data[i] = (nx * 0.5 + 0.5) * 255; data[i + 1] = (ny * 0.5 + 0.5) * 255; data[i + 2] = (nz * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  return data;
}
function dataTex(data, size, srgb) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true; return t;
}
const rgbOf = hex => { const c = new THREE.Color(hex); return [c.r * 255, c.g * 255, c.b * 255]; };

/* ---------- BIOMES: palettes + surface patterns mimicking the Batch 08 dungeon sheets ---------- */
const BIOMES = {
  core_facility:   { floor:'panel',   wall:'tech',     base:'#2a3f52', dark:'#0f1a24', glow:'#21c8f1', accent:'#ce983e', fog:0x050b12, fogD:0.024, hemi:[0x7fb6d8, 0x10161c], rough:0.55, metal:0.55, particle:'motes', light:0x48d8ff },
  shadow_realm:    { floor:'flag',    wall:'obsidian', base:'#5a4688', dark:'#1c1434', glow:'#ad6bfa', accent:'#f3a2ff', fog:0x08051a, fogD:0.03,  hemi:[0x9b7fd8, 0x140c1c], rough:0.7,  metal:0.2,  particle:'wisps', light:0xb67bff },
  voltage_foundry: { floor:'diamond', wall:'plating',  base:'#5a6572', dark:'#1c2026', glow:'#3cc6ff', accent:'#ffc33e', fog:0x070a0e, fogD:0.025, hemi:[0x98b4cc, 0x1a1610], rough:0.45, metal:0.8,  particle:'sparks', light:0x7fd8ff },
  inferno_depths:  { floor:'basalt',  wall:'basalt',   base:'#4a2c26', dark:'#170807', glow:'#ff7233', accent:'#f8ce6a', fog:0x140503, fogD:0.028, hemi:[0xffa070, 0x200805], rough:0.85, metal:0.1,  particle:'embers', light:0xff7a33 },
  glacial_vault:   { floor:'ice',     wall:'ice',      base:'#5c8ea8', dark:'#16303f', glow:'#8ae4ff', accent:'#d4f9ff', fog:0x0a1820, fogD:0.026, hemi:[0xbfe8ff, 0x10202a], rough:0.18, metal:0.05, particle:'snow', light:0x9fe8ff },
  toxic_hive:      { floor:'hive',    wall:'resin',    base:'#4f6a3a', dark:'#141f0f', glow:'#9bea52', accent:'#e1e87d', fog:0x081106, fogD:0.03,  hemi:[0xb8e090, 0x0d1408], rough:0.6,  metal:0.1,  particle:'spores', light:0xa8f060 },
  astral_rift:     { floor:'void',    wall:'voidstone',base:'#463c7a', dark:'#0e0c28', glow:'#b976ff', accent:'#68d7fe', fog:0x05031a, fogD:0.022, hemi:[0x9a8cff, 0x0a0618], rough:0.4,  metal:0.35, particle:'stars', light:0xc08bff },
  chrono_spire:    { floor:'marble',  wall:'marble',   base:'#8a7d68', dark:'#2c261e', glow:'#f0c77e', accent:'#b1f7f4', fog:0x100c08, fogD:0.024, hemi:[0xffe2b0, 0x1a140c], rough:0.32, metal:0.25, particle:'dust', light:0xffd27a },
};

function makeFloorMaps(bk, seed) {
  const B = BIOMES[bk], S = 256;
  const n = makeNoise(S, seed, 5), n2 = makeNoise(S, seed + 7, 3), r = mulberry(seed + 3);
  const base = rgbOf(B.base), dark = rgbOf(B.dark), glow = rgbOf(B.glow), acc = rgbOf(B.accent);
  const h = new Float32Array(S * S), alb = new Uint8Array(S * S * 4), rough = new Uint8Array(S * S * 4), emi = new Uint8Array(S * S * 4);
  const vor = (B.floor === 'flag' || B.floor === 'basalt' || B.floor === 'hive') ? makeVoronoi(S, seed + 1, B.floor === 'flag' ? 16 : B.floor === 'basalt' ? 22 : 40) : null;
  const slabT = [r(), r(), r(), r()];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, j = i * 4;
    let hh = n[i] * 0.3, m = 0.5, e = 0, ec = glow, ro = B.rough;
    const half = S / 2, lx = x % half, ly = y % half, edge2 = Math.min(lx, ly, half - 1 - lx, half - 1 - ly), slab = (x < half ? 0 : 1) + (y < half ? 0 : 2);
    switch (B.floor) {
      case 'panel': { // tech floor panels, rivets, cyan seam light + hazard tiles
        const q = 64, px = x % q, py = y % q, ed = Math.min(px, py, q - 1 - px, q - 1 - py);
        const bev = clamp(ed / 4, 0, 1); hh = bev * 0.6 + n[i] * 0.15;
        m = 0.42 + n[i] * 0.3 + slabT[slab] * 0.1; m *= 0.6 + bev * 0.4;
        const rv = [[6, 6], [q - 7, 6], [6, q - 7], [q - 7, q - 7]].some(([a, b]) => (px - a) ** 2 + (py - b) ** 2 < 5);
        if (rv) { hh += 0.4; m = 0.85; }
        if (ed < 1.5 && ((Math.floor(x / q) + Math.floor(y / q)) % 3 === 0)) e = 1;
        const tile = Math.floor(x / q) * 5 + Math.floor(y / q) * 3;
        if (tile % 7 === 2 && bev > 0.9) { const st = Math.floor((px + py) / 8) % 2; if (px < 10 || px > q - 11) { m = st ? 0.9 : 0.12; ec = acc; } }
        if ((px - q / 2) ** 2 + (py - q / 2) ** 2 < 36 && tile % 5 === 1) { e = 0.7; }
        break;
      }
      case 'flag': { // irregular void flagstones with glowing veins
        const ed = vor.edge[i]; const bev = clamp(ed / 3.5, 0, 1); hh = bev * 0.65 + n[i] * 0.25;
        m = (0.32 + vor.id[i] * 0.3 + n[i] * 0.3) * (0.55 + bev * 0.45);
        if (ed < 1.2 && n2[i] > 0.5) e = 1; ro = 0.75;
        break;
      }
      case 'diamond': { // diamond tread plate with hazard band and arc conduits
        const q = 16, px = (x + (Math.floor(y / q) % 2) * 8) % q, py = y % q;
        const dd = Math.abs(px - 8) + Math.abs(py - 8) * 0.45; const ridge = dd < 3.2 ? 1 : 0;
        hh = ridge * 0.4 + clamp(edge2 / 5, 0, 1) * 0.5; m = 0.45 + ridge * 0.15 + n[i] * 0.25;
        m *= 0.6 + clamp(edge2 / 5, 0, 1) * 0.4;
        if (edge2 < 7 && slab === 3) { const st = Math.floor((x + y) / 10) % 2; m = st ? 0.95 : 0.1; ec = acc; }
        if (Math.abs(lx - half / 2) < 1 && slab === 0) e = 0.9;
        break;
      }
      case 'basalt': { // basalt plates split by molten cracks
        const ed = vor.edge[i]; const bev = clamp(ed / 4, 0, 1); hh = bev * 0.7 + n[i] * 0.3;
        m = (0.25 + vor.id[i] * 0.2 + n[i] * 0.35) * (0.4 + bev * 0.6);
        if (ed < 2.2) { e = 1.2 * (1 - ed / 2.2); ec = ed < 0.9 ? acc : glow; }
        ro = 0.9;
        break;
      }
      case 'ice': { // clear ice slabs with frost fractures
        const bev = clamp(edge2 / 6, 0, 1); hh = bev * 0.5 + n[i] * 0.25;
        m = 0.65 + n[i] * 0.3 + slabT[slab] * 0.1;
        const crack = Math.abs(Math.sin((x * 0.05 + n2[i] * 6) + slab)) < 0.04 || Math.abs(Math.sin(y * 0.043 + n[i] * 7)) < 0.03;
        if (crack) { m = 1.1; hh -= 0.2; e = 0.4; }
        ro = 0.12 + n2[i] * 0.2;
        break;
      }
      case 'hive': { // honeycomb organics and slime nodules
        const ed = vor.edge[i]; const cell = clamp(ed / 2.5, 0, 1); hh = cell * 0.5 + (1 - vor.f1[i] / 26) * 0.4;
        m = (0.3 + n[i] * 0.4) * (0.45 + cell * 0.55);
        if (vor.id[i] > 0.82 && vor.f1[i] < 9) { e = 1 - vor.f1[i] / 9; ec = vor.id[i] > 0.93 ? acc : glow; }
        ro = 0.45;
        break;
      }
      case 'void': { // star-flecked void tiles floating over a nebula
        const bev = clamp(edge2 / 4, 0, 1); hh = bev * 0.6 + n[i] * 0.2;
        m = (0.32 + n[i] * 0.3) * (0.5 + bev * 0.5);
        const neb = smooth(0.55, 0.8, n2[i]); if (neb > 0) { e = neb * 0.45; }
        if (r() > 0.996) { e = 1.4; ec = [255, 255, 255]; } else if (r() > 0.997) { e = 1.2; ec = acc; }
        if (edge2 < 1.5) { e = Math.max(e, 0.5); ec = acc; }
        break;
      }
      case 'marble': { // veined marble with gold clock inlays
        const bev = clamp(edge2 / 5, 0, 1); hh = bev * 0.5 + n[i] * 0.15;
        const vein = Math.abs(Math.sin((x + y) * 0.03 + n[i] * 9)); m = 0.7 + n2[i] * 0.2 - (vein < 0.08 ? 0.35 : 0);
        m *= 0.7 + bev * 0.3;
        const cx = lx - half / 2, cy = ly - half / 2, rad = Math.hypot(cx, cy), ang = Math.atan2(cy, cx);
        if (Math.abs(rad - 40) < 1.4) { e = 1; ec = glow; m = 0.9; }
        if (rad > 34 && rad < 44 && Math.abs(((ang / (Math.PI * 2) * 12) % 1 + 1) % 1 - 0.5) > 0.46) { e = 1; ec = glow; }
        if (edge2 < 1.5) { e = 0.6; ec = glow; }
        ro = 0.25 + n2[i] * 0.2;
        break;
      }
    }
    h[i] = hh;
    const k = clamp(m, 0, 1.2);
    for (let c = 0; c < 3; c++) alb[j + c] = clamp(lerp(dark[c], base[c] * 1.35, Math.min(1, k)) * (k > 1 ? k : 1), 0, 255);
    alb[j + 3] = 255;
    const rv = clamp(ro + n2[i] * 0.15, 0, 1) * 255; rough[j] = rough[j + 1] = rough[j + 2] = rv; rough[j + 3] = 255;
    for (let c = 0; c < 3; c++) emi[j + c] = clamp(ec[c] * e, 0, 255); emi[j + 3] = 255;
  }
  return { map: dataTex(alb, S, true), normalMap: dataTex(heightToNormal(h, S, 6), S), roughnessMap: dataTex(rough, S), emissiveMap: dataTex(emi, S, true) };
}
function makeWallMaps(bk, seed) {
  const B = BIOMES[bk], S = 256;
  const n = makeNoise(S, seed, 5), n2 = makeNoise(S, seed + 5, 3), r = mulberry(seed + 11);
  const base = rgbOf(B.base), dark = rgbOf(B.dark), glow = rgbOf(B.glow), acc = rgbOf(B.accent);
  const h = new Float32Array(S * S), alb = new Uint8Array(S * S * 4), rough = new Uint8Array(S * S * 4), emi = new Uint8Array(S * S * 4);
  const brickRand = []; for (let i = 0; i < 64; i++) brickRand.push(r());
  const rows = { tech: 4, obsidian: 5, plating: 3, basalt: 6, ice: 4, resin: 5, voidstone: 5, marble: 3 }[B.wall];
  const bh = S / rows, bw = S / (B.wall === 'plating' || B.wall === 'tech' ? 2 : 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, j = i * 4, row = Math.floor(y / bh);
    const off = (B.wall === 'tech' || B.wall === 'plating') ? 0 : (row % 2) * bw / 2;
    const bx = (x + off) % S, col = Math.floor(bx / bw), lx = bx % bw, ly = y % bh;
    const edge = Math.min(lx, ly, bw - 1 - lx, bh - 1 - ly), br = brickRand[(row * 3 + col) % 64];
    const mortar = edge < 2.2, chip = clamp(edge / 5, 0, 1);
    let hh = mortar ? 0.05 : 0.45 + chip * 0.35 + n[i] * 0.3, m = mortar ? 0.12 : (0.35 + br * 0.3 + n[i] * 0.35) * (0.7 + chip * 0.3), e = 0, ec = glow, ro = B.rough + 0.15;
    switch (B.wall) {
      case 'tech': if (Math.abs(ly - bh * 0.5) < 2 && lx > 10 && lx < bw - 10 && br > 0.35) e = 1; if ([[8, 8], [bw - 9, 8], [8, bh - 9], [bw - 9, bh - 9]].some(([a, b]) => (lx - a) ** 2 + (ly - b) ** 2 < 6)) { hh += 0.3; m = 0.8; } break;
      case 'obsidian': if (!mortar && Math.abs(Math.sin(x * 0.07 + n2[i] * 10)) < 0.05 && br > 0.4) e = 1; m *= 0.8; break;
      case 'plating': if (y > S - 26) { const st = Math.floor((x + y) / 12) % 2; m = st ? 0.95 : 0.1; ec = acc; } if (ly > 4 && ly < 7) { hh -= 0.2; } if ((lx % 24) < 2 && Math.abs(ly - 5) < 2) { m = 0.9; hh += 0.3; } if (Math.abs(lx - bw / 2) < 1.2 && br > 0.6) e = 0.8; break;
      case 'basalt': if (mortar) { e = 0.9 * (1 - edge / 2.2); ec = edge < 1 ? acc : glow; } break;
      case 'ice': m = 0.6 + n[i] * 0.4 + (mortar ? -0.2 : 0); ro = 0.15; if (!mortar && Math.abs(Math.sin(y * 0.05 + n2[i] * 8)) < 0.03) { m = 1.05; e = 0.35; } break;
      case 'resin': if (!mortar && n2[i] > 0.66) { e = (n2[i] - 0.66) * 2.4; } hh += n2[i] * 0.3; break;
      case 'voidstone': if (r() > 0.995) { e = 1.3; ec = [255, 255, 255]; } if (mortar) { e = 0.45; ec = acc; } break;
      case 'marble': { const vein = Math.abs(Math.sin((x - y) * 0.03 + n[i] * 9)); m = 0.75 + n2[i] * 0.15 - (vein < 0.07 ? 0.3 : 0); if (mortar) { e = 0.8; m = 0.6; } if (ly < 4) { e = 0.9; } ro = 0.28; break; }
    }
    h[i] = hh;
    const k = clamp(m, 0, 1.2);
    for (let c = 0; c < 3; c++) alb[j + c] = clamp(lerp(dark[c], base[c], Math.min(1, k)) * (k > 1 ? k : 1), 0, 255);
    alb[j + 3] = 255;
    const rv = clamp(ro + n2[i] * 0.15, 0, 1) * 255; rough[j] = rough[j + 1] = rough[j + 2] = rv; rough[j + 3] = 255;
    for (let c = 0; c < 3; c++) emi[j + c] = clamp(ec[c] * e, 0, 255); emi[j + 3] = 255;
  }
  return { map: dataTex(alb, S, true), normalMap: dataTex(heightToNormal(h, S, 5), S), roughnessMap: dataTex(rough, S), emissiveMap: dataTex(emi, S, true) };
}
/* Brushed / scratched metal for fauna and props */
function makeMetalMaps(seed) {
  const S = 128, n = makeNoise(S, seed, 4); const r = mulberry(seed);
  const alb = new Uint8Array(S * S * 4), rough = new Uint8Array(S * S * 4), h = new Float32Array(S * S);
  const sm = new Float32Array(S * S);
  for (let k = 0; k < 40; k++) { const x = r() * S, y = r() * S, a = r() * 6.28, l = 6 + r() * 20; for (let t = 0; t < l; t++) { const xx = Math.floor(x + Math.cos(a) * t + S) % S, yy = Math.floor(y + Math.sin(a) * t + S) % S; sm[yy * S + xx] = 1; } }
  for (let i = 0; i < S * S; i++) {
    const v = 150 + n[i] * 80 + sm[i] * 40; const j = i * 4;
    alb[j] = alb[j + 1] = alb[j + 2] = clamp(v, 0, 255); alb[j + 3] = 255;
    const ro = clamp(0.32 + n[i] * 0.3 - sm[i] * 0.15, 0, 1) * 255; rough[j] = rough[j + 1] = rough[j + 2] = ro; rough[j + 3] = 255;
    h[i] = n[i] - sm[i] * 0.3;
  }
  return { map: dataTex(alb, S, true), roughnessMap: dataTex(rough, S), normalMap: dataTex(heightToNormal(h, S, 2.5), S) };
}
function radialTex(stops, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const TEX = { biome: {} };
function biomeMaps(bk) {
  if (!TEX.biome[bk]) { const seed = 1000 + Object.keys(BIOMES).indexOf(bk) * 97; TEX.biome[bk] = { floor: makeFloorMaps(bk, seed), wall: makeWallMaps(bk, seed + 50) }; }
  return TEX.biome[bk];
}
function buildProceduralTextures() {
  TEX.metal = makeMetalMaps(77);
  TEX.shadow = radialTex([[0, 'rgba(0,0,0,0.75)'], [0.55, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]);
  TEX.glow = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  TEX.ring = (() => { const s = 256, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'); g.strokeStyle = '#fff'; g.lineWidth = 10; g.shadowColor = '#fff'; g.shadowBlur = 24; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 26, 0, Math.PI * 2); g.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
}

/* ---------- pixel sprite material: hit flash, tint, dissolve, outline glow ---------- */
function pixelSpriteMat(tex, o = {}) {
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: 0.04, fog: true, toneMapped: false, color: o.color ?? 0xffffff, opacity: o.opacity ?? 1 });
  m.userData.u = { uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) }, uDissolve: { value: 0 }, uDissolveCol: { value: new THREE.Color(o.dissolveCol ?? 0xffffff) }, uGain: { value: o.gain ?? 0.94 } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, m.userData.u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFlash; uniform vec3 uFlashCol; uniform float uDissolve; uniform vec3 uDissolveCol; uniform float uGain;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb *= uGain;
        diffuseColor.rgb = mix(diffuseColor.rgb, uFlashCol, uFlash);
        #ifdef USE_MAP
        if (uDissolve > 0.0) {
          float cell = fract(sin(dot(floor(vMapUv * vec2(2048.0, 2048.0) / 3.0), vec2(12.9898, 78.233))) * 43758.5453);
          if (cell < uDissolve) discard;
          if (cell < uDissolve + 0.08) diffuseColor.rgb = uDissolveCol * 2.2;
        }
        #endif`);
  };
  m.customProgramCacheKey = () => 'pixelSprite';
  return m;
}

/* ---------- atlases ---------- */
const ART = {};        // legacy card parts: ART[heroId][name] = { tex, w, h, canvas }
let MANIFEST = null;   // legacy card rects
let BATCH = null;      // atlas/batch.json
const SHEETS = {};     // shared sprite sheets: roster thumbnails
const AGENT_TEX = {};  // per-agent { body, fx } textures (lazy)
function loadImage(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not load ' + url)); i.src = url; }); }
function sheetTex(img, pixel) {
  const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = pixel ? THREE.NearestFilter : THREE.LinearFilter;
  return t;
}
async function loadAtlases(onProgress) {
  const [man, batch] = await Promise.all([fetch('atlas/manifest.json').then(r => r.json()), fetch('atlas/batch.json').then(r => r.json())]);
  MANIFEST = man; BATCH = batch;
  const ids = Object.keys(MANIFEST); const extra = ['thumbs']; let done = 0; const total = ids.length + extra.length;
  const tick = () => { done++; onProgress && onProgress(done / total); };
  await Promise.all([
    ...ids.map(async id => {
      const img = await loadImage('atlas/' + id + '.webp');
      ART[id] = {};
      for (const [name, [x, y, w, h]] of Object.entries(MANIFEST[id].r)) {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
        ART[id][name] = { tex: t, w, h, canvas: c, url: null };
      }
      tick();
    }),
    ...extra.map(async k => { const img = await loadImage('atlas/' + k + '.webp'); SHEETS[k] = { img, tex: sheetTex(img, k !== 'thumbs') }; tick(); }),
  ]);
}
function artURL(id, name) { const a = ART[id][name]; if (!a.url) a.url = a.canvas.toDataURL('image/png'); return a.url; }
const agentLoads = {};
function loadAgent(id) {
  if (!agentLoads[id]) agentLoads[id] = Promise.all([loadImage('atlas/agents/' + id + '.webp'), loadImage('atlas/fx/' + id + '.webp')])
    .then(([b, f]) => (AGENT_TEX[id] = { bodyImg: b, fxImg: f, body: sheetTex(b, false), fx: sheetTex(f, true) }));
  return agentLoads[id];
}
/* frame index -> UV rect inside an atlas */
function frameUV(tex, cols, rows, idx, out) {
  const c = idx % cols, r = Math.floor(idx / cols);
  tex.repeat.set(1 / cols, 1 / rows); tex.offset.set(c / cols, 1 - (r + 1) / rows);
  return out;
}
/* thumbnail/agent frame as a data URL for DOM use */
const thumbCache = {};
function agentThumbURL(id) {
  if (thumbCache[id]) return thumbCache[id];
  const i = BATCH.thumbs.indexOf(id), C = BATCH.layout.cell, img = SHEETS.thumbs.img;
  const c = document.createElement('canvas'); c.width = c.height = C;
  c.getContext('2d').drawImage(img, (i % 7) * C, Math.floor(i / 7) * C, C, C, 0, 0, C, C);
  return (thumbCache[id] = c.toDataURL());
}
const fxIconCache = {};
function moveIconURL(id, move) {
  const k = id + move; if (fxIconCache[k]) return fxIconCache[k];
  const T = AGENT_TEX[id]; if (!T) return '';
  const r = BATCH.layout.moves.indexOf(move), F = BATCH.layout.fxCell;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const col = move === 'area_pulse' || move === 'sweeping_arc' ? 3 : move === 'piercing_beam' ? 1 : 2; // pick the most readable frame
  const src = move === 'area_pulse' ? 12 + 2 : col; // pulse uses its impact ring
  g.drawImage(T.fxImg, src * F + F * 0.1, r * F + F * 0.1, F * 0.8, F * 0.8, 0, 0, 64, 64);
  return (fxIconCache[k] = c.toDataURL());
}

/* ---------- GPU particles ---------- */
const PMAX = 4000;
const particles = (() => {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(PMAX * 3), col = new Float32Array(PMAX * 3), size = new Float32Array(PMAX), alpha = new Float32Array(PMAX);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 600 } },
    vertexShader: `attribute float size; attribute float alpha; varying vec3 vC; varying float vA;
      uniform float scale; void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0);
      gl_PointSize=size*scale/-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d);
      if(r>0.5) discard; float a=smoothstep(0.5,0.0,r); gl_FragColor=vec4(vC*(0.6+a*1.6), a*vA); }`,
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 9; scene.add(pts);
  const P = []; for (let i = 0; i < PMAX; i++) P.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.2, r: 1, g: 1, b: 1, drag: 2, grav: 0 });
  let cursor = 0; const c = new THREE.Color();
  function emit(x, y, z, color, n, o = {}) {
    c.set(color);
    for (let k = 0; k < n; k++) {
      const p = P[cursor]; cursor = (cursor + 1) % PMAX;
      const sp = (o.speed ?? 5) * (0.35 + Math.random() * 0.65), a = Math.random() * 6.283, el = (Math.random() - 0.3) * (o.up ?? 1.2);
      p.x = x + rr(-1, 1) * (o.spreadPos ?? 0.1); p.y = y + rr(-1, 1) * (o.spreadY ?? 0); p.z = z + rr(-1, 1) * (o.spreadPos ?? 0.1);
      p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = el * sp + (o.lift ?? 1);
      if (o.dir) { p.vx += o.dir[0]; p.vz += o.dir[1]; }
      p.max = p.life = (o.life ?? 0.5) * (0.6 + Math.random() * 0.6);
      p.s = (o.size ?? 0.25) * (0.6 + Math.random() * 0.8); p.r = c.r; p.g = c.g; p.b = c.b;
      p.drag = o.drag ?? 3; p.grav = o.grav ?? 6;
    }
  }
  function update(dt) {
    for (let i = 0; i < PMAX; i++) {
      const p = P[i];
      if (p.life > 0) {
        p.life -= dt; const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vz *= d; p.vy = p.vy * d - p.grav * dt;
        p.x += p.vx * dt; p.y = Math.max(0.05, p.y + p.vy * dt); p.z += p.vz * dt;
        const t = Math.max(0, p.life / p.max);
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
        size[i] = p.s * (0.4 + t * 0.6); alpha[i] = t;
      } else if (alpha[i] !== 0) { alpha[i] = 0; size[i] = 0; }
    }
    geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.size.needsUpdate = geo.attributes.alpha.needsUpdate = true;
  }
  function clear() { for (const p of P) p.life = 0; }
  return { emit, update, mat, clear };
})();

/* ---------- procedural audio ---------- */
const AUDIO = (() => {
  let ctx = null, master = null, sfxBus = null, musicBus = null, muted = false, noiseBuf = null, musicTimer = null;
  try { muted = localStorage.getItem('ad_muted') === '1'; } catch (e) { }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(comp);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.22; musicBus.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const last = {};
  function throttle(k, ms) { const t = performance.now(); if (last[k] && t - last[k] < ms) return true; last[k] = t; return false; }
  function tone(type, f0, f1, dur, vol, when = 0) {
    if (!ctx) return; const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, fFrom, fTo, q = 1, when = 0, type = 'bandpass') {
    if (!ctx) return; const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(fFrom, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, fTo), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  const v = () => 0.94 + Math.random() * 0.12; // pitch variance keeps repeats alive
  const sfx = {
    shoot(p = 1) { if (throttle('shoot', 45)) return; tone('square', 880 * p * v(), 330 * p, 0.07, 0.06); },
    burst() { if (throttle('burst', 40)) return; tone('square', 1200 * v(), 500, 0.05, 0.05); },
    arc() { noise(0.18, 0.32, 600 * v(), 4200, 1.2); tone('triangle', 300, 140, 0.15, 0.08); },
    beam() { tone('sawtooth', 160, 900, 0.35, 0.1); noise(0.4, 0.22, 3000, 800, 3); tone('sine', 1800, 2400, 0.3, 0.04); },
    pulse() { tone('sine', 220 * v(), 55, 0.45, 0.3); noise(0.35, 0.3, 300, 2500, 0.8); },
    summon() { [0, 7, 12].forEach((s, i) => tone('triangle', 392 * 2 ** (s / 12), 392 * 2 ** (s / 12) * 1.01, 0.18, 0.08, i * 0.06)); noise(0.3, 0.12, 2000, 6000, 2); },
    hit() { if (throttle('hit', 30)) return; noise(0.08, 0.25, 3000 * v(), 600, 2); },
    kill() { if (throttle('kill', 40)) return; noise(0.22, 0.35, 1800 * v(), 120, 0.8); tone('triangle', 220, 60, 0.2, 0.18); },
    hurt() { if (throttle('hurt', 120)) return; tone('sawtooth', 300, 80, 0.25, 0.2); noise(0.15, 0.3, 900, 200, 1); },
    dash() { noise(0.2, 0.3, 400, 3000, 1.4); },
    pickup() { [0, 4, 7, 12].forEach((s, i) => tone('triangle', 523 * 2 ** (s / 12), 523 * 2 ** (s / 12), 0.12, 0.12, i * 0.045)); },
    xp() { if (throttle('xp', 35)) return; tone('sine', 1200 + Math.random() * 300, 1800, 0.06, 0.06); },
    special() { tone('sawtooth', 110, 440, 0.45, 0.16); noise(0.5, 0.3, 200, 4000, 0.7); tone('sine', 660, 1320, 0.4, 0.1, 0.08); },
    boom() { noise(0.6, 0.55, 900, 60, 0.6); tone('sine', 120, 35, 0.6, 0.35); },
    level() { [0, 4, 7, 11, 14].forEach((s, i) => tone('square', 392 * 2 ** (s / 12), 392 * 2 ** (s / 12), 0.18, 0.07, i * 0.07)); },
    eshot() { if (throttle('eshot', 70)) return; tone('sine', 520 * v(), 260, 0.12, 0.05); },
    boss() { tone('sawtooth', 70, 40, 1.4, 0.3); noise(1.2, 0.35, 120, 600, 0.5); },
    portal() { [0, 7, 12, 19].forEach((s, i) => tone('sine', 262 * 2 ** (s / 12), 262 * 2 ** (s / 12) * 1.01, 0.5, 0.1, i * 0.1)); },
    ui() { tone('square', 660, 990, 0.05, 0.05); },
    warn() { if (throttle('warn', 180)) return; tone('square', 880, 880, 0.08, 0.05); tone('square', 660, 660, 0.08, 0.05, 0.1); },
    telegraph() { if (throttle('tg', 90)) return; noise(0.25, 0.4, 200, 1400, 1.5); tone('sawtooth', 90, 45, 0.3, 0.2); },
    switchOn() { tone('square', 523, 523, 0.08, 0.08); tone('square', 784, 784, 0.12, 0.08, 0.08); },
    switchBad() { tone('sawtooth', 220, 110, 0.3, 0.12); },
    gate() { tone('sawtooth', 55, 110, 1.2, 0.2); noise(1.2, 0.3, 80, 900, 0.6); [0, 5, 10].forEach((s, i) => tone('triangle', 330 * 2 ** (s / 12), 330 * 2 ** (s / 12), 0.4, 0.07, 0.3 + i * 0.12)); },
    secret() { [0, 4, 7, 12, 16, 19].forEach((s, i) => tone('sine', 659 * 2 ** (s / 12), 659 * 2 ** (s / 12), 0.25, 0.07, i * 0.07)); },
    trap() { if (throttle('trap', 200)) return; noise(0.3, 0.25, 1500, 300, 1.2); },
    status() { if (throttle('status', 150)) return; tone('triangle', 900, 1400, 0.1, 0.05); },
    land() { noise(0.2, 0.35, 200, 60, 0.8, 0, 'lowpass'); tone('sine', 90, 40, 0.2, 0.2); },
  };
  /* generative score: biome-keyed arpeggio over a filtered drone */
  const MODES = { minor: [0, 3, 5, 7, 10, 12, 15, 17], dorian: [0, 2, 3, 7, 9, 12, 14, 15], phrygian: [0, 1, 5, 7, 8, 12, 13, 17], lydian: [0, 4, 6, 7, 11, 12, 16, 18] };
  function startMusic(intense = false, key = { root: 55, mode: 'minor' }) {
    if (!ctx) return; stopMusic();
    const root = key.root, scale = MODES[key.mode] || MODES.minor;
    const drone = ctx.createOscillator(), drone2 = ctx.createOscillator(), dg = ctx.createGain(), lp = ctx.createBiquadFilter();
    drone.type = 'sawtooth'; drone2.type = 'sawtooth'; drone.frequency.value = root; drone2.frequency.value = root * 1.501;
    lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 4; dg.gain.value = 0.18;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 220; lfo.connect(lg); lg.connect(lp.frequency);
    drone.connect(lp); drone2.connect(lp); lp.connect(dg); dg.connect(musicBus); drone.start(); drone2.start(); lfo.start();
    const bpm = intense ? 138 : 104, step = 60 / bpm / 2; let n = 0;
    const delay = ctx.createDelay(); delay.delayTime.value = step * 3; const fb = ctx.createGain(); fb.gain.value = 0.35; delay.connect(fb); fb.connect(delay); delay.connect(musicBus);
    const pattern = intense ? [0, 2, 4, 5, 4, 2, 6, 4] : [0, 4, 2, 5, 3, 6, 4, 7];
    function tick() {
      const t = ctx.currentTime + 0.05;
      const deg = pattern[n % 8] + (Math.floor(n / 16) % 2 ? 1 : 0);
      const f = root * 4 * 2 ** (scale[deg % scale.length] / 12);
      const o = ctx.createOscillator(), g = ctx.createGain(), f2 = ctx.createBiquadFilter();
      o.type = 'triangle'; o.frequency.value = f; f2.type = 'lowpass'; f2.frequency.value = 2400;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.8);
      o.connect(f2); f2.connect(g); g.connect(musicBus); g.connect(delay); o.start(t); o.stop(t + step * 2);
      if (n % 4 === 0) {
        const k = ctx.createOscillator(), kg = ctx.createGain(); k.frequency.setValueAtTime(intense ? 140 : 110, t); k.frequency.exponentialRampToValueAtTime(40, t + 0.18);
        kg.gain.setValueAtTime(intense ? 0.5 : 0.28, t); kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); k.connect(kg); kg.connect(musicBus); k.start(t); k.stop(t + 0.25);
      }
      if (intense && n % 2 === 1) { // hats
        const s = ctx.createBufferSource(); s.buffer = noiseBuf; const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 7000;
        const hg = ctx.createGain(); hg.gain.setValueAtTime(0.05, t); hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); s.connect(hf); hf.connect(hg); hg.connect(musicBus); s.start(t); s.stop(t + 0.06);
      }
      n++;
    }
    musicTimer = { iv: setInterval(tick, step * 1000), nodes: [drone, drone2, lfo], gain: dg };
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer.iv); musicTimer.nodes.forEach(o => { try { o.stop(); } catch (e) { } }); musicTimer = null; } }
  function toggleMute() { muted = !muted; try { localStorage.setItem('ad_muted', muted ? '1' : '0'); } catch (e) { } if (master) master.gain.value = muted ? 0 : 0.8; return muted; }
  return { init, sfx, startMusic, stopMusic, toggleMute, get muted() { return muted; } };
})();
const MUSIC_KEYS = { core_facility: { root: 55, mode: 'minor' }, shadow_realm: { root: 49, mode: 'phrygian' }, voltage_foundry: { root: 58.27, mode: 'dorian' }, inferno_depths: { root: 51.91, mode: 'phrygian' }, glacial_vault: { root: 61.74, mode: 'lydian' }, toxic_hive: { root: 46.25, mode: 'dorian' }, astral_rift: { root: 41.2, mode: 'lydian' }, chrono_spire: { root: 65.41, mode: 'minor' } };
