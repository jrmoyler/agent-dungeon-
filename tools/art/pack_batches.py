"""Pack the AI Dungeon Batch 04-09 art drops into compact runtime atlases.

usage: python3 -I tools/art/pack_batches.py <dir containing the extracted Batch_04..09 folders>

Writes into atlas/:
  agents/<id>.webp   148 frames, 12 cols x 13 rows, 168px cells (see FRAME_LAYOUT)
  fx/<id>.webp       7 moves x (projectile, muzzle, trail, impact) x 4 frames, 128px cells
  batch.json         combat data (moves, muzzles), boss/enemy/dungeon metadata
                     (bosses and CPU units are rendered as procedural 3D rigs in src/05b_models.js)
"""
import glob, json, os, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(ROOT, 'atlas')
def find(pattern):
    hits = glob.glob(os.path.join(SRC, '**', pattern), recursive=True)
    if not hits: raise SystemExit('missing ' + pattern)
    return hits[0]


# source 320px cell -> crop window -> runtime cell
CROP_X, CROP_Y, CROP = 48, 72, 240
CELL = 168
SCALE = CELL / CROP
COLS = 12
DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']
SETS = [('loco', None), ('shot', 'primary_shot'), ('arc', 'sweeping_arc'), ('cast', 'area_pulse')]
REACT = ['run', 'dash', 'jump', 'hurt', 'death']   # Batch04 movement rows 1..5
JUMP_DROP = 56                                     # jump rows are shifted down so the leap fits the window
MOVES = ['primary_shot', 'rapid_fire', 'sweeping_arc', 'piercing_beam', 'area_pulse', 'summon', 'ultimate']
FX_KINDS = ['projectile', 'muzzle', 'trail', 'impact']
FX_CELL = 128

# Batch folder id -> runtime id. The Batch art is a second, distinct cast, so each gets its own name.
NEW_IDS = {
    'openai_dots': 'dotmatrix', 'claude_cowork': 'folio', 'gemini_spark': 'prismara', 'meta_muse_spark': 'musette',
    'minimax': 'triax', 'moonshot_kimi': 'lunaris', 'manus_cue_agents': 'cuebit', 'glm_agents': 'voxlet',
    'hermes_agent': 'glyphwing', 'openclaw': 'rendclaw', 'google_antigravity': 'zerog', 'grokbot': 'snarkbit',
    'cursor': 'caret', 'devin_ai': 'forgewright',
}

def cell_of(sheet, col, row, drop=0):
    c = sheet.crop((col * 320, row * 320, col * 320 + 320, row * 320 + 320))
    if drop:
        moved = Image.new('RGBA', (320, 320 + drop)); moved.alpha_composite(c, (0, drop)); c = moved
    return c.crop((CROP_X, CROP_Y, CROP_X + CROP, CROP_Y + CROP)).resize((CELL, CELL), Image.LANCZOS)

def to_cell(px):  # source pixel -> runtime cell pixel
    return [round((px[0] - CROP_X) * SCALE, 1), round((px[1] - CROP_Y) * SCALE, 1)]

