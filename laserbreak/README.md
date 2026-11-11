# LaserBreak — Free Play and 25-level Arcade

A standalone, landscape-only arcade game and Free Play gameplay sandbox. Serve the repository with any static HTTP server and open `laserbreak/`; relative paths also work at `/small-apps/laserbreak/`. Original Canvas/SVG graphics and JavaScript. No framework, build step, external audio files, or runtime dependencies.

## Choose a mode

Open Setup and choose **Game mode**:

- **Free Play** is the existing endless random sandbox and remains the default. All Setup sliders are editable. Its timing, spawning, input, sounds, and rendering behavior are preserved.
- **Arcade** has 25 automatically generated levels. Each lasts **45 seconds of active gameplay**. Defense is `destroyed / (destroyed + escaped) × 100`; the generated passing threshold rises from **40% to 80%**. Direct and blast-destroyed targets count once. A target escapes when its entire circle leaves the bottom; active targets at the deadline and bars are excluded. Zero resolved targets cannot pass.

There is no early failure: recover your percentage until the deadline. The compact HUD shows only level/time. A 7 CSS pixel bar is neutral until the first resolution, then green for destroyed and red for escaped, with a white marker at the level’s threshold. Crossing down below the threshold pulses red once, only after at least five resolutions; staying below or recovering does not pulse. Escapes produce a short localized red flash and descending warning tone. Bars and Free Play produce neither escape feedback nor penalties.

At the deadline, result cards show level, destroyed, escaped, final percentage, required percentage and PASS/FAIL, with **Start Level N** or **Retry**. Clearing Level 25 shows victory and **Restart from Level 1**. Transitions freeze play and discard held contacts. No lives or scripted waves are added.

Generated Arcade sliders are visible but read-only to keep the attempt/report reproducible. Sound, debug, and diagnostics remain available. Switch to Free Play to edit gameplay parameters; its previous settings are restored. Changing modes starts a fresh session, rather than preserving objects between modes. Sound/debug preferences follow you across modes.

Arcade time and cooldown freeze during Setup, explicit pause, backgrounding, portrait, stopped sessions, and transition/result cards. A long **active** frame still counts toward 45 seconds, but falling/spawning advance at most 100 ms to avoid catch-up bursts. Free Play retains its previous clamped timing behavior. Stop clears the current attempt; Start retries the current Arcade level (or begins a fresh endless Free Play session).

### Level Select for testing

In Arcade Setup, **Level Select · testing feature** can start any Level 1–25. Select a number, then tap **Start selected level**. Timer, destroyed/escaped counts, warning state, shots, objects/effects, cooldown, and shuffle bag reset. It stays frozen until Setup closes. Disable `LaserArcade.CONFIG.testingLevelSelect` in `arcade.js` to hide/disable this temporary tool before release. It does not introduce scenario files or scripted spawn sequences.

### Generation and difficulty estimates

`generateLevel(levelNumber)` and `CONFIG` live in [arcade.js](arcade.js). Levels 1–10 retain every previous physical setting, checked against [the historical fixture](fixtures/pre-defense-settings.json). Speeds continue rising 2% per level. A rotating budget changes one extra axis at a time (density, bars, diameter, rotation), with physical plateaus every fourth step. Threshold budget grows most on those plateaus and holds on bar/size steps. Bounds and centralized threshold start/end/ramp/weights support future extension without individual level overrides. The pure function is tested through Level 50.

See [ARCADE-REPORT.md](ARCADE-REPORT.md) for all 25 settings, exact formulas, graph, **7,500 simulated games**, per-model completion/defense/escape/shot metrics and balance concerns. Raw results and joint outcome histograms are in [arcade-simulation.json](arcade-simulation.json). All levels were attained by Practised; slower models find later levels steep, with Regular reversals at bar-share increases. These are estimates requiring phone playtesting, not proof of balance.

## Release-only controls

