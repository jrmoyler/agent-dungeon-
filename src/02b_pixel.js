/* ------------------------------------------------------------------
   LIVING PIXELS (PixiJS) — the hand-made pixel layer Three.js stands up in 3D.
   - live atlas: torch and brazier flames, banners and floor tufts are
     redrawn at 12 fps on a small Pixi canvas that Three samples as a
     nearest-filtered texture, so fire licks and cloth sways frame by frame
     like the agent sprites;
   - prop sheet: crates, kegs, shelves, statues, chests and rune plates are
     painted per biome in the sprites' chunky outlined style and cut into
     Three textures;
   - weather: a transparent Pixi canvas over the WebGL view, on the same
     low-res pixel grid, drifts dust, ash, snow, spores, fog banks and light
     shafts at parallax depths in front of the dungeon.
   If PixiJS can't load, the same painters run on a 2D canvas and the
   weather layer is skipped.
------------------------------------------------------------------- */
const LIVE_W = 256, LIVE_H = 160, LIVE_FPS = 12;
const LIVE_CELLS = { torch: [0, 0, 16, 24], brazier: [16, 0, 24, 24], banner: [40, 0, 16, 24] };
for (let i = 0; i < 8; i++) LIVE_CELLS['tuft' + i] = [i * 16, 32, 16, 16];
const GLOW_TUFTS = new Set(['gshroom', 'crystal', 'ember']);
const WOOD = ['#21130b', '#43261a', '#6b3f22', '#94602f', '#c58a4c'], IRON = ['#14161c', '#33373f', '#5a5f6b', '#9198a6'], BONE = ['#6f6450', '#b8ab8c', '#ece2c6'], CLAY = ['#3a1c12', '#7a3c22', '#b0603a', '#d88e5a'];
const toNum = c => typeof c === 'number' ? c : typeof c === 'string' ? hexInt(c) : ((Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]));
const mixC = (a, b, t) => { const x = toNum(a), y = toNum(b); return [16, 8, 0].map(s => ((x >> s) & 255) + ((((y >> s) & 255) - ((x >> s) & 255)) * t)); };

/* pens: every painter only ever calls pen.rect, so Pixi Graphics and a 2D canvas draw identical pixels */
function pixiPen(g, ox = 0, oy = 0) {
  return { rect(x, y, w, h, c, a = 1) { w = Math.round(w); h = Math.round(h); if (w > 0 && h > 0 && a > 0) g.rect(Math.round(x) + ox, Math.round(y) + oy, w, h).fill({ color: toNum(c), alpha: Math.min(1, a) }); } };
}
function canvasPen(ctx, ox = 0, oy = 0) {
  return { rect(x, y, w, h, c, a = 1) { w = Math.round(w); h = Math.round(h); if (w <= 0 || h <= 0 || a <= 0) return; const n = toNum(c); ctx.fillStyle = `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${Math.min(1, a)})`; ctx.fillRect(Math.round(x) + ox, Math.round(y) + oy, w, h); } };
}
const dot = (P, x, y, c, a) => P.rect(x, y, 1, 1, c, a);
function ell(P, cx, cy, rx, ry, c, a) { for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / (ry + 0.5)) ** 2))); P.rect(cx - w, cy + y, w * 2 + 1, 1, c, a); } }
function seg(P, x0, y0, x1, y1, c, a) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) dot(P, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c, a); }
/* sprite-style outline: draw the shape once as a 1px dark halo, then in colour on top */
function outlined(P, ink, fn) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) fn({ rect: (x, y, w, h, c, a = 1) => { if (a >= 0.5) P.rect(x + dx, y + dy, w, h, ink); } });
  fn(P);
}

