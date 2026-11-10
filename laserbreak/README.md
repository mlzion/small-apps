# LaserBreak — Phase 1 visual polish

A standalone, landscape-only gameplay sandbox. Serve the repository with any static HTTP server and open `laserbreak/`; relative paths also work at `/small-apps/laserbreak/`. Original Canvas/SVG graphics and JavaScript. No framework, build step, or runtime dependencies.

## Controls and orientation

Place one thumb on each tall firing pad. Their vertical positions determine the firing line.

- **Fire on touch** (default): the second contact on the opposite pad fires immediately. No aiming line.
- **Fire on release**: hold both pads, slide to aim along a faint line, then lift either thumb to fire.
- Both modes require every contact to release before re-arming. A gesture attempted during cooldown is consumed; holding until ready never fires automatically. Cooldown defaults to 0.75 seconds of gameplay time.
- Pointer cancellation, opening Setup, and orientation changes discard active gestures without firing. Leaving the window/tab pauses; use the main Resume button to continue.
- Desktop fallback: hold the mouse on a pad and press Space for the opposite endpoint at the same height. Release mouse and Space before the next shot. In release mode, releasing either fires. Angled input is intended for multitouch.

Two adjacent buttons remain available above the field: **Pause / Resume** freezes/continues objects, rotation, spawning, effects, and cooldown; **Stop / Start** ends and clears the current random-object session or begins a fresh one. This is not a level restart. Start retains the current settings and seeds up to three random objects, subject to density and entry clearance. At zero density it starts empty. Clear removes objects and effects while retaining the session state. Reset restores defaults and starts a fresh session. Settings are session-local.

Portrait replaces the gameplay interface with **“Rotate your phone to play LaserBreak.”** The underlying field, Setup, and controls are hidden and inert; gameplay time and firing are blocked. Returning to landscape restores the interface and preserves the explicit Pause/Stop state. The browser attempts `screen.orientation.lock('landscape')` on user gestures and fullscreen changes where the API exists. Browsers that require fullscreen or do not support locking fall back to the overlay; there is no forced fullscreen transition. Like the Rings orientation guard, this clears input, freezes gameplay, and restores focus, adapted for landscape-only play.

The header's **Fullscreen** button enters/exits the browser Fullscreen API and updates its icon, accessible label, and pressed state. It is hidden when fullscreen is unsupported. Rejected requests show a status message without blocking play. Fullscreen transitions clear held gestures and recalculate the field and Canvas resolution. Successful landscape locks are released on exit, including locks that finish after exit. This follows Celphonica's request-fullscreen-then-lock lifecycle, while preserving LaserBreak's portrait guard.

Pads are 130 CSS pixels wide (previously 72), or 97 pixels on small landscape screens (previously 54), approximately an 80% increase. Very narrow viewports reduce them to 18vw to preserve the central field. The world remains 1000 logical pixels wide; its logical height follows the field aspect ratio, keeping circles circular and bar geometry undistorted. Sizes are logical pixels, speeds are logical pixels/second, and rotation settings are degrees/second.

## Objects and settings

Targets are bright cyan or yellow circles, diameter **40** by default, with a cached neon halo. They fall straight down without rotation. Bars are solid muted rectangles, **100 × 12** by default, falling and rotating vertically. Thickness is fixed; there is no thickness slider.

Setup overlays the field and can be hidden. It provides firing mode, cooldown, target diameter and falling speed, bar length/falling speed/rotation speed, density, collision overlay, performance diagnostics, Clear, and Reset.

**Object properties are snapshots at spawn time.** Changing size, speed, or rotation affects future objects only. Existing objects retain their dimensions, falling speed, and angular velocity, including when the new setting is zero or negative. Firing mode and cooldown update immediately. Negative bar rotation reverses future bars. Density changes reset the spawn timer immediately and never modify existing objects.

## Instant beams and accurate geometry

`engine.js` owns simulation, geometry, and the pointer state machine. `game.js` owns the browser adapter, renderer, orientation guard, frame pacing, and diagnostics.

Firing performs collision detection once, using the current object positions/angles. Each side casts an instantaneous segment along the whole line toward the opposite boundary, shortening it to the first intersecting bar. Targets do not block beams. Beams intentionally overlap along the same line; without bars, both reach the opposite boundary. A 140 ms fading flash shows the already-resolved beams; there is no traveling-pulse state or collision work during the flash.

