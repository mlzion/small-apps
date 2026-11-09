# Phase 4 — two-ring gameplay

Levels 1–3 retain the legacy single-ring settings and 16-second profiles. Normal Levels 4–6 explicitly load the Phase 3 draft rows through the validated runtime adapter, using the run seed for reproducible profile selection. Level 6 success displays “All 6 available levels complete” with Main Menu and no Next Level. Both UI and engine prevent advancement; no three-ring level is truncated or enabled.

| Level | Time | Bomb HP | Ammo | Inner / outer gate width | Gate HP each | Family | Playback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 77s | 3 | 50 | 110° / 106° | 2 | Easy | 1× |
| 5 | 71s | 5 | 58 | 95° / 91° | 3 | Medium | 1.05× |
| 6 | 65s | 7 | 66 | 80° / 76° | 4 | Hard | 1.10× |

The adapter now loads each ring's own width, health and seeded eligible profile. It accepts one or two rings and rejects three/four for gameplay. The existing ray/annular-sector resolver and renderer are unchanged: the outer ring is physically encountered first, and every intact gate or wall blocks the ray. A destroyed gate opens only its own sector, while the red wall continues blocking. One shot spends one ammo and damages at most one target; beams end at the first intersection. The bomb can be hit only through both actual openings. No scripted alignment permission is used.

## Assembly rotation

Schema v1 remains backward compatible with `{ "enabled": false }`. Optional assembly settings are now `{ "enabled": true, "speed": 20 }`, in degrees per **gameplay second**, with signed speeds from −180 to 180. Enabled rotation requires a finite speed; disabled rotation ignores it. No random motion or acceleration is added. Both rings receive the same `elapsed * speed` offset after profile sampling. Collision uses the resulting displayed angle. Playback speed changes the shared profile clock independently of assembly speed. Pause freezes both; restart resets both clocks. Existing motion definitions and alignment percentages are unchanged.

## Test a two-ring level

Open App Lab → Developer Tools, code `FUSE-LAB-3`. Select EDIT 4, 5, or 6, or change any draft to two rings. Independently edit each family's eligible profiles, gate width, and health. Enable constant assembly rotation and set its speed if desired (disabled by default). Animation preview uses the same offset and motion calculation. TEST LEVEL opens the actual game. Same-seed retry restores both gates and the same assignments; new-seed retry deliberately changes the seed. Return to Editor restores original edits. Results never advance Test Mode. Levels with three/four rings remain preview-only, clearly marked for Phase 5. No editable motion-profile tool is added.

Validation minimum ammo includes both gate health values plus bomb health. A structurally valid level is not a human difficulty guarantee. Existing single-ring and experimental files remain importable.

## Verification

Run all prior suites plus `node d-fuze/test-two-rings.cjs`. New tests cover outside-in wall/gate collisions, inner/bomb immunity, independent damage/destruction, opening passage, permanent wall blocking, one-target damage and beam endpoints, all nine mixed-family pairs, exact common holds, seeded selection, constant assembly/displayed-angle collision, pause/retry, ammo/timeout and normal progression through six levels. A conservative common-hold strategy wins all nine tested family combinations. `test-rings.cjs` now validates legacy progression only at Levels 1–3; Phase 4 tests cover 4–6 instead of treating later levels as legacy single-ring levels. Legacy helper/data hashes remain protected.

`python d-fuze/test-builder-browser.py` now tests actual two-ring launch, assembly rotation, victory/retry/return, the normal end message, and two-ring touch/rotation pause on a 320×480 emulated phone at `/` and `/small-apps/`. Existing game, builder, Calculator, Breakout, Falling Blocks and gallery suites are also run. No physical devices, audible quality, other browsers, or live deployment are established by these Chromium emulations. Human balance of the provisional draft rows needs playtesting. Three/four-ring gameplay and complex assembly motion remain deferred.
