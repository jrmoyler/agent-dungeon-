/* ------------------------------------------------------------------
   MODELS: authored procedural 3D rigs for the 10 bosses and the 12
   CPU archetypes, built from the Batch 08 concept board (silhouette,
   palette, signature parts). Rim-lit PBR materials, phase palettes,
   state-driven animation (idle / move / attack / stagger / phase /
   death) and part-scatter deaths. No image assets.
------------------------------------------------------------------- */
const MG = {};
function initModelGeo() {
  const rb = (w, h, d, r = 0.12) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
  MG.rb = rb; MG.cache = {};
  MG.box = rb(1, 1, 1, 0.14); MG.slab = rb(1, 1, 1, 0.05);
  MG.sph = new THREE.SphereGeometry(0.5, 24, 16); MG.sphLo = new THREE.SphereGeometry(0.5, 12, 8);
  MG.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 18); MG.cyl8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  MG.cone = new THREE.ConeGeometry(0.5, 1, 14); MG.cone4 = new THREE.ConeGeometry(0.5, 1, 4); MG.cone6 = new THREE.ConeGeometry(0.5, 1, 6);
  MG.torus = new THREE.TorusGeometry(0.5, 0.08, 10, 40); MG.torusThin = new THREE.TorusGeometry(0.5, 0.03, 8, 64);
  MG.oct = new THREE.OctahedronGeometry(0.5, 0); MG.ico = new THREE.IcosahedronGeometry(0.5, 0); MG.dod = new THREE.DodecahedronGeometry(0.5, 0);
  MG.capsule = new THREE.CapsuleGeometry(0.5, 1, 6, 12);
  MG.disc = new THREE.CylinderGeometry(0.5, 0.5, 1, 48);
  MG.plane = new THREE.PlaneGeometry(1, 1);
  // tapered block: square section, narrower top (side 1 at the base, 0.68 at the top)
  MG.taper = new THREE.CylinderGeometry(0.48, 0.7071, 1, 4, 1); MG.taper.rotateY(Math.PI / 4);
  MG.wedge = new THREE.CylinderGeometry(0.2, 0.7071, 1, 4, 1); MG.wedge.rotateY(Math.PI / 4);
  MG.dome = new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  MG.panel = makePanelMaps(91);
  // blade: flat tapered extrusion pointing +y
  MG.blade = (() => { const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(-0.25, 0.75); s.lineTo(0, 1); s.lineTo(0.25, 0.75); s.lineTo(0.5, 0); s.lineTo(0, -0.12); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }); g.translate(0, 0, -0.04); return g; })();
  // feather: long leaf shape pointing +y
  MG.feather = (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.42, 0.45, 0.12, 1); s.lineTo(0, 1.08); s.lineTo(-0.12, 1); s.quadraticCurveTo(-0.42, 0.45, 0, 0); const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }); g.translate(0, 0, -0.02); return g; })();
  const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  MG.robe = lathe([[0.02, 1], [0.32, 0.96], [0.38, 0.8], [0.44, 0.55], [0.6, 0.25], [0.78, 0.04], [0.74, 0]]);
  MG.gown = lathe([[0.02, 1], [0.26, 0.98], [0.3, 0.86], [0.26, 0.7], [0.34, 0.55], [0.55, 0.3], [0.9, 0.06], [1, 0], [0.92, -0.02]]);
  MG.hood = lathe([[0, 1], [0.28, 0.92], [0.46, 0.62], [0.5, 0.3], [0.44, 0], [0.36, 0.02], [0.38, 0.3], [0.34, 0.6], [0.22, 0.82], [0, 0.88]]);
  MG.shell = lathe([[0, 1], [0.38, 0.92], [0.5, 0.6], [0.5, 0.2], [0.42, 0], [0.4, 0.02]], 24);
  MG.dial = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, '#2a3a44'); gr.addColorStop(1, '#0a1218'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#f7c45c'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 118, 0, 7); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 96, 0, 7); g.stroke();
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, r0 = i % 5 ? 104 : 88; g.lineWidth = i % 5 ? 2 : 5; g.strokeStyle = i % 5 ? '#9fb8c4' : '#c4f7ff'; g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); g.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); g.stroke(); }
    g.fillStyle = '#f7c45c'; g.font = 'bold 22px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ['XII', 'III', 'VI', 'IX'].forEach((t, i) => { const a = i * Math.PI / 2 - Math.PI / 2; g.fillText(t, 128 + Math.cos(a) * 70, 128 + Math.sin(a) * 70); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
}

/* armour plating: panel seams, rivets and edge wear, as albedo + normal + roughness */
function makePanelMaps(seed) {
  const S = 256, n = makeNoise(S, seed, 4), r = mulberry(seed);
  const h = new Float32Array(S * S), alb = new Uint8Array(S * S * 4), ro = new Uint8Array(S * S * 4);
  const cuts = []; for (let i = 0; i < 9; i++) cuts.push([r() < 0.5, Math.floor(r() * S), Math.floor(r() * S), Math.floor(r() * S * 0.6)]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, gx = x % 64, gy = y % 64;
    let seam = (gx < 2 || gy < 2) ? 1 : 0;
    for (const [hor, a, b, len] of cuts) { if (hor && Math.abs(y - a) < 1.5 && ((x - b + S) % S) < len) seam = 1; if (!hor && Math.abs(x - a) < 1.5 && ((y - b + S) % S) < len) seam = 1; }
    const rivet = ((gx - 6) ** 2 + (gy - 6) ** 2 < 5) || ((gx - 58) ** 2 + (gy - 6) ** 2 < 5) ? 1 : 0;
    const edge = Math.min(gx, gy, 63 - gx, 63 - gy);
    h[i] = (seam ? -0.6 : 0) + rivet * 0.6 + n[i] * 0.15 + (edge < 5 ? (edge / 5) * 0.2 : 0.2);
    const wear = edge < 4 && n[i] > 0.55 ? 0.25 : 0;
    const v = clamp(200 + n[i] * 50 - seam * 120 + rivet * 30 + wear * 120, 0, 255), j = i * 4;
    alb[j] = alb[j + 1] = alb[j + 2] = v; alb[j + 3] = 255;
    const rv = clamp(0.45 + n[i] * 0.25 + seam * 0.3 - wear, 0, 1) * 255; ro[j] = ro[j + 1] = ro[j + 2] = rv; ro[j + 3] = 255;
  }
  return { map: dataTex(alb, S, true), normalMap: dataTex(heightToNormal(h, S, 4), S), roughnessMap: dataTex(ro, S) };
}
/* rim-lit standard material: a fresnel term keeps silhouettes readable against dark dungeons */
function rimMat(o) {
  if (o.rim !== undefined) o.rim = new THREE.Color(o.rim).multiplyScalar(o.rimK ?? 0.4);
  const m = new THREE.MeshStandardMaterial({ color: o.color ?? 0x888888, metalness: o.metal ?? 0.7, roughness: o.rough ?? 0.4, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1,
    map: o.tex === false ? null : o.tex === 'panel' ? MG.panel.map : (o.tex ?? TEX.metal.map), roughnessMap: o.tex === false ? null : o.tex === 'panel' ? MG.panel.roughnessMap : TEX.metal.roughnessMap, normalMap: o.tex === false ? null : o.tex === 'panel' ? MG.panel.normalMap : TEX.metal.normalMap, normalScale: new THREE.Vector2(o.ns ?? 0.8, o.ns ?? 0.8),
    transparent: !!o.opacity, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide, depthWrite: o.depthWrite ?? true });
  m.userData.rim = { uRim: { value: new THREE.Color(o.rim ?? 0x000000) }, uRimP: { value: o.rimP ?? 2.6 } };
  m.userData.baseEm = m.emissive.clone(); m.userData.baseEI = m.emissiveIntensity;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, m.userData.rim);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uRimP;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n vec3 rimV = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition); float rimF = pow(1.0 - clamp(abs(dot(normal, rimV)), 0.0, 1.0), uRimP); totalEmissiveRadiance += uRim * rimF;');
  };
  m.customProgramCacheKey = () => 'rimMat';
  return m;
}
const glowMat = (c, ei = 3) => rimMat({ color: 0x000000, emissive: c, ei, metal: 0, rough: 0.3, tex: false });
function addPart(parent, geo, mat, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.scale.set(...(typeof s === 'number' ? [s, s, s] : s)); m.rotation.set(...r); parent.add(m); return m;
}
function addGroup(parent, p = [0, 0, 0], r = [0, 0, 0]) { const g = new THREE.Group(); g.position.set(...p); g.rotation.set(...r); parent.add(g); return g; }
/* palette kit: armour, trim, dark under-structure, two glow channels */
function paletteKit(base, trim, glow, rim, o = {}) {
  return {
    armor: rimMat({ color: base, metal: o.metal ?? 0.75, rough: o.rough ?? 0.4, rim, tex: 'panel' }),
    trim: rimMat({ color: trim, metal: 0.95, rough: 0.22, rim, rimK: 0.25 }),
    dark: rimMat({ color: o.dark ?? 0x1c1f28, metal: 0.65, rough: 0.5, rim, rimK: 0.15 }),
    glow: glowMat(glow, o.gi ?? 1.7), glow2: glowMat(o.glow2 ?? trim, 1.25),
    ice: rimMat({ color: 0x9fd8ee, emissive: glow, ei: 0.25, metal: 0.1, rough: 0.08, opacity: 0.88, tex: false, rim: 0xd4f9ff, rimK: 0.5 }),
  };
}
function collectMats(root) { const s = new Set(); root.traverse(o => { if (o.material) s.add(o.material); }); return [...s]; }
/* jagged lightning line between two local points, rebuilt on demand */
function arcLine(parent, color) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
  const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); parent.add(l);
  l.zap = (a, b, amp = 0.35) => { const p = geo.attributes.position.array; for (let i = 0; i < 10; i++) { const t = i / 9, j = i && i < 9 ? amp : 0; p[i * 3] = lerp(a[0], b[0], t) + rr(-j, j); p[i * 3 + 1] = lerp(a[1], b[1], t) + rr(-j, j); p[i * 3 + 2] = lerp(a[2], b[2], t) + rr(-j, j); } geo.attributes.position.needsUpdate = true; };
  return l;
}

