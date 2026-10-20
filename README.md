# Agent Dungeon

A Three.js pixel-dungeon twin-stick shooter. **28 AI agents** fight through **8 sealed sectors**, a CPU army that moves as a squad, three corrupted rival guardians and **10 bosses** to break *The Override*. Every agent carries the same seven-move kit, animated in eight facings, and every dungeon is built procedurally in Three.js to match the AI Dungeon art sheets.

By **Collective AI Inc.** — John-Ross Moyler (Hataalii).

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
- **Vault:** clear both passages (and the rival, if present) to open the gates. Bosses fight in three phases with telegraphed lanes, rings, circles and cones, bullet volleys, adds and their own status effects, animated through attack, stagger, phase and death states.
- **Rivals:** the Four Locks guardians are corrupted copies of other agents from the roster, guarding the upper relay.

## Repo layout

```
index.html              Built game (single page)
manifest.webmanifest    PWA manifest        sw.js   offline cache
vercel.json             Static deploy config + cache headers
icons/                  PWA icons (tools/art/make_icons.py)
atlas/
  agents/<id>.webp      148-frame sprite sheets, one per agent (lazy-loaded)
  fx/<id>.webp          7 moves × projectile/muzzle/trail/impact × 4 frames
  bosses.webp           10 bosses: idle, attack, stagger, phase, death, signature FX
  enemies.webp          12 CPU classes
  thumbs.webp           roster thumbnails
  <id>.webp             Origin card art (portraits, icons, ultimate FX)
  batch.json            frame layout, muzzles, move data, boss/enemy metadata
src/
  01_data.js            roster, kit, statuses, CPU/boss/sector data
  02_engine.js          renderer, biome PBR texture generator, pixel sprite shader, atlas loading, particles, audio
  03_world.js           branching sector generator, biome prop kits, gates, seal, switches, traps
  04_actors.js          8-direction animation, moves, projectiles, statuses, summons
  05_enemies.js         fauna, CPU tactics + squad director, telegraphs, bosses, rivals
  06_flow.js            pickups, traps, puzzle, cache, sector progression, player controller, camera
  07_ui.js              screens, HUD, minimap, input, main loop, PWA hooks
  template.html         markup + CSS; build.py inlines src/*.js
tools/art/              sprite pipelines (card extraction, batch packing, legacy animation, icons)
qa/                     Playwright playtests
```

## Development

```bash
python3 build.py                       # after editing anything in src/
npm install                            # three + playwright for QA
npm test                               # all 28 agents: every move fires, a full sector loop, unique names/stats
node qa/play.js desktop caret 2        # scripted playthrough with screenshots (desktop|mobile, agent, sectors)
./tools/art/make_art.sh <batch-dir>    # rebuild every atlas from art/source + the extracted Batch 04–09 zips
```

Everything except the character, enemy and boss sprites is generated in code: biome floor and wall PBR maps (albedo, normal, roughness, emissive), dungeon layouts, prop kits, gates, traps, telegraphs, particles, sound effects and music. Three.js `0.170.0` loads from jsDelivr via an import map.

The Batch 04–09 art is procedurally posed and fan-made, as its own READMEs note: rear facings are approximations and the mascots are not official vendor art.
