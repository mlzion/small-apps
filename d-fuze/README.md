> **Motion migration:** All six published levels now use only the Level Builder’s 15 ten-second profiles. The legacy profile definitions have been removed. Earlier phase notes below are historical.

> **Phase 4 update:** One- and two-ring gameplay tests are now supported, normal play ends after Level 6, and optional constant assembly rotation is available. See [Phase 4 instructions](PHASE4.md) for current behavior. Historical phase descriptions below describe the earlier implementation.

# D::FUZE — Phase 2: first rotating ring

A dependency-free static Canvas arcade game. Serve the repository and open `d-fuze/` directly or through App Lab; relative assets and links support both `/` and `/small-apps/`. Other apps are unchanged.

Rotate with Left/A and Right/D (120°/second), shoot with Space (4/second), or hold independent touch controls. Break the blue gate, then shoot through the moving opening to defuse the bomb. Red walls block shots. Every shot costs ammunition. Three lives, explicit next/retry/new-game actions, synthesized sound/mute storage, focus/visibility pause, portrait phone controls, menus, countdown pulses, and explosion/defusal effects are retained. Escape or PAUSE pauses; resuming is explicit.

## Architecture and geometry

- `engine.js`: state machine, resources, exact-time firing, shared gameplay clock, outcomes, and seeded profile selection. All active levels have exactly one ring.
- `rings.js`: separate `Ring` and child `Gate`, configurable geometry, and reusable ray/annular-sector intersection (circle boundaries plus radial end faces). Gate angle derives from its parent. The wall arc excludes the entire gate sector: no hidden wall is left beneath the gate. A destroyed gate is neither drawn nor collided with; its ring keeps moving.
- `motion.js`: six curated easy/medium/hard profiles, interpolation, validation, deterministic PRNG, and selection independent of ring number.
- `levels.js`: centralized countdown, bomb health, ammo, turret speed/rate, ring count, radius/spacing/thickness, gate width/health, profile difficulty/family, playback multiplier, alignment hold duration, and future assembly setting.
- `renderer.js`, `audio.js`, `input.js`, `game.js`: Canvas visuals, original oscillator sounds, held keyboard/pointer controls, menus/HUD, responsive rendering, orientation/focus integration, and one animation loop.

Logical Canvas units are 600×600. Bomb radius is 75 (formerly 91); Ring 1 radius is 108 with an 8-unit cross-section. Future ring radii at the configured 30-unit spacing would be 138, 168, and 198, inside the turret's 235-unit orbit and 216-unit muzzle. Only Ring 1 is instantiated. The reusable resolver sorts by physical radius and compares first intersection distances, so outward-numbered rings block first regardless of array order. A shot samples ring positions at its exact gameplay timestamp, consumes one ammo, and records a beam endpoint at the first wall/gate/bomb hit. Shared arc edges count as wall hits.

Gate hits reduce health, flash blue, play a distinct tone, and reduce opacity from 1 toward 0.3 before destruction. Wall impacts use a dull tone and orange flash; gate destruction uses a higher power-down tone; bomb impacts retain their sound/flash. Short beams stop at the collision point. Rings fade with the existing defusal/explosion animation.

## Shared animation timeline

The `shared-16` family lasts 16 animation seconds. Every profile holds relative angle zero over `[0, 0.75]`, `[6, 8]`, and `[14, 16]`; the latter hold continues into the next cycle. The middle and end windows are common to all six profiles. Keyframes use unwrapped degrees, outgoing `linear` or `smooth` (smoothstep) interpolation, repeated angles for pauses, and explicit reversals. Linear segments allow abrupt speed/direction changes without teleporting angles. Library validation rejects unordered/nonfinite keys and missing/nonzero shared hold endpoints.

Animation time is derived from `game.elapsed * animationPlaybackSpeed`, never from an independent timer. Future tracks can sample that same clock; playback speed scales all movement and holds together. The display angle is `relativeAngle + assemblyAngle + referenceOffset`. Every gate uses the same upward reference offset (`−π/2`), and assembly angle stays zero in this phase. No assembly motion is implemented. Editing alignment-window duration requires editing the compatible family and all corresponding profile key times together; the level's duration field describes its family, rather than stretching one track independently.

Shots always test actual geometry, including coincidental openings outside holds. No alignment flag grants permission to shoot. The animation can support four independent tracks, but no playable configuration enables additional rings.

## Initial balancing