/* ---------- live cells ---------- */
function paintFlame(P, x0, y0, w, h, cols, t, seed, tongues = 1) {
  const base = y0 + h - 1, n = a => Math.sin(a) * 0.5 + 0.5;
  for (let k = 0; k < tongues; k++) {
    const side = tongues > 1 ? (k - (tongues - 1) / 2) : 0, ph = seed + k * 2.1;
    const cx = x0 + w / 2 - 0.5 + side * w * 0.26;
    const H = (h - 2) * (0.6 + 0.24 * n(t * 9 + ph) + 0.12 * n(t * 23 + ph * 3)) * (side ? 0.7 : 1);
    const W = w * (tongues > 1 ? 0.24 : 0.3);
    for (let r = 0; r < H; r++) {
      const f = r / H, half = W * Math.pow(1 - f, 0.85) * (0.78 + 0.22 * n(t * 15 + r * 0.9 + ph)) * (f < 0.18 ? 0.55 + f * 2.5 : 1);
      const sx = cx + Math.sin(t * 7 + r * 0.35 + ph) * f * f * w * 0.16, y = base - r;
      P.rect(sx - half, y, half * 2 + 1, 1, cols[2]);
      if (f < 0.82 && half > 1) P.rect(sx - half * 0.6, y, half * 1.2 + 1, 1, cols[1]);
      if (f < 0.5 && half > 1.5) P.rect(sx - half * 0.25, y, half * 0.5 + 1, 1, cols[0]);
    }
  }
  for (let s = 0; s < 2; s++) { // sparks pop off the tip
    const u = t * 1.6 + s * 0.5 + seed, ph = u % 1, k = Math.floor(u);
    dot(P, x0 + w / 2 + Math.sin(seed * 9 + s * 4 + k * 2.3) * w * 0.3, base - (h - 2) * (0.5 + ph * 0.48), cols[ph < 0.5 ? 1 : 2], 1 - ph * 0.7);
  }
}
function paintBanner(P, x0, y0, cloth, sigil, t) {
  const dark = mixC(cloth, '#000000', 0.45), lite = mixC(cloth, '#ffffff', 0.22), ink = '#0c0a10';
  const shift = y => Math.round(Math.sin(t * 2.4 + y * 0.3) * (y - 3) / 20 * 1.4);
  const notch = y => y > 18 ? (y - 18) * 1.3 : 0; // swallowtail
  P.rect(x0, y0, 16, 4, ink);
  for (let y = 3; y < 23; y++) { const s = shift(y), n = notch(y); if (!n) P.rect(x0 + 1 + s, y0 + y - 1, 14, 3, ink); else { P.rect(x0 + 1 + s, y0 + y - 1, 7.5 - n + 2, 3, ink); P.rect(x0 + 7.5 + n - 1 + s, y0 + y - 1, 8 - n + 1, 3, ink); } }
  for (let y = 3; y < 23; y++) {
    const s = shift(y), n = notch(y);
    for (let x = 2; x < 14; x++) {
      if (n && Math.abs(x - 7.5) < n) continue;
      const fold = Math.sin(x * 0.95 + t * 2.4 + y * 0.12);
      P.rect(x0 + x + s, y0 + y, 1, 1, x === 2 || x === 13 ? dark : fold > 0.55 ? lite : fold < -0.6 ? dark : cloth);
    }
  }
  P.rect(x0 + 1, y0 + 1, 14, 2, IRON[2]); P.rect(x0, y0 + 1, 1, 2, IRON[3]); P.rect(x0 + 15, y0 + 1, 1, 2, IRON[3]);
  const sh = Math.round(Math.sin(t * 2.4 + 12 * 0.3) * 0.45 * 1.4);
  for (let r = 0; r < 4; r++) P.rect(x0 + 7.5 - r + sh, y0 + 9 + r, r * 2 + 1, 1, sigil), P.rect(x0 + 7.5 - r + sh, y0 + 15 - r, r * 2 + 1, 1, sigil);
  P.rect(x0 + 7 + sh, y0 + 11, 2, 2, mixC(sigil, '#ffffff', 0.5));
}
function paintTuft(P, x0, y0, kind, B, t, i) {
  const C = pal(B.key), moss = B.moss, mo = [mixC(moss, '#000000', 0.45), moss, mixC(moss, '#ffffff', 0.3)], fl = B.flame.map(toNum);
  const glowPulse = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.7);
  const base = y0 + 15, cx = x0 + 8;
  const blades = (cols, n, hmax, spread) => { for (let k = 0; k < n; k++) { const bx = cx + Math.round((k - (n - 1) / 2) * spread), hh = Math.round(hmax * (0.55 + 0.45 * Math.abs(Math.sin(k * 2.7 + i)))), lean = (k - (n - 1) / 2) * 0.35; for (let r = 0; r < hh; r++) dot(P, bx + Math.round(lean * r / 3), base - r, cols[r < 2 ? 0 : r > hh - 3 ? 2 : 1]); } };
  const rock = (rx, ry, w, h, tone) => outlined(P, C.o, Q => { Q.rect(rx, ry, w, h, mixC(C.m, C.b, tone)); Q.rect(rx, ry, w, 1, mixC(C.b, C.h, tone)); Q.rect(rx + w - 1, ry + 1, 1, h - 1, C.d); });
  switch (kind) {
    case 'grass': blades(mo, 6, 9, 1.6); break;
    case 'straw': blades(['#6d5a2c', '#b8964a', '#e3c77a'], 6, 8, 1.6); break;
    case 'flower': blades(mo, 4, 6, 2); for (const [fx, fy, c] of [[cx - 2, base - 7, '#f2d24a'], [cx + 3, base - 6, '#e86a8a']]) { P.rect(fx - 1, fy, 3, 1, c); P.rect(fx, fy - 1, 1, 3, c); dot(P, fx, fy, '#fff6d0'); } break;
    case 'pebble': rock(cx - 4, base - 3, 4, 3, 0.4); rock(cx + 1, base - 2, 3, 2, 0.7); dot(P, cx + 5, base, C.m); break;
    case 'rubble': rock(cx - 6, base - 4, 5, 4, 0.3); rock(cx - 1, base - 6, 6, 6, 0.6); rock(cx + 4, base - 2, 3, 2, 0.8); break;
    case 'bone': outlined(P, '#1a140c', Q => { Q.rect(cx - 5, base - 2, 10, 2, BONE[1]); Q.rect(cx - 6, base - 3, 2, 4, BONE[2]); Q.rect(cx + 4, base - 3, 2, 4, BONE[2]); }); outlined(P, '#1a140c', Q => { Q.rect(cx - 2, base - 7, 5, 4, BONE[2]); Q.rect(cx - 1, base - 4, 3, 1, BONE[1]); }); dot(P, cx - 1, base - 6, '#1a140c'); dot(P, cx + 1, base - 6, '#1a140c'); break;
    case 'shroom': case 'gshroom': {
      const glow = kind === 'gshroom', cap = glow ? mixC(fl[2], fl[1], glowPulse) : mixC(moss, '#c84a3a', 0.65), spot = glow ? fl[0] : '#f4ead0';
      for (const [sx, sh, r] of [[cx - 3, 6, 3], [cx + 3, 4, 2]]) outlined(P, '#140c10', Q => { Q.rect(sx, base - sh, 1 + (r > 2 ? 1 : 0), sh, BONE[1]); ell(Q, sx + (r > 2 ? 0.5 : 0), base - sh, r, Math.max(1, r - 1), cap); });
      dot(P, cx - 4, base - 7, spot); dot(P, cx - 2, base - 6, spot); dot(P, cx + 3, base - 5, spot);
      if (!glow) blades(mo, 3, 4, 3); break;
    }
    case 'crystal': for (const [sx, sh, w, c] of [[cx - 2, 10, 3, fl[1]], [cx + 2, 6, 2, fl[2]], [cx - 5, 5, 2, fl[2]]]) outlined(P, '#0c0a18', Q => { for (let r = 0; r < sh; r++) Q.rect(sx, base - r, r > sh - 3 ? Math.max(1, w - (sh - r)) : w, 1, r > sh * 0.6 ? mixC(c, '#ffffff', 0.35 + glowPulse * 0.2) : c); }); break;
    case 'ember': rock(cx - 5, base - 4, 5, 4, 0.1); rock(cx + 1, base - 3, 4, 3, 0.2); dot(P, cx - 3, base - 2, mixC(fl[2], fl[1], glowPulse)); dot(P, cx - 2, base - 3, fl[1]); dot(P, cx + 2, base - 1, mixC(fl[2], fl[0], glowPulse)); P.rect(cx - 6, base, 12, 1, '#2a1a14'); break;
    case 'ice': for (const [sx, sh] of [[cx - 3, 8], [cx + 1, 11], [cx + 4, 5]]) outlined(P, '#16304a', Q => { for (let r = 0; r < sh; r++) Q.rect(sx, base - r, r > sh - 3 ? 1 : 2, 1, r > sh * 0.5 ? '#eafaff' : '#9fdcf4'); }); break;
  }
}
function paintLive(P, B, t) {
  const fl = B.flame.map(toNum);
  paintFlame(P, ...LIVE_CELLS.torch, fl, t, 0.3);
  paintFlame(P, ...LIVE_CELLS.brazier, fl, t * 0.92, 1.7, 3);
  paintBanner(P, LIVE_CELLS.banner[0], LIVE_CELLS.banner[1], B.banner, B.flame[1], t);
  B.cover.forEach((k, i) => paintTuft(P, ...LIVE_CELLS['tuft' + i].slice(0, 2), k, B, t, i));
}

