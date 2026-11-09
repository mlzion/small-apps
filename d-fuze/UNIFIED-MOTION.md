# Unified motion editor and schema v3

Open App Lab → Developer Tools (`FUSE-LAB-3`, public disposable deterrent), then **Motion Editor**. Choose **Ring Profiles** or **Assembly Profiles**. One set of profile/keyframe controls drives the selected type. Each type retains its own graph, animated preview and time/angle readout; the mode shows the appropriate view to keep phones compact.

## Editing

Select, rename, duplicate, add or delete profiles. Time/angle rows support Add Keyframe, Insert After and Delete Key. Ring keys additionally expose linear/smooth interpolation outside protected holds. Editable angle fields use a text keyboard so a minus can be entered; the adjacent **+/−** button reliably reverses the numeric sign even on phone keyboards without a minus key. Negative values are numeric data in drafts, JSON and gameplay, not strings or expressions.

Ring duration is locked to **10 seconds**. The first/last zero keys and all alignment-window keys are read-only, cannot be deleted or sign-flipped, and insertion inside holds is disabled. Imports and saved data are also validated, so bypassing the UI cannot break holds. Editing an outside key into a protected interval causes a validation error. Segments touching holds (and loop endpoints) use smoothstep easing automatically, giving zero angular velocity into/out of holds. Other segments can use deliberate linear/sharp transitions. No assembly angles are baked into ring keys.

| Family | Protected holds | Guaranteed aligned share |
| --- | --- | --- |
| Easy | 3.5–5 / 8.5–10s | 30% |
| Medium | 4–5 / 9–10s | 20% |
| Hard | 4.5–5 / 9.5–10s | 10% |

All families therefore still share 4.5–5 and 9.5–10 exactly at relative zero. Incidental alignment elsewhere remains possible. Deleting the last profile in a family is blocked. New/duplicated profiles join the family's complete selection pool immediately; no per-profile eligibility setting remains.

Assembly profiles retain their independently editable duration and shape-preserving smooth-loop interpolation. A profile referenced by any level cannot be deleted until those levels select another profile. Ring profile deletion does not require per-level reassignment because levels select families, not individual profile IDs. Changes are shared throughout the draft library, so editing a profile affects every draft level whose family/selection uses it.

## Play / Stop

There is one **Play / Stop** button for the selected motion profile. Play always begins at time 0 at normal 1× profile time. Playback loops at 10 seconds for rings or the authored assembly duration. Stop resets time to 0 and redraws the starting pose. The graph's orange playhead moves during playback and is not interactive. Speed selectors, timeline sliders and Pause/Resume controls are removed.

The combined Level Preview also uses a single Play/Stop button, restarting/resetting its scene clock at zero. It runs at normal elapsed-game-time speed, respecting the level's configured ring and assembly rate multipliers. These game settings are distinct from removed preview-speed overrides. Hiding/locking tools stops and resets previews. Actual game pause/resume behavior remains unchanged.

## Gate widths

Every gate-width editor is a dropdown: 10°, 20°, …, 120°. Schema v3 accepts only these values. New invalid imports are rejected, never rounded silently. Migrating v1/v2 files rounds legacy valid 10–180° values to the nearest 10° (ties upward), then clamps at 120°. Every adjustment appears in the import/load/session migration report; already-valid values are preserved.

Published adjustments required by the new rule:

- Level 3 Ring 1: 64° → 60°.
- Level 4 Ring 2: 106° → 110°.
- Level 5 Ring 1: 95° → 100°; Ring 2: 91° → 90°.
- Level 6 Ring 2: 76° → 80°.

All other published gameplay resource values remain unchanged.

## Assembly is always active

All six normal levels and all experimental levels run their selected assembly profile. The enable/disable flag and checkbox are removed. New levels select **Gentle Drift** by default; migrations supply it when no profile is specified and report that choice. Existing selected profiles and their playback multipliers are retained. The separate assembly parent and its independent clock remain authoritative for world angles and collisions. An intentionally flat authored profile may have no visible rotation, but the assembly clock still runs; no enable flag bypasses it.

The per-level assembly rate remains a gameplay setting, not an extra preview speed. Published Levels 1–6 now select active Gentle Drift at 1×. Ring and assembly clocks never merge, and Test Mode remains isolated. Three/four-ring gameplay remains preview-only.

## Schema and migrations

Schema **v3** adds editable `ringProfiles` alongside `assemblyProfiles`. Ring profile data is `{id,name,difficulty,duration:10,keyframes:[[time,angle,easing],…]}`. Family hold definitions remain fixed in code and cannot be imported/redefined. Levels' rings contain only number, width, health and family: obsolete `profiles` eligibility arrays are removed. Assembly settings contain only `{profileId,playbackSpeed}`.

The seeded random algorithm is preserved. It selects from **all** profiles in the assigned family, in library order. The same seed and configuration reproduce assignments. A legacy subset restriction is deliberately removed, so a migrated subset may choose a different profile for the same seed; the migration report explains the new pool. Creating/deleting profiles also intentionally changes that pool.

JSON export/import, local saved drafts, session restoration and Test Mode transfers include both editable libraries. Versions 1 and 2 migrate on read, including the prior constant-speed-to-keyframe conversion. Migration preserves level fields and selected assembly/rate values except for the explicitly requested removal of flags/lists and gate-width adjustments. Saved local drafts are not overwritten until SAVE DRAFT. Invalid legacy data or unsupported versions are rejected. Published v3 configuration remains the only source for normal play; browser drafts do not write to the repository. Use LOAD PUBLISHED LEVELS to edit the six-level source before an intentional reviewed publication.

## Validation performed

New `node d-fuze/test-unified-motion.cjs` covers negative custom keys, JSON/draft/Test Mode persistence, all-family seeded selection including new profiles, protected holds and zero-velocity entry/exit, v1/v2 migration reports, width rejection, obsolete-field rejection, and active parent/world angles at all six normal levels.

New `python d-fuze/test-unified-browser.py` covers real touch sign flips, negative preview angles and exported values, reload/draft persistence, Play/Stop reset and 10/25-second looping through the actual preview clock, protected row controls, ring creation/deletion, removed controls/checkboxes, width dropdowns, visible migration adjustments, rejected v3 widths, and Android-sized/desktop layouts. Existing game, ring, builder, assembly, two-ring and App Lab regression suites are also run. Paths work at `/` and `/small-apps/`. No other App Lab source files are modified.

Physical Android/iOS keyboards, audible sound quality, non-Chromium browsers, real mobile file pickers/downloads and live Pages deployment remain manual checks. Automated touch/layout checks use Chromium emulation. Human balancing may change because assembly now runs and some gate widths were normalized. Profile editing does not guarantee a humanly beatable configuration.
