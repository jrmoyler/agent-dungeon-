/* ------------------------------------------------------------------
   ENGINE: 3D pixel-art renderer (low-res target, ortho camera snapped
   to the pixel grid, depth outlines, posterize + ordered dither),
   biome pixel tiles, sprite shader, atlas loading, GPU particles,
   procedural audio
------------------------------------------------------------------- */
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const DPR = Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.5 : 2);
renderer.setPixelRatio(DPR);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in the pixel blit

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060b);
scene.fog = new THREE.Fog(0x04060b, 60, 110);

/* The world is drawn at a low resolution and blown up with hard pixel edges, so walls, rigs,
   particles and sprites all share one pixel grid. PPU is the art scale: low-res pixels per world
   unit, chosen so a floor tile (2 units, 40 texels) maps texel-for-pixel. */
const PPU = 20, TEXELS_PER_TILE = 40;
const CAM_PITCH = THREE.MathUtils.degToRad(55), CAM_DIST = 40;
const VIEW = { scale: 2, lw: 2, lh: 2, offX: 0, offY: 0, zoom: 1, cropX: 0, cropY: 0 };
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 140);
camera.aspect = 1;
const SPRITE_TILT = { value: Math.tan(CAM_PITCH) };

const sceneRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(2, 2) });
sceneRT.texture.minFilter = sceneRT.texture.magFilter = THREE.NearestFilter;
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.3, 0.9);
const pixelBlit = new FullScreenQuad(new THREE.ShaderMaterial({
  uniforms: { tScene: { value: sceneRT.texture }, tDepth: { value: sceneRT.depthTexture }, uLow: { value: new THREE.Vector2(2, 2) }, uScale: { value: 2 }, uOff: { value: new THREE.Vector2() },
    uLevels: { value: 18 }, uExposure: { value: 1.25 }, uEdge: { value: 0.0035 }, uHurt: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
  fragmentShader: `uniform sampler2D tScene; uniform sampler2D tDepth; uniform vec2 uLow; uniform float uScale; uniform vec2 uOff;
    uniform float uLevels; uniform float uExposure; uniform float uEdge; uniform float uHurt;
    vec3 RRTAndODTFit(vec3 v){ vec3 a=v*(v+0.0245786)-0.000090537; vec3 b=v*(0.983729*v+0.4329510)+0.238081; return a/b; }
    vec3 aces(vec3 c){ const mat3 I=mat3(vec3(0.59719,0.07600,0.02840),vec3(0.35458,0.90834,0.13383),vec3(0.04823,0.01566,0.83777));
      const mat3 O=mat3(vec3(1.60475,-0.10208,-0.00327),vec3(-0.53108,1.10813,-0.07276),vec3(-0.07367,-0.00605,1.07602));
      c*=uExposure/0.6; c=I*c; c=RRTAndODTFit(c); c=O*c; return clamp(c,0.0,1.0); }
    vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c,vec3(1.0/2.4))-0.055, step(0.0031308,c)); }
    float bayer2(vec2 a){ a=floor(a); return fract(dot(a,vec2(0.5,a.y*0.75))); }
    float bayer4(vec2 a){ return bayer2(0.5*a)*0.25+bayer2(a); }
    float D(vec2 c){ return texture2D(tDepth,(c+0.5)/uLow).r; }
    void main(){
      vec2 cell=floor(gl_FragCoord.xy/uScale+uOff);
      vec3 c=texture2D(tScene,(cell+0.5)/uLow).rgb;
      // depth outlines: a pixel sitting behind a nearer neighbour darkens, the near rim brightens
      float d=D(cell), dU=D(cell+vec2(0,1)), dDn=D(cell-vec2(0,1)), dL=D(cell-vec2(1,0)), dR=D(cell+vec2(1,0));
      float behind=max(max(d-dU,d-dDn),max(d-dL,d-dR));
      float rim=dU-d;
      if(d<1.0 && behind>uEdge) c*=0.28;
      else if(rim>uEdge && d<1.0) c*=1.45;
      c=toSRGB(aces(c));
      c=mix(c,vec3(c.r*1.15+0.08,c.g*0.7,c.b*0.72),uHurt);
      c=floor(c*uLevels+bayer4(cell))/uLevels;
      gl_FragColor=vec4(c,1.0); }`,
  depthTest: false, depthWrite: false,
}));

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const W = Math.round(w * DPR), H = Math.round(h * DPR);
  // integer upscale that lands the short side near 330-400 low-res pixels
  const scale = Math.max(1, Math.round(Math.min(W, H) / (w < h ? 300 : 360)));
  VIEW.scale = scale; VIEW.lw = Math.ceil(W / scale); VIEW.lh = Math.ceil(H / scale);
  VIEW.cropX = (VIEW.lw * scale - W) / 2 / scale; VIEW.cropY = (VIEW.lh * scale - H) / 2 / scale;
  sceneRT.setSize(VIEW.lw, VIEW.lh);
  bloom.setSize(VIEW.lw, VIEW.lh);
  const u = pixelBlit.material.uniforms; u.uLow.value.set(VIEW.lw, VIEW.lh); u.uScale.value = scale;
  camera.aspect = VIEW.lw / VIEW.lh;
  applyZoom(VIEW.zoom);
}
function applyZoom(z) {
  VIEW.zoom = z; const hw = VIEW.lw / 2 / (PPU * z), hh = VIEW.lh / 2 / (PPU * z);
  camera.left = -hw; camera.right = hw; camera.top = hh; camera.bottom = -hh; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
/* Fixed-angle camera. The look-at point is snapped to whole low-res pixels on screen and the
   leftover fraction is fed to the blit as a sub-pixel shift, so scrolling is smooth but the
   world never crawls or shimmers. */
const CAM_UP = new THREE.Vector3(0, Math.cos(CAM_PITCH), -Math.sin(CAM_PITCH));
function placeCamera(tx, tz) {
  const ppu = PPU * VIEW.zoom, sp = Math.sin(CAM_PITCH);
  const sx = tx * ppu, sy = -tz * sp * ppu, rx = sx - Math.round(sx), ry = sy - Math.round(sy);
  const cx = Math.round(sx) / ppu, cz = -Math.round(sy) / (sp * ppu);
  camera.position.set(cx, CAM_DIST * Math.sin(CAM_PITCH), cz + CAM_DIST * Math.cos(CAM_PITCH));
  camera.up.set(0, 1, 0); camera.lookAt(cx, 0, cz);
  VIEW.offX = rx + VIEW.cropX; VIEW.offY = ry + VIEW.cropY;
  pixelBlit.material.uniforms.uOff.value.set(VIEW.offX, VIEW.offY);
}
/* screen <-> NDC through the pixel blit (crop + sub-pixel shift) */
function cssToNdc(cx, cy) {
  const k = canvas.width / innerWidth, X = cx * k, Yb = canvas.height - cy * k;
  return [(X / VIEW.scale + VIEW.offX) / VIEW.lw * 2 - 1, (Yb / VIEW.scale + VIEW.offY) / VIEW.lh * 2 - 1];
}
function ndcToCss(nx, ny) {
  const k = canvas.width / innerWidth;
  const X = ((nx + 1) / 2 * VIEW.lw - VIEW.offX) * VIEW.scale, Yb = ((ny + 1) / 2 * VIEW.lh - VIEW.offY) * VIEW.scale;
  return [X / k, (canvas.height - Yb) / k];
}
function renderFrame(dt) {
  particles.mat.uniforms.scale.value = PPU * VIEW.zoom;
  renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera);
  bloom.render(renderer, null, sceneRT, dt, false);
  renderer.setRenderTarget(null); pixelBlit.render(renderer);
}

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