/* ---------- static props (painted once per biome) ---------- */
const PX_PROPS = {
  crate: [30, 28], keg: [22, 28], chest: [30, 26], runeplate: [48, 48], shelf: [30, 40], statue: [22, 44], rack: [30, 34],
  urn: [16, 20], anvil: [26, 20], bigshroom: [24, 30], crystal: [18, 36], hourglass: [18, 32],
};
function paintProp(P, name, B, w, h) {
  const C = pal(B.key), fl = B.flame.map(toNum), ink = '#0d0a0c', hot = B.key === 'inferno_depths';
  const plank = (x, y, pw, ph, wd = WOOD) => { P.rect(x, y, pw, ph, wd[2]); P.rect(x, y, pw, 1, wd[3]); P.rect(x, y + ph - 1, pw, 1, wd[1]); for (let k = 2; k < pw - 1; k += 5) dot(P, x + k, y + 1 + (k % 3), wd[1]); };
  switch (name) {
    case 'crate': {
      const wd = hot ? ['#120a08', '#2a1610', '#46261a', '#6a3c24', '#8a5a34'] : WOOD;
      outlined(P, ink, Q => Q.rect(1, 3, w - 2, h - 4, wd[1]));
      P.rect(1, 3, w - 2, 5, wd[3]); P.rect(1, 3, w - 2, 1, wd[4]); // lid seen from above
      for (let k = 0; k < 4; k++) plank(2, 8 + k * 4.5, w - 4, 4, wd);
      seg(P, 3, 9, w - 4, h - 3, wd[1]); seg(P, 3, 10, w - 4, h - 2, wd[3]);
      for (const x of [1, w - 4]) { P.rect(x, 3, 3, h - 4, IRON[1]); P.rect(x, 3, 1, h - 4, IRON[2]); dot(P, x + 1, 6, IRON[3]); dot(P, x + 1, h - 4, IRON[3]); }
      if (hot) for (let k = 0; k < 6; k++) dot(P, 5 + k * 4, 10 + (k * 7) % 12, k % 2 ? fl[1] : fl[2]);
      break;
    }
    case 'keg': {
      const band = B.key === 'toxic_hive' ? '#4f8a24' : hot ? '#2a2a2e' : '#9a2a22';
      outlined(P, ink, Q => { ell(Q, 11, 15, 9, 12, WOOD[2]); Q.rect(2, 4, 18, 22, WOOD[2]); });
      for (let x = 3; x < 19; x += 4) P.rect(x, 4, 1, 22, WOOD[1]);
      P.rect(2, 4, 4, 22, WOOD[3]); ell(P, 11, 4, 8, 2, WOOD[1]); ell(P, 11, 4, 6, 1, WOOD[0]);
      for (const y of [7, 21]) { P.rect(2, y, 18, 2, IRON[1]); P.rect(2, y, 18, 1, IRON[3]); }
      P.rect(2, 12, 18, 6, band); P.rect(2, 12, 18, 1, mixC(band, '#ffffff', 0.3));
      if (B.key === 'toxic_hive') { for (const [x, l] of [[6, 4], [11, 7], [15, 3]]) P.rect(x, 18, 2, l, '#9be84a'); ell(P, 11, 3, 5, 1, '#9be84a'); }
      else { P.rect(10, 13, 2, 4, '#f4ead0'); P.rect(9, 14, 4, 1, '#f4ead0'); dot(P, 8, 13, '#f4ead0'); dot(P, 13, 16, '#f4ead0'); dot(P, 8, 16, '#f4ead0'); dot(P, 13, 13, '#f4ead0'); }
      break;
    }
    case 'chest': {
      outlined(P, ink, Q => { Q.rect(1, 6, w - 2, h - 7, WOOD[2]); ell(Q, w / 2 - 0.5, 7, w / 2 - 1, 5, WOOD[3]); });
      ell(P, w / 2 - 0.5, 7, w / 2 - 2, 4, WOOD[3]); P.rect(1, 9, w - 2, 1, WOOD[1]); plank(2, 11, w - 4, 6); plank(2, 17, w - 4, 6);
      for (const x of [3, w - 6]) { P.rect(x, 3, 3, h - 4, '#b88a2e'); P.rect(x, 3, 1, h - 4, '#f2cf6a'); }
      P.rect(w / 2 - 3, 9, 6, 7, '#b88a2e'); P.rect(w / 2 - 2, 10, 4, 5, '#f2cf6a'); P.rect(w / 2 - 1, 12, 2, 2, ink);
      break;
    }
    case 'runeplate': { // round floor plate for relays and the exit, seen from above
      const r0 = w / 2 - 1;
      ell(P, w / 2, h / 2, r0, r0, C.o); ell(P, w / 2, h / 2, r0 - 1, r0 - 1, C.d); ell(P, w / 2, h / 2, r0 - 3, r0 - 3, C.b); ell(P, w / 2, h / 2, r0 - 5, r0 - 5, C.m);
      for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283, x = w / 2 + Math.cos(a) * (r0 - 2), y = h / 2 + Math.sin(a) * (r0 - 2); P.rect(x - 1, y - 1, 2, 2, C.h); }
      for (let k = 0; k < 64; k++) { const a = k / 64 * 6.283; if (k % 8 < 5) dot(P, w / 2 + Math.cos(a) * (r0 - 8), h / 2 + Math.sin(a) * (r0 - 8), fl[1]); }
      for (let k = 0; k < 3; k++) { const a = k / 3 * 6.283 - 1.57, b = a + 2.094; seg(P, w / 2 + Math.cos(a) * 12, h / 2 + Math.sin(a) * 12, w / 2 + Math.cos(b) * 12, h / 2 + Math.sin(b) * 12, fl[2]); }
      ell(P, w / 2, h / 2, 3, 3, fl[1]); dot(P, w / 2, h / 2, fl[0]);
      break;
    }
    case 'shelf': {
      outlined(P, ink, Q => Q.rect(1, 1, w - 2, h - 2, WOOD[1]));
      P.rect(1, 1, w - 2, 2, WOOD[3]); P.rect(1, 1, 2, h - 2, WOOD[2]); P.rect(w - 3, 1, 2, h - 2, WOOD[2]);
      const books = ['#8a2a2a', '#2a4a8a', '#3a6a3a', '#7a5a2a', '#5a2a6a', mixC(B.banner, '#000000', 0.1)];
      for (let row = 0; row < 3; row++) {
        const y = 4 + row * 12; P.rect(3, y + 10, w - 6, 2, WOOD[3]); P.rect(3, y, w - 6, 10, WOOD[0]);
        for (let x = 3; x < w - 4;) { const bw = 2 + ((x * 7 + row * 3) % 3), bh = 6 + ((x * 5 + row) % 4), c = books[(x + row * 2) % books.length]; if ((x + row) % 9 === 4) { x += 2; continue; } P.rect(x, y + 10 - bh, bw, bh, c); P.rect(x, y + 10 - bh, 1, bh, mixC(c, '#ffffff', 0.3)); dot(P, x, y + 12 - bh, '#e8d090'); x += bw; }
      }
      break;
    }
    case 'statue': {
      const s = [C.m, C.b, C.h, mixC(C.h, '#ffffff', 0.35)];
      outlined(P, ink, Q => { Q.rect(2, h - 9, w - 4, 8, s[1]); Q.rect(6, 12, w - 12, h - 21, s[2]); ell(Q, w / 2 - 0.5, 8, 4, 4, s[2]); Q.rect(3, 15, 3, 12, s[2]); Q.rect(w - 6, 13, 3, 10, s[2]); Q.rect(w - 5, 2, 1, 22, IRON[2]); });
      P.rect(2, h - 9, w - 4, 2, s[3]); P.rect(6, 12, 3, h - 21, s[3]); ell(P, w / 2 - 1.5, 7, 2, 2, s[3]);
      P.rect(7, 22, w - 14, 1, s[0]); P.rect(w / 2 - 1, 16, 1, h - 26, s[1]); dot(P, w / 2 - 2, 8, s[0]); dot(P, w / 2 + 1, 8, s[0]);
      for (let k = 0; k < 5; k++) dot(P, 3 + (k * 5) % (w - 6), h - 6 + (k % 2), B.key === 'glacial_vault' ? '#eafaff' : mixC(B.moss, '#000000', 0.2));
      if (B.key === 'glacial_vault') { P.rect(5, 4, w - 10, 2, '#eafaff'); P.rect(2, h - 10, w - 4, 1, '#eafaff'); }
      break;
    }
    case 'rack': {
      outlined(P, ink, Q => { Q.rect(2, 4, 2, h - 5, WOOD[2]); Q.rect(w - 4, 4, 2, h - 5, WOOD[2]); Q.rect(1, 8, w - 2, 2, WOOD[3]); Q.rect(1, h - 8, w - 2, 2, WOOD[3]);
        for (const [x, l] of [[8, 26], [14, 30], [20, 24]]) { Q.rect(x, h - 2 - l, 2, l, IRON[2]); Q.rect(x - 2, h - 8, 6, 1, '#b88a2e'); }
        Q.rect(24, 6, 1, h - 8, WOOD[3]); Q.rect(23, 3, 3, 4, IRON[3]); });
      for (const [x, l] of [[8, 26], [14, 30], [20, 24]]) { dot(P, x, h - 2 - l, IRON[3]); P.rect(x, h - 1 - l, 1, l - 8, IRON[3]); }
      break;
    }
    case 'urn': {
      outlined(P, ink, Q => { ell(Q, 8, 12, 6, 6, CLAY[2]); Q.rect(5, 2, 6, 5, CLAY[2]); Q.rect(4, 1, 8, 2, CLAY[3]); });
      ell(P, 6, 10, 2, 3, CLAY[3]); P.rect(3, 12, 10, 1, CLAY[1]); P.rect(4, 14, 8, 1, mixC(B.banner, '#000000', 0.2)); P.rect(6, 1, 4, 1, CLAY[0]);
      break;
    }
    case 'anvil': {
      outlined(P, ink, Q => { Q.rect(2, 3, w - 6, 5, IRON[2]); Q.rect(w - 4, 4, 3, 2, IRON[2]); Q.rect(8, 8, 8, 5, IRON[1]); Q.rect(4, 13, 16, 6, WOOD[2]); });
      P.rect(2, 3, w - 6, 1, IRON[3]); P.rect(4, 13, 16, 1, WOOD[3]); P.rect(10, 9, 4, 1, IRON[2]);
      break;
    }
    case 'bigshroom': {
      const cap = B.key === 'toxic_hive' ? mixC(fl[2], fl[1], 0.3) : mixC(fl[2], '#2a1450', 0.3);
      outlined(P, ink, Q => { Q.rect(9, 12, 6, h - 13, BONE[1]); ell(Q, 12, 10, 11, 7, cap); Q.rect(4, h - 4, 4, 3, BONE[1]); ell(Q, 6, h - 6, 3, 2, cap); });
      P.rect(9, 12, 2, h - 13, BONE[2]); ell(P, 10, 7, 6, 3, mixC(cap, '#ffffff', 0.25));
      for (const [x, y] of [[6, 9], [12, 6], [17, 10], [10, 12], [15, 13]]) P.rect(x, y, 2, 1, fl[0]);
      break;
    }
    case 'crystal': {
      const c = fl[1], cl = mixC(c, '#ffffff', 0.45), cd = mixC(c, '#000000', 0.35);
      outlined(P, ink, Q => { for (let r = 0; r < h - 4; r++) { const half = r > h - 12 ? Math.max(0, (h - 4 - r) * 0.6) : 4; Q.rect(w / 2 - half, h - 2 - r, half * 2, 1, c); } ell(Q, w / 2, h - 3, 7, 2, C.m); for (let r = 0; r < 12; r++) Q.rect(2 + r * 0.2, h - 3 - r, 3, 1, cd); });
      for (let r = 0; r < h - 10; r++) dot(P, w / 2 - 2, h - 3 - r, cl); P.rect(w / 2 + 1, 8, 1, h - 14, cd);
      break;
    }
    case 'hourglass': {
      outlined(P, ink, Q => { Q.rect(1, 1, w - 2, 3, '#b88a2e'); Q.rect(1, h - 4, w - 2, 3, '#b88a2e'); Q.rect(2, 4, 2, h - 8, WOOD[2]); Q.rect(w - 4, 4, 2, h - 8, WOOD[2]);
        for (let r = 0; r < h - 8; r++) { const f = Math.abs(r - (h - 8) / 2) / ((h - 8) / 2); Q.rect(w / 2 - 1 - f * 4, 4 + r, 2 + f * 8, 1, '#cfe8ee'); } });
      for (let r = 0; r < 7; r++) P.rect(w / 2 - 1 - (r / 7) * 4, h - 5 - r, 2 + (r / 7) * 8, 1, '#e3c77a');
      P.rect(w / 2 - 0.5, h / 2, 1, 6, '#e3c77a'); P.rect(1, 1, w - 2, 1, '#f2cf6a');
      break;
    }
  }
}

