# Phase 4.5 — independent Rings Assembly and authoritative published data

## Level-loading audit and correction

The old `levels.js` constructed editor defaults and then overrode Level 1–3 timers, health, ammo, gate settings and playback using a hard-coded row table. Normal play also used a generated run seed instead of the configured level seed. Both paths are removed.

`published-levels.js` is now the single versioned **published Level Builder document**: six complete levels plus their assembly profile library. Its values preserve the prior published Levels 1–6 (including the 48/44/40-second first three levels). `levels.js` only validates this document and selects a level; it does not generate, merge, rebalance or substitute settings. The normal game uses the published seed per level; an intentional `?seed=42` debugging override remains available. There are no legacy 16-second profiles or legacy generation dependencies. `motion.js` remains shared interpolation/validation/PRNG math for the unchanged fifteen 10-second ring profiles.

Every normal gameplay field passes through the same schema adapter used by Test Mode: timer, bomb HP, ammo, turret speed/rate, ring count, each gate width/health and eligible family/profile IDs, ring playback, and assembly selection/playback. Engine constants only describe geometric layout. Missing/invalid published data displays **CONFIGURATION ERROR**, with no substituted level. Test Mode validates its separate transfer and can run valid experimental data independently of broken published data.

The builder's **LOAD PUBLISHED LEVELS** button clones this exact six-level document for editing. **RESET TO DEFAULTS** still creates the separate twelve-level experimental draft; those defaults do not feed normal play. Browser edits, session copies and local drafts never modify the published source. To publish intentionally: load the published document, edit and validate, export JSON, replace the data object in `published-levels.js` with that exported document (retain the small module wrapper), run tests, and commit through a reviewed PR. No repository-write API or automatic publisher is added.

## Parent hierarchy and clocks

`assembly.js` defines a logical `RingsAssembly` owning child Ring objects. Each ring has a non-enumerable parent reference. Its local angle is its sampled ring profile angle plus the existing upward gate reference offset. Its world/display angle is exactly `parent.angle + ring.localAngle`. Gate position, Canvas arcs, ray collision, and attached impact effects read that same world angle. Instantaneous beam endpoints retain the world-space point captured when fired.

The ring clock is `game.elapsed * level.playbackSpeed`. The independent assembly clock is `game.elapsed * level.assembly.playbackSpeed`. Neither clock modifies the other's keys or rate. The parent angle applies once to every child, preserving all relative alignment. The parent supports four children architecturally; gameplay still validates a maximum of two rings. Preview can show four without damage/collision logic.

Pause, hidden tabs and the existing phone orientation restriction freeze the source gameplay clock. Retry/new game/new level create a fresh parent and reset both clocks. Defusal/explosion keep existing transitions/effects. There is no random assembly speed or assembly alignment window.

## Gentle Drift and interpolation

The initial profile is `gentle-drift`, **Gentle Drift**, with a 25-second loop:

| Time (s) | Unwrapped angle (degrees) |
| --- | --- |
| 0 | 0 |
| 5 | 24 |
| 10 | 12 |
| 16 | −18 |
| 21 | −8 |
| 25 | 0 |

The sampler uses shape-preserving cubic Hermite interpolation with weighted harmonic tangents. Reversing slopes give zero tangents, avoiding overshoot. Both cycle endpoints share the same periodic tangent, so position and angular velocity remain continuous across the seam (C1 continuity; acceleration need not be C2). Angles stay unwrapped. If an authored loop ends at a different angle, subsequent cycles accumulate that net travel, enabling complete rotations without an artificial rewind. Ring profiles remain fixed and unedited.

## Edit and enable assembly motion

Open App Lab → Developer Tools, disposable public code **FUSE-LAB-3** (not secure authentication).

- In Ring Configuration, choose a level, enable assembly motion, select its assembly profile and set its independent playback multiplier (0.1–4×). Assembly is disabled by default in all six published levels.
- The **Assembly Motion** section selects a library profile to edit. Edit name, duration (1–300s), and time/angle rows; add a midpoint key, insert after a row, or delete an interior key. First time remains 0. The final key must equal duration. Changing duration does **not** stretch keys; adjust their times explicitly.
- The static graph samples the actual assembly interpolation. The small animated parent preview, Play/Pause, scrubber and preview speed do not edit level playback. The level preview combines selected local ring motion with the selected parent motion using independent clocks.
- DUPLICATE PROFILE creates an editable copy; ADD PROFILE starts a 25-second flat track. DELETE CUSTOM PROFILE cannot remove a referenced profile; first reassign every referring level. Gentle Drift itself cannot be deleted, but its draft keys can be edited. Profiles are shared within the draft, so editing one affects all draft levels referencing it.
- TEST LEVEL loads the actual game with the selected one/two-ring level and an independent snapshot of its assembly library. Retry keeps configuration and seed (or explicitly generates a new seed); Return to Editor preserves valid unsaved settings and library edits. Three/four-ring gameplay remains unavailable.

## Schema v2 and migration

JSON schema version 2 adds root `assemblyProfiles`: `{id, name, duration, keyframes:[[time,angle],...]}`. Per-level settings are `{enabled, profileId, playbackSpeed}`. Profile IDs must be unique and referenced IDs must exist even for disabled motion. Profiles have 2–100 ordered finite keys, time 0 through duration, angles within ±100000°, and no extra fields. The library supports up to 256 profiles (including migrations). Invalid keys/libraries block testing/export and produce readable messages; the animation preview does not sample invalid data.

Existing schema v1 JSON, saved browser drafts, session workspaces and Test Mode transfers migrate explicitly on read. Disabled settings select Gentle Drift without enabling motion. Old constant-speed settings become named keyframe profiles with `[0,0]` and `[25,25*speed]` and assembly playback 1×, preserving the original motion including continuous turns. All other level fields and eligible IDs are retained. Unsupported versions are rejected. Storage keys remain the same so old drafts are discoverable. Migration does not overwrite local saved drafts until SAVE DRAFT, and never changes published data.

JSON export/import and browser drafts include the library and all edited keyframes. CSV remains a main-table summary, not a complete backup. Imported data is validated numeric/string data, never executed as scripts or expressions.

## Verification

New checks:

```sh
node d-fuze/test-assembly.cjs
python d-fuze/test-assembly-browser.py
```

They check authoritative published settings and seed (including changing valid source values to prove no override), rejection rather than fallback, Test Mode independence, parent links/world-angle collisions, separate clocks, no-overshoot interpolation, C1 loop velocity, unwrapped rotations, key/library validation, JSON round trips, v1 browser draft migration, pause/retry, mobile add/insert/delete/graph UI, published-load action, and visible configuration errors. The existing builder browser suite also edits a custom assembly profile, exports/imports it, runs it in Test Mode, retries and returns to the editor with the library intact.

All previous D::FUZE engine/ring/builder/two-ring/browser suites, Breakout/Falling Blocks engine/browser suites, and gallery/Calculator regression checks are run. Both `/` and `/small-apps/` paths and representative desktop/tablet/phone sizes down to 320×480 are covered in Chromium. A phone screenshot was inspected for editor readability.

Physical phones, audible quality, non-Chromium browsers, actual mobile file pickers/downloads, live GitHub Pages deployment, and human difficulty remain manual checks. Editor data is local and requires an intentional reviewed publication step. Three/four-ring gameplay, random assembly motion, editable individual-ring profiles, and C2 spline continuity are outside this phase.
