"""Render the PWA icons from the agent atlases: a hero trio over a glowing vault ring.
usage: python3 -I tools/art/make_icons.py"""
import json, math, os
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
ATL = os.path.join(ROOT, 'atlas'); OUT = os.path.join(ROOT, 'icons'); os.makedirs(OUT, exist_ok=True)
batch = json.load(open(os.path.join(ATL, 'batch.json'))); L = batch['layout']; C = L['cell']

def frame(hid, d=1):
    im = Image.open(os.path.join(ATL, 'agents', hid + '.webp')).convert('RGBA'); k = L['sets']['loco'] + d * 4
    return im.crop(((k % L['cols']) * C, (k // L['cols']) * C, (k % L['cols'] + 1) * C, (k // L['cols'] + 1) * C))

def icon(size, safe):
    S = 1024; c = Image.new('RGBA', (S, S), (4, 6, 11, 255)); d = ImageDraw.Draw(c)
    for r in range(S // 2, 0, -4):  # radial backdrop
        t = r / (S / 2); col = (int(10 + 40 * (1 - t)), int(12 + 30 * (1 - t)), int(30 + 90 * (1 - t)), 255); d.ellipse((S / 2 - r, S / 2 - r, S / 2 + r, S / 2 + r), fill=col)
    glow = Image.new('RGBA', (S, S)); g = ImageDraw.Draw(glow)
    for rad, w, col in ((330, 26, (124, 196, 255, 255)), (250, 12, (176, 127, 255, 255))):
        g.ellipse((S / 2 - rad, S * 0.56 - rad * 0.42, S / 2 + rad, S * 0.56 + rad * 0.42), outline=col, width=w)
    c.alpha_composite(glow.filter(ImageFilter.GaussianBlur(18))); c.alpha_composite(glow)
    k = 1.0 if safe else 1.18
    for hid, x, sc, dd in (('claude', 0.27, 2.6, 1), ('cursor', 0.73, 2.6, 3), ('caret', 0.5, 3.4, 2)):
        f = frame(hid, dd); w = int(C * sc * k)
        f = f.resize((w, w), Image.LANCZOS)
        c.alpha_composite(f, (int(S * x - w * L['anchor'][0] / C), int(S * (0.6 if safe else 0.62) - w * L['anchor'][1] / C)))
    if safe:  # maskable: keep content inside the 80% safe zone
        m = Image.new('RGBA', (S, S), (4, 6, 11, 255)); inner = c.resize((int(S * 0.8), int(S * 0.8)), Image.LANCZOS); m.alpha_composite(inner, (int(S * 0.1), int(S * 0.1))); c = m
    return c.resize((size, size), Image.LANCZOS)

icon(192, False).save(os.path.join(OUT, 'icon-192.png'))
icon(512, False).save(os.path.join(OUT, 'icon-512.png'))
icon(512, True).save(os.path.join(OUT, 'icon-maskable-512.png'))
icon(180, False).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))
print('icons written')
