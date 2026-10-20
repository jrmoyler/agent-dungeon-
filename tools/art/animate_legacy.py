"""Give the original 14 agents the same animation set as the Batch 04-06 cast.

usage: python3 -I tools/art/animate_legacy.py        (run after pack_batches.py)

Reads atlas/<id>.webp + atlas/manifest.json (the hand-extracted card art) and writes
atlas/agents/<id>.webp and atlas/fx/<id>.webp in exactly the layout pack_batches.py uses:
8 facings x 4 phases for locomotion / shot / arc / cast, plus run, dash, jump, hurt and death,
all registered to the same 320px canvas with the foot anchor at (160, 296).

Poses are procedural derivatives of the source art (lean, squash, recoil, weapon pivot,
smears, tints and dissolves); facings flip the art and shade the rear quarter.
"""
import json, math, os, random
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
ATL = os.path.join(ROOT, 'atlas')
sys_path = __import__('sys').path; sys_path.insert(0, HERE)
from pack_batches import CROP_X, CROP_Y, CROP, CELL, COLS, JUMP_DROP, FX_CELL, save_webp, to_cell

AX, AY = 160, 296
BODY_H = 158
COLORS = {  # accent + light accent, matched to each card's palette
    'cursor': ('#3fa9ff', '#c4e6ff'), 'devin': ('#ffb636', '#fff0b8'), 'minimax': ('#ff3b4a', '#ffc2c7'),
    'kimi': ('#6f8cff', '#d9e1ff'), 'manus': ('#2fe39a', '#c2ffe5'), 'glm': ('#9b6bff', '#e2d4ff'),
    'hermes': ('#2ec8ff', '#c4f1ff'), 'openclaw': ('#ff4a2a', '#ffc6b8'), 'antigravity': ('#a070ff', '#e6d9ff'),
    'grok': ('#ff8a1f', '#ffdcb5'), 'dots': ('#2fe0b0', '#c6fff0'), 'claude': ('#ffa43a', '#ffe2bd'),
    'gemini': ('#8b8cff', '#ffd1f2'), 'meta': ('#c084ff', '#f0dcff'),
}
PROJ_ANGLE = {'cursor': 2.25}  # radians the projectile art is already rotated by

def hexrgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

def load_parts(hid, man):
    sheet = Image.open(os.path.join(ATL, hid + '.webp')).convert('RGBA')
    return {n: sheet.crop((x, y, x + w, y + h)) for n, (x, y, w, h) in man[hid]['r'].items()}

def body_scale(img):
    bb = img.getchannel('A').point(lambda v: 255 if v > 60 else 0).getbbox()
    return BODY_H / max(1, bb[3] - bb[1])

def place(canvas, img, scale=1.0, rot=0.0, flip=False, ox=0.0, oy=0.0, sx=1.0, sy=1.0, alpha=1.0, pivot='feet'):
    """Draw img with its bottom-centre on the foot anchor, transformed about that point."""
    if flip: img = img.transpose(Image.FLIP_LEFT_RIGHT)
    w, h = img.size
    a = math.radians(rot)
    # forward map: p' = A + R*S*(p - foot)
    cs, sn = math.cos(a), math.sin(a)
    m00, m01 = cs * scale * sx, -sn * scale * sy
    m10, m11 = sn * scale * sx, cs * scale * sy
    det = m00 * m11 - m01 * m10
    i00, i01, i10, i11 = m11 / det, -m01 / det, -m10 / det, m00 / det
    fx, fy = w / 2, h - 2
    tx, ty = AX + ox, AY + oy
    W = canvas.width + 0
    # inverse: p = foot + Minv*(p' - T)
    coeffs = (i00, i01, fx - i00 * tx - i01 * ty, i10, i11, fy - i10 * tx - i11 * ty)
    layer = img.transform(canvas.size, Image.AFFINE, coeffs, resample=Image.BICUBIC)
    if alpha < 1: layer.putalpha(layer.getchannel('A').point(lambda v: int(v * alpha)))
    canvas.alpha_composite(layer)

def tint(img, rgb, k):
    solid = Image.new('RGBA', img.size, rgb + (255,))
    out = Image.blend(img, solid, k); out.putalpha(img.getchannel('A')); return out

def shade(img, k):  # rear-quarter shading: darker, a touch desaturated
    rgb = ImageEnhance.Brightness(ImageEnhance.Color(img).enhance(1 - k * 0.6)).enhance(1 - k)
    rgb.putalpha(img.getchannel('A')); return rgb

def dissolve(img, keep, seed):
    a = np.asarray(img).copy(); rng = np.random.default_rng(seed)
    mask = rng.random(a.shape[:2]) > keep
    a[..., 3][mask] = 0; return Image.fromarray(a)

