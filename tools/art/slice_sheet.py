"""Cut the props + HUD sheet (art/source/props_hud_sheet.jpg) into alpha PNGs.

The sheet is a JPEG on a dark navy grid, so alpha comes from a flood fill that
starts at each crop's border and spreads through background-coloured pixels.
Dark paint enclosed by an outline is never reached, so it stays opaque; for HUD
frames that enclosed backdrop is kept slightly translucent instead.

usage: python3 -I tools/art/slice_sheet.py [sheet] [outDir]
"""
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SHEET = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'art', 'source', 'props_hud_sheet.jpg')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'atlas', 'props')

# (name, x0, y0, x1, y1, kind) — boxes measured from the sheet's row/column projections
ITEMS = [
    ('crate_tech', 84, 52, 207, 230, 'prop'), ('server', 322, 52, 405, 230, 'prop'), ('pad', 516, 52, 637, 230, 'prop'),
    ('terminal', 748, 52, 839, 230, 'prop'), ('tesla', 973, 52, 1046, 230, 'prop'),
    ('ice_pillar', 106, 269, 186, 448, 'prop'), ('barrel', 306, 269, 417, 448, 'prop'), ('crystal', 544, 269, 612, 448, 'prop'),
    ('crate_hot', 732, 269, 854, 448, 'prop'), ('cache', 959, 269, 1063, 448, 'prop'),
    ('ic_guard', 80, 557, 108, 630, 'icon'), ('ic_ember', 196, 557, 224, 630, 'icon'), ('ic_lock', 312, 557, 340, 630, 'icon'),
    ('ic_hex', 423, 557, 468, 630, 'icon'), ('ic_orb', 544, 557, 586, 630, 'icon'),
    ('ic_heal', 69, 675, 118, 750, 'icon'), ('ic_round', 202, 675, 217, 750, 'icon'), ('ic_flame', 308, 675, 343, 750, 'icon'),
    ('ic_toxin', 432, 675, 459, 750, 'icon'), ('ic_void', 549, 675, 580, 750, 'icon'),
    ('slot_a', 69, 867, 157, 947, 'frame'), ('slot_b', 226, 867, 315, 947, 'frame'), ('slot_c', 382, 867, 471, 947, 'frame'),
    ('slot_gold', 540, 867, 628, 947, 'frame'),
    ('panel', 79, 1045, 478, 1228, 'frame'), ('banner', 73, 1326, 483, 1420, 'frame'), ('bar', 77, 1528, 481, 1596, 'bar'),
]
BG = np.array([1.0, 9.0, 32.0])
PAD = 5


def background_like(px):
    """True where a pixel reads as the navy backdrop or its faint grid."""
    d = np.sqrt(((px - BG) ** 2).sum(-1))
    return (d < 30) & (px.max(-1) < 58)


def flood(mask):
    """Pixels of `mask` connected to the crop border."""
    h, w = mask.shape
    seen = np.zeros_like(mask)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if mask[y, x] and not seen[y, x]:
                seen[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if mask[y, x] and not seen[y, x]:
                seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; q.append((ny, nx))
    return seen


def dilate(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r:
                continue
            out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


def cut(img, box, kind):
    x0, y0, x1, y1 = box
    crop = img[y0 - PAD:y1 + PAD + 1, x0 - PAD:x1 + PAD + 1].astype(float)
    bgl = background_like(crop)
    # backdrop within 2px of bright paint can't carry the fill, which seals hairline gaps in
    # outlines; the dark ring it leaves behind reads as the sprite's outline
    near = dilate(crop.max(-1) > 90, 3 if kind == "prop" else 2)
    outside = flood(bgl & ~near)
    alpha = np.where(outside, 0.0, 1.0)
    if kind in ('frame', 'bar'):
        # enclosed backdrop: keep as a translucent plate so the game shows through a little
        inner = bgl & ~outside & ~near
        alpha = np.where(inner, 0.86, alpha)
    rim = ~outside & bgl & dilate(outside, 1)
    alpha = np.where(rim, 0.55, alpha)
    rgba = np.dstack([crop, alpha * 255]).clip(0, 255).astype(np.uint8)
    ys, xs = np.where(alpha > 0.05)
    rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return Image.fromarray(rgba, 'RGBA')


def main():
    img = np.asarray(Image.open(SHEET).convert('RGB'))
    os.makedirs(OUT, exist_ok=True)
    for name, x0, y0, x1, y1, kind in ITEMS:
        im = cut(img, (x0, y0, x1, y1), kind)
        im.save(os.path.join(OUT, name + '.webp'), lossless=True, method=6)
        print(f'{name:12s} {im.size[0]}x{im.size[1]} {kind}')


if __name__ == '__main__':
    main()