Place one thumb on each tall firing pad, slide vertically to aim along the faint preview line, then lift either thumb to fire. Touching the pads never fires. Both contacts establish the line; alignment indicators follow each thumb. Release every contact before re-arming. A gesture released during cooldown is consumed: holding/re-touching one pad until ready never fires automatically. Cooldown defaults to 0.75 seconds of gameplay time.

Pointer cancellation, opening Setup, fullscreen changes, and orientation changes discard active gestures without firing. Leaving the window/tab pauses and stops current sounds; use Resume to continue. The Setup button opens on pointer-down so a third thumb can interrupt held aiming contacts before a release fires.

Desktop fallback: hold the mouse on a pad and press Space for the opposite endpoint at the same height. Release either to fire, then release mouse and Space before another shot. Angled input is intended for multitouch.

Two adjacent main buttons remain available: **Pause / Resume** freezes/continues falling, rotation, spawning, visual effects, and cooldown; **Stop / Start** ends and clears the random session or starts a fresh one using current settings. In either mode, Start resets the shuffle bag and seeds up to three objects subject to density/clearance. At zero density it starts empty. Settings are session-local.

Pads remain 130 CSS pixels wide, or 97 on small landscape screens; very narrow viewports use 18vw. The world is 1000 logical pixels wide, with logical height following the field aspect ratio so circles remain circular. Sizes are logical pixels, falling speeds are logical pixels/second, and rotation is degrees/second.

## Setup on a phone

Setup fills the available screen in a browser tab or browser fullscreen. A sticky **X** in the upper-left closes it. The panel has spaced vertical rows, visible values, 28-pixel slider handles inside 44-pixel control areas, and vertical scrolling with a visible scrollbar where the browser supports one. Sliders are slightly shorter to reserve a distinct **40 CSS pixel scrolling strip** on the right. The strip contains no controls and scrolls Setup natively, including alongside slider rows and in browser fullscreen. Keyboard focus stays inside Setup; Escape closes it and focus returns to the header button.

Opening Setup cancels held firing contacts, stops current sounds, and freezes gameplay through a separate settings-open gate. It does **not** modify the explicit running/paused/stopped state, reset the session, or alter current object properties. Closing restores active play, an existing pause, or a stopped session as appropriate. Backgrounding still applies the normal background pause. Clear and Reset remain explicit actions: Clear removes objects/effects while retaining session state and bag position; Reset restores defaults and starts a fresh session, held frozen until Setup closes.

Free Play rows provide cooldown, **Blast diameter multiplier**, target diameter/falling speed, bar length/falling speed/rotation speed, density, Bar Percentage, Sound on, collision debug, performance diagnostics, Clear, and Reset. There is no firing-mode selector.

Vertical swipes in the right-side strip or the space between controls scroll natively without editing values. Direct slider touches suppress the native eager range edit: a tap or horizontal movement beyond eight CSS pixels adjusts the value, while a vertical gesture scrolls the panel without editing. Horizontal control geometry is cached at gesture start. Mouse and keyboard range behavior remains native. Only the input's actual control area handles these gestures; a swipe starting outside it cannot activate a slider simply by crossing over it.

**Object properties are assigned at spawn time.** Size, falling speed, and angular velocity changes affect future objects only, including zero/negative values. Density and cooldown update immediately. Blast multiplier is captured at firing time, so a visible explosion never changes size when the slider changes.

## Instant beams and blast diameter

Targets are bright cyan/yellow circles, default diameter **40**, with a cached neon halo. Bars are solid muted rectangles, default **100 × 12**, falling and rotating vertically. Thickness is fixed. Targets never rotate.

Firing checks collisions once at current positions/angles. Each side casts an instantaneous full-width segment to the opposite boundary, shortened to the first bar. Targets never block beams. The two beams intentionally overlap; without bars both reach the opposite boundary. A 140 ms flash shows the already-resolved paths; there are no traveling pulses or per-frame laser collision scans.