def norm_weapon(icon, size):
    """Rotate the weapon icon so its long axis points +x, scale to `size` px long."""
    al = np.asarray(icon.getchannel('A')).astype(float)
    ys, xs = np.nonzero(al > 80)
    if len(xs) < 5: return icon
    cx, cy = xs.mean(), ys.mean(); cov = np.cov(np.vstack([xs - cx, ys - cy]))
    ev, vec = np.linalg.eigh(cov); v = vec[:, 1]
    ang = math.degrees(math.atan2(v[1], v[0]))
    r = icon.rotate(ang, resample=Image.BICUBIC, expand=True)
    bb = r.getbbox(); r = r.crop(bb)
    # the heavier half is the grip/head; put the lighter (pointy) end forward
    a2 = np.asarray(r.getchannel('A')).astype(float); half = a2.shape[1] // 2
    if a2[:, half:].sum() > a2[:, :half].sum(): r = r.transpose(Image.FLIP_LEFT_RIGHT)
    k = size / r.width
    return r.resize((max(1, int(r.width * k)), max(1, int(r.height * k))), Image.LANCZOS)

def paste_weapon(canvas, wpn, ang_deg, px, py):
    r = wpn.rotate(-ang_deg, resample=Image.BICUBIC, expand=True)
    # grip sits at the pivot: shift so the weapon's rear end is on the hand
    off = wpn.width * 0.32
    cx = px + math.cos(math.radians(ang_deg)) * off; cy = py + math.sin(math.radians(ang_deg)) * off
    canvas.alpha_composite(r, (int(cx - r.width / 2), int(cy - r.height / 2)))

def crop_cell(c):
    return c.crop((CROP_X, CROP_Y, CROP_X + CROP, CROP_Y + CROP)).resize((CELL, CELL), Image.LANCZOS)

def star(draw, x, y, r, col, w=2):
    for a in range(0, 360, 45):
        rr = r if a % 90 == 0 else r * 0.55
        draw.line((x, y, x + math.cos(math.radians(a)) * rr, y + math.sin(math.radians(a)) * rr), fill=col, width=w)