/* ---------- BIOME PIXEL TILES ----------
   Floors are painted at 40x40 texels per tile so one texel lands on one low-res pixel. Each biome
   gets four floor variants (plain, plain-alt, circuit/feature, accent), a wall face and a wall cap
   whose neon trim is drawn only on the sides that border open floor, so the trim traces the maze. */
function pal(bk) {
  const B = BIOMES[bk], d = rgbOf(B.dark), b = rgbOf(B.base), g = rgbOf(B.glow), a = rgbOf(B.accent);
  const mix = (x, y, t) => x.map((v, i) => clamp(v + (y[i] - v) * t, 0, 255));
  return { o: mix(d, [0, 0, 0], 0.5), d, m: mix(d, b, 0.5), b, h: mix(b, [255, 255, 255], 0.25), g, a, mix };
}
function pxCanvas(S, H = S) { return { S, H, alb: new Uint8Array(S * H * 4), emi: new Uint8Array(S * H * 4) }; }
function put(P, x, y, c, e) {
  x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= P.S || y >= P.H) return;
  const i = (y * P.S + x) * 4; P.alb[i] = c[0]; P.alb[i + 1] = c[1]; P.alb[i + 2] = c[2]; P.alb[i + 3] = 255;
  if (e) { P.emi[i] = e[0]; P.emi[i + 1] = e[1]; P.emi[i + 2] = e[2]; P.emi[i + 3] = 255; }
}
function rect(P, x0, y0, w, h, c, e) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(P, x, y, c, e); }
function bevel(P, x0, y0, w, h, C, hi = C.h) { // 1px seam on top/left, light lip, dark lip
  for (let x = x0; x < x0 + w; x++) { put(P, x, y0, C.o); put(P, x, y0 + 1, hi); put(P, x, y0 + h - 1, C.d); }
  for (let y = y0; y < y0 + h; y++) { put(P, x0, y, C.o); if (y > y0) put(P, x0 + 1, y, hi); put(P, x0 + w - 1, y, C.d); }
}
function line(P, x0, y0, x1, y1, c, e) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) put(P, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c, e); }
function ring(P, cx, cy, r, c, e, ticks = 0) { for (let k = 0; k < 160; k++) { const a = k / 160 * 6.283; if (ticks && Math.floor(k / 160 * ticks * 2) % 2) continue; put(P, cx + Math.cos(a) * r, cy + Math.sin(a) * r, c, e); } }
/* data -> nearest-filtered texture; painter rows run top-down, texture rows bottom-up */
function pxTex(P, which, srgb) {
  const src = P[which], out = new Uint8Array(src.length), row = P.S * 4;
  for (let y = 0; y < P.H; y++) out.set(src.subarray(y * row, (y + 1) * row), (P.H - 1 - y) * row);
  if (which === 'emi') for (let i = 3; i < out.length; i += 4) out[i] = 255;
  const t = new THREE.DataTexture(out, P.S, P.H, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
function paintFloor(bk, v, seed) {
  // floors sit one step brighter than wall caps so the walkable space reads at a glance
  const S = TEXELS_PER_TILE, P = pxCanvas(S), C0 = pal(bk), B = BIOMES[bk], r = mulberry(seed + v * 31);
  const C = { ...C0, o: C0.d, d: C0.m, m: C0.mix(C0.m, C0.b, 0.6), b: C0.mix(C0.b, C0.h, 0.5) };
  const n = makeNoise(S, seed + v, 3), hash = () => r(), soft = C.mix(C.m, C.h, 0.4);
  const base = (lo, mid, hi, lt = 0.3, ht = 0.72) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const k = n[y * S + x] + (hash() - 0.5) * 0.12; put(P, x, y, k < lt ? lo : k > ht ? hi : mid); } };
  const glowLine = (pts, col = C.g) => { const e = C.mix(col, [0, 0, 0], 0.35); for (let i = 0; i < pts.length - 1; i++) line(P, ...pts[i], ...pts[i + 1], C.mix(col, C.d, 0.35), e); };
  const node = (x, y, col = C.g) => { rect(P, x - 1, y - 1, 3, 3, C.o); put(P, x, y, [255, 255, 255], col); };
  const stripes = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(P, x, y, Math.floor((x + y) / 3) % 2 ? C.a : C.o, Math.floor((x + y) / 3) % 2 ? C.mix(C.a, [0, 0, 0], 0.7) : null); };
  switch (B.floor) {
    case 'panel': {
      base(C.d, C.m, C.b); const H = S / 2;
      for (const y of [0, H]) { bevel(P, 0, y, S, H, C, soft); for (const a of [3, S - 4]) { put(P, a, y + 3, C.h); put(P, a, y + H - 4, C.h); } }
      if (v === 1) for (let k = 0; k < 4; k++) rect(P, H + 5, H + 5 + k * 3, H - 10, 1, C.o, k === 3 ? C.mix(C.g, [0, 0, 0], 0.5) : null);
      if (v === 2) { glowLine([[0, 11], [12, 11], [12, 27], [S - 1, 27]]); glowLine([[27, 0], [27, 11], [20, 11]]); node(12, 11); node(27, 27); }
      if (v === 3) { stripes(2, 2, S - 4, 4); stripes(2, S - 6, S - 4, 4); }
      break;
    }
    case 'flag': case 'basalt': {
      const lava = B.floor === 'basalt', vor = makeVoronoi(S, seed + v * 7, lava ? 5 : 5);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const i = y * S + x, e = vor.edge[i], k = vor.id[i] * 0.6 + n[i] * 0.5;
        if (e < 1.1) { const hot = lava ? (n[i] > (v >= 2 ? 0.4 : 0.62)) : (v === 2 && n[i] > 0.5); put(P, x, y, hot ? C.mix(C.a, C.g, 0.5) : C.o, hot ? (e < 0.6 ? C.a : C.g) : null); }
        else if (e < 2.1) put(P, x, y, C.h.map((q, j) => (q + C.m[j]) / 2));
        else put(P, x, y, k > 0.62 ? C.b : k > 0.38 ? C.m : C.d);
      }
      if (v === 3) { if (lava) { for (let y = 12; y < 28; y++) for (let x = 10; x < 30; x++) { const d = Math.hypot((x - 20) / 10, (y - 20) / 8); if (d < 1) put(P, x, y, d < 0.6 ? C.a : C.g, d < 0.6 ? C.a : C.g); } } else ring(P, 20, 20, 9, C.a, C.a, 8); }
      break;
    }
    case 'diamond': {
      base(C.d, C.m, C.b); bevel(P, 0, 0, S, S, C, soft);
      for (let y = 3; y < S - 2; y += 5) for (let x = 3 + (Math.floor(y / 5) % 2) * 2; x < S - 2; x += 5) { put(P, x, y, C.h); put(P, x + 1, y, C.b); put(P, x, y + 1, C.b); put(P, x + 1, y + 1, C.o); }
      if (v === 2) { rect(P, 0, 18, S, 1, C.o); rect(P, 0, 21, S, 1, C.o); rect(P, 0, 19, S, 2, C.g, C.g); node(20, 19); }
      if (v === 3) { stripes(1, 1, S - 2, 5); stripes(1, S - 6, S - 2, 5); }
      break;
    }
    case 'ice': {
      base(C.m, C.b, C.h, 0.3, 0.6); bevel(P, 0, 0, S, S, { ...C, o: C.m, d: C.m });
      for (let k = -S; k < S; k += 13) for (let t = 0; t < S; t++) if (hash() > 0.25) put(P, t, t + k, C.h);
      let x = 4 + hash() * 30, y = 2; while (y < S - 2) { put(P, x, y, [240, 252, 255], v === 2 ? C.g : C.mix(C.g, [0, 0, 0], 0.75)); x += Math.round(hash() * 2 - 1); y++; }
      if (v === 3) { ring(P, 20, 20, 8, C.a, C.a, 6); ring(P, 20, 20, 4, C.h, C.g); }
      break;
    }
    case 'hive': {
      base(C.d, C.m, C.b);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const row = Math.round(y / 8.66), cy = row * 8.66, cx = Math.round((x - (row % 2) * 5) / 10) * 10 + (row % 2) * 5;
        const d2 = [[cx, cy], [cx - 10, cy], [cx + 10, cy], [cx - 5, cy - 8.66], [cx + 5, cy - 8.66], [cx - 5, cy + 8.66], [cx + 5, cy + 8.66]].map(([ax, ay]) => Math.hypot(x - ax, y - ay)).sort((a, b) => a - b);
        if (d2[1] - d2[0] < 1.3) put(P, x, y, C.o); else if (d2[1] - d2[0] < 2.4) put(P, x, y, C.d); else if (d2[0] < 2.6) put(P, x, y, C.h);
      }
      if (v >= 2) for (const [x, y] of [[10, 9], [25, 26], [30, 9]].slice(0, v === 2 ? 2 : 3)) { rect(P, x - 2, y - 2, 5, 5, C.mix(C.g, C.o, 0.4), C.mix(C.g, [0, 0, 0], 0.4)); rect(P, x - 1, y - 1, 3, 3, C.g, C.g); put(P, x, y, C.a, C.a); }
      break;
    }
    case 'void': {
      base(C.o, C.d, C.d, 0.45, 0.8);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (n[y * S + x] > 0.62) put(P, x, y, C.m, C.mix(C.g, [0, 0, 0], 0.72));
      for (let k = 0; k < 6; k++) put(P, hash() * S, hash() * S, [255, 255, 255], [200, 200, 255]);
      const edgeA = C.mix(C.a, C.d, 0.55), edgeE = C.mix(C.a, [0, 0, 0], 0.82);
      for (let t = 0; t < S; t++) { put(P, t, 0, edgeA, edgeE); put(P, 0, t, edgeA, edgeE); }
      if (v === 2) { ring(P, 20, 20, 10, C.g, C.g, 10); node(20, 20); }
      if (v === 3) { line(P, 6, 34, 20, 6, C.a, C.a); line(P, 20, 6, 34, 34, C.a, C.a); line(P, 6, 34, 34, 34, C.a, C.a); }
      break;
    }
    case 'marble': {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const vein = Math.abs(Math.sin((x + y) * 0.16 + n[y * S + x] * 7)); put(P, x, y, vein < 0.08 ? C.d : vein < 0.2 ? C.m : n[y * S + x] > 0.6 ? C.h : C.b); }
      bevel(P, 0, 0, S, S, { ...C, h: [255, 248, 230] });
      if (v === 2) { ring(P, 20, 20, 13, C.g, C.g); ring(P, 20, 20, 10, C.g, C.g, 12); line(P, 20, 20, 20, 11, C.a, C.a); line(P, 20, 20, 27, 22, C.a, C.a); }
      if (v === 3) { rect(P, 2, 2, S - 4, 1, C.g, C.g); rect(P, 2, S - 3, S - 4, 1, C.g, C.g); for (let x = 6; x < S - 4; x += 8) rect(P, x, 4, 2, 2, C.g, C.g); }
      break;
    }
  }
  return P;
}
function paintWallSide(bk, seed) {
  const S = TEXELS_PER_TILE, H = Math.round(S * 1.1), P = pxCanvas(S, H), C = pal(bk), B = BIOMES[bk], r = mulberry(seed), n = makeNoise(S, seed + 3, 3);
  const panels = B.wall === 'tech' || B.wall === 'plating';
  for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) { const k = n[(y % S) * S + x] + (r() - 0.5) * 0.1; put(P, x, y, k < 0.3 ? C.m : k > 0.7 ? C.h : C.b); }
  if (panels) {
    for (const x0 of [0, S / 2]) bevel(P, x0, 3, S / 2, H - 6, C);
    if (B.wall === 'tech') { rect(P, 4, 12, S - 8, 2, C.g, C.g); rect(P, 4, 11, S - 8, 1, C.o); rect(P, 4, 14, S - 8, 1, C.o); for (let k = 0; k < 4; k++) rect(P, 6, 22 + k * 4, 8, 2, C.o); put(P, S - 7, 26, C.a, C.a); put(P, S - 7, 29, C.g, C.g); }
    else { for (let y = H - 9; y < H - 3; y++) for (let x = 0; x < S; x++) put(P, x, y, Math.floor((x + y) / 3) % 2 ? C.a : C.o); for (let x = 4; x < S; x += 9) { put(P, x, 7, C.h); put(P, x, H - 12, C.h); } rect(P, S / 2 - 1, 10, 2, 16, C.g, C.g); }
  } else {
    const rows = 4, bh = Math.floor((H - 4) / rows);
    for (let row = 0; row < rows; row++) {
      const y0 = 2 + row * bh, bw = B.wall === 'marble' ? S / 2 : S / 3, off = row % 2 ? bw / 2 : 0;
      for (let x0 = -off; x0 < S; x0 += bw) {
        const xa = Math.max(0, Math.round(x0)), xb = Math.min(S, Math.round(x0 + bw));
        for (let x = xa; x < xb; x++) { put(P, x, y0, B.wall === 'basalt' ? C.g : C.o, B.wall === 'basalt' ? C.g : null); put(P, x, y0 + 1, C.h); put(P, x, y0 + bh - 1, C.d); }
        for (let y = y0; y < y0 + bh; y++) put(P, xa, y, B.wall === 'basalt' ? C.a : C.o, B.wall === 'basalt' && r() > 0.4 ? C.g : null);
      }
    }
    if (B.wall === 'obsidian' || B.wall === 'resin' || B.wall === 'ice') for (let k = 0; k < (B.wall === 'resin' ? 5 : 2); k++) { const x = 3 + r() * (S - 6), y = 6 + r() * (H - 14); if (B.wall === 'resin') { rect(P, x - 1, y - 1, 3, 3, C.g, C.g); put(P, x, y, C.a, C.a); } else line(P, x, y, x + (r() - 0.5) * 8, y + 8, C.h, C.mix(C.g, [0, 0, 0], 0.3)); }
    if (B.wall === 'voidstone') for (let k = 0; k < 7; k++) put(P, r() * S, r() * H, [255, 255, 255], [220, 220, 255]);
    if (B.wall === 'marble') rect(P, 0, 4, S, 1, C.g, C.g);
  }
  for (let x = 0; x < S; x++) { put(P, x, 0, C.h); put(P, x, 1, C.b); put(P, x, H - 1, C.o); put(P, x, H - 2, C.o); }
  return P;
}
/* mask bits mark open floor on a side: 1 north, 2 east, 4 south, 8 west */
function paintWallTop(bk, mask, seed) {
  const S = TEXELS_PER_TILE, P = pxCanvas(S), C = pal(bk), B = BIOMES[bk], r = mulberry(seed + mask), n = makeNoise(S, seed + 9, 3);
  const inner = !mask;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const k = n[y * S + x] + (r() - 0.5) * 0.14; put(P, x, y, k < 0.3 ? C.o : k > 0.7 ? C.m : C.d); }
  if (inner) { bevel(P, 0, 0, S, S, C, C.m); bevel(P, 6, 6, S - 12, S - 12, C, C.m); }
  if (B.wall === 'tech' || B.wall === 'plating') { for (let k = 6; k < S; k += 11) { rect(P, k, 0, 1, S, C.o); rect(P, 0, k, S, 1, C.o); } }
  const glow = C.g, trim = (side) => {
    for (let t = 0; t < S; t++) {
      const at = (d) => side === 1 ? [t, d] : side === 4 ? [t, S - 1 - d] : side === 8 ? [d, t] : [S - 1 - d, t];
      put(P, ...at(0), C.h); put(P, ...at(1), C.b); put(P, ...at(2), C.m);
      put(P, ...at(4), C.mix(glow, [255, 255, 255], 0.3), glow);
    }
  };
  for (const side of [1, 2, 4, 8]) if (mask & side) trim(side);
  return P;
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
  if (!TEX.biome[bk]) {
    const seed = 1000 + Object.keys(BIOMES).indexOf(bk) * 97, side = paintWallSide(bk, seed + 50);
    TEX.biome[bk] = {
      floor: [0, 1, 2, 3].map(v => { const P = paintFloor(bk, v, seed); return { map: pxTex(P, 'alb', true), emissiveMap: pxTex(P, 'emi', true) }; }),
      side: { map: pxTex(side, 'alb', true), emissiveMap: pxTex(side, 'emi', true) },
      top: {}, seed,
    };
  }
  return TEX.biome[bk];
}
function wallTopMaps(bk, mask) {
  const T = biomeMaps(bk);
  if (!T.top[mask]) { const P = paintWallTop(bk, mask, T.seed); T.top[mask] = { map: pxTex(P, 'alb', true), emissiveMap: pxTex(P, 'emi', true) }; }
  return T.top[mask];
}
function buildProceduralTextures() {
  TEX.metal = makeMetalMaps(77);
  TEX.shadow = radialTex([[0, 'rgba(0,0,0,0.75)'], [0.55, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]);
  TEX.glow = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  TEX.ring = (() => { const s = 256, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'); g.strokeStyle = '#fff'; g.lineWidth = 10; g.shadowColor = '#fff'; g.shadowBlur = 24; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 26, 0, Math.PI * 2); g.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
}

/* ---------- pixel sprite material: hit flash, tint, dissolve, outline glow ----------
   Sprites face the camera, but their depth is rewritten as if they stood upright at their anchor
   ("vertical cards"): a tall sprite next to a wall no longer sinks into it, and two sprites sort by
   where their feet are. A negative x scale mirrors the sprite. */
function tiltSpriteShader(sh) {
  sh.uniforms.uTilt = SPRITE_TILT;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uTilt;')
    .replace('vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;',
      'vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;\n\talignedPosition.x *= modelMatrix[ 0 ].x < 0.0 ? -1.0 : 1.0;')
    .replace('mvPosition.xy += rotatedPosition;', 'mvPosition.xy += rotatedPosition;\n\tmvPosition.z += rotatedPosition.y * uTilt;');
}
function tiltSprite(m) { m.onBeforeCompile = tiltSpriteShader; m.customProgramCacheKey = () => 'tiltSprite'; return m; }
function pixelSpriteMat(tex, o = {}) {
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: 0.04, fog: true, toneMapped: false, color: o.color ?? 0xffffff, opacity: o.opacity ?? 1 });
  m.userData.u = { uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) }, uDissolve: { value: 0 }, uDissolveCol: { value: new THREE.Color(o.dissolveCol ?? 0xffffff) }, uGain: { value: o.gain ?? 0.94 } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, m.userData.u); if (o.tilt !== false) tiltSpriteShader(sh);
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
  m.customProgramCacheKey = () => o.tilt === false ? 'pixelSpriteFlat' : 'pixelSprite';
  return m;
}