A target intersected by one beam dissolves. A target intersected by both beams directly explodes. The blast-diameter multiplier ranges **1×–5×**, step **0.5×**, default **3×**. Blast radius equals the direct target's collision radius times the selected multiplier: a diameter-40 target at 3× creates a diameter-120 blast, radius 60. The stored blast radius drives both collision geometry and the visible ring. Only direct double hits create blasts. Partially intersecting targets and bars are destroyed, but blast victims never generate chain reactions.

Segment/circle tests include tangencies. Bar tests use slab intersections in the actual rotated rectangle, including thickness/endpoints. Blast intersection uses circle/circle and circle/oriented-rectangle closest-point geometry. Debug shows target/bar collision shapes and the full stored blast radius while its ring fades.

Destruction follows D::FUZE's expanding-ring and outward-shard approach: six small shards for a single hit (260 ms), 14 stronger shards for a double (420 ms), and eight shards along a blast-destroyed bar (320 ms). Particles use layered small Canvas squares, no shadows/blur/collisions. The global cap is 128; excess cosmetic particles are skipped. Effects compact in place, freeze with gameplay, and clear on session resets. The target sprite's colored outer rim matches collision radius; its halo is decorative.

## Synthesized arcade sounds

Sound defaults on and can be disabled immediately in Setup. `audio.js` adapts D::FUZE's lazy Web Audio context, frequency ramps, short gain envelopes, and ended-node cleanup. Unlock/resume is attempted on a user pointer/key gesture; it is silent and never queues a shot to replay later. Missing APIs, denied construction/resume, and interrupted contexts leave play usable, with retry on a later gesture. A very early first shot may be silent if the browser has not yet resumed audio.

- Firing: sharp descending sawtooth zap, about 75 ms.
- Single destruction: one bright 1.1 kHz sine beep, lasting 55 ms.
- Direct double-hit explosion: two 55 ms sine beeps at 1.1 kHz and 1.32 kHz, separated by **45 ms of silence**. The slightly higher second tone makes the pair distinct. Both start after the laser zap has largely faded (65 ms / 165 ms after firing).
- Arcade escape: one 120 ms triangle tone descending from 880 Hz to 330 Hz, aggregated once per frame and admitted no more than once per 180 ms across frames. It uses the same mute/unlock/global voice limits and never queues delayed warnings.
- Blast-destroyed bars: a pair of inharmonic metallic tones, about 130–160 ms.

Hit feedback is aggregated once per shot rather than once per object. If a shot has both single and double hits, only the two-beep hit cue plays. The pair shares one oscillator with two scheduled gain envelopes, so voice saturation cannot admit only its first beep. The existing limits remain **six source voices per shot** and **eight globally**; current profiles use at most four per shot, and additional sounds can be skipped at saturation. The master gain remains 0.35; beep envelopes peak at 0.07 before the master, below the existing 0.18 ceiling. No noise buffer or audio filter is needed. Audio nodes are disconnected on completion; muting, Setup, Pause, Stop, and background/portrait transitions stop current voices. No audio processing or polling occurs in ordinary animation; Arcade calls the escape cue only when a new escape is resolved. The sound preference is session-local; Reset re-enables it.

## Balanced random spawning

The **Bar Percentage** slider ranges from **0% to 100% in 10% steps**, default **40% bars / 60% targets**. Each ten-object shuffle bag uses the Free Play selection (or the generated Arcade ratio): for example, 70% creates seven bars and three targets. Entries are randomized with Fisher–Yates. Changing the slider immediately discards the remaining entries and builds a new shuffled bag, without modifying live objects or gameplay timing. Repeated input at the same value leaves the current bag alone. Successful placement consumes the last entry. Empty bags refill and reshuffle. Failed placement retains the pending type; Start resets the bag. Clear does not. This balances each ten successful spawns without predetermined waves or scenarios. Horizontal positions, colors, and bar angles remain random.

