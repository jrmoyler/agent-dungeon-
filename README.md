# Agent Dungeon

A 3D pixel-dungeon twin-stick shooter built with Three.js. Fourteen AI agents descend nine procedurally generated floors of bugs, hallucinations and prompt injections. Each agent's stats come straight from its character card, and its weapon, special, perk and flaw are modeled on that agent's real-world strengths and limits.

By **Collective AI Inc.** — John-Ross Moyler (Hataalii).

## Play

Open `index.html` through any static server (it loads the sprite atlases with `fetch`, so `file://` won't work):

```bash
npm run serve        # then open http://localhost:8080
```

It also deploys as-is to Vercel, Netlify or GitHub Pages — no build step required, `index.html` is prebuilt.

| Action  | Desktop                | Phone                                  |
|---------|------------------------|----------------------------------------|
| Move    | WASD / arrows          | Left stick                             |
| Aim     | Mouse                  | Right stick (auto-aims when released)  |
| Fire    | Hold left mouse, or F to toggle auto-fire | Right stick / automatic |
| Dash    | Space                  | DASH button                            |
| Special | E, Q, Shift or right-click | Special button                     |
| Pause   | Esc / P                | Pause                                  |

## Roster

Cursor · Devin AI · MiniMax · Moonshot Kimi · Manus AI · GLM Agents · Hermes Agent (Nous Research) · OpenClaw · Google Antigravity · Grokbot · OpenAI Dots · Claude Cowork · Gemini Spark · Meta Muse Spark

Each agent has HP / ATK / SPD / DEF plus a signature stat read from its card, a primary weapon, a special, and a perk + flaw pair (for example: Cursor's shots home like autocomplete but it hits a request quota; OpenClaw cleaves hardest but takes extra damage and some pickups are malicious skills; Claude regenerates and has the best defensive dome but the lowest attack).

## Repo layout

```
index.html            Built, playable game (single page)
atlas/                Per-agent WebP sprite atlases + manifest.json
src/
  01_data.js          Agent roster, stats, weapons, specials, upgrades, enemies
  02_engine.js        Renderer, bloom, procedural PBR textures, atlas loader, particles, audio
  03_world.js         Dungeon generation, instanced tiles, pylons, portal, collision
  04_game.js          Player, enemies, projectiles, specials, summons, pickups, floors
  05_ui.js            Menus, HUD, minimap, input, main loop
  template.html       Markup + CSS; build.py inlines src/*.js into it
build.py              Rebuilds index.html from src/
art/source/           Original character sheets
tools/art/            Sprite extraction pipeline (sheets -> atlas/)
qa/                   Headless Playwright playtests
```

## Development

```bash
python3 build.py                # after editing anything in src/
./tools/art/make_art.sh         # re-extract sprites from art/source (pip: pillow numpy scipy)
npm install && npx playwright install chromium
npm test                        # plays every agent through floors 1–3 and the first boss
```

Everything except the character art is generated in code: stone/brick/metal PBR maps (albedo, normal, roughness, emissive), dungeon layouts, enemy and boss meshes, particles, sound effects and music. Three.js `0.170.0` loads from jsDelivr via an import map.