/* ---------- shared mech chassis (Core Tyrant, Storm Colossus, Final Sentinel) ---------- */
function buildMech(K, c) {
  const root = new THREE.Group(), P = {}, s = c.scale, B = c.bulk;
  const T = MG.taper, W = MG.wedge, X = MG.box;
  const hips = P.hips = addGroup(root, [0, 2.45 * s, 0]);
  addPart(hips, X, K.dark, [0, 0, 0], [1.5 * s, 0.55 * s, 1.0 * s]);
  addPart(hips, MG.cyl8, K.trim, [0, 0.05 * s, 0], [0.9 * s, 0.5 * s, 0.9 * s]);
  // hip skirt plates
  for (const [x, z, ry] of [[-0.45, 0.5, 0], [0.45, 0.5, 0], [-0.8, 0, Math.PI / 2], [0.8, 0, Math.PI / 2]]) addPart(hips, T, K.armor, [x * s, -0.35 * s, z * s], [0.55 * s, -0.6 * s, 0.12 * s], [x * z ? 0 : 0, ry, z ? -0.25 * Math.sign(z) * 0 : 0]).rotation.x = z ? 0.18 : 0;
  P.legs = [-1, 1].map(side => {
    const thigh = addGroup(hips, [side * 0.62 * s, -0.2 * s, 0]);
    addPart(thigh, T, K.armor, [0, -0.6 * s, 0], [0.7 * s, -1.25 * s, 0.75 * s]);
    addPart(thigh, X, K.dark, [side * 0.28 * s, -0.55 * s, 0], [0.12 * s, 0.9 * s, 0.5 * s]);
    addPart(thigh, MG.sph, K.dark, [0, -1.25 * s, 0], 0.48 * s);
    addPart(thigh, MG.oct, K.trim, [0, -1.22 * s, 0.32 * s], [0.42 * s, 0.55 * s, 0.3 * s]);
    const shin = addGroup(thigh, [0, -1.25 * s, 0]);
    addPart(shin, T, K.armor, [0, -0.55 * s, 0.05 * s], [0.78 * s, 1.1 * s, 0.85 * s]);
    addPart(shin, MG.slab, K.glow2, [0, -0.45 * s, 0.47 * s], [0.08 * s, 0.6 * s, 0.03 * s]);
    addPart(shin, MG.cyl, K.trim, [0, -0.5 * s, -0.42 * s], [0.16 * s, 0.9 * s, 0.16 * s]); // calf piston
    const foot = addGroup(shin, [0, -1.12 * s, 0.1 * s]);
    addPart(foot, X, K.dark, [0, 0, 0.1 * s], [0.9 * s, 0.26 * s, 1.15 * s]);
    for (const x of [-0.3, 0, 0.3]) addPart(foot, W, K.trim, [x * s, -0.02 * s, 0.75 * s], [0.22 * s, 0.4 * s, 0.18 * s], [Math.PI / 2, 0, 0]);
    addPart(foot, W, K.trim, [0, 0, -0.55 * s], [0.3 * s, 0.35 * s, 0.2 * s], [-Math.PI / 2, 0, 0]);
    if (c.spikes) addPart(shin, MG.cone4, K.trim, [0, -0.15 * s, 0.5 * s], [0.25 * s, 0.6 * s, 0.25 * s], [1.1, 0, 0]);
    return { thigh, shin };
  });
  const torso = P.torso = addGroup(hips, [0, 0.4 * s, 0]);
  // segmented abdomen
  for (let i = 0; i < 3; i++) addPart(torso, X, i % 2 ? K.trim : K.dark, [0, (0.08 + i * 0.22) * s, 0], [(1.0 + i * 0.12) * s, 0.2 * s, (0.75 + i * 0.05) * s]);
  // chest: inverted taper (broad shoulders), pectoral plates, collar
  P.chest = addPart(torso, T, K.armor, [0, 1.25 * s, -0.05 * s], [2.4 * s * B, -1.5 * s, 1.5 * s]);
  for (const x of [-1, 1]) { addPart(torso, W, K.armor, [x * 0.55 * s * B, 1.35 * s, 0.62 * s], [0.95 * s * B, 1.0 * s, 0.4 * s], [-0.15, 0, x * 0.12]).rotation.x = Math.PI / 2 - 0.25; addPart(torso, MG.slab, K.glow2, [x * 0.95 * s * B, 1.25 * s, 0.6 * s], [0.04 * s, 0.75 * s, 0.05 * s], [0, 0, x * 0.25]); }
  addPart(torso, X, K.trim, [0, 2.0 * s, -0.05 * s], [1.3 * s, 0.25 * s, 1.15 * s]);
  // reactor core
  P.ring = addPart(torso, MG.torus, K.trim, [0, 1.15 * s, 0.78 * s], [1.0 * s, 1.0 * s, 1.8 * s]);
  P.core = addPart(torso, MG.sph, K.glow, [0, 1.15 * s, 0.72 * s], 0.62 * s);
  addPart(torso, MG.cyl8, K.dark, [0, 1.15 * s, 0.6 * s], [0.75 * s, 0.25 * s, 0.75 * s], [Math.PI / 2, 0, 0]);
  P.vents = [-1, 1].map(side => addPart(torso, MG.slab, K.glow2, [side * 1.05 * s * B, 0.95 * s, -0.25 * s], [0.05 * s, 0.6 * s, 0.6 * s]));
  // head: helmet, brow, jaw, visor or eye
  const head = P.head = addGroup(torso, [0, 2.2 * s, 0.15 * s]);
  addPart(head, X, K.dark, [0, -0.05 * s, -0.05 * s], [0.45 * s, 0.35 * s, 0.45 * s]);
  addPart(head, T, K.armor, [0, 0.25 * s, 0], [0.82 * s, 0.6 * s, 0.85 * s]);
  addPart(head, W, K.trim, [0, 0.02 * s, 0.38 * s], [0.55 * s, 0.35 * s, 0.25 * s], [Math.PI, 0, 0]);
  addPart(head, X, K.trim, [0, 0.47 * s, 0.32 * s], [0.75 * s, 0.1 * s, 0.25 * s], [0.3, 0, 0]);
  if (c.head === 'cyclops') { P.eye = addPart(head, MG.sph, K.glow, [0, 0.27 * s, 0.42 * s], [0.26 * s, 0.26 * s, 0.12 * s]); addPart(head, MG.torus, K.trim, [0, 0.27 * s, 0.43 * s], 0.32 * s); }
  else P.eye = addPart(head, MG.slab, K.glow, [0, 0.28 * s, 0.43 * s], [0.6 * s, 0.09 * s, 0.03 * s]);
  if (c.head === 'horns') {
    P.horns = [-1, 1].map(side => { const h = addGroup(head, [side * 0.38 * s, 0.5 * s, -0.05 * s], [0, 0, -side * 0.45]); addPart(h, MG.cyl, K.dark, [0, 0.35 * s, 0], [0.16 * s, 0.7 * s, 0.16 * s]); for (let i = 0; i < 3; i++) addPart(h, MG.torus, K.trim, [0, (0.2 + i * 0.22) * s, 0], [0.34 * s, 0.34 * s, 0.6 * s], [Math.PI / 2, 0, 0]); addPart(h, MG.sph, K.glow, [0, 0.85 * s, 0], 0.24 * s); return h; });
  } else if (c.head === 'cyclops') { for (const x of [-1, 1]) addPart(head, MG.cone4, K.trim, [x * 0.35 * s, 0.6 * s, -0.1 * s], [0.12 * s, 0.6 * s, 0.12 * s], [-0.4, 0, -x * 0.5]); }
  else addPart(head, W, K.trim, [0, 0.62 * s, -0.08 * s], [0.12 * s, 0.4 * s, 0.75 * s]);
  // shoulders + arms
  P.arms = [-1, 1].map(side => {
    const sh = addGroup(torso, [side * 1.45 * s * B, 1.75 * s, 0]);
    addPart(sh, MG.dome, K.armor, [side * 0.12 * s, 0, 0], [1.25 * s, 0.9 * s, 1.3 * s]);
    addPart(sh, MG.torus, K.trim, [side * 0.12 * s, 0.02 * s, 0], [1.2 * s, 1.25 * s, 1.0 * s], [Math.PI / 2, 0, 0]);
    if (c.shoulder === 'cannons') for (const dz of [-0.22, 0.22]) { addPart(sh, MG.cyl, K.dark, [side * 0.1 * s + dz * s, 0.62 * s, 0.25 * s], [0.2 * s, 1.25 * s, 0.2 * s], [Math.PI / 2, 0, 0]); addPart(sh, MG.cyl8, K.trim, [side * 0.1 * s + dz * s, 0.62 * s, -0.05 * s], [0.3 * s, 0.4 * s, 0.3 * s], [Math.PI / 2, 0, 0]); addPart(sh, MG.torus, K.glow, [side * 0.1 * s + dz * s, 0.62 * s, 0.88 * s], 0.22 * s); }
    if (c.shoulder === 'spikes') for (let i = 0; i < 3; i++) addPart(sh, MG.cone4, K.trim, [side * (0.05 + i * 0.25) * s, 0.45 * s, (i - 1) * 0.3 * s], [0.26 * s, 1.0 * s, 0.26 * s], [0, 0, -side * 0.4]);
    if (c.shoulder === 'plates') { addPart(sh, MG.dod, K.armor, [side * 0.35 * s, 0.35 * s, 0], [0.9 * s, 0.55 * s, 1.1 * s]); addPart(sh, MG.slab, K.glow2, [side * 0.55 * s, 0.35 * s, 0], [0.05 * s, 0.2 * s, 0.7 * s]); }
    const upper = addGroup(sh, [side * 0.2 * s, -0.25 * s, 0]);
    addPart(upper, MG.capsule, K.dark, [0, -0.5 * s, 0], [0.42 * s, 0.6 * s, 0.42 * s]);
    addPart(upper, T, K.armor, [0, -0.45 * s, 0.05 * s], [0.55 * s, -0.75 * s, 0.6 * s]);
    addPart(upper, MG.sph, K.trim, [0, -1.1 * s, 0], 0.46 * s);
    const fore = addGroup(upper, [0, -1.1 * s, 0]);
    addPart(fore, T, K.armor, [0, -0.55 * s, 0.05 * s], [0.85 * s * c.fist, 1.1 * s, 0.9 * s * c.fist]);
    addPart(fore, MG.slab, K.glow2, [side * 0.33 * s * c.fist, -0.5 * s, 0.12 * s], [0.04 * s, 0.7 * s, 0.35 * s]);
    let barrels = null;
    if (c.weapon === 'gatling') { addPart(fore, MG.cyl8, K.trim, [0, -1.15 * s, 0.1 * s], [0.6 * s, 0.25 * s, 0.6 * s]); barrels = addGroup(fore, [0, -1.25 * s, 0.1 * s]); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; addPart(barrels, MG.cyl, K.dark, [Math.cos(a) * 0.18 * s, -0.4 * s, Math.sin(a) * 0.18 * s], [0.1 * s, 0.85 * s, 0.1 * s]); } addPart(barrels, MG.torus, K.trim, [0, -0.6 * s, 0], [0.48 * s, 0.48 * s, 0.6 * s], [Math.PI / 2, 0, 0]); addPart(barrels, MG.sph, K.glow, [0, -0.85 * s, 0], 0.22 * s); }
    else if (c.weapon === 'fist') { const f = addGroup(fore, [0, -1.3 * s, 0.05 * s]); addPart(f, X, K.trim, [0, 0, 0], [1.05 * s, 0.75 * s, 1.0 * s]); for (const x of [-0.3, -0.1, 0.1, 0.3]) addPart(f, X, K.armor, [x * s, -0.42 * s, 0.25 * s], [0.18 * s, 0.25 * s, 0.4 * s]); addPart(f, MG.sph, K.glow, [0, 0.05 * s, 0.52 * s], 0.26 * s); }
    else if (c.weapon === 'blade') { barrels = addGroup(fore, [0, -1.1 * s, 0.1 * s]); addPart(barrels, MG.cyl8, K.trim, [0, 0, 0], [0.4 * s, 0.25 * s, 0.4 * s]); addPart(barrels, MG.blade, K.glow, [0, -0.2 * s, 0], [0.45 * s, -2.6 * s, 1], [0, Math.PI / 2, 0]); }
    return { sh, upper, fore, barrels, side };
  });
  // back
  P.back = addGroup(torso, [0, 1.4 * s, -0.85 * s]);
  if (c.back === 'stacks') for (const x of [-0.55, 0.55]) { addPart(P.back, MG.cyl, K.dark, [x * s, 0.4 * s, -0.1 * s], [0.36 * s, 1.5 * s, 0.36 * s]); addPart(P.back, MG.cyl8, K.trim, [x * s, 0.0, -0.1 * s], [0.48 * s, 0.25 * s, 0.48 * s]); addPart(P.back, MG.cyl, K.glow2, [x * s, 1.17 * s, -0.1 * s], [0.28 * s, 0.08 * s, 0.28 * s]); }
  if (c.back === 'fins') for (const x of [-1, 1]) addPart(P.back, MG.blade, K.trim, [x * 0.55 * s, 0.6 * s, -0.1 * s], [0.9 * s, 2.0 * s, 1], [0.35, 0, -x * 0.5]);
  if (c.back === 'capacitor') { addPart(P.back, MG.cyl, K.dark, [0, 0.3 * s, 0], [0.9 * s, 1.6 * s, 0.9 * s]); for (let i = 0; i < 4; i++) addPart(P.back, MG.torus, K.glow2, [0, (-0.3 + i * 0.4) * s, 0], [1.0 * s, 1.0 * s, 1.0 * s], [Math.PI / 2, 0, 0]); }
  return { root, P, s };
}
function animMech(M, st, dt) {
  const P = M.P, t = st.t, sp = Math.min(1, st.speed / 2.5);
  const walk = Math.sin(t * 5) * 0.5 * sp;
  P.legs.forEach((l, i) => { const w = i ? -walk : walk; l.thigh.rotation.x = w; l.shin.rotation.x = Math.max(0, -w) * 1.2; });
  P.hips.position.y = M.baseY + Math.abs(Math.sin(t * 5)) * 0.12 * sp + Math.sin(t * 1.5) * 0.04;
  P.torso.rotation.y = Math.sin(t * 0.9) * 0.08;
  const atk = st.state === 'attack' ? Math.sin(st.k * Math.PI) : 0;
  P.arms.forEach(a => {
    a.upper.rotation.x = -atk * 1.35 + Math.sin(t * 1.4 + a.side) * 0.05 - walk * 0.4 * a.side;
    a.upper.rotation.z = a.side * (0.12 + atk * 0.1);
    a.fore.rotation.x = -atk * 0.5 - 0.15;
    if (a.barrels) a.barrels.rotation.y += dt * (4 + atk * 30);
  });
  P.torso.rotation.x = st.state === 'stagger' ? -Math.sin(st.k * Math.PI) * 0.35 : atk * 0.12;
  P.core.scale.setScalar(0.62 * M.s * (1 + Math.sin(t * 6) * 0.06 + atk * 0.35));
  P.ring.rotation.z += dt * (1 + st.phase);
  if (P.horns && Math.random() < dt * 14) M.arc.zap(...M.hornPts(), 0.25);
  if (M.arc) M.arc.material.opacity = 0.4 + Math.random() * 0.6;
}

