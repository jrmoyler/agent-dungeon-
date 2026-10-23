# Agent Dungeon

A Three.js pixel-dungeon twin-stick shooter. **28 AI agents** fight through **8 sealed sectors**, a CPU army that moves as a squad, three corrupted rival guardians and **10 bosses** to break *The Override*. Every agent carries the same seven-move kit, animated in eight facings, and every dungeon is built procedurally in Three.js to match the AI Dungeon art sheets.

By **Collective AI Inc.** — John-Ross Moyler (Hataalii).

## Look

The dungeon is rendered as **3D pixel art** so it sits on the same pixel grid as the agent sprites:

- The scene is drawn into a low-resolution target (the short side lands near 330–400 pixels) and blown up with hard pixel edges. One floor texel is one screen pixel at the game's fixed art scale (20 px per world unit).
- An orthographic camera at a fixed 55° pitch is snapped to whole pixels; the leftover fraction is applied as a sub-pixel shift in the final blit, so scrolling is smooth without shimmer.
- The blit adds depth outlines (dark edge behind a nearer surface, bright rim on top edges), ACES tone mapping, and posterize + ordered dither. Bloom runs at the low resolution too.
- Floors, wall faces and wall caps are painted per biome at 40×40 texels per tile. The neon trim on wall caps is drawn only on sides that face open floor, so it traces the maze.
- Sprites stand as upright cards in depth: they no longer sink into walls, and they sort by where their feet are. The player gets an x-ray silhouette when a wall or rig hides them.

## Props sheet and HUD

`art/source/props_hud_sheet.jpg` is cut into alpha WebPs by `tools/art/slice_sheet.py` (output in `atlas/props/`).

- **Props:** server racks, terminals, tesla coils, ice pillars and crystals stand against north walls as billboards. Crates are breakable cover (shards, sometimes a pickup). Toxic barrels flash on a short fuse, then explode for area damage plus poison (burn in Inferno Depths) and chain into nearby barrels; the blast also hurts you. The weapon crate is the sealed-annex cache, and the round reactor plate sits under relays and the exit portal.
- **Icons:** pickups (patch, overclock, burst, context refill), XP shards and buff/status chips use the sheet icons.
- **HUD:** the panel, banner and slot frames are 9-sliced with `border-image`; the gradient bar is the health bar (drains from the right, pulses under 30%). The ultimate uses the gold slot.

## Combat feel

Recoil and a camera kick on every shot; dash afterimages, a stretch on take-off and a squash on landing; a swept smear arc on melee; a ribbon beam with a white core; floor shockwaves; pooled flash lights for muzzles, impacts, explosions and kills; directional hit sparks; enemies squash when hit; kills throw debris; hitstop on heavy hits, elites and every tenth kill in a chain. Kills inside 2.6 s build a **chain** that adds up to +150% score, and the results screen shows your best chain. An aim reticle and a chevron at your feet show where you're aiming.

## Play

```bash
npm run serve        # then open http://localhost:8080
```

