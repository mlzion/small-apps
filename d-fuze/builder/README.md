> **Current editor:** Ring and assembly profiles now share a protected keyframe editor with Play/Stop controls. Schema v3 removes eligibility/assembly-enable flags and uses 10° gate steps. See [current instructions and migration details](../UNIFIED-MOTION.md). Earlier phase notes below are historical.

> **Phase 4.5:** Published data is now authoritative, and a separate editable 25-second assembly parent replaces constant velocity. See [current assembly/data instructions](../PHASE45.md). Earlier phase descriptions below are historical.

> **Motion migration:** All six published levels now use only the Level Builder’s 15 ten-second profiles. The legacy profile definitions have been removed. Earlier phase notes below are historical.

> **Phase 4 update:** One- and two-ring gameplay tests are now supported, normal play ends after Level 6, and optional constant assembly rotation is available. See [Phase 4 instructions](../PHASE4.md) for current behavior. Historical phase descriptions below describe the earlier implementation.

# D::FUZE Level Builder — experimental development tool

## Open and access

Serve the repository with a static HTTP server. From App Lab, use **Developer Tools** in the homepage footer. Direct navigation also works at `d-fuze/builder/` or `/small-apps/d-fuze/builder/`. Enter the disposable public code **`FUSE-LAB-3`**.

This is **not secure authentication**. The code and all source are public; the gate only discourages casual visitors. It grants no repository access and uses no passwords, API keys, or secrets. To change it, edit `ACCESS_CODE` near the top of `builder.js`, update the documented code and browser test, and bump that script's `?v=` revision in `index.html` so refreshed HTML requests it. A remembered tab stores the current code in session storage; changing the code invalidates that match. LOCK TOOLS reopens the prompt without deleting a saved draft.

## Workflow

1. **Level Table:** edit timer, bomb health, ammunition, turret degrees/second, shots/second, ring count, and playback multiplier. Choose EDIT to select a row. ADD copies the selected settings to a new last row; DUPLICATE inserts a copy after it. DELETE and MOVE UP/DOWN change the draft only. Reordering renumbers levels from 1. On phones the table scrolls within its own container.
2. **Ring Configuration:** edit the selected name and seed, then each inside-to-outside ring's gate width/health, family, and eligible profile checkboxes. Family changes enable all five new-family profiles. The final eligible checkbox cannot be disabled. NEW SEED deliberately changes assignment; otherwise assignments stay reproducible. Assembly rotation stays disabled.
3. **Motion Profile Viewer:** select Easy/Medium/Hard and use arrows to inspect one of five profiles. The static, responsive DPR-aware graph samples the exact shared motion calculation and marks actual keys. Green bands shade guaranteed holds. The small ring uses the same calculation as the game. PLAY/PAUSE, speed, and the scrubber control this viewer independently of level playback settings.
4. **Level Preview / Test:** the selected level's seeded assignments animate up to four rings on one clock. Play, Pause, Restart, and preview speed affect preview only. Gate widths are independent. Preview never runs collisions, damage, ammunition, countdown, or assembly movement. It does not instantiate a multi-ring game.
5. **TEST LEVEL:** available only for a valid single-ring level, with no configuration errors anywhere in the table. It saves the valid workspace and selected experimental level to this tab's session storage, then opens the actual `../?test=1` game. Press START TEST to unlock audio and begin. No second game build is used.
6. **Test results:** victory or failure offers RETRY LEVEL with the same seed, RETRY WITH NEW SEED, and RETURN TO EDITOR. Test retries restore resources and three test lives. Next-level actions are absent and blocked in the engine. Return also appears while paused. The TEST MODE indicator remains visible. Returning restores the original unsaved editor settings; generating a test seed does not overwrite the editor seed. Normal player progression is not written or read by tests (the existing game has no persisted progress/high scores). The existing mute preference remains shared.
7. **Import / Export:** EXPORT JSON downloads the entire versioned configuration, including all ring selections. IMPORT JSON validates the entire file before replacing anything; malformed, incompatible, oversized (>1 MB), or unknown fields are rejected. EXPORT CSV contains only the main table and seed/name, not nested ring settings. Spreadsheet formula-like text is escaped in CSV. Neither action writes to GitHub.
8. **SAVE DRAFT / LOAD DRAFT:** explicit persistent storage in this browser only, not GitHub, another browser/device, or a synchronized account. A separate session copy preserves the last structurally valid workspace across Test Mode and refreshes; unfinished invalid numeric edits are not persisted. Browser storage may be unavailable or full, in which case an error is shown and Test Mode transfer cannot proceed. Export JSON for a portable backup. RESET TO DEFAULTS confirms replacement of current edits; a separately saved local draft is not deleted.

The editor works in both orientations, including portrait phones. The actual Test Mode game preserves the existing phone landscape restriction and pause behavior. Tab hiding pauses editor previews. All page paths are relative for GitHub Pages.

## Fixed experimental motion library