/* ---------- boss factories ---------- */
const BOSS_LOOK = {
  core_tyrant:     { base: 0xc9922a, trim: 0x8a6420, glow: 0x29dcfc, rim: 0x5a3a10, phases: [0x29dcfc, 0xffb030, 0xff4a2a] },
  shadow_weaver:   { base: 0x2c1a4a, trim: 0x6a3aa8, glow: 0xf3a2ff, rim: 0x8a4aff, phases: [0xf3a2ff, 0xc06bff, 0xff4ad8] },
  storm_colossus:  { base: 0x2a6a9a, trim: 0xb8c4d0, glow: 0xfbf4a4, rim: 0x4ab8ff, phases: [0xfbf4a4, 0x7fe0ff, 0xffffff] },
  inferno_queen:   { base: 0x5a1208, trim: 0xd4a843, glow: 0xff6331, rim: 0xff4a10, phases: [0xff6331, 0xffa030, 0xfff0a0] },
  frost_warden:    { base: 0x2f6a88, trim: 0xd4f9ff, glow: 0xc1faff, rim: 0x8ae4ff, phases: [0xc1faff, 0x7fe0ff, 0x4a8aff] },
  toxic_broodlord: { base: 0x22341a, trim: 0x5a6a2a, glow: 0xa8f040, rim: 0x6aff2a, phases: [0xb8ff4a, 0xe6ff8b, 0xff9a2a] },
  void_archon:     { base: 0x0a0814, trim: 0x4a2a8a, glow: 0x9862fd, rim: 0xb07aff, phases: [0x9862fd, 0xdbb6ff, 0xff4ad8] },
  time_keeper:     { base: 0xb8862a, trim: 0x6a4a1a, glow: 0xc4f7ff, rim: 0xf7c45c, phases: [0xc4f7ff, 0xf7c45c, 0xff7a4a] },
  nexus_angel:     { base: 0x857c68, trim: 0xd4a843, glow: 0xfce7a3, rim: 0xfff0c0, phases: [0xfce7a3, 0xa3edff, 0xffffff] },
  final_sentinel:  { base: 0x1a1418, trim: 0x8a1a24, glow: 0xfc455c, rim: 0xff2a3a, phases: [0xfc455c, 0xff8a3a, 0xffffff] },
};
function buildBossModel(id) {
  const L = BOSS_LOOK[id], K = paletteKit(L.base, L.trim, L.glow, L.rim, { glow2: L.phases[1] });
  let M;
  switch (id) {
    case 'core_tyrant': {
      M = buildMech(K, { scale: 1.15, bulk: 1.05, fist: 1, head: 'visor', shoulder: 'cannons', weapon: 'gatling', back: 'stacks' });
      M.anim = (st, dt) => animMech(M, st, dt); break;
    }
    case 'storm_colossus': {
      M = buildMech(K, { scale: 1.3, bulk: 1.15, fist: 1.35, head: 'horns', shoulder: 'plates', weapon: 'fist', back: 'capacitor' });
      M.arc = arcLine(M.P.head, L.glow);
      const s = 1.3; M.hornPts = () => [[-0.68 * s, 1.35 * s, -0.1 * s], [0.68 * s, 1.35 * s + rr(-0.1, 0.1), -0.1 * s]];
      M.rocks = []; for (let i = 0; i < 6; i++) M.rocks.push(addPart(M.root, MG.dod, K.armor, [0, 0, 0], [0.5 + rand() * 0.4, 0.4 + rand() * 0.3, 0.5 + rand() * 0.4], [rand() * 3, rand() * 3, 0]));
      M.anim = (st, dt) => { animMech(M, st, dt); M.rocks.forEach((r, i) => { const a = st.t * 0.6 + i * 1.047; r.position.set(Math.cos(a) * 4.2, 2.2 + Math.sin(st.t * 1.3 + i) * 0.6, Math.sin(a) * 4.2); r.rotation.x += dt; r.rotation.y += dt * 0.7; }); };
      break;
    }
    case 'final_sentinel': {
      M = buildMech(K, { scale: 1.2, bulk: 1.0, fist: 1.05, head: 'cyclops', shoulder: 'spikes', weapon: 'blade', back: 'fins', spikes: true });
      M.blades = addGroup(M.P.torso, [0, 1.1 * 1.2, 0]);
      for (let i = 0; i < 4; i++) addPart(M.blades, MG.blade, K.glow, [Math.cos(i * Math.PI / 2) * 2.6, 0, Math.sin(i * Math.PI / 2) * 2.6], [0.45, 1.3, 1], [Math.PI / 2, i * Math.PI / 2, 0]);
      M.wings = addGroup(M.P.back, [0, 1, -0.3]); M.wings.visible = false;
      for (const x of [-1, 1]) for (let i = 0; i < 4; i++) addPart(M.wings, MG.blade, rimMat({ color: 0x000000, emissive: L.glow, ei: 2.5, tex: false, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }), [x * (0.6 + i * 0.5), 0.3 + i * 0.2, 0], [0.5, 2.6 - i * 0.3, 1], [0, 0, -x * (0.5 + i * 0.25)]);
      M.anim = (st, dt) => { animMech(M, st, dt); M.blades.rotation.y += dt * (1.2 + st.phase * 0.8); M.wings.visible = st.phase >= 3; if (M.wings.visible) M.wings.scale.setScalar(1 + Math.sin(st.t * 3) * 0.05); };
      break;
    }
    case 'shadow_weaver': {
      const root = new THREE.Group(), P = {}; M = { root, P };
      const body = P.body = addGroup(root, [0, 2.6, 0]);
      addPart(body, MG.robe, K.armor, [0, -2.2, 0], [2.2, 3.2, 2.2]);
      addPart(body, MG.robe, K.glow2, [0, -2.25, 0], [2.26, 0.12, 2.26]);
      addPart(body, MG.sph, K.dark, [0, 0.9, 0], [1.1, 1.0, 0.9]);
      addPart(body, MG.hood, K.trim, [0, 1.1, 0], [1.5, 1.5, 1.5]);
      P.eyes = [-1, 1].map(x => addPart(body, MG.sph, K.glow, [x * 0.2, 1.55, 0.48], [0.16, 0.08, 0.06]));
      for (let i = 0; i < 5; i++) addPart(body, MG.cone4, K.trim, [(i - 2) * 0.22, 2.35 - Math.abs(i - 2) * 0.1, -0.1], [0.12, 0.5, 0.12]);
      P.legs = [];
      for (let i = 0; i < 6; i++) {
        const side = i < 3 ? -1 : 1, k = i % 3, hip = addGroup(body, [side * 0.45, 1.1, -0.2 - k * 0.1], [0, side * (0.5 + k * 0.6), 0]);
        const up = addGroup(hip, [0, 0, 0], [0, 0, side * -0.9]);
        addPart(up, MG.taper, K.trim, [side * 1.2, 0, 0], [0.32, 2.4, 0.32], [0, 0, side * Math.PI / 2]);
        addPart(up, MG.sph, K.glow2, [side * 2.4, 0, 0], 0.22);
        const lo = addGroup(up, [side * 2.4, 0, 0], [0, 0, side * 1.9]);
        addPart(lo, MG.taper, K.armor, [side * 1.3, 0, 0], [0.26, -2.6, 0.26], [0, 0, side * Math.PI / 2]);
        addPart(lo, MG.blade, K.glow, [side * 2.9, 0, 0], [0.35, 1.1, 1], [0, 0, -side * Math.PI / 2]);
        P.legs.push({ up, lo, side, k });
      }
      P.ribbons = []; for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, r = addPart(body, MG.plane, rimMat({ color: 0x2a1040, emissive: L.glow, ei: 0.25, opacity: 0.75, side: THREE.DoubleSide, tex: false, depthWrite: false }), [Math.cos(a) * 0.9, -2.8, Math.sin(a) * 0.9], [0.35, 1.6, 1], [0, -a, 0]); P.ribbons.push(r); }
      P.shards = []; for (let i = 0; i < 7; i++) P.shards.push(addPart(root, MG.oct, K.glow, [0, 0, 0], [0.35, 0.8, 0.35]));
      M.anim = (st, dt) => {
        const t = st.t, atk = st.state === 'attack' ? Math.sin(st.k * Math.PI) : 0;
        body.position.y = 2.6 + Math.sin(t * 1.6) * 0.25; body.rotation.x = st.state === 'stagger' ? -Math.sin(st.k * Math.PI) * 0.3 : atk * 0.25;
        P.legs.forEach(l => { const w = Math.sin(t * 2.4 + l.k * 1.3 + (l.side > 0 ? 1.6 : 0)); l.up.rotation.z = l.side * (-0.9 + w * 0.15 - atk * 0.6); l.lo.rotation.z = l.side * (1.9 - w * 0.2 + atk * 0.9); });
        P.ribbons.forEach((r, i) => { r.rotation.x = Math.sin(t * 2 + i) * 0.25; });
        P.shards.forEach((s, i) => { const a = t * (0.8 + st.phase * 0.25) + i * 0.9, R = 3.4 + st.phase * 0.5; s.position.set(Math.cos(a) * R, 2.4 + Math.sin(t * 2 + i) * 0.8, Math.sin(a) * R); s.rotation.y += dt * 2; });
        P.eyes.forEach(e => e.scale.y = 0.08 * (1 + atk * 1.5));
      };
      break;
    }
    case 'inferno_queen': {
      const root = new THREE.Group(), P = {}; M = { root, P };
      const body = P.body = addGroup(root, [0, 0.4, 0]);
      addPart(body, MG.gown, K.armor, [0, 0, 0], [2.0, 3.4, 2.0]);
      P.inner = addPart(body, MG.gown, rimMat({ color: 0x000000, emissive: L.glow, ei: 0.9, tex: false, opacity: 0.4, depthWrite: false }), [0, -0.05, 0], [1.9, 3.25, 1.9]);
      addPart(body, MG.torus, K.trim, [0, 3.0, 0], [1.25, 1.25, 1.25], [Math.PI / 2, 0, 0]);
      const chest = addGroup(body, [0, 3.35, 0]);
      addPart(chest, MG.sph, K.dark, [0, 0.25, 0], [0.95, 1.1, 0.75]);
      addPart(chest, MG.cone, K.trim, [0, 0.0, 0.32], [0.55, 0.9, 0.2], [Math.PI, 0, 0]);
      const head = P.head = addGroup(chest, [0, 1.05, 0]);
      addPart(head, MG.sph, rimMat({ color: 0x3a1a14, rough: 0.5, metal: 0.2, rim: L.rim }), [0, 0, 0], [0.6, 0.72, 0.6]);
      addPart(head, MG.slab, K.trim, [0, 0.05, 0.27], [0.45, 0.16, 0.08]);
      P.eyes = [-1, 1].map(x => addPart(head, MG.sph, K.glow, [x * 0.12, 0.06, 0.32], 0.08));
      P.crown = []; for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.32; P.crown.push(addPart(head, MG.cone, K.glow2, [Math.sin(a) * 0.3, 0.42 + (3 - Math.abs(i - 3)) * 0.06, -Math.cos(a) * 0.05], [0.12, 0.55 + (3 - Math.abs(i - 3)) * 0.12, 0.12], [-0.15, 0, -a * 0.6])); }
      P.arms = [-1, 1].map(side => { const sh = addGroup(chest, [side * 0.5, 0.45, 0], [0, 0, side * 0.9]); addPart(sh, MG.capsule, K.dark, [0, -0.6, 0], [0.22, 0.9, 0.22]); const orb = addPart(sh, MG.sph, K.glow, [0, -1.35, 0], 0.55); return { sh, orb, side }; });
      P.wings = [-1, 1].map(side => { const w = addGroup(chest, [side * 0.35, 0.4, -0.35]); for (let i = 0; i < 8; i++) { const a = 0.2 + i * 0.2; addPart(w, MG.feather, i % 3 === 1 ? K.glow : K.armor, [0, 0, -i * 0.02], [0.75, 3.2 - Math.abs(i - 3.5) * 0.25, 1], [0, 0, -side * a]); if (i % 3 !== 1) addPart(w, MG.feather, K.glow2, [0, 0, -i * 0.02 + 0.03], [0.32, 2.2 - Math.abs(i - 3.5) * 0.18, 1], [0, 0, -side * a]); } return w; });
      M.anim = (st, dt) => {
        const t = st.t, atk = st.state === 'attack' ? Math.sin(st.k * Math.PI) : 0;
        body.position.y = 0.4 + Math.sin(t * 1.4) * 0.15;
        P.wings.forEach((w, i) => { const s = i ? 1 : -1; w.rotation.y = s * (0.35 + Math.sin(t * 2.2) * 0.2 + atk * 0.4); w.rotation.x = -0.2; });
        P.arms.forEach(a => { a.sh.rotation.z = a.side * (0.9 - atk * 0.7); a.sh.rotation.x = -atk * 1.1; a.orb.scale.setScalar(0.55 * (1 + Math.sin(t * 8 + a.side) * 0.12 + atk * 0.6)); });
        P.crown.forEach((c, i) => c.scale.y = (0.55 + (3 - Math.abs(i - 3)) * 0.12) * (1 + Math.sin(t * 10 + i) * 0.15));
        P.inner.material.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.25 + st.phase * 0.2;
        if (Math.random() < dt * 30) { const a = rand() * 6.28; M.emit = [Math.cos(a) * 1.6, 0.3, Math.sin(a) * 1.6]; }
      };
      M.fx = 'fire';
      break;
    }
    case 'frost_warden': {
      const root = new THREE.Group(), P = {}; M = { root, P };
      P.segs = [];
      const N = 15;
      for (let i = 0; i < N; i++) {
        const g = addGroup(root), r = 1.0 - i * 0.05;
        addPart(g, MG.sph, K.armor, [0, 0, 0], [r * 1.25, r * 1.1, r * 1.35]);
        addPart(g, MG.sph, K.dark, [0, -r * 0.25, 0], [r * 1.05, r * 0.7, r * 1.2]);
        addPart(g, MG.cone6, K.ice, [0, r * 0.75, 0], [r * 0.35, r * 0.9, r * 0.35]);
        if (i % 3 === 1) for (const x of [-1, 1]) addPart(g, MG.cone6, K.trim, [x * r * 0.6, r * 0.45, 0], [r * 0.2, r * 0.6, r * 0.2], [0, 0, -x * 0.7]);
        P.segs.push(g);
      }
      const head = P.head = addGroup(root);
      addPart(head, MG.taper, K.armor, [0, 0.12, 0.75], [1.35, 2.0, 0.95], [Math.PI / 2, 0, 0]);   // skull tapering into the snout
      addPart(head, MG.taper, K.dark, [0, 0.02, 1.55], [0.7, 0.8, 0.55], [Math.PI / 2, 0, 0]);
      for (const x of [-1, 1]) addPart(head, MG.wedge, K.trim, [x * 0.42, 0.52, 0.65], [0.3, 1.1, 0.25], [Math.PI / 2 - 0.25, 0, x * 0.3]); // brow ridges
      P.jaw = addGroup(head, [0, -0.22, 0.25]); addPart(P.jaw, MG.taper, K.dark, [0, -0.12, 0.7], [1.0, 1.6, 0.35], [Math.PI / 2, 0, 0]);
      for (const x of [-0.32, -0.12, 0.12, 0.32]) { addPart(P.jaw, MG.cone4, K.ice, [x, 0.08, 1.35], [0.09, 0.3, 0.09]); addPart(head, MG.cone4, K.ice, [x * 0.9, -0.15, 1.6], [0.08, 0.26, 0.08], [Math.PI, 0, 0]); }
      P.eyes = [-1, 1].map(x => addPart(head, MG.sph, K.glow, [x * 0.46, 0.32, 1.05], [0.17, 0.09, 0.12]));
      for (const x of [-1, 1]) for (let i = 0; i < 3; i++) addPart(head, MG.cone6, K.ice, [x * (0.4 + i * 0.12), 0.6 + i * 0.1, 0.1 - i * 0.35], [0.15, 1.2 - i * 0.25, 0.15], [-1.0, 0, -x * 0.4]);
      P.aura = addPart(root, MG.torusThin, K.glow2, [0, 0.1, 0], [7, 7, 7], [Math.PI / 2, 0, 0]);
      M.anim = (st, dt) => {
        const t = st.t, atk = st.state === 'attack' ? Math.sin(st.k * Math.PI) : 0, stag = st.state === 'stagger' ? Math.sin(st.k * Math.PI) : 0;
        const rise = 3.6 + Math.sin(t * 1.2) * 0.3 + atk * 0.8;
        for (let i = 0; i < N; i++) {
          const u = i / (N - 1), g = P.segs[i];
          const y = lerp(rise - 0.6, 0.6, Math.min(1, u * 1.6));
          const ang = u * 5.2 - t * 2.2;
          g.position.set(Math.sin(ang) * (0.6 + u * 2.4), y, -u * 4.2 + Math.cos(ang) * u * 1.2);
          if (i) { const q = P.segs[i - 1].position, dx = q.x - g.position.x, dy = q.y - g.position.y, dz = q.z - g.position.z; g.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0, 'YXZ'); }
        }
        head.position.set(P.segs[0].position.x * 0.6, rise + 0.2, 0.6 + atk * 1.4); head.rotation.x = -0.25 + atk * 0.35 - stag * 0.5; head.rotation.y = Math.sin(t * 1.3) * 0.2;
        P.jaw.rotation.x = 0.1 + atk * 0.7 + Math.max(0, Math.sin(t * 0.8)) * 0.1;
        P.aura.rotation.z += dt * 0.5;
      };
      M.fx = 'frost';
      break;
    }
    case 'toxic_broodlord': {
      const root = new THREE.Group(), P = {}; M = { root, P };
      const body = P.body = addGroup(root, [0, 1.6, 0]);
      P.abdomen = addGroup(body, [0, 0.3, -1.6]);
      addPart(P.abdomen, MG.sph, K.armor, [0, 0, 0], [3.0, 2.2, 3.6]);
      for (let i = 0; i < 9; i++) { const a = i * 2.4, y = Math.sin(i * 1.7) * 0.5; addPart(P.abdomen, MG.sph, K.glow2, [Math.cos(a) * 1.25, 0.35 + y * 0.4, Math.sin(a) * 1.5], 0.32 + (i % 3) * 0.08); }
      addPart(P.abdomen, MG.shell, K.armor, [0, 0.15, 0.1], [3.2, 1.45, 3.7]); for (let i = 0; i < 5; i++) addPart(P.abdomen, MG.torus, K.trim, [0, 0.1, -1.2 + i * 0.6], [2.6 - Math.abs(i - 2) * 0.35, 1.9 - Math.abs(i - 2) * 0.3, 2.5], [0, 0, 0]);
      P.sacs = []; for (const x of [-1, 1]) P.sacs.push(addPart(P.abdomen, MG.sph, rimMat({ color: 0x3a5a10, emissive: L.glow, ei: 0.45, metal: 0.1, rough: 0.25, opacity: 0.9, tex: false }), [x * 1.1, -0.6, -0.9], [1.0, 0.9, 1.1]));
      const thorax = addGroup(body, [0, 0.4, 0.3]);
      addPart(thorax, MG.sph, K.armor, [0, 0, 0], [2.0, 1.4, 1.8]);
      addPart(thorax, MG.shell, K.trim, [0, 0.1, 0], [2.1, 0.9, 1.9]);
      const head = P.head = addGroup(thorax, [0, 0.1, 1.15]);
      addPart(head, MG.sph, K.dark, [0, 0, 0], [1.3, 0.95, 1.1]);
      P.eyes = [-1, 1].map(x => addPart(head, MG.sph, K.glow, [x * 0.38, 0.2, 0.4], 0.24));
      for (const x of [-1, 1]) addPart(head, MG.cone, K.glow2, [x * 0.45, 0.85, -0.2], [0.32, 1.6, 0.32], [-0.5, 0, -x * 0.35]);
      P.mand = [-1, 1].map(x => { const g = addGroup(head, [x * 0.35, -0.25, 0.45]); addPart(g, MG.cone, K.trim, [0, 0, 0.45], [0.22, 1.0, 0.22], [Math.PI / 2, 0, 0]); return g; });
      P.legs = []; for (let i = 0; i < 6; i++) { const side = i < 3 ? -1 : 1, k = i % 3, hip = addGroup(thorax, [side * 0.8, -0.2, 0.5 - k * 0.9], [0, side * (k - 1) * -0.5, 0]); const up = addGroup(hip, [0, 0, 0], [0, 0, side * -0.6]); addPart(up, MG.box, K.dark, [side * 0.9, 0, 0], [1.8, 0.22, 0.22]); const lo = addGroup(up, [side * 1.8, 0, 0], [0, 0, side * 1.6]); addPart(lo, MG.cone4, K.armor, [side * 0.9, 0, 0], [0.26, 1.9, 0.26], [0, 0, side * Math.PI / 2]); P.legs.push({ up, lo, side, k }); }
      P.wings = [-1, 1].map(x => addPart(body, MG.sph, rimMat({ color: 0xc8ff8a, emissive: L.glow, ei: 0.5, opacity: 0.35, tex: false, depthWrite: false, side: THREE.DoubleSide }), [x * 1.0, 1.7, -1.4], [1.6, 0.06, 3.4], [0, x * 0.3, 0]));
      M.anim = (st, dt) => {
        const t = st.t, sp = Math.min(1, st.speed / 2.5), atk = st.state === 'attack' ? Math.sin(st.k * Math.PI) : 0;
        body.position.y = 1.6 + Math.sin(t * 2) * 0.06; body.rotation.x = st.state === 'stagger' ? -Math.sin(st.k * Math.PI) * 0.25 : -atk * 0.15;
        P.legs.forEach(l => { const w = Math.sin(t * 8 * (0.3 + sp) + l.k * 2 + (l.side > 0 ? Math.PI : 0)); l.up.rotation.z = l.side * (-0.6 + w * 0.25 * (0.3 + sp)); l.up.rotation.y = w * 0.25 * sp; });
        P.mand.forEach((m, i) => m.rotation.y = (i ? -1 : 1) * (0.2 + Math.abs(Math.sin(t * 3)) * 0.25 + atk * 0.5));
        P.sacs.forEach((s, i) => s.scale.setScalar(1 + Math.sin(t * 3 + i) * 0.08 + st.phase * 0.08));
        P.wings.forEach((w, i) => { w.visible = st.phase >= 2; w.rotation.z = (i ? 1 : -1) * (0.2 + Math.sin(t * 40) * 0.25); });
      };
      M.fx = 'toxic';
      break;
    }
    case 'void_archon': {
      const root = new THREE.Group(), P = {}; M = { root, P };
      const core = P.core = addGroup(root, [0, 3.4, 0]);
      addPart(core, MG.sph, rimMat({ color: 0x050308, metal: 0.95, rough: 0.12, rim: L.rim, rimP: 1.8, tex: false }), [0, 0, 0], 2.6);
      P.iris = addPart(core, MG.torus, K.glow, [0, 0, 1.18], [1.1, 1.1, 1.6]);
      P.pupil = addPart(core, MG.sph, K.glow2, [0, 0, 1.15], [0.45, 0.45, 0.2]);
      P.rings = [0, 1, 2].map(i => { const g = addGroup(core, [0, 0, 0], [i * 1.1, i * 0.7, 0]); addPart(g, MG.torusThin, K.trim, [0, 0, 0], 3.6 + i * 0.7); for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; addPart(g, MG.sph, K.glow, [Math.cos(a) * (1.8 + i * 0.35), Math.sin(a) * (1.8 + i * 0.35), 0], 0.22); } return g; });
      P.tent = []; for (let i = 0; i < 8; i++) { const segs = []; let parent = addGroup(core, [Math.cos(i * 0.785) * 1.0, -0.9, Math.sin(i * 0.785) * 1.0]); for (let k = 0; k < 7; k++) { const g = addGroup(parent, [0, k ? -0.5 : 0, 0]); addPart(g, MG.sph, k % 2 ? K.dark : K.armor, [0, -0.25, 0], [0.42 - k * 0.04, 0.6, 0.42 - k * 0.04]); if (k === 6) addPart(g, MG.cone4, K.glow, [0, -0.6, 0], [0.18, 0.5, 0.18], [Math.PI, 0, 0]); segs.push(g); parent = g; } P.tent.push(segs); }
      M.anim = (st, dt) => {
        const t = st.t, atk = st.state === 'attack' ? Math.sin(st.k * Math.PI) : 0;
        core.position.y = 3.4 + Math.sin(t * 1.3) * 0.3; core.rotation.x = st.state === 'stagger' ? -Math.sin(st.k * Math.PI) * 0.4 : Math.sin(t * 0.7) * 0.08;
        P.rings.forEach((r, i) => { r.rotation.x += dt * (0.4 + i * 0.2) * (1 + st.phase * 0.4); r.rotation.y += dt * (0.3 - i * 0.15); });
        P.pupil.scale.set(0.45 * (1 - atk * 0.6), 0.45 * (1 + atk * 0.4), 0.2);
        P.tent.forEach((segs, i) => segs.forEach((g, k) => { g.rotation.x = Math.sin(t * 2.2 + i + k * 0.6) * (0.18 + atk * 0.2); g.rotation.z = Math.cos(t * 1.8 + i * 1.3 + k * 0.5) * (0.22 + atk * 0.25); }));
      };
      M.fx = 'void';
      break;
    }
    case 'time_keeper': {
      const root = new THREE.Group(), P = {}; M = { root, P };
      const body = P.body = addGroup(root, [0, 3.4, 0]);
      P.gear = addPart(body, G3.gear, K.trim, [0, 0, -0.45], [4.8, 4.8, 3]);
      addPart(body, MG.disc, K.armor, [0, 0, 0], [3.4, 0.5, 3.4], [Math.PI / 2, 0, 0]);
      addPart(body, MG.disc, rimMat({ color: 0xffffff, map: MG.dial, tex: MG.dial, metal: 0.1, rough: 0.4, emissive: 0x223038, ei: 1 }), [0, 0, 0.26], [3.0, 0.02, 3.0], [Math.PI / 2, 0, 0]);
      addPart(body, MG.torus, K.trim, [0, 0, 0.28], [3.4, 3.4, 3.4]);
      P.hands = [[0.06, 1.15], [0.05, 0.8]].map(([w, l]) => { const g = addGroup(body, [0, 0, 0.32]); addPart(g, MG.slab, K.glow, [0, l / 2, 0], [w * 2, l, 0.04]); return g; });
      addPart(body, MG.sph, K.glow, [0, 0, 0.33], 0.2);
      const head = addGroup(body, [0, 2.1, 0]); addPart(head, MG.sph, K.armor, [0, 0, 0], [1.0, 0.8, 0.9]); P.eye = addPart(head, MG.slab, K.glow, [0, 0.05, 0.44], [0.6, 0.1, 0.04]); addPart(head, MG.cone, K.trim, [0, 0.55, 0], [0.25, 0.6, 0.25]);
      P.arms = [-1, 1].map(side => { const sh = addGroup(body, [side * 1.85, 0.6, 0], [0, 0, side * 0.3]); addPart(sh, MG.sph, K.trim, [0, 0, 0], 0.55); addPart(sh, MG.box, K.armor, [0, -0.7, 0], [0.4, 1.2, 0.4]); const hg = addGroup(sh, [0, -1.6, 0]); addPart(hg, MG.cone, rimMat({ color: 0xc4f7ff, emissive: L.glow, ei: 0.8, opacity: 0.7, tex: false }), [0, 0.3, 0], [0.5, 0.6, 0.5], [Math.PI, 0, 0]); addPart(hg, MG.cone, rimMat({ color: 0xc4f7ff, emissive: L.glow, ei: 0.8, opacity: 0.7, tex: false }), [0, -0.3, 0], [0.5, 0.6, 0.5]); addPart(hg, MG.disc, K.trim, [0, 0.62, 0], [0.6, 0.06, 0.6]); addPart(hg, MG.disc, K.trim, [0, -0.62, 0], [0.6, 0.06, 0.6]); return { sh, hg, side }; });
      const pend = P.pend = addGroup(body, [0, -1.7, 0.1]); addPart(pend, MG.cyl, K.trim, [0, -0.8, 0], [0.08, 1.6, 0.08]); addPart(pend, MG.disc, K.armor, [0, -1.7, 0], [0.9, 0.12, 0.9], [Math.PI / 2, 0, 0]); addPart(pend, MG.sph, K.glow, [0, -1.7, 0.08], 0.3);
      P.orbs = []; for (let i = 0; i < 6; i++) P.orbs.push(addPart(root, MG.sph, K.glow, [0, 0, 0], 0.35));
      M.anim = (st, dt) => {
        const t = st.t, atk = st.state === 'attack' ? Math.sin(st.k * Math.PI) : 0, rate = st.phase >= 3 ? -2 : 1;
        body.position.y = 3.4 + Math.sin(t * 1.1) * 0.2; body.rotation.x = st.state === 'stagger' ? -Math.sin(st.k * Math.PI) * 0.3 : 0;
        P.hands[0].rotation.z -= dt * 2.2 * rate * (1 + atk * 4); P.hands[1].rotation.z -= dt * 0.25 * rate;
        P.gear.rotation.z += dt * 0.4 * rate;
        P.pend.rotation.z = Math.sin(t * 2.4) * 0.5;
        P.arms.forEach(a => { a.sh.rotation.x = -atk * 1.2; a.hg.rotation.z += dt * (0.5 + atk * 6); });
        P.orbs.forEach((o, i) => { const a = t * 0.9 * rate + i * 1.047; o.position.set(Math.cos(a) * 4, 3.4 + Math.sin(a * 2) * 0.6, Math.sin(a) * 4); });
      };
      break;
    }
    case 'nexus_angel': {
      const root = new THREE.Group(), P = {}; M = { root, P };
      const body = P.body = addGroup(root, [0, 0.8, 0]);
      addPart(body, MG.gown, K.armor, [0, 0, 0], [1.4, 3.6, 1.4]);
      addPart(body, MG.gown, K.trim, [0, 0.02, 0], [1.44, 0.18, 1.44]);
      const chest = addGroup(body, [0, 3.5, 0]);
      addPart(chest, MG.sph, K.armor, [0, 0.2, 0], [0.9, 1.1, 0.7]);
      addPart(chest, MG.cone, K.trim, [0, 0.15, 0.25], [0.6, 0.8, 0.2], [Math.PI, 0, 0]);
      const head = addGroup(chest, [0, 1.0, 0]);
      addPart(head, MG.sph, rimMat({ color: 0xc8b8a4, metal: 0.2, rough: 0.35, rim: L.rim }), [0, 0, 0], [0.55, 0.65, 0.55]);
      addPart(head, MG.slab, K.trim, [0, 0.08, 0.25], [0.46, 0.18, 0.08]);
      P.eyes = [-1, 1].map(x => addPart(head, MG.sph, K.glow2, [x * 0.11, 0.09, 0.3], 0.06));
      P.halo = addPart(head, MG.torus, K.glow, [0, 0.65, -0.1], [1.1, 1.1, 1.6], [Math.PI / 2.4, 0, 0]);
      P.wings = [-1, 1].map(side => { const w = addGroup(chest, [side * 0.3, 0.45, -0.3]); for (let i = 0; i < 10; i++) { const a = 0.05 + i * 0.16; addPart(w, MG.feather, i % 3 ? K.armor : K.trim, [0, 0, -i * 0.03], [0.8, 3.6 - Math.abs(i - 4) * 0.22, 1], [0, 0, -side * a]); } addPart(w, MG.feather, K.glow, [0, 0, 0.05], [0.4, 2.6, 1], [0, 0, -side * 0.4]); return w; });
      const arm = addGroup(chest, [0.55, 0.45, 0.1], [0, 0, 0.5]); addPart(arm, MG.capsule, K.armor, [0, -0.5, 0], [0.18, 0.7, 0.18]);
      P.spear = addGroup(arm, [0, -1.0, 0.1], [0.4, 0, -0.5]); addPart(P.spear, MG.cyl, K.trim, [0, 0.6, 0], [0.08, 3.6, 0.08]); addPart(P.spear, MG.blade, K.glow, [0, 2.6, 0], [0.4, 1.1, 1]);
      M.anim = (st, dt) => {
        const t = st.t, atk = st.state === 'attack' ? Math.sin(st.k * Math.PI) : 0;
        body.position.y = 0.8 + Math.sin(t * 1.5) * 0.25; body.rotation.x = st.state === 'stagger' ? -Math.sin(st.k * Math.PI) * 0.25 : 0;
        P.wings.forEach((w, i) => { const s = i ? 1 : -1; w.rotation.y = s * (0.5 + Math.sin(t * 1.8) * 0.28 + atk * 0.3); });
        P.halo.rotation.z += dt * (0.6 + st.phase * 0.4); P.spear.rotation.x = 0.4 - atk * 1.3;
      };
      M.fx = 'light';
      break;
    }
  }
  M.K = K; M.look = L; M.s = M.s || 1.15; M.baseY = M.P.hips ? M.P.hips.position.y : 0;
  M.root.scale.setScalar(1.25); leanRig(M, 0.42);
  M.mats = collectMats(M.root); M.glows = [K.glow, K.glow2];
  M.root.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  return M;
}
/* the gameplay camera looks down ~60°: tip tall rigs toward it so their fronts read; yaw lives on the inner group */
function leanRig(M, lean) { const outer = new THREE.Group(); outer.add(M.root); outer.rotation.x = -lean; /* tilt back: fronts turn up into the camera */ M.yawNode = M.root; M.root = outer; }
/* phase palette: blend the glow channels toward the phase colour */
function setModelPhase(M, phase) { const c = M.look.phases[Math.min(2, phase - 1)]; M.K.glow.emissive.set(c); M.K.glow.userData.baseEm = M.K.glow.emissive.clone(); M.K.glow.emissiveIntensity = M.K.glow.userData.baseEI * (1 + (phase - 1) * 0.25); }
/* hit flash / status tint for any model */
function flashModel(mats, amt, col = 0xffffff) { for (const m of mats) { if (!m.emissive) continue; if (amt > 0) { m.emissive.set(col); m.emissiveIntensity = 1.6 * amt + (m.userData.baseEI || 0) * 0.5; } else if (m.userData.baseEm) { m.emissive.copy(m.userData.baseEm); m.emissiveIntensity = m.userData.baseEI; } } }
/* death: every mesh tumbles away from the centre and fades */
function shatterModel(root, power = 6) {
  const debris = []; root.updateMatrixWorld(true);
  const c = new THREE.Vector3(); new THREE.Box3().setFromObject(root).getCenter(c);
  root.traverse(o => { if (!o.isMesh) return; const w = new THREE.Vector3(); o.getWorldPosition(w); const d = w.sub(c); if (d.lengthSq() < 0.01) d.set(rr(-1, 1), 1, rr(-1, 1)); d.normalize(); debris.push({ o, v: d.multiplyScalar(power * (0.4 + rand() * 0.8)).add(new THREE.Vector3(0, power * 0.5, 0)), spin: new THREE.Vector3(rr(-6, 6), rr(-6, 6), rr(-6, 6)) }); if (o.material) { o.material = o.material.clone(); o.material.transparent = true; } });
  return debris;
}
function tickShatter(debris, dt, k) {
  for (const d of debris) { d.v.y -= 9 * dt; const p = d.o.position; const inv = 1 / (d.o.parent ? d.o.parent.getWorldScale(tmpV).x || 1 : 1); p.x += d.v.x * dt * inv; p.y += d.v.y * dt * inv; p.z += d.v.z * dt * inv; d.o.rotation.x += d.spin.x * dt; d.o.rotation.y += d.spin.y * dt; d.o.rotation.z += d.spin.z * dt; if (d.o.material) d.o.material.opacity = Math.max(0, 1 - k * 1.1); }
}