`index.html` is prebuilt and loads its atlases with `fetch`, so it needs a static server (not `file://`). It installs as a PWA (offline after the first visit for every agent you've played) and deploys to Vercel as-is; see `vercel.json`.

| Action      | Desktop                        | Phone                                       |
|-------------|--------------------------------|---------------------------------------------|
| Move        | WASD / arrows                  | Left stick                                  |
| Aim + fire  | Mouse, hold left button (T toggles auto-fire) | Right stick (auto-aims when released) |
| Burst       | Right mouse button             | Skill ring                                  |
| Arc · Beam · Pulse · Summon | Q · E · C · F    | Skill ring                                  |
| Ultimate    | R (or middle mouse)            | Gold button                                 |
| Dash        | Space / Shift                  | DASH                                        |
| Use relay   | E near a switch                | USE                                         |
| Pause       | Esc / P                        | Tap your portrait                           |

## The roster

**Origin cohort** — the original 14 cards (Cursor, Devin AI, MiniMax, Moonshot Kimi, Manus AI, GLM Agents, Hermes Agent, OpenClaw, Google Antigravity, Grokbot, OpenAI Dots, Claude Cowork, Gemini Spark, Meta Muse Spark). Stats come straight from the cards; each keeps its signature ultimate.

**Echo cohort** — the 14 Batch 04–06 designs. They share studios with the Origin agents but are different characters, so each has its own name, signature stat and a stat line no other agent shares (enforced by `npm test`):

| Echo | echo of | HP/ATK/SPD/DEF | Signature | Hit status |
|---|---|---|---|---|
| Dotmatrix | OpenAI Dots | 5/3/5/3 | ORBIT 6 | mark |
| Folio | Claude Cowork | 6/3/3/5 | FOCUS 6 | bind |
| Prismara | Gemini Spark | 3/6/5/2 | SPECTRUM 7 | refract |
| Musette | Meta Muse Spark | 4/4/6/2 | CHARM 6 | confuse |
| Triax | MiniMax | 3/4/7/2 | THRIFT 6 | split |
| Lunaris | Moonshot Kimi | 5/4/2/5 | RECALL 7 | slow |
| Cuebit | Manus | 4/5/4/4 | QUEUE 6 | queue |
| Voxlet | GLM Agents | 5/5/3/4 | SYNTAX 5 | fracture |
| Glyphwing | Hermes Agent | 4/5/5/3 | LORE 6 | silence |
| Rendclaw | OpenClaw | 5/7/4/1 | FERAL 6 | bleed |
| Zero-G | Google Antigravity | 4/3/7/3 | LIFT 7 | pull |
| Snarkbit | Grokbot | 3/6/6/2 | VOLTAGE 6 | shock |
| Caret | Cursor | 3/5/6/4 | PRECISION 7 | pierce |
| Forgewright | Devin AI | 6/4/2/6 | FORGE 7 | construct |

**Kit (all 28):** primary · burst · sweeping arc (also cuts bullets) · piercing beam · area pulse (erases bullets) · summon turret · ultimate. Every agent has 8-direction locomotion, shot/arc/cast poses, and run, dash, jump, hurt and death reactions. The Origin agents' animations were generated from their card art to match the Echo cohort's layout frame-for-frame (`tools/art/animate_legacy.py`).

## Campaign

Eight sectors in four Locks, each a branching dungeon: a threshold, an upper and a lower passage, a vault behind energy gates, and a sealed annex.

| # | Sector | Guardian(s) | Trap | Rival |
|---|---|---|---|---|
| 1 | Core Facility | Core Tyrant | laser | |
| 2 | Shadow Realm | Shadow Weaver | rift (confuse) | Relay Warden |
| 3 | Voltage Foundry | Storm Colossus | electric (stun) | |
| 4 | Inferno Depths | Inferno Queen | flame (burn) | Archive Sentinel |
| 5 | Glacial Vault | Frost Warden | ice (slow) | |
| 6 | Toxic Hive | Toxic Broodlord | toxin (poison) | The Convergence |
| 7 | Astral Rift | Void Archon + Time Keeper | gravity (pull) | |
| 8 | Chrono Spire | Nexus Angel + Final Sentinel | clock (time slow) | |

- **CPU faction:** 12 archetypes (drone, infantry, turret, hunter, brute, mage, sniper, shield, healer, flyer, bomber, elite) with their own tactics, coordinated by a squad director (vanguard, flankers, suppressor, support, reserve; advance / pin / encircle / recover / rush). Glitch fauna (bugs, spam bots, hallucinations, prompt injections, rate limiters) mix in.
- **Circuit puzzle:** two relays per sector must be used in the right order. Solving it shuts the traps down and cracks open the sealed annex with a cache (heal, overclock, free upgrade).
- **Vault:** clear both passages (and the rival, if present) to open the gates. Bosses fight in three phases with telegraphed lanes, rings, circles and cones, bullet volleys, adds and their own status effects.
- **Bosses and CPU units are procedural 3D rigs** (`src/05b_models.js`), modelled on the Batch 08 concept board: panel-lined PBR armour with rim lighting, per-boss signature parts (Core Tyrant's gatlings and reactor, Shadow Weaver's blade legs, Storm Colossus's tesla horns, Inferno Queen's flame wings, Frost Warden's serpent body, Toxic Broodlord's carapace, Void Archon's eye and tentacles, Time Keeper's working clock, Nexus Angel's wings and spear, Final Sentinel's orbiting blades and final-form wings). They animate through idle, walk, attack, stagger, phase and death (parts shatter and tumble), shift palette each phase, and lean toward the camera so their fronts read from the top-down view.
- **Rivals:** the Four Locks guardians are corrupted copies of other agents from the roster, guarding the upper relay.

## Repo layout

```
index.html              Built game (single page)
manifest.webmanifest    PWA manifest        sw.js   offline cache
vercel.json             Static deploy config + cache headers
icons/                  PWA icons (tools/art/make_icons.py)
atlas/
  props/<name>.webp     props, pickup icons and HUD frames cut from the props/HUD sheet
  agents/<id>.webp      148-frame sprite sheets, one per agent (lazy-loaded)
  fx/<id>.webp          7 moves × projectile/muzzle/trail/impact × 4 frames
  thumbs.webp           roster thumbnails
  <id>.webp             Origin card art (portraits, icons, ultimate FX)
  batch.json            frame layout, muzzles, move data, boss/enemy metadata
src/
  01_data.js            roster, kit, statuses, CPU/boss/sector data
  02_engine.js          pixel renderer (low-res target, snapped ortho camera, outline/posterize blit), biome pixel tiles, sprite shader, atlas loading, particles, audio
  03_world.js           branching sector generator, biome prop kits, sheet props, breakable crates and barrels, gates, seal, switches, traps
  04_actors.js          8-direction animation, moves, projectiles, statuses, summons
  05_enemies.js         fauna, CPU tactics + squad director, telegraphs, bosses, rivals
  05b_models.js         procedural 3D rigs for the 10 bosses and 12 CPU units
  06_flow.js            pickups, traps, puzzle, cache, sector progression, player controller, camera
  07_ui.js              screens, HUD, minimap, input, main loop, PWA hooks
  template.html         markup + CSS; build.py inlines src/*.js
tools/art/              sprite pipelines (card extraction, batch packing, legacy animation, icons, props/HUD sheet slicing)
qa/                     Playwright playtests and the per-sector screenshot pass (qa/shots.js)
```

## Development

```bash
python3 build.py                       # after editing anything in src/
npm install                            # three + playwright for QA
npm test                               # all 28 agents: every move fires, a full sector loop, unique names/stats
node qa/play.js desktop caret 2        # scripted playthrough with screenshots (desktop|mobile, agent, sectors)
node qa/shots.js desktop caret 1,4,8   # one gameplay frame per sector plus the boss, for art review
npm run art:sheet                      # re-cut atlas/props from art/source/props_hud_sheet.jpg
./tools/art/make_art.sh <batch-dir>    # rebuild every atlas from art/source + the extracted Batch 04–09 zips
```

Apart from the agent sprites and the props/HUD sheet, everything is generated in code: bosses and CPU units, biome floor and wall pixel tiles, dungeon layouts, 3D prop kits, gates, traps, telegraphs, particles, sound effects and music. Three.js `0.170.0` loads from jsDelivr via an import map.

The Batch 04–09 art is procedurally posed and fan-made, as its own READMEs note: rear facings are approximations and the mascots are not official vendor art.
