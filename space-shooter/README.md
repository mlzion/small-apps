# Galactix v0.3

A standalone, buildless portrait arcade shooter at `space-shooter/`, launched from App Lab's **Galactix** card. v0.3 builds on merged v0.2 (PR #46), expands the campaign to **30 selectable sectors**, adds mixed-formation bosses and new dive patterns, and extends the original synthesized audio. Ship geometry, starfield, original enemies, portrait layout and controls are retained. The only shared-file edit updates this app's gallery description to v0.3/thirty sectors. Other App Lab projects are unchanged.

No external libraries, assets, requests, server, build step or service worker are needed. All module/asset URLs are relative and work at a domain root and GitHub Pages **`/small-apps/`**.

## Controls and session

- Move with the lower-left relative trackpad while holding the independent right FIRE button with another finger. Lift and reposition without teleporting. Independent pointer ownership/capture handles extra fingers, interrupted touches and capture loss.
- Small trackpad errors use adaptive damping (~28ms, dropping to 6ms for a dodge). Large moves immediately retain the original 520 logical-pixels/second cap. The filter runs on simulation time; keyboard movement remains direct. Desktop: arrows/WASD plus Space; P pauses/resumes.
- The ship stays in the lower half of the upper field, above the control area. Landscape blocks and pauses play. Portrait requires explicit Resume. Blur, hidden pages and app switching stop held inputs and audio. Native portrait locking is attempted where available, with the rotate overlay as fallback.
- Pause offers Resume or Restart Sector. Three hull points, the original 1.8-second damage grace period and a fresh hull each sector are retained. Loss retries the same sector, discarding that sector's score while preserving completed-sector points. Selecting any test level starts a new score run. **Sector 30** ends the campaign.
- A new sector/retry resets hull, shield, weapon timers, projectiles and accuracy attempts. The existing `galactix.best.v01` best-score and `galactix.sound.v02` Sound On/Off keys are retained. Missing/blocked storage does not prevent play. Sound starts muted unless previously enabled.

## Weapons, shields and accuracy

Normal cooldown remains `0.285 / (1 + 0.18 × (sector − 1) / 19)` through sector 20: 0.285s at sector 1, ~0.242s at sector 20. Sectors 21–30 retain sector 20's cadence. Rapid Fire halves the current cooldown; fixed-step remainders keep cadence steady.

Every emitted firing action increments the sector's attempt counter. Dual Spread emits **two projectiles but counts as one action**. Any successful hit, including a nonlethal armor/boss hit, resets the counter for future actions. Each action snapshots its multiplier at emission; delayed projectiles and both spread shots retain that shared snapshot. A first hit cannot promote a second projectile already in flight.

| Attempt since the previous hit | Destruction multiplier |
| --- | --- |
| 1 | 100% |
| 2 | 85% |
| 3 | 70% |
| 4 | 55% |
| 5+ | 40% |

The killing projectile's multiplier applies to base destruction points, rounded to whole points. Nonlethal hits award no points. This also applies to bosses: an attempt-5 killing shot against the final 2,000-point boss awards 800. **Sector-clear bonuses remain separate: 250 per surviving hull point.**

| Pickup | Effect | Bounded drop rule per sector |
| --- | --- | --- |
| Green shield silhouette | Absorbs one hit, then breaks; original protection/grace behavior | Guaranteed halfway through total target destruction count |
| Yellow lightning bolt | Rapid Fire for 8 seconds | One 65% seeded chance at the first quarter |
| Blue upward-opening V | Dual Spread for 10 seconds, **5° total** (±2.5°) | One 55% seeded chance at the third quarter |

All three use the existing matching glowing, bobbing Canvas discs and fall at 68 logical pixels/second. At most three pickups spawn in a sector. Missed pickups leave the field. Weapon effects stack independently; recollection refreshes to 8/10 seconds rather than accumulating time. Timers freeze on pause, expire explicitly in the HUD, and only affect subsequent firing actions. Already-emitted projectiles survive expiration. The shield has no duration and keeps its existing blue ring.

### Weapon color feedback

Rapid Fire adds a soft **yellow** hull tint/glow; Dual Spread adds **blue**. Together they blend gently between those colors. During a weapon's final two seconds its own color flashes six times, falling back to the remaining weapon's color or original blue-gray hull. Timing uses simulation state, so it freezes with the game. Original ship geometry, shading and cockpit remain recognizable; hostile projectiles render above the subtle glows/ring for visibility. A shield alone does not change the hull color.

## Enemies and campaign balance

| Ordinary enemy | HP | Base points | Behavior |
| --- | --- | --- | --- |
| 1 · Blue-gray scout | 1 | 100 | Formation sway, basic dive and vertical shots |
| 2 · Purple armor | 2 | 200 | 10% faster solo dives, 8% faster bullets, 1.5× fire selection weight and 1.35× dive selection weight |
| 3 · Cyan looper | 2 | 300 | Curved lane approach, upper-field loops from sector 13, 1.8× dive selection weight |

