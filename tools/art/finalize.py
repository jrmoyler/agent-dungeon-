"""Recompress agent atlases (lossy colour, lossless alpha) and build the roster thumbnail sheet.

usage: python3 -I tools/art/finalize.py   (run last)
"""
import json, os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
ATL = os.path.join(ROOT, 'atlas')
batch = json.load(open(os.path.join(ATL, 'batch.json')))
L = batch['layout']; C = L['cell']
ids = list(batch['legacy']) + list(batch['agents'])
thumbs = Image.new('RGBA', (7 * C, 4 * C))
for i, hid in enumerate(ids):
    p = os.path.join(ATL, 'agents', hid + '.webp')
    im = Image.open(p).convert('RGBA')
    k = L['sets']['loco'] + 2 * 4          # facing S, phase 0
    thumbs.alpha_composite(im.crop(((k % L['cols']) * C, (k // L['cols']) * C, (k % L['cols'] + 1) * C, (k // L['cols'] + 1) * C)), ((i % 7) * C, (i // 7) * C))
    im.save(p, 'WEBP', quality=88, alpha_quality=100, method=6)
thumbs.save(os.path.join(ATL, 'thumbs.webp'), 'WEBP', quality=90, alpha_quality=100, method=6)
batch['thumbs'] = ids
json.dump(batch, open(os.path.join(ATL, 'batch.json'), 'w'), separators=(',', ':'))
print('finalized', len(ids), 'agents')