def save_webp(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', lossless=True, quality=100, method=6)

def pack_fighters():
    game = json.load(open(os.path.join(B06, 'manifest.game.json')))
    out = {}
    for src_id, ch in game['characters'].items():
        rid = NEW_IDS[src_id]
        frames = []
        for name, move in SETS:
            path = os.path.join(B06, 'characters', src_id, 'locomotion_8dir_4f.png' if move is None else f'attacks/{move}_8dir_4f.png')
            sheet = Image.open(path).convert('RGBA')
            for d in range(8):
                for f in range(4): frames.append(cell_of(sheet, f, d))
        mv = Image.open(os.path.join(B04, 'characters', src_id, 'movement_6x4_1280x1920.png')).convert('RGBA')
        for r, name in enumerate(REACT):
            for f in range(4): frames.append(cell_of(mv, f, r + 1, JUMP_DROP if name == 'jump' else 0))
        rows = (len(frames) + COLS - 1) // COLS
        atlas = Image.new('RGBA', (COLS * CELL, rows * CELL))
        for i, fr in enumerate(frames): atlas.alpha_composite(fr, ((i % COLS) * CELL, (i // COLS) * CELL))
        save_webp(atlas, os.path.join(OUT, 'agents', rid + '.webp'))
        # FX strips
        fx = Image.new('RGBA', (16 * FX_CELL, 7 * FX_CELL))
        for r, move in enumerate(MOVES):
            for k, kind in enumerate(FX_KINDS):
                strip = Image.open(os.path.join(B05, 'characters', src_id, 'fx', move, kind + '_4f.png')).convert('RGBA')
                fw = strip.width // 4
                for f in range(4):
                    c = strip.crop((f * fw, 0, f * fw + fw, strip.height))
                    fx.alpha_composite(c, ((k * 4 + f) * FX_CELL + (FX_CELL - fw) // 2, r * FX_CELL + (FX_CELL - strip.height) // 2))
        save_webp(fx, os.path.join(OUT, 'fx', rid + '.webp'))
        pose = ch['pose06']
        muzzle = {
            'loco': [to_cell(pose['locomotion']['directionData'][d]['muzzlePx'][0]) for d in DIRS],
            'shot': [to_cell(pose['attacks']['primary_shot']['directionData'][d]['muzzlePx'][2]) for d in DIRS],
        }
        moves = {}
        for m in MOVES:
            a = ch['attacks'][m]
            moves[m] = {k: v for k, v in a.items() if k in ('kind', 'displayName', 'speed', 'damage', 'cooldownMs', 'lifetimeMs', 'radius', 'arcDeg', 'range', 'knockback', 'burstCount', 'burstIntervalMs', 'tickMs', 'statusDurationMs', 'pierces', 'summonStyle')}
        out[rid] = {'source': src_id, 'sourceName': ch['name'], 'accent': ch['accent'], 'weaponId': ch['weaponId'], 'motif': ch['motif'],
                    'hitStatus': ch['hitStatus'], 'muzzle': muzzle, 'moves': moves}
        print('agent', rid, len(frames), 'frames', atlas.size)
    return out

def pack_bosses_enemies():
    m8 = json.load(open(os.path.join(B08, 'manifest.batch08.json')))
    bosses = m8['bosses']
    atlas = Image.new('RGBA', (16 * 128, 15 * 128))
    meta = []
    for b, boss in enumerate(bosses):
        cells = []
        idle = Image.open(os.path.join(B08, boss['atlas'])).convert('RGBA')
        cells += [idle.crop((f * 128, 0, f * 128 + 128, 128)) for f in range(4)]
        st = Image.open(os.path.join(B09, 'boss_animations', boss['id'] + '_states.png')).convert('RGBA')
        cells += [st.crop((f * 128, r * 128, f * 128 + 128, r * 128 + 128)) for r in range(4) for f in range(4)]
        sig = Image.open(os.path.join(B08, boss['signatureFx'])).convert('RGBA')
        cells += [sig.crop((f * 64, 0, f * 64 + 64, 64)).resize((128, 128), Image.NEAREST) for f in range(4)]
        for i, c in enumerate(cells):
            k = b * 24 + i; atlas.alpha_composite(c, ((k % 16) * 128, (k // 16) * 128))
        meta.append({k: boss[k] for k in ('id', 'name', 'subtitle', 'color', 'accent', 'visual')} | {'base': b * 24})
    en = Image.new('RGBA', (8 * 64, 6 * 64)); emeta = []
    for e, enemy in enumerate(m8['enemies']):
        strip = Image.open(os.path.join(B08, enemy['atlas'])).convert('RGBA')
        for f in range(4):
            k = e * 4 + f; en.alpha_composite(strip.crop((f * 64, 0, f * 64 + 64, 64)), ((k % 8) * 64, (k // 8) * 64))
        emeta.append({k: enemy[k] for k in ('id', 'name', 'color', 'ai', 'hp', 'mobile')} | {'base': e * 4})
    print('bosses', atlas.size, 'enemies', en.size)
    return meta, emeta, m8['dungeons']

if __name__ == '__main__':
    SRC = os.path.abspath(sys.argv[1])
    B04 = os.path.dirname(find('AI_Dungeon_Batch_04_Combat_Motion/manifest.json'))
    B05 = os.path.dirname(find('AI_Dungeon_Batch_05_8Way_Weapons/README.md'))
    B06 = os.path.dirname(find('AI_Dungeon_Batch_06_Directional_Poses/manifest.game.json'))
    B08 = os.path.dirname(find('manifest.batch08.json'))
    B09 = os.path.dirname(find('manifest.batch09.json'))
    agents = pack_fighters()
    bosses, enemies, dungeons = pack_bosses_enemies()
    layout = {'cell': CELL, 'cols': COLS, 'anchor': [round((160 - CROP_X) * SCALE, 1), round((296 - CROP_Y) * SCALE, 1)],
              'sets': {s: i * 32 for i, (s, _) in enumerate(SETS)}, 'react': {n: 128 + i * 4 for i, n in enumerate(REACT)},
              'dirs': DIRS, 'jumpDrop': round(JUMP_DROP * SCALE, 1), 'fxCell': FX_CELL, 'moves': MOVES, 'fxKinds': FX_KINDS}
    json.dump({'layout': layout, 'agents': agents, 'bosses': bosses, 'enemies': enemies, 'dungeons': dungeons},
              open(os.path.join(OUT, 'batch.json'), 'w'), separators=(',', ':'))
    print('wrote atlas/batch.json')