All twenty existing v0.2 sector configurations are preserved exactly, including normal firing cadence and ordinary formation sizes/counts. A captured v0.2 fixture tests that contract. Boss integration on fifth sectors adds one rear-center target and shifts ordinary rows down 20px to keep the boss clear of the back row. Normal attacking formations remain bounded at 28 ordinary enemies after sector 10.

| Sectors | Attack vocabulary |
| --- | --- |
| 1–10 | Existing formation/scout/armored attacks, with bosses every fifth sector |
| 11–12 | Existing curved looper dives |
| 13–14 | Existing upper-field oval loops |
| 15–18 | Existing synchronized two-enemy dives, gradual pressure increases |
| 19–20 | Existing synchronized three-enemy dives |
| 21–23 | Mix in launch-targeted kamikaze attacks |
| 24–26 | Add three-enemy single-file columns |
| 27–29 | Four-enemy columns and gradually more frequent kamikazes |
| 30 | Five-enemy columns, all earlier patterns, final boss |

Difficulty after 20 emphasizes behavior. From sector 20 to 30, ordinary dive speed rises **205→219**, bullet speed **215→230**, and global ordinary shot interval changes **0.95→0.87s**, with small equal increments per sector. Armor/looper counts, ordinary formation size and player cadence stay at sector-20 values. Kamikaze selection chance rises from 18% at 21 to 37.8% at 30. Column selection begins at 18% at 24 and reaches 30% at 30; remaining selections retain classic curved/looping/coordinated patterns.

Classic group attacks retain fixed separated lanes (pairs at x=84/276, triples at x=48/180/312 in a 360px logical world), 0.75s amber warnings and no continuous homing. Later sectors permit one major attacking group at a time, including boss dives. Independent ordinary and boss firing remains possible, with a shared hard cap of **14 live hostile projectiles**. Representative seeded combat tests reached a peak of **five**, rather than approaching the safety cap.

### Kamikaze · sector 21+

A coral warning ring and target reticle announce the attack for **0.9s**, followed by a 0.45s upper-field wind-up while the warning remains visible. At the start of the actual rush, the enemy snapshots the player's position once and accelerates along a straight ray through that point (70 initial speed, 380 acceleration, 430 speed cap). It never steers toward later player movement. Tests demonstrate more than a second between target lock and arrival in the tested dodge scenario, a safe immediate dodge, and a real hit if the player stays put. Survivors exit the field and return smoothly to their original formation slot.

### Single-file column · sector 24+

Three to five ships queue from one available upper formation row, nearest ship first, after a **0.9s cyan warning**. Using one row prevents approach paths crossing at the join. The leader locks one target position at launch; all followers share that snapshot and the same curved centerline. Each first joins the staging point above the player zone, then follows the leader with a fixed **~0.45–0.53s delay**, adjusted to preserve at least 62px vertical separation on the shared descent. Approaches also retain more than a collision diameter of separation in the tested cases. The path passes through the locked target and curves out below the field; survivors return to their own original slots.

If no upper row has at least three available ships, the scheduler uses a classic attack instead of an overlapping or undersized column. Loops, kamikazes, columns and later boss dives share the major-attack budget; a second group does not stack onto an already active late-sector group. Enemies can still fire and return through the upper formation area.

## Bosses in the formation

A boss occupies the rear-center at logical (180,38), behind the ordinary back row. Its original six-wing spacecraft is about 1.5× ordinary width, with increasingly detailed plating/engines and a compact health bar. Bosses are integrated targets: **all ordinary enemies and the boss must be destroyed** to finish that sector.

| Sector | HP | Base points |
| --- | --- | --- |
| 5 | 4 | 500 |
| 10 | 6 | 750 |
| 15 | 8 | 1,000 |
| 20 | 10 | 1,250 |
| 25 | 12 | 1,500 |
| 30 | 15 | 2,000 |

The boss initially moves with the formation and fires a modest independent stream. It occasionally flashes a **1.05s violet warning**, locks a target, breaks into a sweeping upper-field arc and returns continuously to its rear-center position. Successive bosses attack/fire slightly more often and add lateral motion; bosses 20+ fire two spaced projectiles during the major attack. They do not continuously home or dive directly through the player's zone. Ordinary enemies keep attacking while the boss exists. Boss hits produce a heavier impact; destruction adds a 44-particle burst and a special two-layer electronic explosion.

## Audio

`audio.js` uses only original Web Audio oscillators/envelopes, with no assets or simulation RNG. Existing Sound On/Off preference persists. User gestures unlock playback; missing devices, rejected playback and blocked storage stay silent without interrupting gameplay.

Combat cues distinguish crisp player laser pulses, enemy projectiles, nonlethal impacts, short explosions, rising dive swoops, player damage, protective shield effects, heavy boss impacts and larger boss explosions. Repetition limits, priority selection (at most two routine cue categories per step), a 0.12 master gain and a **12-voice cap** bound overlap and CPU cost. Finished/cancelled nodes are disconnected.

