# Galactix · Space Shooter v0.2

A standalone, buildless portrait arcade shooter, launched from App Lab's existing **Space Shooter** card at `space-shooter/`. Ship geometry, blue-gray palette, scrolling starfield, viewport footprint and existing controls are retained. Application code and tests live in this directory; the only shared edit updates the Space Shooter gallery card’s version/sector description. No external assets, libraries, server, service worker or other-app modifications.

## Controls and session

- Drag the lower-left relative trackpad to move; lift and reposition without teleporting. Small movements use adaptive damping (~28ms for tiny errors, dropping to 6ms for a dodge). Big moves immediately reach the existing 520 logical-pixels/second speed cap. The filter runs in simulation time, independent of pointer event frequency; keyboard movement remains direct.
- Hold the independent right FIRE button while moving with another finger. Separate pointer ownership/capture prevents extra fingers or cancelled touches from leaving controls held. On a portrait desktop window, use arrows/WASD and Space; P toggles pause.
- The ship stays in the lower half of the upper playfield. Landscape covers the game and freezes play. Portrait requires explicit Resume. Blur, app switching and screen locking clear held controls and pause the flight. Native orientation locking is attempted where supported, with the rotate overlay as fallback.
- Pause offers Resume or Restart Sector. Loss retries the sector with a fresh hull, discarding that sector's score while retaining completed-sector points. A test-level selection begins a new score run; all twenty sectors are selectable. Sector 20 ends the campaign.
- Three hull points and the original 1.8-second hit grace period are retained. Each new sector resets hull, weapons, shield, projectiles and accuracy attempts. Best scores retain the existing `galactix.best.v01` storage key, so v0.1 records survive. Blocked storage never prevents play.
- The main-branch v0.1 source had no sound engine. v0.2 supplies optional, quiet synthesized shot/hit/pickup cues: use **SOUND ON/OFF** in the existing footer. Sound starts muted; the preference is saved as `galactix.sound.v02`. Audio unlocks on user gestures, stops on pause/mute/page exit, and never drives simulation randomness or timing. Unsupported audio remains silent.

## Player fire and accuracy

Normal sector-1 cooldown is **0.285s**, versus v0.1's 0.19s: approximately one-third fewer firing actions per second. The cooldown follows `0.285 / (1 + 0.18 × (sector − 1) / 19)`, reaching ~0.242s (18% more firing actions/second) in sector 20. Rapid Fire halves the current cooldown. Fixed-step remainder is retained for steady cadence.

A firing action means one emission while FIRE/Space is held, including the two projectiles of Dual Spread. Each action increments the sector's attempt counter. Every successful enemy projectile hit resets the counter to zero for **future actions**, including nonlethal armor hits. Misses and hitting nothing do not reset it.

| Action attempt since the previous hit | Destruction multiplier |
| --- | --- |
| 1 | 100% |
| 2 | 85% |
| 3 | 70% |
| 4 | 55% |
| 5 or more | 40% |

Each firing action snapshots its multiplier at emission. Projectiles already in flight retain that snapshot even if another projectile hits later. Both spread projectiles share the same immutable action/snapshot: a first hit cannot upgrade the second projectile's points, even if they kill separate targets or hit the same armored target twice. The killing projectile's snapshot multiplies the enemy's base value, rounded to whole points. Nonlethal hits award no points. For example, an attempt-5 spread killing two scouts awards 40 + 40; a late attempt-5 shot killing armor still awards 80 even if another shot has since reset the counter.

Sector-clear bonuses remain **250 per surviving hull point**, separate from accuracy. Engine state tracks `killScore`, `clearBonus` and the latest destruction award for inspection.

## Enemies and twenty-sector curve

| Enemy | Appearance | HP | Base points | Behavior |
| --- | --- | --- | --- | --- |
| 1 · Scout | Original blue-gray wings | 1 | 100 | Formation sway, basic dive and vertical fire |
| 2 · Armored | Original purple wings | 2 | 200 | 10% faster solo dives, 8% faster bullets; 1.5× selection weight to fire, 1.35× to dive |
| 3 · Looper | Original cyan three-pronged wings | 2 | 300 | Curved lane approaches, then upper-field loops as introduced below; 1.8× dive selection weight |

Sectors 1–10 retain the original formation sizes, armored counts, sway, dive/shot interval and speed configuration. Individual armor behavior and the requested player cadence/scoring change apply throughout. Sectors 11–20 keep the formation bounded at 28 enemies and gradually increase armor, loopers, bullet speed, dive speed, sway and global firing pressure rather than continuing to add rows. Fire interval moves from 1.27s at sector 10 to 0.95s at sector 20; dive speed from 173 to 205. Type selection weights redistribute that pressure rather than spawning independent bullet streams.

