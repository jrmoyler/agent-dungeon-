/* ------------------------------------------------------------------
   ENGINE: renderer, post FX, procedural PBR textures, asset atlases,
   particles, audio
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
const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 120);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w * DPR * 0.5, h * DPR * 0.5);
  camera.aspect = w / h;
  // keep a similar view width on portrait phones
  camera.fov = w < h ? 52 : 40;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const hemi = new THREE.HemisphereLight(0x8a9cd0, 0x1a120e, 1.1);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xb0c0ff, 0.9);
moon.position.set(-8, 20, 6);
scene.add(moon);

/* ---------- seeded RNG ---------- */
function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = Math.random;
const rr = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- procedural PBR texture generator ---------- */
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
      const i0 = y0 * (g + 1) + x0, xw = (x0 + 1) % g, yw = (y0 + 1) % g;
      const a = grid[y0 * (g + 1) + x0], b = grid[y0 * (g + 1) + xw], c = grid[yw * (g + 1) + x0], d = grid[yw * (g + 1) + xw];
      out[y * size + x] += (lerp(lerp(a, b, sx), lerp(c, d, sx), sy)) * amp;
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
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
/* Stone slab floor: 2×2 slabs per tile with bevelled seams, wear, cracks, faint circuit inlays */
function makeFloorMaps(seed) {
  const S = 256, n = makeNoise(S, seed, 5), n2 = makeNoise(S, seed + 7, 3);
  const r = mulberry(seed + 3);
  const h = new Float32Array(S * S), alb = new Uint8Array(S * S * 4), rough = new Uint8Array(S * S * 4), emi = new Uint8Array(S * S * 4);
  const slabTint = [r(), r(), r(), r()];
  // crack polylines
  const cracks = [];
  for (let c = 0; c < 4; c++) { let x = r() * S, y = r() * S, a = r() * 6.28; const pts = []; for (let k = 0; k < 18; k++) { pts.push([x, y]); a += (r() - 0.5) * 0.9; x += Math.cos(a) * 4; y += Math.sin(a) * 4; } cracks.push(pts); }
  const crackMask = new Float32Array(S * S);
  for (const pts of cracks) for (const [x, y] of pts) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = (Math.floor(x) + dx + S) % S, yy = (Math.floor(y) + dy + S) % S; crackMask[yy * S + xx] = Math.max(crackMask[yy * S + xx], dx === 0 && dy === 0 ? 1 : 0.4); }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, half = S / 2;
    const lx = x % half, ly = y % half;
    const edge = Math.min(lx, ly, half - 1 - lx, half - 1 - ly);
    const bevel = clamp(edge / 7, 0, 1);
    const slab = (x < half ? 0 : 1) + (y < half ? 0 : 2);
    let hh = bevel * 0.7 + n[i] * 0.35 - crackMask[i] * 0.35;
    h[i] = hh;
    const t = slabTint[slab];
    let base = 70 + n[i] * 60 + n2[i] * 22 + t * 18;
    base *= 0.55 + bevel * 0.45; base *= 1 - crackMask[i] * 0.5;
    const j = i * 4;
    alb[j] = base * 0.86; alb[j + 1] = base * 0.92; alb[j + 2] = base * 1.08 + 4; alb[j + 3] = 255;
    const ro = clamp(0.62 + n2[i] * 0.35 - bevel * 0.08 + (1 - bevel) * 0.15, 0, 1) * 255;
    rough[j] = ro; rough[j + 1] = ro; rough[j + 2] = ro; rough[j + 3] = 255;
    // circuitry inlay in seams: faint cyan where edge==1..2 on some slabs
    const seam = edge < 2.5 ? 1 : 0;
    const glow = seam * (n2[i] > 0.62 ? 1 : 0) * (slab === 1 || slab === 2 ? 1 : 0.3);
    emi[j] = 10 * glow; emi[j + 1] = 120 * glow; emi[j + 2] = 160 * glow; emi[j + 3] = 255;
  }
  return { map: dataTex(alb, S, true), normalMap: dataTex(heightToNormal(h, S, 6), S), roughnessMap: dataTex(rough, S), emissiveMap: dataTex(emi, S, true) };
}
/* Brick wall with mortar, chipped edges and occasional glowing rune bricks */
function makeWallMaps(seed) {
  const S = 256, n = makeNoise(S, seed, 5); const r = mulberry(seed + 11);
  const h = new Float32Array(S * S), alb = new Uint8Array(S * S * 4), rough = new Uint8Array(S * S * 4), emi = new Uint8Array(S * S * 4);
  const rows = 6, bh = S / rows, bw = S / 3;
  const brickRand = []; for (let i = 0; i < 64; i++) brickRand.push(r());
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, row = Math.floor(y / bh);
    const off = (row % 2) * bw / 2; const bx = (x + off) % S; const col = Math.floor(bx / bw);
    const lx = bx % bw, ly = y % bh;
    const edge = Math.min(lx, ly, bw - 1 - lx, bh - 1 - ly);
    const id = (row * 3 + col) % 64; const br = brickRand[id];
    const mortar = edge < 2.2;
    const chip = clamp(edge / 5, 0, 1);
    const hh = mortar ? 0.05 : 0.45 + chip * 0.35 + n[i] * 0.3;
    h[i] = hh;
    let base = mortar ? 22 + n[i] * 12 : (60 + br * 40 + n[i] * 50) * (0.7 + chip * 0.3);
    const j = i * 4;
    alb[j] = base * 0.92; alb[j + 1] = base * 0.9; alb[j + 2] = base * 1.06 + 3; alb[j + 3] = 255;
    const ro = mortar ? 250 : clamp(0.7 + n[i] * 0.25, 0, 1) * 255;
    rough[j] = rough[j + 1] = rough[j + 2] = ro; rough[j + 3] = 255;
    // rune brick
    let g = 0;
    if (!mortar && br > 0.88) {
      const cx = lx - bw / 2, cy = ly - bh / 2;
      const ring = Math.abs(Math.hypot(cx * 0.8, cy * 1.6) - 9) < 1.2 ? 1 : 0;
      const bar = (Math.abs(cy) < 1 && Math.abs(cx) < 16) || (Math.abs(cx) < 1 && Math.abs(cy) < 9) ? 1 : 0;
      g = Math.max(ring, bar * 0.8);
    }
    emi[j] = 30 * g; emi[j + 1] = 160 * g; emi[j + 2] = 255 * g; emi[j + 3] = 255;
  }
  return { map: dataTex(alb, S, true), normalMap: dataTex(heightToNormal(h, S, 5), S), roughnessMap: dataTex(rough, S), emissiveMap: dataTex(emi, S, true) };
}
/* Brushed / scratched metal for enemies and props */
function makeMetalMaps(seed) {
  const S = 128, n = makeNoise(S, seed, 4); const r = mulberry(seed);
  const alb = new Uint8Array(S * S * 4), rough = new Uint8Array(S * S * 4), h = new Float32Array(S * S);
  const scratches = []; for (let k = 0; k < 40; k++) scratches.push([r() * S, r() * S, r() * 6.28, 6 + r() * 20]);
  const sm = new Float32Array(S * S);
  for (const [x, y, a, l] of scratches) for (let t = 0; t < l; t++) { const xx = Math.floor(x + Math.cos(a) * t + S) % S, yy = Math.floor(y + Math.sin(a) * t + S) % S; sm[yy * S + xx] = 1; }
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
const TEX = {};
function buildProceduralTextures() {
  TEX.floor = makeFloorMaps(1337);
  TEX.wall = makeWallMaps(4242);
  TEX.metal = makeMetalMaps(77);
  TEX.shadow = radialTex([[0, 'rgba(0,0,0,0.75)'], [0.55, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]);
  TEX.glow = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  TEX.ring = (() => { const s = 256, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'); g.strokeStyle = '#fff'; g.lineWidth = 10; g.shadowColor = '#fff'; g.shadowBlur = 24; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 26, 0, Math.PI * 2); g.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
}

/* ---------- hero sprite atlases (the attached artwork) ---------- */
const ART = {};      // ART[heroId][name] = { tex, w, h, url }
let MANIFEST = null;
async function loadAtlases(onProgress) {
  MANIFEST = await (await fetch('atlas/manifest.json')).json();
  const ids = Object.keys(MANIFEST); let done = 0;
  await Promise.all(ids.map(id => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      ART[id] = {};
      for (const [name, [x, y, w, h]] of Object.entries(MANIFEST[id].r)) {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
        ART[id][name] = { tex: t, w, h, canvas: c, url: null };
      }
      done++; onProgress && onProgress(done / ids.length); res();
    };
    img.onerror = () => rej(new Error('Could not load artwork for ' + id));
    img.src = 'atlas/' + id + '.webp';
  })));
}
function artURL(id, name) {
  const a = ART[id][name];
  if (!a.url) a.url = a.canvas.toDataURL('image/png');
  return a.url;
}

/* ---------- GPU particles ---------- */
const PMAX = 3000;
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
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  const P = []; for (let i = 0; i < PMAX; i++) P.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.2, r: 1, g: 1, b: 1, drag: 2, grav: 0 });
  let cursor = 0;
  function emit(x, y, z, color, n, o = {}) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const p = P[cursor]; cursor = (cursor + 1) % PMAX;
      const sp = (o.speed ?? 5) * (0.35 + Math.random() * 0.65), a = Math.random() * 6.283, el = (Math.random() - 0.3) * (o.up ?? 1.2);
      p.x = x + rr(-1, 1) * (o.spreadPos ?? 0.1); p.y = y; p.z = z + rr(-1, 1) * (o.spreadPos ?? 0.1);
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
  function noise(dur, vol, fFrom, fTo, q = 1, when = 0) {
    if (!ctx) return; const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(fFrom, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, fTo), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  const sfx = {
    shoot(p = 1) { if (throttle('shoot', 45)) return; tone('square', 880 * p, 330 * p, 0.07, 0.07); },
    hit() { if (throttle('hit', 30)) return; noise(0.08, 0.25, 3000, 600, 2); },
    kill() { if (throttle('kill', 40)) return; noise(0.22, 0.35, 1800, 120, 0.8); tone('triangle', 220, 60, 0.2, 0.18); },
    hurt() { if (throttle('hurt', 120)) return; tone('sawtooth', 300, 80, 0.25, 0.2); noise(0.15, 0.3, 900, 200, 1); },
    dash() { noise(0.2, 0.3, 400, 3000, 1.4); },
    pickup() { [0, 4, 7, 12].forEach((s, i) => tone('triangle', 523 * 2 ** (s / 12), 523 * 2 ** (s / 12), 0.12, 0.12, i * 0.045)); },
    xp() { if (throttle('xp', 35)) return; tone('sine', 1200 + Math.random() * 300, 1800, 0.06, 0.06); },
    special() { tone('sawtooth', 110, 440, 0.45, 0.16); noise(0.5, 0.3, 200, 4000, 0.7); tone('sine', 660, 1320, 0.4, 0.1, 0.08); },
    boom() { noise(0.6, 0.55, 900, 60, 0.6); tone('sine', 120, 35, 0.6, 0.35); },
    level() { [0, 4, 7, 11, 14].forEach((s, i) => tone('square', 392 * 2 ** (s / 12), 392 * 2 ** (s / 12), 0.18, 0.07, i * 0.07)); },
    eshot() { if (throttle('eshot', 70)) return; tone('sine', 520, 260, 0.12, 0.05); },
    boss() { tone('sawtooth', 70, 40, 1.4, 0.3); noise(1.2, 0.35, 120, 600, 0.5); },
    portal() { [0, 7, 12, 19].forEach((s, i) => tone('sine', 262 * 2 ** (s / 12), 262 * 2 ** (s / 12) * 1.01, 0.5, 0.1, i * 0.1)); },
    ui() { tone('square', 660, 990, 0.05, 0.05); },
  };
  /* generative score: minor-pentatonic arpeggio over a filtered drone */
  function startMusic(intense = false) {
    if (!ctx) return; stopMusic();
    const root = 55; const scale = [0, 3, 5, 7, 10, 12, 15, 17];
    const drone = ctx.createOscillator(), drone2 = ctx.createOscillator(), dg = ctx.createGain(), lp = ctx.createBiquadFilter();
    drone.type = 'sawtooth'; drone2.type = 'sawtooth'; drone.frequency.value = root; drone2.frequency.value = root * 1.501;
    lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 4; dg.gain.value = 0.18;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 220; lfo.connect(lg); lg.connect(lp.frequency);
    drone.connect(lp); drone2.connect(lp); lp.connect(dg); dg.connect(musicBus); drone.start(); drone2.start(); lfo.start();
    const bpm = intense ? 132 : 104, step = 60 / bpm / 2; let n = 0;
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
      if (n % 4 === 0) { // pulse kick
        const k = ctx.createOscillator(), kg = ctx.createGain(); k.frequency.setValueAtTime(intense ? 140 : 110, t); k.frequency.exponentialRampToValueAtTime(40, t + 0.18);
        kg.gain.setValueAtTime(intense ? 0.5 : 0.28, t); kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); k.connect(kg); kg.connect(musicBus); k.start(t); k.stop(t + 0.25);
      }
      n++;
    }
    musicTimer = { iv: setInterval(tick, step * 1000), nodes: [drone, drone2, lfo], gain: dg };
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer.iv); musicTimer.nodes.forEach(o => { try { o.stop(); } catch (e) { } }); musicTimer = null; } }
  function toggleMute() { muted = !muted; try { localStorage.setItem('ad_muted', muted ? '1' : '0'); } catch (e) { } if (master) master.gain.value = muted ? 0 : 0.8; return muted; }
  return { init, sfx, startMusic, stopMusic, toggleMute, get muted() { return muted; } };
})();
