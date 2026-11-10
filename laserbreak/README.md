# LaserBreak — Phase 1

A standalone mechanics playground. Open `laserbreak/` through any static server; relative URLs also work under GitHub Pages at `/small-apps/laserbreak/`. Original Canvas/SVG graphics and JavaScript, with no build step or runtime dependencies.

## Play

Use landscape orientation and place one thumb on each tall firing pad. Vertical positions on the pads determine the straight firing line across the field.

- **Fire on touch** (default): the second contact on the opposite pad fires immediately. No preview line. Release every contact before another shot.
- **Fire on release**: hold both pads, slide vertically to aim along a faint line, then lift either thumb to fire. Release all contacts before re-arming.
- A shot attempted during cooldown consumes that gesture. Holding until ready does not fire automatically; lift both thumbs and try again. Default cooldown is 0.75 seconds, measured in simulation time.
- Pointer cancellation aborts the gesture. Leaving the tab/window pauses simulation and clears contacts; resume through Setup. Opening Setup or changing orientation also clears contacts.
- Desktop fallback: hold the mouse on either pad and press Space for the opposite endpoint at the same height; release mouse and Space to re-arm. In release mode, releasing either fires. Full angled input is intended for multitouch.

Setup overlays the field and can be closed while playing. Every requested control is live: firing mode, cooldown, target radius/speed, bar length/thickness/speed/rotation, density, collision overlay, pause/resume, clear, and reset. Sizes are logical world pixels; speeds are logical pixels/second and rotation is degrees/second. Negative rotation reverses direction. Clear removes objects, in-flight shots, and effects; ordinary random spawning continues. Reset restores defaults, seeds a fresh sparse field, resumes, and readies the laser. Settings are session-local.

## Simulation and geometry

`engine.js` separates the simulation and pointer state machine from `game.js`, the Canvas renderer and browser input adapter. The logical world is 1000 × 500 and fills the available rectangle between the pads. Scaling can stretch shapes on unusual aspect ratios; collision geometry follows the exact same transform. Safe-area insets and dynamic viewport height keep controls inside the viewport. Portrait provides a rotation hint and remains usable for setup.

Two pulses travel at 2800 logical pixels/second from opposite edges along the selected line, independently. Targets do not block pulses. Each pulse stops at the nearest intersecting bar or opposite edge. Ray segments use analytic circle entry tests for target collision radii and slab intersections in each bar's rotated coordinate system, including bar thickness, endpoints, and grazing hits. Circle versus circle and circle versus oriented rectangle tests handle explosions. The debug overlay shows target collision circles and actual bar rectangles; while an explosion animates it also shows its full blast radius.

Each shot records the sides that reached each target. Resolution waits for both pulses to stop or leave, up to about 0.4 seconds. A target stays present after the first hit so the other pulse can reach it. One side dissolves it; two sides produce an explosion with radius exactly twice the target collision radius. The blast destroys every target/bar whose collision shape intersects the blast circle, including partial overlaps. Blast victims do not explode. Simultaneous direct double hits can each create their own blast. Target centers at resolution time determine blast centers.

Falling and rotation advance in slices of at most 1/240 second. Laser motion uses swept segments, so it cannot tunnel through a stationary shape; moving/rotating geometry is sampled per slice (maximum default-configurable rotation displacement: 1° per slice). Frame delays advance at most 50 ms of simulation, intentionally slowing play under load instead of skipping large distances. Pause freezes objects, pulses, effects, spawn timers, and cooldown.

## Random objects

The field begins with three random objects near the top and fills sparsely; no predetermined sequence or scenario exists. Spawned objects enter at random horizontal positions just above the field, with 65% targets and 35% bars. Cyan diamonds and yellow hexagons share circular collision radii. Bars use muted outlines, fall vertically, and rotate. Objects are removed after their full shape passes below the field.

Density ranges from 0 to 100%, defaults to 20%, and controls a continuous spawn-frequency function: `0.05 + 5.95 × density / 100` objects/second when positive. This is about 1.24/second at default density and 6/second at maximum. Zero immediately stops new spawning, leaving current objects active. Positions, types, colors, and initial angles remain random. Density never changes size or speed. A cap of 90 live objects bounds simulation/render work, including when falling speeds are zero. Lowering density resets the spawn timer without clearing current objects.

## Automated verification

Run from the repository root:

```sh
node laserbreak/test-engine.cjs
python laserbreak/test-browser.py
python tests/check_site.py
```

Browser checks use Python Playwright and Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`), with local request routing and no server or external requests. These are development tools only.

The 14 engine cases cover pointer order, same-side and extra contacts, duplicate IDs, vertical movement, both firing modes, cancellation, cooldown and re-arming, independent pulse stopping, target intersections, oriented bar intersections and rotation, single-hit dissolution, delayed double-hit explosions, partial blast intersections, no chain reactions, random positions/types, density zero/default/maximum, monotonic spawning frequency, the object cap, live sizes, bottom removal, and clear.

Desktop Chromium checks cover gallery navigation, every setting, pause/resume, reset, clear, desktop input, and layout at 568×320, 667×375, 844×390, 1024×600, and 1366×768. Mobile Chromium uses an 844×390 touchscreen viewport and actual multi-contact CDP touch events to exercise Pointer Events, both modes, capture outside pad boundaries, lift/re-touch re-arming, cooldown, cancellation, setup cancellation, scroll prevention, and portrait guidance. Screenshots go to `/tmp/laserbreak-desktop.png` and `/tmp/laserbreak-mobile.png`. Gallery regression checks cover both deployment roots, responsive cards/assets, JavaScript-disabled navigation, and the unchanged calculator.

## Physical-phone checks still required

- Android Chrome and iPhone Safari: two-thumb reach, pad width, angled aiming, and repeated gestures at different cooldowns.
- Browser toolbars, notches, safe-area insets, rotation, and OS edge/home gestures. Pointer Events and `touch-action: none` prevent browser pan/zoom in the field, but OS-reserved gestures need device checks.
- Interruptions: notification shade, app switching, incoming calls, lost contacts, and resume with both fingers released.
- Sustained maximum density on older phones, high-DPI sharpness, latency, thermal load, and battery use. Chromium mobile emulation does not establish Safari behavior or physical-device performance.
- Tune the circular target hit radius and the short delay before hit resolution through actual play. Graphics, effects, and the desktop fallback are intentionally minimal.

There are no levels, scenario files, generators, difficulty progression, quotas, lives, scoring, win/loss states, escape allowances, or level-analysis/validation tools.