New objects enter just above the field. Placement checks five logical pixels of clearance with circular target bounds, rotation-safe bar bounds, and the short entry corridor until a new shape is fully inside. Each spawn tries up to 12 positions and then skips if crowded, retaining its bag entry. Initial objects use the same rule. Objects can pass through each other later while falling at different speeds; this is not physical object collision.

Density is 0–100%, default 20%. Positive settings request `0.05 + 5.95 × density / 100` attempts/second (about 1.24/s at default, six/s at maximum). Zero stops new spawning immediately. Crowding reduces accepted spawns; no more than one bounded attempt occurs per frame. Caps remain **60 objects**, **160 transient effects**, and **128 particles**, including at zero falling speed or cooldown.

## Orientation, fullscreen, and performance

Portrait replaces gameplay with **“Rotate your phone to play LaserBreak.”** Underlying controls are hidden/inert, time and firing are blocked, and any open Setup closes. Landscape restores the interface and explicit session state, with no held contacts.

The header fullscreen control uses the Fullscreen API and follows actual enter/exit events, recalculating field/Canvas dimensions. It is hidden when unavailable; rejected requests show a non-blocking message. Landscape lock is attempted where supported, and successful locks are released on exit, including late resolutions. Setup stays available inside fullscreen. Fullscreen/orientation support varies by browser.

The PR #25/#26 performance architecture remains: one elapsed-time update per rendered frame, adaptive 60/30 FPS pacing, DPR ≤1.5 and ≤1 MP Canvas backing store, two cached target sprites, static CSS grid, no runtime shadows/blur/backdrop filter, in-place object/effect compaction, event-driven pad updates, and a 10 Hz changed-text-only HUD. Paused/stopped/Setup scenes repaint only when dirty. Long frame delays advance at most 100 ms; background/orientation transitions reset timing.

Enable **Performance diagnostics**, then close Setup to observe frame interval, CPU render/update time, object count, and 30/60 budget. Diagnostics text refreshes at 2 Hz. Render time measures Canvas command submission, not GPU completion. See [PERFORMANCE.md](PERFORMANCE.md) for measurement history and regression budgets.

## Automated verification

From the repository root:

```sh
node laserbreak/test-engine.cjs
node laserbreak/test-arcade.cjs
node laserbreak/test-audio.cjs
python laserbreak/test-browser.py
python laserbreak/test-arcade-browser.py
python laserbreak/test-setup.py
python laserbreak/test-audio.py
python laserbreak/test-fullscreen.py
python laserbreak/test-performance.py
python tests/check_site.py
```

To reproduce the difficulty study and its standalone SVG graph:

```sh
node laserbreak/simulate-arcade.cjs 100
python laserbreak/report-arcade.py
```

Simulation requires Node only. Report/chart generation uses Python/matplotlib as development tools; there are no new deployed dependencies.