A target intersecting one segment dissolves immediately. A target intersecting both segments explodes immediately with radius exactly twice its collision radius. Double hits can occur anywhere along the firing line wherever both beams reach the circle. Blasts destroy any target or bar whose geometry intersects the blast circle, including partial overlaps. Blast victims never produce further blasts. Direct double hits each create their own blast.

Target tests use analytic segment/circle entry, including tangencies. Bar tests transform the segment into the actual rotated rectangle and use slab intersections, accounting for thickness and endpoints. Blasts use circle/circle and circle/oriented-rectangle closest-point tests. Debug outlines show the actual collision shapes and full explosion radius while an explosion fades. No collision scans occur during ordinary object/effect animation.

## Destruction fragments

Destruction uses D::FUZE's visual approach: an expanding ring and outward-fading square fragments. Single-hit targets produce six small shards over 260 ms. Double-hit explosions produce 14 larger/faster shards over 420 ms plus the blast ring. Blast-destroyed bars produce eight shards distributed along their actual rotated length, fading over 320 ms. Blast victims fragment without causing another explosion.

Particles use small layered Canvas squares with a dim outer tint and bright core: no runtime shadows, blur filters, particle collisions, or fullscreen flash. Directions/velocities are computed only at creation; frame updates move and age the particles in place. A strict global cap of 128 drops additional cosmetic fragments without changing hit resolution. Expired particles compact out; Clear, Stop, Start, and Reset remove them. Pause and portrait freeze them with the rest of gameplay. The neon target sprite's colored rim meets its circular collision radius; its decorative halo is outside the hit shape. The target diameter slider still spans 12–70 logical pixels and affects future spawns only.

## Random spawning and bounds

New objects enter just above the field at random horizontal positions: 65% targets, 35% bars, with random colors and initial bar angles. There is no fixed sequence or scenario. Objects disappear once their full shape leaves the bottom.

Placement checks a five-logical-pixel clearance using circle bounds for targets and circumscribed rotation-safe circles for bars. It also reserves the short vertical entry corridor until the new object is fully inside, so it cannot spawn directly above an occupied entry slot. These bounds deliberately reject some positions that an exact rectangle test might accept; they protect rotating bar tips without planning a sequence. Each attempt tries up to 12 horizontal positions, then skips the spawn if none fits. Initial objects use the same rule. Objects do not collide physically while falling; different speeds can cause later overlaps after entry.

Density ranges from 0–100%, default 20%. A positive setting requests `0.05 + 5.95 × density / 100` spawns/second (about 1.24/s at default, 6/s at maximum). Zero stops spawning immediately and leaves current objects active. Crowded entry slots can reduce accepted spawns. At most one bounded placement attempt occurs per frame, without delayed catch-up bursts. There are at most **60 active objects**, **160 transient effects**, and **128 particles**, including with zero falling speed or zero cooldown.

## Performance and diagnostics

- One elapsed-time update per rendered frame, normally 60 FPS; no 240 Hz subdivisions.
- Sustained slow RAF delivery switches to a 30 FPS update/render budget. Stable fast delivery and low CPU cost restore 60 FPS. Long delays advance at most 100 ms of gameplay; background/portrait transitions reset the clock.
- Array compaction avoids per-frame object/effect filter allocations. Collisions and explosions resolve only during firing; spawn occupancy is checked only on spawn attempts.
- Canvas DPR is capped at 1.5, with an additional one-megapixel budget. Resizing/layout reads occur through resize notifications, not during drawing.
- Target halos are two small pre-rasterized sprites. Bars use `fillRect`; beams use layered strokes. No per-frame Canvas shadows, full-field blur, or Setup backdrop filter. The grid is a static CSS background.
- Sliders update only their own output. Pad DOM updates follow input events; the HUD checks at 10 Hz and changes text only when needed. Paused/stopped scenes draw only when dirty.

**Performance diagnostics** in Setup reveals frame interval, CPU render time, CPU update time, active count, and 30/60 FPS budget. Its text refreshes twice per second and is hidden by default. Render time measures JavaScript Canvas submission, not GPU completion. See [PERFORMANCE.md](PERFORMANCE.md) for before/after measurements and reproducible guardrails.