| Level | Seconds | Bomb hits | Ammo | Gate width | Gate hits | Profiles | Playback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 48 | 3 | 24 | 100° | 2 | Easy | 1.00× |
| 2 | 44 | 5 | 32 | 80° | 3 | Medium | 1.05× |
| 3 | 40 | 7 | 40 | 64° | 4 | Hard | 1.12× |

Later levels remain single-ring, eventually capping at 36 seconds, 9 bomb hits, 5 gate hits, a 48° gate, 44 ammo, and 1.25× playback. Difficulty plateaus by Level 15 instead of becoming impossible. Minimum damaging shots are `sum(gate health) + bomb health`, giving 5, 8, and 11 initially, at most 14 later. Ammo leaves a substantial blocked/missed-shot margin. Timers allow multiple full animation cycles, and even maximum playback retains 1.6-second middle holds (at least six cooldown-spaced shots per hold).

Automated conservative-strategy tests validate both eligible profiles at each level 1–100 (200 cases): remain at the shared upward reference and fire during actual zero-angle holds, finishing with ammo and more than ten seconds remaining. Later settings plateau, but this is a validation of the current library/configuration and a specific player strategy, not a promise about arbitrary profile edits, player reactions, or future multi-ring combinations. Human difficulty still needs playtesting; all settings are provisional.

Each level attempt selects one compatible profile using a seeded PRNG and keeps it fixed. Retries advance selection and may pick a different profile; a new game resets the run's seed sequence.

## Debugging and pause

Use `?debug=1&seed=42` intentionally to show level, seed, ring count, profile, animation time/playback, gate angle/health, bomb health, and ammo. `?seed=42` is deterministic without the panel. Normal play hides the panel. There is no editor.

Pause, blur, hidden tabs, and the existing phone landscape restriction freeze countdown, relative ring angle, and shared animation time, clear controls, and require manual resume. Retry/new level resets the clock, gate, bomb, ammo, and turret. Existing orientation rules are preserved from merged main: coarse-pointer landscape ≤1000px wide and ≤500px high shows the rotation message. The separate unmerged Android detection PR is not included. Portrait uses dynamic viewport height/safe-area spacing; desktop and roomier tablets keep existing layouts.

Controller, rendering, audio, new modules, and CSS URLs carry a Phase 2 revision to avoid stale assets after refreshing HTML. An already-open/cached document still needs reload/revalidation.

## Verification

From the repository root:

```sh
node d-fuze/test-engine.cjs
node d-fuze/test-rings.cjs
python d-fuze/test-browser.py
node breakout/test-engine.cjs
node falling-blocks/test-engine.cjs
python tests/check_site.py
python breakout/test-browser.py
python falling-blocks/test-browser.py
```

Engine tests retain Phase 1 state/timing/lives/cooldown regressions using explicit ring-free fixtures, with updated Phase 2 level resources. Ring tests cover real arc geometry, wraparound/edges/radial faces, gate parent/damage/opacity/opening, outermost interception, continuing rotation, keyframes/holds/loops/reversals, playback, deterministic selection, pause/retry, frame invariance, and conservative strategy validation. Browser checks interact with real ring targets through keyboard firing, assert beam endpoints and gate/bomb damage, test hidden/seeded debug, multitouch, pause/visibility/rotation, progression/lives/audio fallback, both hosting roots, desktop/tablet layouts, and phones down to 320×480. Browser tools are development-only Python Playwright and `/usr/bin/chromium`, matching the existing suites. Screenshots go to `/tmp/d-fuze-WIDTHxHEIGHT.png`.

Physical phones, audible quality/synchronization, real mobile toolbar/OS interruptions, non-Chromium browsers, and live GitHub Pages behavior require manual verification. Browser touch/viewports and visibility/blur events are emulated. Web Audio/hardware latency may affect perceived pulse synchronization despite shared events. No additional rings, assembly movement, pickups, or level editor are implemented.

## Phase 3 development tool

The separate [Level Builder](builder/README.md) adds fifteen **experimental** 10-second profiles, a twelve-level draft, multi-ring **animation-only** preview, and validated single-ring Test Mode in this same game. It does not migrate the published progression or the six legacy 16-second profiles described above. Open it through the App Lab footer’s Developer Tools button; ordinary game navigation does not link to it.

Additional checks: `node d-fuze/test-builder.cjs` and `python d-fuze/test-builder-browser.py`. They protect legacy motion/level file snapshots, fixed alignment timing, experimental schema/storage behavior, real-game Test Mode isolation, and editor workflows/layouts.