/* ---------- PIX ---------- */
const PIX = { pixi: null, ok: false, canvas: null, liveTex: null, app: null, gfx: null, ctx: null, biome: null, acc: 0, t: 0, weather: null };
async function initPix() {
  try { PIX.pixi = await import('pixi.js'); }
  catch (e) { console.warn('PixiJS unavailable, painting on a 2D canvas', e); }
  if (PIX.pixi) {
    try {
      const app = new PIX.pixi.Application();
      await app.init({ width: LIVE_W, height: LIVE_H, backgroundAlpha: 0, antialias: false, resolution: 1, autoDensity: false, autoStart: false, preserveDrawingBuffer: true, preference: 'webgl', powerPreference: 'low-power' });
      app.ticker?.stop();
      PIX.app = app; PIX.gfx = new PIX.pixi.Graphics(); app.stage.addChild(PIX.gfx); PIX.canvas = app.canvas; PIX.ok = true;
    } catch (e) { console.warn('PixiJS init failed, painting on a 2D canvas', e); PIX.app = null; }
  }
  if (!PIX.ok) { PIX.canvas = document.createElement('canvas'); PIX.canvas.width = LIVE_W; PIX.canvas.height = LIVE_H; PIX.ctx = PIX.canvas.getContext('2d'); }
  const t = new THREE.CanvasTexture(PIX.canvas);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  PIX.liveTex = t;
  if (PIX.ok) try { PIX.weather = await initWeather(); } catch (e) { console.warn('weather layer off', e); }
}
function pixPen() { return PIX.ok ? pixiPen(PIX.gfx) : canvasPen(PIX.ctx); }
function pixFlush() {
  if (PIX.ok) PIX.app.renderer.render(PIX.app.stage);
  PIX.liveTex.needsUpdate = true;
}
function pixClear() { if (PIX.ok) PIX.gfx.clear(); else PIX.ctx.clearRect(0, 0, LIVE_W, LIVE_H); }
/* paint a list of [name, w, h, painter] side by side on the Pixi canvas and cut each into its own 2D canvas */
function pixSheet(items) {
  pixClear(); const P = pixPen(), at = {};
  let x = 0, y = 0, rowH = 0;
  for (const [name, w, h, fn] of items) {
    if (x + w + 2 > LIVE_W) { x = 0; y += rowH + 2; rowH = 0; }
    const ox = x + 1, oy = y + 1; at[name] = [ox, oy, w, h];
    fn({ rect: (px, py, pw, ph, c, a) => { const x0 = Math.max(px, 0), y0 = Math.max(py, 0), x1 = Math.min(px + pw, w), y1 = Math.min(py + ph, h); if (x1 > x0 && y1 > y0) P.rect(x0 + ox, y0 + oy, x1 - x0, y1 - y0, c, a); } }, w, h);
    x += w + 3; rowH = Math.max(rowH, h + 1);
  }
  pixFlush();
  const out = {};
  for (const [name, [sx, sy, w, h]] of Object.entries(at)) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(PIX.canvas, sx, sy, w, h, 0, 0, w, h); out[name] = c; }
  return out;
}
function nearestTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; }
/* repaint the props for a biome into PROPS (crate, keg, chest, shelf...) and restart the live cells */
function pixBiome(bk) {
  const B = BIOMES[bk]; PIX.biome = bk;
  const cut = pixSheet(Object.entries(PX_PROPS).map(([name, [w, h]]) => [name, w, h, (P, w, h) => paintProp(P, name, B, w, h)]));
  for (const [name, c] of Object.entries(cut)) { PROPS[name]?.tex.dispose(); PROPS[name] = { tex: nearestTex(c), w: c.width, h: c.height, url: null, ww: c.width / PROP_TEXELS }; }
  PIX.acc = 1; tickPix(0);
  PIX.weather?.setBiome(B);
}
const PROP_TEXELS = 20; // painted props: texels per world unit, same as the floor
function tickPix(dt) {
  if (!PIX.liveTex || !PIX.biome) return;
  PIX.t += dt; PIX.acc += dt;
  if (PIX.acc < 1 / LIVE_FPS) return; PIX.acc = 0;
  pixClear(); paintLive(pixPen(), BIOMES[PIX.biome], PIX.t); pixFlush();
}

