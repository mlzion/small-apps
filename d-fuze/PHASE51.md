# Phase 5.1: coordinated motion shuffle and clearance

## One family per level, six editable profiles per family

Schema **v4** replaces per-ring `family` and level `playbackSpeed` with one `motionFamily` (`easy`, `medium`, `hard`). Every ring uses that family and the same exact ten-second clock; no ring playback multiplier remains. Ring width, health and numbering remain independent. Assembly profile/duration/playback rate are unchanged and independent.

Each family now contains exactly **six** editable profiles, 18 total. The original fifteen tracks are unchanged. Added authored tracks:

- `easy-06` — Soft counterstep: gentle short counterclockwise hold followed by a wider return, mirrored asymmetrically in the second half.
- `medium-06` — Asymmetric switchback: alternating travel, a held turn, and unequal clockwise/counterclockwise returns.
- `hard-06` — Counterspin recoil: unwrapped multi-turn travel, pauses and sharp internal reversals, with eased entries/exits to protected holds.

Ring profile creation, duplication and deletion controls are hidden and their handlers reject ring operations. Names and outside-hold keyframes remain editable; the library must retain six profiles per family. Assembly profile creation/duplication/deletion remains available. Imports may preserve existing custom profile IDs/content within the six slots; no runtime choice is restricted to built-in IDs.

## Shared deterministic assignment

`experimental-motion.js` owns the scheduler used by normal gameplay, Test Mode and Level Preview. The cycle is `floor(gameplayElapsed / 10)`. All ring assignments change together at 10, 20, 30 seconds and so on, independently of assembly phase.

For each block of six cycles, a seeded Fisher–Yates shuffle orders the family pool. Its cyclic rotations provide distinct assignments to 1–4 rings. The six rotations are visited in a seeded order, so **every ring receives every family profile exactly once in each six-cycle block**. At a block boundary, the first rotation excludes the preceding profile for every ring. With six profiles and at most four forbidden offsets, at least two boundary choices always remain.

A bounded recent-assignment list favors less recently used whole combinations, with seeded tie-breaking. Repetition after older cycles is allowed; immediate per-ring repetition is forbidden. The scheduler stores only the current block, assignment and last 24 combination keys. Skipping cycles replays the deterministic sequence; backwards seeks/reset replay from the same seed. Drawing extra frames consumes no random choices. Very large backwards/random seeks take time proportional to the target cycle, rather than retaining unbounded history.

The engine assigns profiles before updating ring angles and resolving shots. Preview uses the same scheduler and refreshes its assignment labels at cycle changes. Restart/Retry reset both the timeline and schedule; the same seed and configuration reproduce the run. Pause/visibility/orientation pause freeze gameplay time, both motion systems and assignment changes.

## Start, holds and unwrapped angles

All profiles retain exactly one zero-angle start key at 0.0 seconds and the existing final endpoint at 10.0 seconds. Both are locked in the editor; no redundant endpoint is appended. The protected alignment windows are unchanged:

| Family | Middle | Final |
| --- | --- | --- |
| Easy | 3.5–5.0s | 8.5–10.0s |
| Medium | 4.0–5.0s | 9.0–10.0s |
| Hard | 4.5–5.0s | 9.5–10.0s |

Protected keys cannot be moved, deleted, edited or sign-flipped. JSON validation rejects nonzero/moved starts, missing endpoints, invalid ordering and drift during holds. Existing protected interpolation eases away from zero and into holds with zero angular velocity. Therefore the old profile ends held at local zero, the next begins at local zero with zero initial velocity, and the shared assembly world angle stays continuous. Intermediate angles remain unwrapped degrees, preserving complete rotations and deliberate internal reversals. Assembly motion is never baked into these keys.

## Explicit migration

Opening normal play/new editor loads the v4 published JSON. Importing v1/v2 retains the existing explicit migration path before applying v3→v4. For a legacy v3 level:

1. Validate the old family/multiplier fields before removing them.
2. Select the **strongest family present**, using Hard > Medium > Easy. This preserves the strongest authored motion category rather than making a random choice. Mixed published Levels 8/9/11/12 become Medium/Hard/Medium/Hard respectively.
3. Remove per-ring family fields and the old ring playback multiplier. The cycle now lasts exactly ten gameplay seconds, as requested; previous 1.05/1.1/1.12× rates are intentionally not retained.
4. If a family has five profiles, append its authored sixth track and report it. A pre-existing six-profile custom family is retained. Other counts are rejected with an error; profiles are not discarded. ID collisions receive a deterministic `-migrated` suffix for the inserted track.

Migration reports each level's family/rate decision and every added profile. Seeded assignments intentionally change from older versions because the pool and schedule have changed; reproducibility applies to the same v4 configuration and seed. All twelve published timers, bomb HP, ammo, turret speed, fire rate, gate widths/health, seeds and assembly settings are unchanged. A test-only v3 level fixture verifies the full migration. Unsupported/malformed inputs cannot be published. The shape/version change needs no browser-draft migration because drafts/autosave remain absent.

## Geometry

Bomb radius 75 and ring radii 108/138/168/198 with thickness 8 are unchanged. Turret orbit moves from 235 to **249**, and the inward-facing tip/muzzle moves from 216 to **230**. The fourth wall's outer edge remains 202, so muzzle clearance grows from 14 to **28** units. The turret's outer vertex remains at radius 263 within the 300-unit canvas half-size. Muzzle flash is shortened to remain outside the fourth wall. The same muzzle constant supplies the actual ray origin and visible beam. No collision rule or ring numbering changes.

One/two/three-ring spacing and bomb clearance are preserved. Phone Canvas scaling remains circular with safe margins; portrait controls and landscape pause behavior are unchanged.

## Builder workflow and manual Android Chrome checks

The workflow stays **Load Published → Edit in memory → Test in separate tab → Publish (download JSON)**. Publish exports complete validated v4 data; it does not update GitHub or the live site. Existing game sessions retain their original configuration snapshots. Add Level 13+ and the 1–200-level validation ceiling are unchanged.

On Android Chrome:

1. Open Developer Tools (`FUSE-LAB-3`), select a four-ring level, and change its one Motion Family selector. Confirm there are no per-ring family or ring rate controls.
2. Play Level Preview for several cycles. Assignment names should change together at ten-second boundaries, with different profiles on every ring and no immediate per-ring repeat. Confirm the independent assembly keeps drifting; width edits should update without resetting playback.
3. In Ring Profiles, inspect six profiles per family. Confirm the start and alignment keys are protected, editable angles accept +/−, and there are no ring Add/Duplicate/Delete Profile controls. Switch to Assembly Profiles and confirm its management and rate controls remain available.
4. Test the level. Check clearance, shoot gates outside inward, pause/resume, rotate landscape/portrait and manually resume. Retry should repeat the same seeded schedule from zero. Return should preserve in-memory edits.
5. Import an older configuration and review migration notes. Publish and verify a v4 JSON download with 18 ring profiles and level-wide families; it is NOT LIVE until installed/deployed through a PR.

Automated tests cover 18,000 cycles across 1–4 rings/families/seeds, six-cycle coverage, exact boundaries, continuity, unwrapped turns, frame-rate independence, migration and malformed JSON, preview/Test Mode consistency, gameplay/collisions and mobile/root/Pages regressions. Physical Android performance/touch/file-download behavior, audible quality, other browsers and live deployment remain manual checks. Balancing may feel different because motion families are unified and ring speed is fixed; no health/ammo/timer/gate balance values were adjusted.
