# Galactix v0.4

A standalone portrait arcade shooter, built on merged v0.3 (PR #47), now with **40 sectors**, progressive weapon unlocks, delayed stronger bosses, and continuous synthesized background audio. Original ship geometry, space motif, smooth relative controls, ordinary enemy families, attack patterns, accuracy scoring and best scores are retained.

All application code, tests and documentation are in `space-shooter/`. The only shared-file edit updates Galactix's gallery description to v0.4/forty sectors. No other App Lab applications, dependencies or hosting configuration changed. There are no external libraries, audio files, images, runtime requests, build step or server requirements. Relative script/navigation paths support GitHub Pages **`/small-apps/`** and a domain root.

## Controls and progression

- Drag the lower-left relative trackpad with one thumb and hold the independent right FIRE button with another. Lift and reposition without teleporting. Small-motion damping and the responsive 520 logical-pixels/second dodge cap are unchanged. Extra fingers, cancelled touches and capture loss do not leave held controls behind.
- Keyboard: arrows/WASD to move, Space to fire, P to pause/resume. Gameplay focuses the canvas, and Space's native button behavior is suppressed during flight, including reward announcements, so a held/released fire key cannot accidentally activate Pause.
- Portrait only. Landscape covers and pauses the game. Returning to portrait requires Resume. Blur/hidden pages stop gameplay and audio. Pause can also freeze an in-progress reward announcement; Resume continues its remaining time. Restart/retry starts a fresh hull at the same sector.
- A regular new campaign starts at **sector 1** and advances sequentially through **40**. Sector 40 ends with a special campaign victory screen and expanded fanfare. Best scores retain `galactix.best.v01`; unavailable storage never prevents play.
- **Assignment correction honored:** the existing development selector remains visible on every menu, including Pause, with all **40 sectors**. Selecting a sector starts a new test run with earlier bosses' weapon unlocks already initialized. For example, 20 starts with Rapid/Spread/Double unlocked, 21 additionally unlocks Laser, and 26+ unlocks Mine. A jump starts with a normal weapon, not a free consumable; its drop pool has the appropriate earlier unlocks. Selecting 1 resets to a fresh campaign.

Learned unlocks persist across retries within the current campaign. Restart/retry starts with the normal weapon and cannot claim the same unlock twice. Completing a sector carries the current offensive weapon's remaining time or charge into the next sector, so a weapon awarded by the last boss kill is still ready there. Shield/hull reset as in earlier releases. Menus and celebrations do not consume weapon time.

## One offensive weapon slot

Only **one** offensive power-up can be equipped. Any offensive pickup replaces the current weapon immediately, even if it has a lower rank. The previous timer/charge is discarded. Recollecting the same kind refreshes it. Replacement cancels any active laser or undetonated player mine; already-emitted ordinary projectiles retain their flight and accuracy snapshots. A shield never changes the offensive slot or cancels its effect. Expiring/consuming a weapon returns to normal single shots.

| Rank | Weapon / icon color | Effect | Unlock boss | Random drops begin |
| --- | --- | --- | --- | --- |
| Defensive | Green shield silhouette | Absorbs one hit, original 1.8s grace and protective ring | Available initially | 1 |
| 1 | Yellow lightning · Rapid Fire | Half the normal cooldown, 8 seconds | 5 | 6 |
| 2 | Blue V · Dual Spread | Two angled shots, **5° total** (±2.5°), 10 seconds | 10 | 11 |
| 3 | Purple twin bars · Double Barrel | Two parallel shots, 10 seconds | 15 | 16 |
| 4 | Orange ray · Laser | One activation, continuous-looking 0.25s beam, at most 3 kills | 20 | 21 |
| 5 | Pink circular mine · Mine | One launched proximity/fused blast, at most 4 kills | 25 | 26 |

Laser and Mine automatically activate on the **next firing action**, consume their charge, and return the slot to normal. Rapid Fire cannot stack with any other offensive weapon. The normal v0.3 cadence remains 0.285s in sector 1, gradually reaching ~0.242s in sector 20, then holding steady through 40. Parallel/spread emissions still count as a single firing action.

The original ship gains the active weapon's yellow/blue/purple/orange/pink tint and soft glow. Timed weapons flash their own color six times in the final two seconds, then restore normal colors. Charged specials stay colored until used. Shield alone does not tint the ship. Hostile shots render above glows for visibility. All six pickup icons share matching Canvas discs, scale and gentle animation, with no external assets.

### Laser and mine damage rules

Both specials deal **two HP damage once per target per activation**. Scouts and 2-HP ordinary enemies can be destroyed in one hit; a healthy boss loses only two HP. Neither effect repeatedly damages a boss while overlapping it. The limits count **destructions**, not nonlethal hits: a beam can damage a healthy boss and destroy up to three other ships, and a mine can damage a healthy boss and destroy up to four. Once the kill budget is exhausted, no further targets take damage. A weakened boss killed by a special counts toward the budget and immediately starts the boss announcement, stopping the rest of that activation.

Laser is an 8px-wide upward beam anchored to the moving player. Targets intersecting the beam are checked from nearest to furthest. The beam lasts exactly 0.25 simulation seconds from emission; a hit set prevents repeated damage. Its orange/white ray has a distinct synthesized sound.

A player mine travels upward at 210 logical pixels/second. After a brief arming period, it detonates near enemies, or at its fuse/upper-field limit. Its visible pink blast has a **72px radius**; enemy body overlap counts. Damage is applied once, nearest targets first, up to four destructions. Deployment and explosion have distinct sounds. It does not repeatedly tick damage or remain as a permanent hazard.

### Accuracy and bonuses

Unchanged accuracy tiers: attempt 1 **100%**, 2 **85%**, 3 **70%**, 4 **55%**, 5+ **40%**. Any successful enemy hit, including nonlethal boss/armor damage, resets the counter for future firing actions. Each firing action retains an immutable snapshot for every projectile or area target it hits. Delayed shots, spread, parallel barrels, beams and mine explosions cannot promote later hits from the same action after an earlier hit resets the counter.

The killing action's snapshot multiplies the enemy's base points. Nonlethal damage awards no destruction points. For example, an attempt-5 mine destroying four scouts awards 40 + 40 + 40 + 40. **Clear bonuses (250 per surviving hull point) and later-boss reward bonuses remain separate from accuracy.**

## Unlock celebrations

On defeating bosses 5/10/15/20/25 for the first time in a campaign:

1. The boss explodes and the destruction/unlock cue plays.
2. Gameplay freezes immediately for **1.5 seconds**.
3. A centered **NEW POWER-UP ACHIEVED!** banner shows the new name, Canvas icon and color.
4. The weapon is equipped immediately, replacing the old slot, with its full time/charge.
5. Play resumes automatically, requiring a **fresh fire press**. Captured touches, held Space and keyboard auto-repeat cannot spend the charge during or across the announcement.

Enemies, projectiles, player movement, pickup positions, weapon timers, invulnerability clocks and simulation RNG stay frozen. Pure visual explosion particles may finish fading without advancing gameplay. Pause/rotation/hidden pages also freeze the announcement timer. Learned unlocks are recorded once per campaign; retrying an already-defeated early boss shows a boss-defeated message without another unlock grant.

Bosses **30/35/40** instead show **BOSS DEFEATED!**, with a fixed **2,500 / 2,750 / 3,000** score bonus. If the boss was the last target, its announcement finishes **before** the usual sector-complete transition or final campaign victory. Reward sounds yield to the later victory fanfare without overlapping; a pending victory is queued rather than dropped.

## Stronger, delayed bosses

No boss is present at the start of its sector. Once **ceil(ordinary enemy count / 2)** ordinary ships have been destroyed, the boss enters from above over ~2.2 seconds, with a short warning and dedicated entrance sound. It takes the rear-center position, behind surviving ships, and must be destroyed to finish. Ordinary enemies continue their attacks. The compact boss health bar remains.

| Sector | HP | Base points | Major character |
| --- | --- | --- | --- |
| 5 | 6 | 750 | Fast sweeping arc, single pulse |
| 10 | 10 | 1,200 | Alternating side feints |
| 15 | 14 | 1,800 | Looping/weaving sweep, twin major shots |
| 20 | 18 | 2,500 | Stronger lance/weave |
| 25 | 22 | 3,300 | Deeper weave, drifting mines |
| 30 | 26 | 4,200 | Paired mine deployments |
| 35 | 30 | 5,200 | Faster high weave, wide three-shot major fan |
| 40 | 35 | 6,500 | Three health phases, sharper weave/fans, mines from phase 2 |

Bosses sway faster than ordinary ships and have faster major movement, shorter cooldowns and increasingly elaborate attacks. Major attacks retain brief colored warning rings and locked targeting. The final boss changes phase below 66% and 33% health; movement phases are captured at launch so taking damage does not teleport an active dive. Its broad shot fans leave gaps. Boss palettes/details distinguish each rank. Damage flashes armor, adds small deterministic sparks below two-thirds health, and increases low-health feedback. Destruction adds a larger 70-particle burst, kept within the mobile particle cap.

### Enemy mines

Later bosses can deploy at most **two** spiked coral/orange drifting mines, distinct from the player's pink round mine and from bullets. They descend toward the player, split into separated left/right lanes, then **stop and show a solid blast-radius warning for one second** before exploding. Their 50px blasts leave a wide central escape corridor. Shield and hit grace apply normally. Mines are hazards to dodge, not extra targets required for sector completion. Deployment, warning and detonation have distinct cues.

From sector 34, occasional field mines also join non-boss intervals. Boss 40 introduces mines in phase 2. All sources share the same two-mine cap and lane ownership; extra requests are skipped, not stacked into an unavoidable zone.

## Forty-sector balance and drops

All first-30 v0.3 ordinary-sector configuration values are preserved against a captured fixture. Explicit v0.4 changes apply throughout: the new weapon/drop progression, delayed stronger bosses and audio/warning redesign. The original scout/armor/looper HP/base values, curved loops, fixed coordinated lanes, non-homing kamikazes and staggered single-file paths remain.

Sectors 31–33 gradually favor kamikaze/column attacks. Sectors 34–35 mix in mine pressure; 36–39 increase established combinations and coordination. Sector 40 combines those patterns with the phased final boss. From sector 30 to 40, ordinary dive speed increases only **219→230**, bullet speed **230→240**, and the global shot interval **0.87→0.82s**. The ordinary formation stays capped at 28 ships. Later major dives share an attack budget and all hostile bullets share a 14-live-projectile safety cap. Representative seeded three-minute simulations peaked at six hostile bullets, plus at most two mines.

**Dashed trajectories and target reticles are removed.** Preparing enemies retain short, color-coded local warning rings; no full predicted flight paths are drawn. Enemy mine blast-radius rings remain because they warn about a local explosion, not a flight path.

Pickups are deterministic and bounded:

- Before the first unlock, shield is the only available pickup: one guaranteed at half the ordinary destruction count.
- Sectors 6–15 have one extra random opportunity; 16–25 have two; 26–40 have three, with gradually increasing probabilities.
- The pool is captured when a sector starts, containing only already-unlocked weapons from **earlier** bosses. A current-sector unlock cannot leak into its random pool.
- Extra opportunities can also produce shields. At most **four pickups spawn per sector**, and no more than **three are on screen**. The guaranteed shield can replace an older floating pickup if necessary.
- Loot spawns inside reachable x bounds and the upper field, falling at the original 68 logical pixels/second. The seeded drop tests averaged 1.00, 1.45, 2.02, 2.66 and 2.95 pickups in sectors 1/6/16/26/40 using dispersed seed samples.

## Continuous, always-enabled audio

There is **no Sound On/Off button or preference**. Playback unlocks on the player's first pointer/key interaction as required by browsers. If Web Audio is unavailable, the game remains functional. Existing combat effects, boss effects, ascending victory/final-victory and descending defeat fanfares remain, with additional entrance/laser/mine cues.

The old rhythmic throb is replaced by a soft **196Hz sine carrier** and one sine LFO. A 50-cent base detune plus ±50-cent modulation glides smoothly from the root to **one semitone above**, never switches between notes. The LFO rate rises linearly from **0.7 cycles/second** at sector 1 to **2.5** at 40, with smooth rate automation. The same LFO supplies a gentle gain breath. The background is quieter than important effects.

Only one carrier/LFO graph exists during active gameplay; no interval or note-retrigger timer is used. Pause, hidden pages, announcements and fanfares stop/disconnect the background. Pause/page exit stop all effects and future notes too. Resume recreates one clean background graph. Combat and fanfare voices plus background oscillators share the **12-oscillator cap**; finished/cancelled nodes are disconnected. Sound timing and rendering consume no gameplay RNG and never drive simulation time.

## Modules and verification

- `engine.js`: fixed 120Hz simulation, campaign/sector flow, scoring, collisions, freezes and enemy hazards.
- `weapons.js`: one-slot inventory, unlock/drop eligibility, projectile/beam/mine emissions and bounded area damage.
- `attacks.js`: existing deterministic dive paths plus boss definitions/entrances/phases and mine deployments.
- `appearance.js`: pure weapon colors/flashes and boss damage styling.
- `game.js`: portrait Canvas/input/session/announcement presentation and audio dispatch.
- `audio.js`: independent Web Audio modulation, effects, priority and cleanup.

From repository root:

```sh
node --check space-shooter/engine.js
node --check space-shooter/weapons.js
node --check space-shooter/attacks.js
node --check space-shooter/appearance.js
node --check space-shooter/game.js
node --check space-shooter/audio.js
node space-shooter/test-engine.cjs
node space-shooter/test-v03.cjs
node space-shooter/test-v04.cjs
node space-shooter/test-controls.cjs
node space-shooter/test-audio.cjs
python space-shooter/test-browser.py
python tests/check_site.py
```

The retained engine suite covers all forty real clears, accuracy/delayed/shared-action scoring, normal/rapid cadence, movement/jitter, armor behavior, shields/grace and bounded simulations. The retained v0.3 suite covers first-20 fixtures and classic/looping/coordinated/kamikaze/column path regressions. The v0.4 suite adds first-30 fixtures, jump/campaign unlocks, delayed eight-boss spawning/HP/behavior, freeze/RNG/input/announcement ordering, full weapon replacement matrix, laser/mine damage/caps/duration, drop reachability/frequency/caps, enemy mines, damage feedback/final phases, and deterministic later combat runs.

Controller tests cover forty sequential transitions, visible selectors, jump unlocks, pointer/keyboard cancellation, announcement pause/resume and fresh firing. Audio tests inspect the actual oscillator/gain graph, pitch/depth/rate automation, lifecycle/no duplicates, retained/new cues, voice caps and ordered fanfares. Real Chromium uses the repository's existing Python Playwright setup (`CHROMIUM_PATH` can override `/usr/bin/chromium`) and locally routed `.test` files, with no server or external requests. It verifies four portrait viewports, actual CDP two-finger input, Space behavior through rewards, jump unlocks, boss entry/announcement/final flows, weapon Canvas colors, all attack warnings without dashed calls, mine rendering, continuous audio lifecycle, best scores and assets/navigation at **`/` and `/small-apps/`**. Screenshots go to `/tmp/galactix-v04-*.png`.

The unchanged gallery regression suite verifies responsive layouts/assets/launch navigation, calculator arithmetic/keyboard behavior and original blob hashes, plus the JavaScript-disabled gallery. These suites passed during implementation; Chromium required execution outside the restricted socket sandbox.

**Remaining physical-device checks:** Safari/iOS and Chrome/Android two-thumb feel, browser chrome/safe areas, native portrait locking, speaker/headphone audibility and fatigue of the continuous tone, audio focus/silent-mode/lock-screen policies, sustained mobile CPU/battery usage, and longer human balance runs across the late bosses. Emulation and synthesized audio-graph tests cannot establish those device behaviors.

Tractor-beam capture/rescue and bonus challenge stages remain deferred. Delivery is a dedicated branch and PR against `main`; no merge or production deployment is performed by this assignment.