A quiet low synthesized throb runs only during active gameplay, starting at **75 BPM** and increasing linearly to **145 BPM** at sector 30. A 25ms audio scheduler looks 120ms ahead using `AudioContext.currentTime`; it does not drive engine time or randomness. It skips missed beats rather than bursting after a throttled tab.

Sector victory plays an original ascending ~1.5-second fanfare; final victory expands to ~1.8 seconds. Defeat uses a descending ~1.2-second phrase. They cancel routine voices and take priority over rhythm/effects, reject overlapping/repeated fanfares, and preserve a final boss explosion when destruction and victory coincide. Sector completion stops the rhythm while allowing its fanfare to finish. Starting another sector cancels any remaining notes and starts a clean rhythm. Pause, mute, blur, hidden pages and page exit stop all voices and the scheduler; Resume restarts cleanly from the audio clock.

## Modules and determinism

- `engine.js`: fixed 120Hz gameplay, collisions, scoring, pickups, enemy events and campaign state.
- `attacks.js`: original kamikaze, column and boss paths/definitions, driven only by simulation time and seeded selections.
- `appearance.js`: pure weapon color/flash feedback; never changes gameplay.
- `game.js`: portrait Canvas presentation, input ownership, menu/session lifecycle and audio dispatch.
- `audio.js`: Web Audio timing/voices, independent of the deterministic engine.

The seeded LCG and identical input steps reproduce gameplay. Rendering and sound consume no random numbers and cannot change encounter timing. Transient shots, bullets, pickups, particles and audio voices are bounded.

## Verification

Run from repository root:

```sh
node --check space-shooter/engine.js
node --check space-shooter/attacks.js
node --check space-shooter/appearance.js
node --check space-shooter/game.js
node --check space-shooter/audio.js
node space-shooter/test-engine.cjs
node space-shooter/test-v03.cjs
node space-shooter/test-controls.cjs
node space-shooter/test-audio.cjs
python space-shooter/test-browser.py
python tests/check_site.py
```

Browser tests reuse the repository's Python Playwright/Chromium setup (`CHROMIUM_PATH` can override `/usr/bin/chromium`), routing a reserved `.test` origin to local files without an HTTP server or external requests.

- **Existing engine suite, expanded to 30:** all sector clears, base/accuracy/bonus scoring including delayed and spread projectiles, movement/jitter/cadence, original enemy weights/loops/groups, pickups/stacking/independent expiry, shield/grace/defeat and bounded two-minute runs in every sector.
- **v0.3 engine/appearance suite:** exact first-20 configuration fixture, gentle later parameters, bosses only on fifth sectors, rear positioning/HP/value/destruction/accuracy/completion and attack return; kamikaze warning/locked targeting/acceleration/dodge/hit/frequency; 3/4/5-member columns, safe staging/shared trajectories/spacing/depleted-row fallback/return; weapon colors/blending/expiration flashing; one-step audio event contracts; repeated deterministic combat simulations with bounded projectiles.
- **Controller:** actual engine cue dispatch, completion vs paused audio lifecycle, pointer ownership/cancellation, blur/visibility/rotation, explicit resume, retries and 30-sector progression/selection.
- **Audio:** gesture/preference/unsupported-device fallback, tempo endpoints and steady scheduling, one timer, all combat sounds, overlap cap, ascending/descending/final fanfares, suppression/deduplication, rhythm priority, pause/mute/cleanup and scheduled-note cancellation.
- **Real Chromium:** four portrait viewport sizes (320×568 through 430×932), CDP two-finger move/fire/cancel, keyboard, 30-sector HUD/progression, boss and new attack-warning rendering, Canvas pixel checks for powered/flashing/restored ship colors, actual final-boss/victory audio events, sound timer/voice lifecycle, rotation, pickup HUD, best score and navigation/assets at both `/` and **`/small-apps/`**. Screenshots go to `/tmp/galactix-v03-*.png`.
- **Existing gallery suite:** responsive layouts, assets/navigation, calculator arithmetic/keyboard regressions and original blob hashes, plus the no-JavaScript gallery. Other apps' source is unchanged.

These suites passed during implementation; Chromium required execution outside the restricted socket sandbox. Inspected small-phone menus, populated sector 30 with its boss/health bar, pickups and powered-ship screenshots. **Not physically tested:** Safari/iOS and Chrome/Android touch feel, browser chrome/safe areas, native orientation lock support, audible mix/rhythm/fanfares on phone speakers or headphones, long-session mobile CPU/battery use, and background/lock-screen audio policy. Emulated browser and synthesized-clock tests do not establish those device behaviors.

Tractor-beam capture/rescue and bonus challenge stages remain deferred. This feature is delivered on a dedicated branch/PR; it is not merged or deployed by this assignment.