/* ---------- CPU faction rigs ---------- */
const CPU_LOOK = {
  drone:    { plan: 'drone' },   infantry: { plan: 'bot', weapon: 'rifle' }, turret: { plan: 'turret' }, hunter: { plan: 'bot', weapon: 'claws', lean: 0.35, h: 0.9 },
  brute:    { plan: 'bot', weapon: 'hammers', bulk: 1.6, h: 1.15 }, mage: { plan: 'caster' }, sniper: { plan: 'bot', weapon: 'rail', h: 1.05, slim: 0.8 },
  shield:   { plan: 'bot', weapon: 'shield', bulk: 1.2 }, healer: { plan: 'medic' }, flyer: { plan: 'manta' }, bomber: { plan: 'bomb' },
  elite:    { plan: 'bot', weapon: 'dual', bulk: 1.25, h: 1.2, horns: true, cape: true },
};
function buildCpuModel(type, color) {
  const L = CPU_LOOK[type], col = new THREE.Color(color);
  const base = col.clone().multiplyScalar(0.55).lerp(new THREE.Color(0x2a2e3a), 0.45), trim = col.clone().lerp(new THREE.Color(0xffffff), 0.15);
  const K = paletteKit(base, trim, col.clone().lerp(new THREE.Color(0xffffff), 0.25), col, { gi: 1.35 }); K.glow2.emissiveIntensity = K.glow2.userData.baseEI = 0.8;
  const root = new THREE.Group(), P = {}; let anim;
  switch (L.plan) {
    case 'bot': {
      const h = L.h || 1, b = L.bulk || 1, sl = L.slim || 1;
      const hips = P.hips = addGroup(root, [0, 0.85 * h, 0]);
      addPart(hips, MG.box, K.dark, [0, 0, 0], [0.55 * b, 0.25, 0.35]);
      P.legs = [-1, 1].map(x => { const th = addGroup(hips, [x * 0.18 * b, -0.05, 0]); addPart(th, MG.taper, K.armor, [0, -0.22 * h, 0], [0.22 * b * sl, -0.45 * h, 0.26]); const sh = addGroup(th, [0, -0.45 * h, 0]); addPart(sh, MG.sph, K.dark, [0, 0, 0], 0.13); addPart(sh, MG.taper, K.armor, [0, -0.18 * h, 0.02], [0.24 * b * sl, 0.36 * h, 0.28]); addPart(sh, MG.oct, K.trim, [0, -0.02, 0.12], [0.14, 0.18, 0.1]); addPart(sh, MG.box, K.dark, [0, -0.36 * h, 0.06], [0.26 * b, 0.1, 0.36]); return { th, sh }; });
      const torso = P.torso = addGroup(hips, [0, 0.12, 0], [L.lean || 0, 0, 0]);
      addPart(torso, MG.box, K.dark, [0, 0.12 * h, 0], [0.42 * b, 0.25 * h, 0.3 * b]);
      addPart(torso, MG.taper, K.armor, [0, 0.42 * h, 0], [0.82 * b * sl, -0.5 * h, 0.5 * b]);
      for (const x of [-1, 1]) addPart(torso, MG.wedge, K.trim, [x * 0.17 * b * sl, 0.46 * h, 0.24 * b], [0.3 * b * sl, 0.36 * h, 0.12], [Math.PI / 2 - 0.2, 0, 0]);
      addPart(torso, MG.sph, K.glow, [0, 0.36 * h, 0.25 * b], [0.09, 0.09, 0.05]);
      addPart(torso, MG.box, K.dark, [0, 0.42 * h, -0.27 * b], [0.4 * b, 0.4 * h, 0.14]);
      const head = P.head = addGroup(torso, [0, 0.74 * h, 0.03]);
      addPart(head, MG.box, K.dark, [0, 0, 0], [0.16, 0.1, 0.16]);
      addPart(head, MG.taper, K.armor, [0, 0.13, 0], [0.32, 0.24, 0.32]);
      addPart(head, MG.slab, K.glow, [0, 0.13, 0.16], [0.22, 0.045, 0.02]);
      addPart(head, MG.box, K.trim, [0, 0.27, 0.02], [0.24, 0.05, 0.3]);
      if (L.horns) for (const x of [-1, 1]) addPart(head, MG.cone, K.glow2, [x * 0.16, 0.36, -0.04], [0.07, 0.42, 0.07], [-0.3, 0, -x * 0.5]);
      if (L.cape) { P.cape = addPart(torso, MG.plane, rimMat({ color: col.clone().multiplyScalar(0.4), emissive: col, ei: 0.15, side: THREE.DoubleSide, tex: false }), [0, 0.1 * h, -0.27 * b], [0.7 * b, 1.0 * h, 1]); }
      P.arms = [-1, 1].map(x => { const sh = addGroup(torso, [x * 0.46 * b * sl, 0.55 * h, 0]); addPart(sh, MG.dome, K.trim, [x * 0.03, 0.02, 0], [0.32 * b, 0.26, 0.34]); const up = addGroup(sh, [0, -0.05, 0]); addPart(up, MG.box, K.dark, [0, -0.2 * h, 0], [0.14 * b, 0.4 * h, 0.16 * b]); const fo = addGroup(up, [0, -0.4 * h, 0]); addPart(fo, MG.box, K.armor, [0, -0.17 * h, 0], [0.17 * b, 0.34 * h, 0.19 * b]); return { sh, up, fo, x }; });
      const [la, ra] = P.arms;
      switch (L.weapon) {
        case 'rifle': { const g = addGroup(ra.fo, [0, -0.3, 0.12]); addPart(g, MG.box, K.dark, [0, 0, 0.25], [0.1, 0.14, 0.65]); addPart(g, MG.cyl, K.trim, [0, 0.02, 0.62], [0.05, 0.25, 0.05], [Math.PI / 2, 0, 0]); addPart(g, MG.slab, K.glow, [0.055, 0.02, 0.2], [0.01, 0.04, 0.3]); P.muzzle = g; break; }
        case 'rail': { const g = addGroup(ra.fo, [0, -0.28, 0.12]); addPart(g, MG.box, K.dark, [0, 0, 0.45], [0.09, 0.12, 1.15]); addPart(g, MG.cyl, K.glow, [0, 0.11, 0.25], [0.05, 0.3, 0.05], [Math.PI / 2, 0, 0]); addPart(g, MG.slab, K.glow, [0, 0, 1.0], [0.12, 0.02, 0.02]); P.muzzle = g; break; }
        case 'claws': for (const a of P.arms) for (let i = -1; i <= 1; i++) addPart(a.fo, MG.blade, K.glow, [i * 0.06, -0.42, 0.06], [0.08, -0.38, 1], [0.3, 0, 0]); break;
        case 'hammers': for (const a of P.arms) { addPart(a.fo, MG.box, K.trim, [0, -0.45, 0], [0.38, 0.3, 0.38]); addPart(a.fo, MG.slab, K.glow, [0, -0.45, 0.2], [0.22, 0.06, 0.02]); } break;
        case 'shield': { P.shield = addGroup(la.fo, [0.05, -0.2, 0.32]); addPart(P.shield, MG.box, K.trim, [0, 0, 0], [0.75, 1.15, 0.08]); addPart(P.shield, MG.box, K.armor, [0, 0, 0.03], [0.6, 1.0, 0.06]); addPart(P.shield, MG.slab, K.glow, [0, 0.1, 0.07], [0.08, 0.7, 0.01]); addPart(P.shield, MG.slab, K.glow, [0, 0.1, 0.07], [0.45, 0.08, 0.01]); const g = addGroup(ra.fo, [0, -0.3, 0.1]); addPart(g, MG.box, K.dark, [0, 0, 0.18], [0.09, 0.12, 0.42]); P.muzzle = g; break; }
        case 'dual': for (const a of P.arms) { const g = addGroup(a.fo, [0, -0.3, 0.1]); addPart(g, MG.box, K.dark, [0, 0, 0.22], [0.1, 0.13, 0.5]); addPart(g, MG.slab, K.glow, [0, 0.07, 0.22], [0.06, 0.01, 0.4]); } P.muzzle = true; break;
      }
      anim = (st, dt) => {
        const t = st.t, sp = Math.min(1, st.speed / 3.5), w = Math.sin(t * 10) * 0.6 * sp;
        P.legs[0].th.rotation.x = w; P.legs[1].th.rotation.x = -w; P.legs[0].sh.rotation.x = Math.max(0, -w) * 1.1; P.legs[1].sh.rotation.x = Math.max(0, w) * 1.1;
        hips.position.y = 0.85 * h + Math.abs(Math.cos(t * 10)) * 0.05 * sp;
        const aim = L.weapon === 'claws' || L.weapon === 'hammers' ? (st.atk > 0 ? -1.6 * st.atk : -0.2) : -1.25;
        ra.up.rotation.x = aim - (st.atk > 0 && L.weapon !== 'claws' && L.weapon !== 'hammers' ? 0.25 * st.atk : 0);
        la.up.rotation.x = L.weapon === 'shield' ? -0.9 : L.weapon === 'dual' || L.weapon === 'claws' || L.weapon === 'hammers' ? aim : -w * 0.6 - 0.1;
        ra.fo.rotation.x = L.weapon === 'hammers' ? -0.4 : -0.1; la.fo.rotation.x = L.weapon === 'shield' ? -0.5 : -0.1;
        torso.rotation.x = (L.lean || 0) + (st.stagger ? -0.4 : 0); torso.rotation.y = Math.sin(t * 1.3) * 0.05;
        if (P.cape) P.cape.rotation.x = 0.15 + sp * 0.4 + Math.sin(t * 6) * 0.05;
      };
      break;
    }
    case 'turret': {
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; addPart(root, MG.box, K.dark, [Math.cos(a) * 0.45, 0.25, Math.sin(a) * 0.45], [0.12, 0.6, 0.12], [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6]); }
      addPart(root, MG.cyl8, K.armor, [0, 0.6, 0], [0.75, 0.3, 0.75]);
      const head = P.head = addGroup(root, [0, 0.95, 0]);
      addPart(head, MG.box, K.armor, [0, 0.12, 0], [0.75, 0.5, 0.8]); addPart(head, MG.box, K.trim, [0, 0.4, -0.05], [0.6, 0.1, 0.6]);
      P.barrels = [-1, 1].map(x => { const b = addGroup(head, [x * 0.18, 0.12, 0.35]); addPart(b, MG.cyl, K.dark, [0, 0, 0.35], [0.12, 0.75, 0.12], [Math.PI / 2, 0, 0]); addPart(b, MG.torus, K.glow, [0, 0, 0.74], 0.14); return b; });
      addPart(head, MG.slab, K.glow, [0, 0.2, 0.41], [0.3, 0.06, 0.02]); addPart(head, MG.box, K.dark, [0.45, 0.05, -0.1], [0.2, 0.3, 0.4]);
      anim = (st, dt) => { P.barrels.forEach(b => { b.position.z = 0.35 - (st.atk > 0 ? st.atk * 0.15 : 0); }); head.rotation.x = st.stagger ? -0.3 : 0; };
      P.yawOnly = head; break;
    }
    case 'drone': {
      const body = P.body = addGroup(root, [0, 1.4, 0]);
      addPart(body, MG.sph, K.armor, [0, 0, 0], [0.7, 0.45, 0.7]); addPart(body, MG.torus, K.trim, [0, 0, 0], [0.75, 0.75, 1.6], [Math.PI / 2, 0, 0]);
      P.eye = addPart(body, MG.sph, K.glow, [0, -0.02, 0.3], [0.22, 0.22, 0.12]);
      P.rotors = []; for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; addPart(body, MG.box, K.dark, [Math.cos(a) * 0.45, 0.05, Math.sin(a) * 0.45], [0.5, 0.05, 0.08], [0, -a, 0]); const r = addGroup(body, [Math.cos(a) * 0.68, 0.12, Math.sin(a) * 0.68]); addPart(r, MG.disc, rimMat({ color: 0x000000, emissive: col, ei: 0.8, opacity: 0.45, tex: false, depthWrite: false }), [0, 0, 0], [0.42, 0.01, 0.42]); addPart(r, MG.box, K.trim, [0, 0.01, 0], [0.4, 0.02, 0.05]); P.rotors.push(r); }
      addPart(body, MG.cyl, K.dark, [0, -0.3, 0.1], [0.1, 0.25, 0.1]);
      anim = (st, dt) => { body.position.y = 1.4 + Math.sin(st.t * 4) * 0.12; P.rotors.forEach(r => r.rotation.y += dt * 30); body.rotation.x = Math.min(0.35, st.speed * 0.06) + (st.stagger ? -0.4 : 0); body.rotation.z = Math.sin(st.t * 2) * 0.08; };
      break;
    }
    case 'caster': {
      const body = P.body = addGroup(root, [0, 0.3, 0]);
      addPart(body, MG.robe, K.armor, [0, 0, 0], [1.1, 1.6, 1.1]); addPart(body, MG.robe, K.glow2, [0, 0.0, 0], [1.13, 0.06, 1.13]);
      addPart(body, MG.hood, K.trim, [0, 1.45, 0], [0.75, 0.75, 0.75]); addPart(body, MG.sph, K.dark, [0, 1.75, 0.05], [0.4, 0.4, 0.35]);
      P.eyes = [-1, 1].map(x => addPart(body, MG.sph, K.glow, [x * 0.08, 1.78, 0.2], 0.05));
      const arm = addGroup(body, [0.35, 1.35, 0.1], [0, 0, -0.3]); addPart(arm, MG.capsule, K.dark, [0, -0.25, 0], [0.1, 0.35, 0.1]);
      P.staff = addGroup(body, [0.5, 0.2, 0.25]); addPart(P.staff, MG.cyl, K.trim, [0, 0.8, 0], [0.05, 1.9, 0.05]); P.orb = addPart(P.staff, MG.ico, K.glow, [0, 1.85, 0], 0.32); addPart(P.staff, MG.torus, K.trim, [0, 1.85, 0], 0.42);
      P.runes = []; for (let i = 0; i < 3; i++) P.runes.push(addPart(root, MG.oct, K.glow, [0, 0, 0], [0.12, 0.22, 0.12]));
      anim = (st, dt) => { body.position.y = 0.3 + Math.sin(st.t * 2) * 0.1; P.orb.rotation.y += dt * 2; P.orb.scale.setScalar(0.32 * (1 + st.atk * 0.8)); P.staff.rotation.x = -st.atk * 0.6; P.runes.forEach((r, i) => { const a = st.t * 1.5 + i * 2.1; r.position.set(Math.cos(a) * 0.9, 1.2 + Math.sin(a * 2) * 0.2, Math.sin(a) * 0.9); }); };
      break;
    }
    case 'medic': {
      const body = P.body = addGroup(root, [0, 1.3, 0]);
      addPart(body, MG.sph, K.armor, [0, 0, 0], [0.8, 0.8, 0.8]); addPart(body, MG.torus, K.trim, [0, 0, 0], 0.95, [Math.PI / 2, 0, 0]);
      addPart(body, MG.slab, K.glow, [0, 0, 0.4], [0.4, 0.12, 0.04]); addPart(body, MG.slab, K.glow, [0, 0, 0.4], [0.12, 0.4, 0.04]);
      P.ring = addPart(body, MG.torusThin, K.glow, [0, 0, 0], 1.3); P.arms = [-1, 1].map(x => { const g = addGroup(body, [x * 0.45, -0.2, 0]); addPart(g, MG.cyl, K.dark, [0, -0.25, 0.1], [0.06, 0.5, 0.06], [0.4, 0, 0]); addPart(g, MG.sph, K.glow2, [0, -0.45, 0.25], 0.1); return g; });
      anim = (st, dt) => { body.position.y = 1.3 + Math.sin(st.t * 2.5) * 0.12; P.ring.rotation.x += dt * 1.6; P.ring.rotation.y += dt; };
      break;
    }
    case 'manta': {
      const body = P.body = addGroup(root, [0, 1.6, 0]);
      const wing = new THREE.Shape(); wing.moveTo(0, 0.6); wing.quadraticCurveTo(0.9, 0.2, 1.3, -0.35); wing.lineTo(0.25, -0.2); wing.lineTo(0, -0.5); wing.lineTo(-0.25, -0.2); wing.lineTo(-1.3, -0.35); wing.quadraticCurveTo(-0.9, 0.2, 0, 0.6);
      const wg = MG.cache.manta || (MG.cache.manta = new THREE.ExtrudeGeometry(wing, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }));
      P.wing = addPart(body, wg, K.armor, [0, 0, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
      addPart(body, MG.sph, K.trim, [0, 0.06, 0.1], [0.35, 0.18, 0.7]); addPart(body, MG.sph, K.glow, [0, 0.1, 0.42], [0.14, 0.08, 0.1]);
      for (const x of [-1, 1]) addPart(body, MG.slab, K.glow, [x * 0.65, 0.05, -0.05], [0.5, 0.02, 0.04], [0, x * 0.4, 0]);
      P.tail = addGroup(body, [0, 0, -0.45]); addPart(P.tail, MG.cone4, K.dark, [0, 0, -0.45], [0.08, 0.9, 0.04], [-Math.PI / 2, 0, 0]);
      anim = (st, dt) => { body.position.y = 1.6 + Math.sin(st.t * 3) * 0.2; body.rotation.z = Math.sin(st.t * 2) * 0.25; P.wing.scale.x = 1 + Math.sin(st.t * 6) * 0.08; P.tail.rotation.y = Math.sin(st.t * 5) * 0.4; };
      break;
    }
    case 'bomb': {
      const body = P.body = addGroup(root, [0, 0.7, 0]);
      addPart(body, MG.sph, K.dark, [0, 0, 0], 0.95); addPart(body, MG.torus, K.trim, [0, 0, 0], [1.0, 1.0, 1.3], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 4; i++) addPart(body, MG.slab, K.glow2, [Math.cos(i * 1.57) * 0.47, 0.1, Math.sin(i * 1.57) * 0.47], [0.04, 0.3, 0.04]);
      addPart(body, MG.cyl, K.trim, [0, 0.55, 0], [0.22, 0.18, 0.22]); P.fuse = addPart(body, MG.sph, K.glow, [0, 0.72, 0], 0.2);
      P.legs = [0, 1, 2, 3].map(i => { const g = addGroup(body, [Math.cos(i * 1.57 + 0.78) * 0.35, -0.35, Math.sin(i * 1.57 + 0.78) * 0.35]); addPart(g, MG.cyl, K.armor, [0, -0.15, 0], [0.08, 0.35, 0.08]); return g; });
      anim = (st, dt) => { const sp = Math.min(1, st.speed / 4); body.position.y = 0.7 + Math.abs(Math.sin(st.t * 14)) * 0.12 * sp; P.legs.forEach((l, i) => l.rotation.x = Math.sin(st.t * 14 + i * 1.57) * 0.6 * sp); P.fuse.scale.setScalar(0.2 * (st.fuse ? 1.6 + Math.sin(st.t * 40) * 0.6 : 1 + Math.sin(st.t * 6) * 0.2)); };
      break;
    }
  }
  const out = { root, P, anim, mats: collectMats(root), K };
  leanRig(out, 0.3);
  return out;
}