/* ---------- atlases ---------- */
const ART = {};        // legacy card parts: ART[heroId][name] = { tex, w, h, canvas }
let MANIFEST = null;   // legacy card rects
let BATCH = null;      // atlas/batch.json
const SHEETS = {};     // shared sprite sheets: roster thumbnails
const AGENT_TEX = {};  // per-agent { body, fx } textures (lazy)
/* props + pickup icons cut from the props/HUD sheet (tools/art/slice_sheet.py) */
const PROP_NAMES = ['crate_tech', 'server', 'pad', 'terminal', 'tesla', 'ice_pillar', 'barrel', 'crystal', 'crate_hot', 'cache', 'ic_guard', 'ic_ember', 'ic_lock', 'ic_hex', 'ic_orb', 'ic_heal', 'ic_round', 'ic_flame', 'ic_toxin', 'ic_void'];
const PROPS = {};      // name -> { tex, w, h, url }
function loadImage(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not load ' + url)); i.src = url; }); }
function sheetTex(img, pixel) {
  const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = pixel ? THREE.NearestFilter : THREE.LinearFilter;
  return t;
}
async function loadAtlases(onProgress) {
  const [man, batch] = await Promise.all([fetch('atlas/manifest.json').then(r => r.json()), fetch('atlas/batch.json').then(r => r.json())]);
  MANIFEST = man; BATCH = batch;
  const ids = Object.keys(MANIFEST); const extra = ['thumbs']; let done = 0; const total = ids.length + extra.length + PROP_NAMES.length;
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
    ...PROP_NAMES.map(async k => {
      const url = 'atlas/props/' + k + '.webp', img = await loadImage(url), t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
      PROPS[k] = { tex: t, w: img.width, h: img.height, url }; tick();
    }),
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
    uniforms: { scale: { value: PPU } },
    // hard-edged pixel motes: size is in world units, scale is low-res pixels per unit
    vertexShader: `attribute float size; attribute float alpha; varying vec3 vC; varying float vA;
      uniform float scale; void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0);
      gl_PointSize=max(1.0,floor(size*scale*0.8+0.5)); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d);
      if(r>0.5 || vA<0.04) discard; float core=step(r,0.22); gl_FragColor=vec4(vC*(1.0+core*1.4)*(0.55+vA*0.9), 1.0); }`,
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