`../experimental-motion.js` contains library `builder-10-v1`, separate from unchanged `../motion.js` legacy tracks. IDs are stable; imported JSON selects IDs and **cannot contain executable code or replacement keyframes**. Family/keyframe objects are frozen. All fifteen profiles use the existing `sampleProfile` interpolation; no level slider stretches or rewrites keys.

| Family | IDs | Middle hold | Final hold | Guaranteed aligned time |
| --- | --- | --- | --- | --- |
| Easy | easy-01 … easy-05 | 3.5–5.0s | 8.5–10.0s | 3s / 30% |
| Medium | medium-01 … medium-05 | 4.0–5.0s | 9.0–10.0s | 2s / 20% |
| Hard | hard-01 … hard-05 | 4.5–5.0s | 9.5–10.0s | 1s / 10% |

All cycles are ten animation seconds. Every mixed-family selection shares `[4.5,5]` and `[9.5,10]` at exact relative angle zero. Playback speed scales the whole clock, preserving the guaranteed alignment percentage. Incidental alignment outside holds is allowed. Graph angles are unwrapped, so a full revolution remains visible on the graph.

The five Easy tracks cover a broad pendulum, clockwise excursion, counterclockwise steps, uneven figure eight, and delayed reversal. Medium adds double switchbacks, long clockwise returns, broken counterturns, three-part weaving, and offset braking. Hard adds snap oscillations, orbit/recoil, four-way feints, charged pauses, and rolling cascades. These have deliberately different key timing, travel, pauses, and reversal patterns, rather than renamed speed variants.

Changing fixed experimental keys requires a new library revision and an explicit configuration migration.

No migration of the six published 16-second legacy profiles or normal level configuration occurs. SHA-256 regression snapshots protect both files, and the original game tests run against normal mode. Future publication of experimental levels requires a separate explicit configuration migration and gameplay validation.

## Versioned schema and validation

`../level-schema.js` is the central validator, defaults, JSON/CSV serializer, browser draft helper, and game runtime adapter. Root fields are `format: "d-fuze-levels"`, `version: 1`, `motionLibrary: "builder-10-v1"`, and `levels`. A level contains `number`, optional `name`, `timer`, `bombHealth`, `ammo`, `turretSpeed`, `fireRate`, `ringCount`, `playbackSpeed`, `seed`, disabled `assembly`, and its `rings`. Each ring has inside-out `number`, `gateWidth` (degrees), `gateHealth`, `family`, and an eligible `profiles` ID array. No imported expressions, scripts, URLs, or profile definitions are evaluated.

Main ranges: timer 5–300s, bomb HP 1–100, ammo 1–999, turret 15–360°/s, fire rate 1–12/s, ring count 1–4, playback 0.25–3×, seed uint32; gate width 10–180° and health 1–50. Integer fields are checked. Documents contain 1–200 levels, with unique positive level numbers and names up to 80 characters. Unknown fields/versions/libraries, mismatched counts, invalid IDs/families, duplicate/empty eligibility, or enabled assembly movement are rejected.

Validation includes minimum damaging hits `bombHealth + sum(gateHealth)` and whether that ideal number of cooldown-spaced shots fits strictly before timeout. Library validation and tests protect all fixed hold definitions, mixed-family overlap, and deterministic assignment. **Structural validity is not a human playability or difficulty guarantee.** Profiles, narrow gates, reaction time, missed shots, and tracking may make valid levels impractical. All twelve defaults are provisional. Each block of three introduces another preview ring and eases timer, gate health/width, and family before increasing difficulty again. Only the first three are eligible for gameplay Test Mode; multi-ring play is Phase 4.

## Tests

From the repository root:

```sh
node d-fuze/test-builder.cjs
python d-fuze/test-builder-browser.py
node d-fuze/test-engine.cjs
node d-fuze/test-rings.cjs
python d-fuze/test-browser.py
node breakout/test-engine.cjs
node falling-blocks/test-engine.cjs
python tests/check_site.py
python breakout/test-browser.py
python falling-blocks/test-browser.py
```

Chromium/Playwright are development tools only. New tests cover all fifteen definitions, exact holds/percentages, 125 mixed-family combinations, interpolation/loops, seeded assignment, schema rejection and round trips, CSV, drafts, single-ring runtime loading/retries/no advancement, multi-ring rejection, and unchanged legacy hashes. Browser workflows exercise both hosting roots, access/lock, editing/reorder/eligibility, graphs/scrubbing, preview, real downloads/imports, browser draft loading, real-game launch/results/retries/return with unsaved edits, invalid Test Mode rejection, normal-game isolation, and mobile/desktop layouts at 320×480, 375×812, 412×915, 768×1024, and 1440×900. Screenshots are saved under `/tmp/d-fuze-builder-WIDTH.png`.

Physical Android/iOS devices, actual download/file-picker behavior on those devices, audible sound quality, non-Chromium browsers, live Pages deployment, and human balancing are not established by emulated tests. Those need manual verification. CSV import, custom profile editing, actual authentication, automatic publishing/sync, multi-ring collisions/gameplay, and assembly movement are intentionally absent.