def build_hero(hid, parts):
    col = hexrgb(COLORS[hid][0]); lite = hexrgb(COLORS[hid][1])
    idle, move, atk = parts['idle'], parts['move'], parts['attack']
    sc = body_scale(idle)
    wpn = norm_weapon(parts['icon_weapon'], 54)
    frames, muz_loco, muz_shot = [], [], []

    def facing(d):
        dx, dy = math.cos(math.radians(d * 45)), math.sin(math.radians(d * 45))
        flip = dx < -0.2 or (abs(dx) < 0.2 and dy < 0)
        rear = 0.22 if dy < -0.9 else 0.1 if dy < -0.2 else 0
        return dx, dy, flip, rear

    def hand(dx, dy, ox=0, oy=0):
        return AX + dx * 22 + ox, AY - 64 + dy * 14 + oy

    def pose(art, d, ox=0, oy=0, rot=0, sx=1, sy=1, w_off=0, recoil=0, flash=0, swing=None, aura=0):
        dx, dy, flip, rear = facing(d)
        c = Image.new('RGBA', (320, 320 + JUMP_DROP))
        body = shade(art, rear) if rear else art
        wang = d * 45 + w_off
        hx, hy = hand(dx, dy, ox - dx * recoil, oy - dy * recoil)
        behind = dy < -0.2
        if aura:
            dr = ImageDraw.Draw(c)
            rx, ry = 46 + aura * 30, 14 + aura * 9
            for k, a in ((0, 180), (6, 110), (12, 60)):
                dr.ellipse((AX - rx - k, AY - ry - k * 0.3, AX + rx + k, AY + ry + k * 0.3), outline=lite + (a,), width=3)
        if behind: paste_weapon(c, wpn, wang, hx, hy)
        place(c, body, sc, rot * (-1 if flip else 1), flip, ox - dx * recoil, oy - dy * recoil, sx, sy)
        if not behind: paste_weapon(c, wpn, wang, hx, hy)
        mx = hx + math.cos(math.radians(wang)) * 44; my = hy + math.sin(math.radians(wang)) * 44
        dr = ImageDraw.Draw(c)
        if flash:
            star(dr, mx, my, 9 + flash * 9, lite + (255,), 3); star(dr, mx, my, 5 + flash * 5, (255, 255, 255, 255), 2)
        if swing is not None:
            a0, a1 = swing
            for k in range(4):
                rad = 70 + k * 4
                dr.arc((hx - rad, hy - rad, hx + rad, hy + rad), a0, a1, fill=(col if k < 2 else lite) + (230 - k * 45,), width=5 - k)
        return c, (mx, my)

    # locomotion (walk cycle)
    for d in range(8):
        for f in range(4):
            art = move if f % 2 else idle
            dx = math.cos(math.radians(d * 45))
            c, m = pose(art, d, oy=(-6 if f % 2 else 0), rot=(4 if f % 2 else 0) * (1 if dx >= 0 else -1) * 0 + (3 if f % 2 else -1),
                        sx=1.0 if f % 2 else 1.03, sy=1.0 if f % 2 else 0.975, w_off=(-6 if f == 1 else 6 if f == 3 else 0))
            frames.append(c)
            if f == 0: muz_loco.append(m)
    # shot
    for d in range(8):
        for f in range(4):
            c, m = pose(atk, d, recoil=[3, 0, 9, 3][f], w_off=[-14, -4, 0, -2][f], flash=[0, 0, 1, 0.3][f])
            frames.append(c)
            if f == 2: muz_shot.append(m)
    # arc (melee sweep)
    for d in range(8):
        base = d * 45
        for f in range(4):
            off = [-80, -35, 45, 85][f]
            c, _ = pose(atk, d, w_off=off, rot=[-5, -2, 5, 3][f], swing=(base - 70, base + 70) if f == 2 else None)
            frames.append(c)
    # cast (area pulse / summon)
    for d in range(8):
        for f in range(4):
            c, _ = pose(atk, d, sx=[1, 1.04, 1.08, 1.02][f], sy=[1, 1.04, 1.08, 1.02][f], oy=[0, -3, -6, -1][f], w_off=-60, aura=[0.2, 0.6, 1.0, 0.5][f])
            frames.append(c)
    # reactions (front-facing, right; the runtime mirrors them)
    def single(art, **kw):
        c = Image.new('RGBA', (320, 320 + JUMP_DROP)); place(c, art, sc, **kw); return c
    for f in range(4):  # run
        frames.append(single(move if f % 2 == 0 else idle, rot=-9, sx=1.05, sy=0.98, oy=[-2, -9, -2, -9][f], ox=4))
    for f in range(4):  # dash: stretched with afterimages
        c = Image.new('RGBA', (320, 320 + JUMP_DROP))
        ghost = tint(move, lite, 0.55)
        for g, a in ((3, 0.18), (2, 0.3), (1, 0.45)):
            place(c, ghost, sc, rot=-12, sx=1.12, sy=0.94, ox=-g * (14 + f * 5), alpha=a * (1 - f * 0.18))
        place(c, move, sc, rot=-12, sx=1.12 - f * 0.02, sy=0.94, ox=6 + f * 3)
        dr = ImageDraw.Draw(c)
        for k in range(3): y = AY - 30 - k * 34; dr.line((AX - 120 + f * 8, y, AX - 60 + f * 8, y), fill=lite + (160,), width=2)
        frames.append(c)
    for f, (lift, sx_, sy_) in enumerate([(0, 1.12, 0.84), (44, 0.9, 1.12), (100, 1.0, 1.0), (18, 1.08, 0.9)]):  # jump
        c = Image.new('RGBA', (320, 320 + JUMP_DROP))
        place(c, move if f in (1, 2) else idle, sc, sx=sx_, sy=sy_, oy=JUMP_DROP - lift)
        frames.append(c)
    for f in range(4):  # hurt
        k = [0.75, 0.45, 0.22, 0][f]
        art = tint(idle, (255, 70, 70) if f else (255, 255, 255), k)
        frames.append(single(art, rot=[12, 9, 5, 1][f], ox=[-10, -7, -3, 0][f]))
    for f in range(4):  # death: crumple, tip over, dissolve
        art = tint(idle, (255, 80, 80), 0.35) if f == 0 else idle
        if f >= 2: art = dissolve(art, [1, 1, 0.6, 0.25][f], f)
        frames.append(single(art, rot=[14, 48, 82, 88][f], oy=[0, 6, 14, 16][f], ox=[-4, -14, -26, -30][f], alpha=[1, 1, 0.85, 0.5][f]))

    cells = [crop_cell(c) for c in frames]
    atlas = Image.new('RGBA', (COLS * CELL, ((len(cells) + COLS - 1) // COLS) * CELL))
    for i, fr in enumerate(cells): atlas.alpha_composite(fr, ((i % COLS) * CELL, (i // COLS) * CELL))
    save_webp(atlas, os.path.join(ATL, 'agents', hid + '.webp'))
    return {'loco': [to_cell(m) for m in muz_loco], 'shot': [to_cell(m) for m in muz_shot]}

# ---------- pixel-style FX strips in each hero's palette ----------
def px_canvas(): return Image.new('RGBA', (64, 64))
def up(im): return im.resize((FX_CELL, FX_CELL), Image.NEAREST)
def art_fit(img, size, rot=0):
    i = img.copy(); i.thumbnail((size, size), Image.LANCZOS)
    if rot: i = i.rotate(rot, resample=Image.BICUBIC, expand=True)
    c = Image.new('RGBA', (FX_CELL, FX_CELL)); c.alpha_composite(i, ((FX_CELL - i.width) // 2, (FX_CELL - i.height) // 2)); return c

def build_fx(hid, parts):
    col = hexrgb(COLORS[hid][0]); lite = hexrgb(COLORS[hid][1]); W = (255, 255, 255)
    rng = random.Random(hid)
    pa = -math.degrees(PROJ_ANGLE.get(hid, 0))
    def burst(f, rings=False, big=1.0):
        c = px_canvas(); d = ImageDraw.Draw(c); cx = cy = 32
        r = (4 + f * 6) * big
        if rings:
            d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(col if f < 2 else lite) + (255 - f * 50,), width=2 if f < 3 else 1)
        else:
            if f < 2: d.ellipse((cx - 5 + f, cy - 5 + f, cx + 5 - f, cy + 5 - f), fill=lite + (255,))
            for k in range(8 + f * 2):
                a = rng.random() * 6.283; L = r * (0.6 + rng.random() * 0.6)
                d.line((cx + math.cos(a) * r * 0.3, cy + math.sin(a) * r * 0.3, cx + math.cos(a) * L, cy + math.sin(a) * L), fill=(col if k % 2 else lite) + (255 - f * 45,), width=1)
        return up(c)
    def muzzle(f):
        c = px_canvas(); d = ImageDraw.Draw(c); star(d, 32, 32, 3 + f * 3, lite + (255,), 1)
        d.rectangle((31, 31, 33, 33), fill=W + (255,)); return up(c)
    def trail(f):
        c = px_canvas(); d = ImageDraw.Draw(c)
        for k in range(4):
            x = 40 - k * 6 - f; a = 230 - k * 50 - f * 20
            d.ellipse((x - 3 + k * 0.5, 29 + k * 0.5, x + 3 - k * 0.5, 35 - k * 0.5), fill=(lite if k == 0 else col) + (max(30, a),))
        return up(c)
    def crescent(f):
        c = px_canvas(); d = ImageDraw.Draw(c)
        d.arc((14 - f, 8, 46 - f, 56), -70, 70, fill=lite + (255,), width=4); d.arc((10 - f, 6, 44 - f, 58), -60, 60, fill=col + (255,), width=2)
        return up(c)
    def beam(f):
        c = px_canvas(); d = ImageDraw.Draw(c)
        d.rectangle((0, 27, 63, 37), fill=col + (220,)); d.rectangle((0, 30, 63, 34), fill=lite + (255,)); d.line((0, 32, 63, 32), fill=W + (255,))
        for x in range(f * 4, 64, 16): d.rectangle((x, 26, x + 3, 38), fill=W + (200,))
        return up(c)
    def rings(f):
        c = px_canvas(); d = ImageDraw.Draw(c); r = 4 + f * 8
        d.ellipse((32 - r, 32 - r, 32 + r, 32 + r), outline=col + (255,), width=2)
        d.ellipse((29, 29, 35, 35), fill=lite + (255,)); return up(c)
    proj = parts['proj']
    rows = []
    rows.append([art_fit(proj, 60, pa + [0, 6, 0, -6][f]) for f in range(4)])                    # primary
    rows.append([art_fit(proj, 42, pa + [0, 10, 0, -10][f]) for f in range(4)])                  # rapid
    rows.append([crescent(f) for f in range(4)])                                                 # arc
    rows.append([beam(f) for f in range(4)])                                                     # beam
    rows.append([rings(f) for f in range(4)])                                                    # pulse
    rows.append([art_fit(parts['summon'], 70, [0, 3, 0, -3][f]) for f in range(4)])              # summon
    rows.append([art_fit(parts['fx'], 112, f * 8) for f in range(4)])                            # ultimate
    atlas = Image.new('RGBA', (16 * FX_CELL, 7 * FX_CELL))
    for r in range(7):
        strip = rows[r] + [muzzle(f) for f in range(4)] + [trail(f) for f in range(4)] + [burst(f, rings=r == 4, big=1.25 if r == 6 else 1) for f in range(4)]
        for k, im in enumerate(strip): atlas.alpha_composite(im, (k * FX_CELL, r * FX_CELL))
    save_webp(atlas, os.path.join(ATL, 'fx', hid + '.webp'))

if __name__ == '__main__':
    man = json.load(open(os.path.join(ATL, 'manifest.json')))
    batch_path = os.path.join(ATL, 'batch.json')
    batch = json.load(open(batch_path))
    batch['legacy'] = {}
    for hid in man:
        parts = load_parts(hid, man)
        batch['legacy'][hid] = {'muzzle': build_hero(hid, parts)}
        build_fx(hid, parts)
        print('legacy', hid)
    json.dump(batch, open(batch_path, 'w'), separators=(',', ':'))