| Sectors | New attack pressure |
| --- | --- |
| 11–12 | Two cyan loopers, smooth curved solo dives |
| 13–14 | Loopers complete an oval in the upper field before descending |
| 15–16 | Synchronized two-enemy attacks |
| 17–18 | More armored/looping enemies and steadily faster firing/dives |
| 19–20 | Synchronized three-enemy attacks; sector 20 is the final formation |

Every attack has a **0.75s amber ring telegraph**; curved attacks mark their fixed lower-field lanes. Curves are original analytic paths: eased approach, optional full oval, and a gentle curved descent. Loops stay above the player's movement zone. Attacks never home onto the player after launch. Two-enemy lanes are at x=84/276; three-enemy lanes at x=48/180/312 (360px logical world), with at most 20px side sway. Mixed groups share launch time, path phases and speed, including an escort loop when a looper leads, so lower-field spacing stays readable. Later sectors permit only one attacking group at a time. Survivors exit below and re-enter from the top.

The fixed 120Hz simulation uses a seeded LCG for selections and drops; the renderer and optional sound do not consume randomness. Runs with the same seed and input steps reproduce the same encounters.

## Pickups

All three collectibles are drawn in Canvas as matching 30px glowing discs with a gentle bob/pulse. Collision positions stay fixed to the simulation rather than the decorative bob. Falling speed is 68 logical pixels/second, and missed pickups disappear below the field.

| Pickup | Icon | Effect | Drop rule per sector |
| --- | --- | --- | --- |
| Shield | Green shield silhouette | Absorbs one hit, then breaks; original grace/protection mechanics | Guaranteed halfway through enemy destruction count |
| Rapid Fire | Yellow lightning bolt | 8 seconds; halves current firing cooldown | One 65% seeded chance at the first quarter of destruction count |
| Dual Spread | Blue V, two clean upward-diverging arms | 10 seconds; two shots, **5° total** (±2.5°) | One 55% seeded chance at the third quarter of destruction count |

At most three collectibles spawn per sector, with no per-frame random drops. Rapid Fire and Dual Spread stack independently. Recollecting a weapon refreshes its duration to 8/10 seconds rather than accumulating time. Timers freeze on pause/rotation and reset on sector/retry. The HUD shows remaining whole seconds; a notice marks expiry. Expiry changes subsequent firing actions, leaving already-emitted projectiles intact. The shield has no duration and does not grant a weapon effect.

## Automated verification

Run from repository root:

```sh
node --check space-shooter/engine.js
node --check space-shooter/game.js
node --check space-shooter/audio.js
node space-shooter/test-engine.cjs
node space-shooter/test-controls.cjs
node space-shooter/test-audio.cjs
python space-shooter/test-browser.py
python tests/check_site.py
```

Browser tests use the repository's existing Python Playwright + Chromium setup (`CHROMIUM_PATH` can override `/usr/bin/chromium`). They route a reserved `.test` origin to local repository files without a server or external requests. Development-only tests add no runtime dependency.

- **Engine:** all twenty clears, early-sector configuration retention, smooth later curve, destruction/bonus separation, all five accuracy tiers, nonlethal resets, old projectiles, shared-action spread kills and angled swept collisions; jitter attenuation, immediate dodge, keyboard bounds, normal/rapid cadence; measured armor selection bias, telegraphs, loops, synchronized mixed groups and escape gaps; seeded drop bounds, collection/misses/refresh/independent expiry/stacking, shield/grace/defeat, deterministic encounters and two-minute bounded simulations in every sector.
- **Controller:** event-double regressions for pointer ownership/cancellation, blur/visibility pause, rotation and explicit resume, restart/retry, twenty-sector progression and test-level selection.
- **Audio:** gesture gating, saved preference, cue priority, stop/mute cleanup, missing Web Audio and blocked-storage fallback.
- **Real Chromium:** portrait layouts at 320×568, 375×812, 390×844 and 430×932; CDP two-finger move/fire/cancel, keyboard, sound preference, paused weapon timers, rotation, twenty-sector UI flow, pickup/status/expiry, retained best score and navigation at both `/` and **`/small-apps/`**. Screenshots go to `/tmp/galactix-v02-*.png`.
- **Existing gallery suite:** responsive assets/navigation, launch counts, calculator behavior and original calculator blob hashes, and JavaScript-disabled gallery. All unchanged.

These suites passed during v0.2 implementation. Chromium required execution outside the restricted socket sandbox. Physical Safari/iOS and Chrome/Android feel, browser chrome/safe areas, native orientation-lock support and audible output still need hands-on device checks; emulation cannot establish those. Other apps and shared gallery behavior are unchanged.

Tractor-beam capture/rescue and bonus challenge stages remain deferred.
