> Phase 5.1 updates ring families, shuffling, schema and turret clearance. See [current motion/geometry rules](PHASE51.md); the original Phase 5 values below are historical.

# Phase 5: four rings and content-driven progression

## Gameplay and architecture

Normal play and Test Mode support one to four rings through the same engine. Ring 1 is innermost; shots encounter Ring 4 first when four are active. The existing annular-sector ray collision finds the first wall/gate intersection using current world angles at the instant of firing. A shot consumes one ammo and damages at most one target. Walls never take damage; intact gates stop shots; destroyed gates leave rotating openings. All openings on the ray must be clear before bomb damage is possible.

Geometry is unchanged: bomb radius 75, ring centerline radii 108/138/168/198, thickness 8, muzzle radius 216, and turret orbit 235 (600-unit square scene). This preserves one/two-ring appearance, leaves 22 units between ring cross-sections, and places the outer wall 14 units inside the muzzle. Canvas scales uniformly in portrait; Android landscape restrictions, controls, effects and audio retain their existing behavior.

Each ring independently selects from **all** profiles in its configured family with seeded randomness. Ring profiles and protected holds are unchanged: Easy 3.5–5/8.5–10, Medium 4–5/9–10, Hard 4.5–5/9.5–10 seconds. Mixed rings share 4.5–5 and 9.5–10 at local zero. All rings share the ring clock. The always-active assembly uses its own profile, duration and rate on an independent clock. World angle remains assembly angle + local profile angle + common reference offset. Assembly movement preserves relative alignment, but the player must track the resulting world-space openings.

Level Preview uses the same profiles, geometry and world-angle composition. Live gate widths, continuous elapsed time, independent looping, and Play/Stop behavior from PR #14 remain intact. Tests compare actual preview arcs with the gameplay engine for four rings over multiple cycles.

## Published levels and session snapshots

`published-levels.json` is the only normal gameplay dataset. A game controller captures one complete validated copy (levels, ring library and assembly library) when created. Retry, advancement and New Game within that page use the same snapshot, even if a later loader request changes or fails. A newly loaded game page reads the current published file.

The game's final level is the number of entries in that snapshot, not a hard-coded 6 or 12. Configurations must contain **1–200 consecutive ordered levels beginning at Level 1**. This existing technical ceiling keeps the editor/file validation bounded. Level count is independent of ring count; any level can use 1–4 rings. No normal-game generator fills missing levels. Invalid or missing data shows an error. The completion screen uses the actual snapshot count, and advancement remains a manual button press.

Schema v3 is unchanged in shape. Existing valid six-level v3 files still load and end naturally after six. Full imported/exported configurations now require consecutive numbering; a standalone Test Mode payload may retain its selected level's positive number (e.g. Level 20), without pretending to be a full progression.

## Initial Levels 7–12

All published Levels 1–6 and both motion libraries are preserved exactly. Levels 7–12 copy the existing Level Builder template values once into published JSON. The template is not consulted during normal gameplay. Within each slash-separated value, rings run inner to outer.

| Level | Rings | Timer | Bomb HP | Ammo | Gate widths (°) | Gate HP | Families | Ring rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 3 | 89 | 3 | 60 | 110/110/100 | 2/2/2 | Easy/Easy/Easy | 1× |
| 8 | 3 | 83 | 5 | 68 | 100/90/90 | 3/3/3 | Medium/Medium/Easy | 1.05× |
| 9 | 3 | 77 | 7 | 76 | 80/80/70 | 4/4/4 | Hard/Hard/Medium | 1.1× |
| 10 | 4 | 101 | 3 | 70 | 110/110/100/100 | 2/2/2/2 | Easy/Easy/Easy/Easy | 1× |
| 11 | 4 | 95 | 5 | 78 | 100/90/90/80 | 3/3/3/3 | Medium/Medium/Easy/Easy | 1.05× |
| 12 | 4 | 89 | 7 | 86 | 80/80/70/70 | 4/4/4/4 | Hard/Hard/Medium/Medium | 1.1× |

All use turret 120°/s, fire rate 4/s, Gentle Drift assembly at 1×, and seeds 4206–4211. Minimum damaging shots (gates + bomb) are 9/14/19/11/17/23; ammo leaves a substantial blocked-shot margin. Timers permit repeated common holds, and each new ring count eases width/health/families before increasing difficulty again.

A conservative strategy following assembly motion with the actual bounded-speed turret and firing during common holds completed every new level for seeds 1, 42, 4200 and 90000 in executed engine tests. These are provisional settings, not claims of perfect balance or universal solvability of arbitrary editor configurations. Structural validation checks ammo and the ideal firing-time floor; it cannot prove human difficulty or all possible custom profile combinations.

## Add Level 13 and beyond

1. Open App Lab → Developer Tools (public deterrent code **FUSE-LAB-3**).
2. A new editor page loads all current published data. Select a valid level and choose **ADD LEVEL** to append a copy, or **DUPLICATE** to insert one. Edit timer/resources, 1–4 rings, per-ring widths/health/families, and assembly profile/rate. Move/delete controls renumber all rows. The level table scrolls inside its container as it grows.
3. Preview the level, then **TEST LEVEL**. All ring counts and level numbers are supported. A separate game tab receives a validated snapshot, preserves seed/configuration on Retry, and never advances. Keep the original editor tab open; Return to Editor closes the test tab and restores focus without storing editor changes.
4. **PUBLISH (DOWNLOAD JSON)** validates the full consecutive dataset and downloads complete `published-levels.json`. It is **NOT LIVE**. Give that file to Codex to install through a repository PR, review, merge and Pages deployment. The editor does not communicate with GitHub or change the running published game.
5. Future game pages then see the added content and automatically end at its final level. Existing sessions continue using their original snapshots.

No drafts, autosave or workspace restoration are added. Reload Published Data confirms before discarding unsaved edits. See [publishing](PUBLISHING.md) and [motion editing](UNIFIED-MOTION.md).

## Verification and manual checks

`test-multi-rings.cjs` covers 1–4-ring outside-in damage, independent gate health/widths, walls at every radius, bomb immunity/beam endpoints, retry, all 81 four-ring family combinations, protected holds over later cycles, seeded choice, pause, assembly/world angles, 24 bounded-turret wins, 1/12/13/20/200-level progression, session snapshots and malformed numbering.

`test-multi-browser.py` checks three/four-ring play through keyboard/touch, geometry and endpoints, small-phone portrait controls, orientation pause/manual resume, Level 13 editor/Test Mode/retry/return/snapshot isolation, Add/Duplicate/Delete/Move operations, actual 13/20-level downloads loaded through normal gameplay, and 20-level UI progression at both `/` and `/small-apps/`. `test-preview-browser.py` checks four-ring preview world angles past 100 simulated seconds and live widths. Existing D::FUZE and App Lab regression suites are also run; see the PR for executed results.

For manual browser testing, use Test Level on Levels 7 and 10–12, destroy gates outside inward, miss into a red wall, pause/resume, rotate a phone into landscape and back, retry, and verify gates/resources reset. Add Level 13, edit and test it, return, publish, and verify the downloaded file contains all libraries and levels. Only install/deploy that file through the repository workflow.

Automated browser checks use desktop/mobile Chromium emulation and controlled time. Physical Android performance/touch feel, audible sound quality, other browsers and live GitHub Pages require manual verification. No physical-device performance claim or real-time endurance benchmark is made. Four rings use the existing lightweight Canvas drawing/collision path; no additional timers or animation loops are introduced.