/* ---------- weather layer ---------- */
const WEATHER = {
  dust:   { n: 46, cols: [0xfff0c8, 0xe8d4a0], size: [1, 1], vx: [-2, 2], vy: [-1.5, 1], tw: 1, add: true, fog: 0.08, shafts: 3 },
  wisps:  { n: 22, cols: [0xc49bff, 0x8a6aff], size: [1, 2], vx: [-3, 3], vy: [-5, -2], tw: 0.6, add: true, fog: 0.16, shafts: 0 },
  ash:    { n: 60, cols: [0x6a6460, 0x8a8078, 0xffb050], size: [1, 1], vx: [-3, 3], vy: [5, 10], tw: 0.3, add: false, fog: 0.12, shafts: 2 },
  embers: { n: 48, cols: [0xff8a2a, 0xffc860, 0xff5a1a], size: [1, 2], vx: [-4, 4], vy: [-16, -7], tw: 0.8, add: true, fog: 0.1, shafts: 0 },
  snow:   { n: 110, cols: [0xf4fbff, 0xd8ecff], size: [1, 2], vx: [3, 9], vy: [10, 20], tw: 0.1, add: false, fog: 0.14, shafts: 2 },
  spores: { n: 44, cols: [0xc8f06a, 0xe8f0a0, 0x9bea52], size: [1, 2], vx: [-3, 3], vy: [-3, 2], tw: 1, add: true, fog: 0.14, shafts: 0, flies: 8 },
  stars:  { n: 50, cols: [0xd8c0ff, 0x9ad8ff, 0xffffff], size: [1, 1], vx: [-0.5, 0.5], vy: [-0.5, 0.5], tw: 2, add: true, fog: 0.1, shafts: 0 },
};
async function initWeather() {
  const X = PIX.pixi, app = new X.Application();
  await app.init({ width: 2, height: 2, backgroundAlpha: 0, antialias: false, resolution: 1, autoDensity: false, autoStart: false, preference: 'webgl', powerPreference: 'low-power' });
  app.ticker?.stop();
  const cv = app.canvas; cv.id = 'px'; cv.setAttribute('aria-hidden', 'true'); canvas.after(cv);
  const fogL = new X.Container(), shaftL = new X.Container(), dropL = new X.Container();
  app.stage.addChild(shaftL, fogL, dropL);
  let cfg = null, drops = [], fogs = [], shafts = [], fogTex = null, W = 2, H = 2;
  const PAD = 24;
  function blobTex(col) { // dithered pixel cloud
    const g = new X.Graphics(), w = 120, h = 46;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = ((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2; if (d < 1 && (x + y * 3) % (d < 0.45 ? 2 : 3) === 0) g.rect(x, y, 1, 1).fill({ color: col }); }
    const t = app.renderer.generateTexture({ target: g, resolution: 1, antialias: false }); g.destroy(); t.source.scaleMode = 'nearest'; return t;
  }
  function spawn(p, anywhere) {
    p.k = rr(0.6, 1.7); p.x = rr(0, W + PAD); p.y = anywhere ? rr(0, H + PAD) : (cfg.vy[0] > 0 ? 0 : cfg.vy[1] < 0 ? H + PAD - 1 : rr(0, H + PAD));
    p.vx = rr(...cfg.vx); p.vy = rr(...cfg.vy); p.ph = rr(0, 6.28); p.life = rr(4, 10);
  }
  function setBiome(B) {
    cfg = WEATHER[B.weather] || WEATHER.dust;
    dropL.removeChildren().forEach(s => s.destroy()); fogL.removeChildren().forEach(s => s.destroy()); shaftL.removeChildren().forEach(s => s.destroy());
    fogTex?.destroy(true); fogTex = blobTex(toNum(mixC(B.fog, '#c8d0e0', 0.35)));
    drops = []; const n = Math.round(cfg.n * (IS_TOUCH ? 0.6 : 1));
    for (let i = 0; i < n + (cfg.flies || 0); i++) {
      const fly = i >= n, s = new X.Sprite(X.Texture.WHITE), sz = fly ? 2 : cfg.size[Math.random() < 0.7 ? 0 : 1];
      s.width = sz; s.height = sz; s.tint = fly ? 0xeaff8a : pick(cfg.cols); if (cfg.add || fly) s.blendMode = 'add';
      const p = { s, fly }; spawn(p, true); dropL.addChild(s); drops.push(p);
    }
    fogs = []; for (let i = 0; i < 4; i++) { const s = new X.Sprite(fogTex); s.alpha = cfg.fog; fogL.addChild(s); fogs.push({ s, x: rr(0, 400), y: rr(0, 300), vx: rr(1.5, 4) * (i % 2 ? 1 : -1), k: rr(1.1, 1.4) }); }
    shafts = []; for (let i = 0; i < cfg.shafts; i++) {
      const g = new X.Graphics(), w = 18 + i * 9;
      for (let y = 0; y < 240; y += 2) g.rect(Math.round(y * 0.45), y, w, 2).fill({ color: toNum(B.flame[0]), alpha: 0.5 });
      g.blendMode = 'add'; shaftL.addChild(g); shafts.push({ g, x: rr(0, 400), ph: rr(0, 6), k: 1.15 });
    }
  }
  function resizeW() {
    W = VIEW.lw; H = VIEW.lh; app.renderer.resize(W, H);
    const css = VIEW.scale / DPR; cv.style.width = W * css + 'px'; cv.style.height = H * css + 'px';
    cv.style.left = -VIEW.cropX * css + 'px'; cv.style.top = -VIEW.cropY * css + 'px';
  }
  const wrap = (v, m) => ((v % m) + m) % m;
  function update(dt, t) {
    if (!cfg) return;
    const ppu = PPU * VIEW.zoom, cx = VIEW.tx * ppu, cy = VIEW.tz * Math.sin(CAM_PITCH) * ppu, Wp = W + PAD, Hp = H + PAD;
    for (const p of drops) {
      p.ph += dt * (p.fly ? 1.3 : 1); p.life -= dt;
      p.x += (p.vx + Math.sin(p.ph * 0.7) * (p.fly ? 6 : 2)) * dt; p.y += (p.vy + Math.cos(p.ph) * (p.fly ? 5 : 0.5)) * dt * p.k;
      if (p.life <= 0) spawn(p, true);
      p.s.x = Math.round(wrap(p.x - cx * p.k, Wp) - PAD / 2); p.s.y = Math.round(wrap(p.y - cy * p.k, Hp) - PAD / 2);
      p.s.alpha = p.fly ? 0.35 + 0.65 * Math.max(0, Math.sin(p.ph * 2.2)) : clamp(0.35 + Math.sin(p.ph * 3 * cfg.tw) * 0.35 * cfg.tw + p.k * 0.2, 0.15, 1) * Math.min(1, p.life);
    }
    for (const f of fogs) { f.x += f.vx * dt; f.s.x = Math.round(wrap(f.x - cx * f.k, W + 240) - 120); f.s.y = Math.round(wrap(f.y - cy * f.k, H + 92) - 46); }
    for (const s of shafts) { s.ph += dt; s.g.x = Math.round(wrap(s.x - cx * s.k, W + 160) - 120); s.g.y = -20; s.g.alpha = 0.05 + 0.03 * Math.sin(s.ph * 0.6); }
    app.renderer.render(app.stage);
  }
  return { setBiome, resize: resizeW, update, set visible(v) { cv.style.display = v ? '' : 'none'; } };
}

/* ---------- UI kit: HUD frames, sockets, health bar and icons, painted like the props ----------
   Frames are 9-sliced by CSS (border-image, 8px slices drawn at 2x); sockets and the bar are drawn at
   half their CSS size and blown up 2x with hard edges. Icons replace the sheet icons for pickups, XP
   shards, buff chips and toasts, in the HUD and in the world. */
const UI_ICON = {};
const UI_INK = '#0d0a0c', STONE = ['#1a1714', '#36302a', '#5a524a', '#857a6c', '#b3a690'], GOLD = ['#5a3a10', '#b88a2e', '#f2cf6a', '#fff2b8'];
function paintFrame(P, w, h, rim, field, o = {}) {
  P.rect(0, 0, w, h, UI_INK);
  P.rect(1, 1, w - 2, h - 2, rim[2]); P.rect(1, 1, w - 2, 1, rim[3]); P.rect(1, 1, 1, h - 2, rim[3]); P.rect(1, h - 2, w - 2, 1, rim[1]); P.rect(w - 2, 1, 1, h - 2, rim[1]);
  if (o.grain) for (let x = 3; x < w - 3; x += 5) { P.rect(x, 2, 2, 1, rim[1]); P.rect(x + 2, h - 4, 2, 1, rim[3]); }
  P.rect(3, 3, w - 6, h - 6, UI_INK);
  P.rect(4, 4, w - 8, h - 8, field[0], o.alpha ?? 0.92); P.rect(4, 4, w - 8, 1, field[1], o.alpha ?? 0.92);
  for (const [x, y] of [[2, 2], [w - 4, 2], [2, h - 4], [w - 4, h - 4]]) { P.rect(x, y, 2, 2, o.stud ?? GOLD[1]); P.rect(x, y, 1, 1, o.studHi ?? GOLD[3]); }
}
function paintSocket(P, w, h, rim, gem) {
  P.rect(1, 0, w - 2, h, UI_INK); P.rect(0, 1, w, h - 2, UI_INK);
  P.rect(1, 1, w - 2, h - 2, rim[2]); P.rect(1, 1, w - 2, 1, rim[3]); P.rect(1, 1, 1, h - 2, rim[3]); P.rect(1, h - 2, w - 2, 1, rim[1]); P.rect(w - 2, 1, 1, h - 2, rim[1]);
  for (let x = 4; x < w - 4; x += 6) P.rect(x, h - 3, 3, 1, rim[1]);
  P.rect(4, 4, w - 8, h - 8, UI_INK); P.rect(5, 5, w - 10, h - 10, '#120f0d'); P.rect(5, 5, w - 10, 1, '#221c17');
  if (gem) { const cx = Math.floor(w / 2); P.rect(cx - 2, 0, 4, 3, UI_INK); P.rect(cx - 1, 0, 2, 2, gem); }
}
function paintBar(P, w, h) {
  P.rect(0, 1, w, h - 2, UI_INK); P.rect(1, 0, w - 2, h, UI_INK);
  P.rect(1, 1, w - 2, h - 2, STONE[2]); P.rect(1, 1, w - 2, 1, STONE[3]);
  P.rect(2, 3, w - 4, h - 6, '#3a0a0c');
  const fill = ['#6a1418', '#b0222a', '#e8434a', '#ff8a7a'];
  P.rect(2, 3, w - 4, h - 6, fill[1]); P.rect(2, 3, w - 4, 2, fill[2]); P.rect(2, 4, w - 4, 1, fill[3]); P.rect(2, h - 5, w - 4, 2, fill[0]);
  for (let x = 10; x < w - 4; x += 10) P.rect(x, 3, 1, h - 6, fill[0]);
  P.rect(0, 0, 2, 2, GOLD[1]); P.rect(w - 2, 0, 2, 2, GOLD[1]); P.rect(0, h - 2, 2, 2, GOLD[1]); P.rect(w - 2, h - 2, 2, 2, GOLD[1]);
}
const ICONS = {
  ic_heal: (P) => outlined(P, UI_INK, Q => { Q.rect(6, 1, 4, 2, WOOD[3]); Q.rect(6, 3, 4, 3, '#cfe8ee'); ell(Q, 8, 10, 5, 4, '#cfe8ee'); ell(Q, 8, 11, 4, 3, '#d8303a'); Q.rect(5, 8, 2, 2, '#ff8a8a'); Q.rect(4, 11, 8, 1, '#ff5a5a'); }),
  ic_flame: (P) => paintFlame(P, 0, 0, 16, 16, ['#fff4c4', '#ffc04a', '#e4561f'].map(toNum), 0.35, 1.2),
  ic_round: (P) => outlined(P, UI_INK, Q => { for (const [x, y, w] of [[9, 1, 3], [8, 3, 3], [7, 5, 3], [5, 7, 7], [8, 9, 3], [7, 11, 3], [6, 13, 2]]) Q.rect(x, y, w, 2, '#ffd45a'); Q.rect(9, 1, 1, 6, '#fff6c0'); }),
  ic_orb: (P) => { outlined(P, UI_INK, Q => ell(Q, 8, 8, 6, 6, '#2a5ac8')); ell(P, 8, 8, 5, 5, '#3c7cf0'); ell(P, 7, 7, 3, 3, '#7cb8ff'); P.rect(5, 5, 2, 2, '#e8f4ff'); },
  ic_hex: (P) => outlined(P, UI_INK, Q => { Q.rect(3, 1, 4, 1, '#bff6ff'); Q.rect(2, 2, 6, 2, '#6ad8f4'); Q.rect(1, 4, 8, 2, '#3aa8d8'); Q.rect(2, 6, 6, 1, '#2a80b8'); Q.rect(3, 7, 4, 1, '#2a80b8'); Q.rect(4, 8, 2, 1, '#1a5a90'); Q.rect(3, 2, 1, 3, '#ffffff'); }),
  ic_lock: (P) => outlined(P, UI_INK, Q => { Q.rect(3, 2, 6, 2, GOLD[2]); Q.rect(2, 3, 2, 5, GOLD[2]); Q.rect(8, 3, 2, 5, GOLD[2]); Q.rect(3, 7, 6, 2, GOLD[2]); Q.rect(5, 4, 2, 3, UI_INK); Q.rect(6, 9, 2, 6, GOLD[1]); Q.rect(8, 12, 3, 1, GOLD[1]); Q.rect(8, 14, 2, 1, GOLD[1]); Q.rect(3, 2, 3, 1, GOLD[3]); }),
  ic_ember: (P) => { outlined(P, UI_INK, Q => { ell(Q, 8, 8, 6, 6, '#c8302a'); }); ell(P, 8, 8, 4, 4, '#f4ead0'); ell(P, 8, 8, 2, 2, '#c8302a'); P.rect(8, 8, 1, 1, '#ffffff'); },
  ic_guard: (P) => outlined(P, UI_INK, Q => { Q.rect(2, 2, 12, 7, STONE[3]); for (let y = 9; y < 15; y++) Q.rect(2 + (y - 8), y, 12 - (y - 8) * 2, 1, STONE[3]); Q.rect(7, 2, 2, 11, '#b0222a'); Q.rect(3, 5, 10, 2, '#b0222a'); Q.rect(2, 2, 12, 1, STONE[4]); }),
  ic_void: (P) => outlined(P, UI_INK, Q => { ell(Q, 8, 7, 6, 5, '#e8dcc0'); Q.rect(5, 11, 6, 3, '#e8dcc0'); Q.rect(4, 6, 3, 3, '#3a1a5a'); Q.rect(9, 6, 3, 3, '#3a1a5a'); Q.rect(7, 10, 2, 1, '#3a1a5a'); Q.rect(6, 13, 1, 1, '#3a1a5a'); Q.rect(9, 13, 1, 1, '#3a1a5a'); }),
  ic_toxin: (P) => { outlined(P, UI_INK, Q => { Q.rect(6, 1, 4, 3, '#cfe8ee'); ell(Q, 8, 10, 5, 5, '#cfe8ee'); }); ell(P, 8, 11, 4, 3, '#5ac83a'); P.rect(6, 9, 1, 1, '#d8ff8a'); P.rect(9, 11, 1, 1, '#d8ff8a'); P.rect(6, 1, 4, 1, WOOD[3]); },
};
const ICON_SIZE = { ic_hex: [10, 10] };
function pixUiKit() {
  const wood = [WOOD[0], WOOD[1], WOOD[2], WOOD[3]], field = ['#17120f', '#241c16'];
  const cut = pixSheet([
    ['panel', 32, 32, (P, w, h) => paintFrame(P, w, h, STONE.slice(1), field)],
    ['banner', 32, 24, (P, w, h) => paintFrame(P, w, h, wood, field, { grain: true, stud: IRON[2], studHi: IRON[3] })],
    ['frame', 24, 24, (P, w, h) => paintFrame(P, w, h, wood, field, { grain: true })],
    ['frame_gold', 24, 24, (P, w, h) => paintFrame(P, w, h, GOLD, field, { stud: '#d8303a', studHi: '#ff9a9a' })],
    ['slot_a', 31, 29, (P, w, h) => paintSocket(P, w, h, STONE.slice(1))],
    ['slot_b', 31, 29, (P, w, h) => paintSocket(P, w, h, wood)],
    ['slot_gold', 37, 34, (P, w, h) => paintSocket(P, w, h, GOLD, '#d8303a')],
    ['portrait', 35, 32, (P, w, h) => paintSocket(P, w, h, GOLD, '#3c7cf0')],
    ['bar', 96, 16, paintBar],
    ...Object.entries(ICONS).map(([k, fn]) => [k, ...(ICON_SIZE[k] || [16, 16]), fn]),
  ]);
  const root = document.documentElement.style;
  for (const [name, c] of Object.entries(cut)) {
    const url = c.toDataURL('image/png');
    if (name.startsWith('ic_')) { UI_ICON[name] = url; PROPS[name]?.tex.dispose(); PROPS[name] = { tex: nearestTex(c), w: c.width, h: c.height, url, ww: c.width / PROP_TEXELS }; }
    else root.setProperty('--ui-' + name.replace('_', '-'), `url(${url})`);
  }
  document.querySelectorAll('img[data-icon]').forEach(i => { i.src = UI_ICON[i.dataset.icon]; });
}
const iconURL = k => UI_ICON[k] || `atlas/props/${k}.webp`;