Python browser tests need Playwright and Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`). They route local reserved origins without external requests or a server. Test dependencies are not deployed. Run the throttled performance test separately from other browser suites to avoid host contention.

- **32 engine cases:** release-only input/cancellation/cooldown/re-arm, full-width beams, exact geometry, selected blast radius/ring snapshot and no chains, future-only properties, 0/40/70/100% bags, immediate ratio changes, unchanged live objects, and failed-entry retention, clearance, density/caps, motion, particles, session/orientation/Setup timing, sound summaries, and update guardrails.
- **17 Arcade cases and desktop/mobile integration:** deterministic bounded generation and plateaus, 45-second deadlines and gates, exact destruction/escape counting, variable threshold/pass math, neutral/green/red status and moving marker, crossing warnings, escape flash/audio, retry/advance/victory/restart, Level Select resets, slow-frame timing, historical-setting preservation and report freshness/joint histograms, real touch input, small HUD layouts, fullscreen, and saved Free Play settings.
- **Audio unit + real browser/offline checks:** lazy silent unlock, denial/missing/interrupted fallback, mute, source limits/cleanup, no animation audio work, distinct synthesized effects, a measured silent gap and higher second-beep frequency, pair reservation under voice pressure, unchanged laser/bar profiles, aggregation, and peak headroom.
- **Gameplay browser checks:** real CDP multitouch with release aiming/indicators, off-center blasts, third-contact Setup cancellation, five landscape sizes, properties/controls and portrait/session restoration.
- **Setup browser checks:** actual touch swipes in the 40 px control-free strip and between/on ranges without edits, intentional horizontal adjustments, outside-control gestures, sticky X, full-screen panel geometry at 568×320 and 844×390, active/paused/stopped preservation, fullscreen and portrait lifecycle. Screenshots: `/tmp/laserbreak-setup-568.png`, `/tmp/laserbreak-setup-844.png`, plus desktop/mobile gameplay screenshots.
- **Fullscreen/performance/gallery checks:** real fullscreen lifecycle/fallbacks, 60 objects plus sustained 128 particles at 4× CPU throttling, unchanged render/update/slider budgets and pixel cap, no per-frame blur/layout/DOM churn, adaptive pacing, and existing App Lab/calculator regressions at both URL roots. The gallery card and other apps remain unchanged.

## Physical-phone retest checklist

1. On the Android phone, hold both pads, slide, and release either thumb. Confirm preview/indicators, cooldown, cancellation, and full release-to-rearm. Touching alone must never fire.
2. Open Setup with a third contact while holding aim. No shot should fire. Verify the full-screen panel and upper-left X in normal and browser fullscreen views. Use the right-side scrolling strip at slider height and between rows, then scroll between controls and directly across ranges without accidental edits; deliberately tap/drag each slider. Repeat near the top/bottom with browser toolbars and safe-area cutouts.
3. Open and close Setup during active play, an explicit pause, and a stopped session. Time, existing object properties, and bag position should not change while open. Close should restore the appropriate state. Test Escape/keyboard where available.
4. Try blast multipliers 1×, 3×, and 5×. Check ring/geometry agreement and no chains; existing rings retain their captured radius after changing the setting. At 3×, a diameter-40 target's blast diameter is 120 logical pixels.
5. Listen on the phone speaker and headphones: unchanged crisp zap and metallic bar break, one clear single-hit beep, and two distinct double-hit beeps with a slightly higher second tone and an audible gap, at comfortable volume without harshness. Test Sound off/on, a fresh reload's unlock, rapid shots, and large multi-target destruction. Voice caps may intentionally suppress excess sounds.
6. Try Bar Percentage at 0%, 40%, 70%, and 100%. Confirm existing objects keep their properties when it changes. Check long-run target/bar mixture and entry clearance at high density and stationary speeds. Crowded placement may delay the pending bag type; no complicated spawn planning occurs.
7. Enable diagnostics and close Setup. Check default/max density, large objects, large blasts, rapid firing, and bursts for 5–10 minutes, observing thermal/battery behavior and 60/30 pacing. Setup should remain responsive.
8. In Arcade, phone-test Levels 1, 10, 11, 13, 14, 18, 19, 23 and 25 with several players. Confirm timer freezes in Setup/background/portrait; only fully departed targets escape, direct/blast targets count once, and active circles are excluded at the deadline. Check neutral then green/red bar and level-specific marker; one downward-cross warning after five resolutions; recovery before the deadline; localized red escape flashes and comfortable, distinct descending warnings during escape bursts. Confirm end-card destroyed/escaped/actual/required figures, Retry/Next/victory25, contact cancellation and fresh Level Select/Restart counters. Compare late difficulty and apparent bar-step reversals with the report before tuning shared formulas.
9. Rotate with held contacts or Setup open; portrait must block play, landscape restore the session with no contacts. Check fullscreen entry/exit, OS edge gestures, notification shade, app switching/calls, and resuming from background with no stale sound. Test iPhone Safari separately; emulation cannot establish speaker quality, physical latency, or device performance.

Free Play remains an endless sandbox. Arcade adds only generated level requirements and progression; neither mode uses scripted waves or predetermined target positions.
