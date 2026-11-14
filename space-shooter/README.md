# Galactix · Space Shooter v0.1

A standalone, buildless, portrait arcade shooter launched from App Lab's existing **Space Shooter** card. The ship uses the card's exact triangular geometry and blue-gray colors; the starfield, enemy craft, shots, and single shield pickup keep the same simple motif. No dependencies, remote assets, service worker, or shared app code.

## Play

Drag on the lower-left pad to move relative to your finger; lift and reposition without teleporting the ship. Hold the adjacent FIRE button with another finger for repeated shots. The ship stays within the lower half of the playfield. On a portrait desktop window, use arrows or WASD plus Space; P toggles pause. Pause offers resume or a fresh attempt at the current sector.

Destroy every enemy to finish a sector. Surviving divers re-enter from the top. Scouts take one hit; the purple armored variant takes two. A single S shield pickup drops halfway through each formation: collect it to absorb one hit. Three hull points, a short grace period after damage, and a fresh hull each sector keep the test campaign forgiving. Scouts score 100, armored enemies 200, and completion adds 250 per remaining hull point. Retry discards the failed sector's score and keeps completed-sector points. Selecting a test level begins a new score run. Only the best score is stored, under `galactix.best.v01`; blocked storage does not prevent play.

The test-level selector opens all ten sectors. Difficulty increases with formation size, armored count, sway, dive speed/frequency, and enemy projectile speed/frequency. Configurations are in `engine.js`; no additional enemy families or weapon upgrade tree in v0.1.

Landscape displays a blocking rotate overlay and pauses the simulation, as LaserBreak does for its opposite orientation. A browser-supported portrait lock is attempted on launch; browsers that reject native locking use the overlay. Returning to portrait leaves a running flight paused until Resume. App switching, browser blur, and pointer cancellation clear held controls. Canvas uses a fixed logical world with equal x/y scaling, a capped device pixel ratio, and a fixed simulation step.

## Verification

Run from repository root:

```sh
node --check space-shooter/engine.js
node --check space-shooter/game.js
node space-shooter/test-engine.cjs
node space-shooter/test-controls.cjs
```

Simulation tests cover all ten formation clears and scoring through real projectile collisions, gradual difficulty parameters, movement bounds, shot cadence, dives, shields, damage/grace, defeat, seeded repeatability, and bounded transient objects. Controller tests use DOM/event doubles to cover separate move/fire pointers, capture loss, cancelled touches, blur/visibility pause, rotation blocking and explicit resume, retry, restart, level selection, and the full ten-sector progression. They do not verify browser rendering or real touch hardware.

The gallery browser suite is `python tests/check_site.py` (existing Playwright/Chromium setup). Its launch count is updated to eleven. Browser QA was not run in the implementation environment because the supported preview/browser tool was unavailable.

Before release on phones, check Safari/iOS and Chrome/Android at 320×568, 375×812, and 390×844 (including browser chrome and safe areas):

- Entire field, drag pad, and fire button fit without page scrolling; the ship stays visible above fingers.
- Two fingers can move and fire simultaneously; long press, extra fingers, sliding off controls, and interrupted touches never leave fire held.
- Landscape immediately covers and pauses the game; portrait requires Resume. App switching and screen locking pause safely.
- All ten test levels launch, the shield can be collected, loss retries correctly, and sector 10 ends the campaign.
- The root and `/small-apps/` gallery launch link and return link resolve correctly. Other apps still launch.