## Automated verification

From the repository root:

```sh
node laserbreak/test-engine.cjs
python laserbreak/test-browser.py
python laserbreak/test-fullscreen.py
python laserbreak/test-performance.py
python tests/check_site.py
```

Python browser tests require Playwright and Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`). Tests route a local reserved origin without a server or external requests; test dependencies are not deployed.

The 26 engine cases cover both input modes, pointer order/cancellation and re-arming, cooldown, instant full-width beams and off-center double hits, first-bar blocking, circle/rotated-bar geometry, immediate single/double-hit effects, partial blast intersections and no chains, default dimensions, spawn-time snapshots, one-update-per-frame motion, density, alternate/blocked/initial entry placement, caps, bottom removal, Pause/Resume, Stop/Start, orientation timing/firing gates, particle counts/lifetime/cap/cleanup and bar shards, and an update performance guardrail.

Desktop and mobile Chromium cover all setup controls, future-only settings, actual CDP multitouch, capture outside pads, both firing modes, cooldown/cancellation, immediate explosions, orientation-lock rejection fallback, portrait hiding/inert input/timing, rotation during held gestures, state restoration, and main session controls. Layout is checked at 568×320, 667×375, 844×390, 1024×600, and 1366×768. Screenshots: `/tmp/laserbreak-desktop.png`, `/tmp/laserbreak-mobile.png`, and `/tmp/laserbreak-particles.png`. Fullscreen checks use real desktop/mobile Chromium entry/exit, external exit, state labels, resize, gesture discard, portrait blocking, unsupported/denied requests, and orientation-lock success, rejection, and late cleanup.

Performance tests use a fixed 60-object fixture at 844×390, DPR 3 emulation, with 4× CPU throttling. They check update/render/frame and slider budgets, Canvas pixel bounds, absence of per-frame Canvas blur/layout reads/DOM mutations, adaptive frame pacing, and 60 objects alongside a sustained 128-particle burst with cleanup. Gallery regression checks cover both deployment roots, assets, responsive cards, JavaScript-disabled navigation, and the original calculator blobs/behavior. The gallery card and all other apps remain unchanged.

## Physical-phone acceptance checklist

The optimized version has been reported smooth on physical Android. Confirm this polish preserves that result:

1. Use Android Chrome in landscape. Confirm normal play and rapid opening/closing of Setup remain responsive at default density. Drag each slider repeatedly while objects continue moving; check for missed input or sticking.
2. Enable diagnostics. Record frame/render/update times, object count, and 30/60 budget at default density and 100% density after the field fills. Repeat with stationary objects, large targets, long bars, and both firing modes. Look for sustained intervals around 16.7 ms (60 FPS) or 33.3 ms (fallback) and responsive controls. Repeat for 5–10 minutes for thermal throttling/battery effects.
3. Fire repeatedly. Confirm beams appear together and stop at bars or the opposite boundary, single hits fragment immediately, off-center double hits blast intersecting shapes without chains, and two-thumb release re-arms reliably.
4. Check the wider pads with both thumbs on the smallest supported landscape screen. Verify circle visibility/glow and central field usability; try browser toolbars expanded/collapsed and devices with cutouts.
5. Rotate while holding two contacts in release mode. Portrait must show only the rotation message, never fire or advance time; landscape must restore the interface with no held contacts. Repeat while paused and stopped. Check orientation-lock behavior both in a normal tab and with the header fullscreen control. Enter/exit fullscreen repeatedly, including with held contacts and while rotating; verify the button state, safe areas, and field dimensions. Unsupported locks should leave fullscreen usable and the rotate overlay available.
6. Pause during cooldown and while objects spin; nothing should advance until Resume. Stop must empty the field, and Start must create a fresh random session using current settings. Zero density must stay empty after Start. Property changes must leave existing objects unchanged.
7. Check newly entering objects at high density for clearance, including long rotating bars. A crowded or stationary entry row may intentionally skip spawns. Later falling objects can pass through each other.
8. Test notification shade, app switching, incoming calls, OS edge/home gestures, and return to play. Resume from a background pause with all fingers released. Test iPhone Safari separately; Chromium emulation does not establish Safari behavior.

No levels, lives, quotas, scoring, scenarios, difficulty progression, or level-generation/analysis systems are included.
