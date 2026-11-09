# D::FUZE — Phase 1

A static Canvas 2D arcade game with no runtime dependencies or external assets. Launch `d-fuze/` through a static HTTP server, directly or from the App Lab gallery. Relative links support both `/` and `/small-apps/`.

- Rotate with Left/A and Right/D; shoot with Space. Hold to repeat. Escape or PAUSE pauses. Touch controls support independent held pointers.
- Defuse each bomb before time or ammunition runs out. Success preserves lives; failure costs one of three lives. Advance and retry through explicit buttons.
- Sound is synthesized after a user gesture. SOUND OFF persists when localStorage is available. Gameplay works without audio or storage.
- Blur/hidden events clear input and pause active gameplay; resume is explicit. Phone landscape with limited space displays a rotation message; active gameplay pauses and requires explicit resume after returning to portrait. Menus/results retain their state.

## Modules and tuning

`engine.js` owns states, gameplay clock, resources, progression, and the shot-resolution seam. `levelConfig` includes the five specified levels plus configurable generation rules in `SETTINGS`. Generated health caps at 32 once the timer reaches ten seconds, reserving two seconds of firing margin. Required hits cannot increase indefinitely with a fixed timer floor and fire rate. Future ring parameters are configuration placeholders only; no rings are implemented. Inject a resolver returning a nearest target to intercept shots before bomb damage in Phase 2.

`input.js` tracks keyboard and independent pointer holds. `game.js` binds menus, HUD, focus behavior, and one requestAnimationFrame loop. `renderer.js` draws at device pixel ratio with a fixed square coordinate system. `audio.js` contains short oscillator effects, voice cleanup, mute storage, and graceful audio fallback. Visual/audio countdown pulses share engine events; browser scheduling and audio hardware latency may still affect perceived synchronization.

The timer and weapon use elapsed gameplay seconds. Scheduled pulse/shot boundaries are processed in order, independent of render frequency. Timeout has priority at the exact deadline; a successful final shot before the deadline has priority over empty ammunition. State guards prevent duplicate outcomes and life deductions. Defusal takes one second; explosion takes 1.3 seconds. Generated audio uses simple tonal sweeps, including low explosion and high crackle effects.

## Verification

From the repository root:

```sh
node d-fuze/test-engine.cjs
python d-fuze/test-browser.py
python d-fuze/test-orientation.py
node breakout/test-engine.cjs
node falling-blocks/test-engine.cjs
python tests/check_site.py
python breakout/test-browser.py
python falling-blocks/test-browser.py
```

Browser checks require development-only Python Playwright and `/usr/bin/chromium`, matching the existing game suites. They route local files at a reserved test origin, including `/small-apps/`. Screenshots are saved as `/tmp/d-fuze-WIDTHxHEIGHT.png`. Engine tests cover timing at 15/30/60/144 fps, firing and final-shot ordering, outcomes, pulses, pause, lives, retries, future shot interception, and 10,000 achievable level configurations. Browser tests cover controls, real CDP multitouch, rotation with held controls, manual resume and menu/result preservation, small-phone and tablet layouts, navigation, focus/visibility events, mute persistence, and unavailable Web Audio.

Physical phones, audible quality, non-Chromium browsers, and live GitHub Pages require manual verification. Mobile browser sound interruptions and real OS app-switch behavior should be checked on iOS Safari and Android Chrome. Browser tests use emulated touch/viewports and synthetic focus/visibility events; they do not substitute for physical-device checks.

## Mobile layout

Portrait phones keep the vertical HUD/playfield/controls layout. The square playfield uses `dvh` (with `svh` fallback) and reserves room for controls and safe areas, including when browser bars reduce available height. Menus can use the screen area below the header on short phones.

A touch-capable landscape viewport with less than 600 CSS pixels of usable height displays “ROTATE YOUR PHONE”, regardless of its width. The smaller of the layout and visual viewport dimensions determines usable space; visual dimensions are normalized by pinch-zoom scale. Touch capability uses coarse-pointer media queries or `navigator.maxTouchPoints`, so a connected mouse does not disable the restriction. No user-agent detection is used. Mouse-only desktops and tablets with at least 600 CSS pixels of available height remain playable in landscape. The covered game is inert, held input and audio stop, and the gameplay clock does not advance. Rotating back never resumes automatically. Defusal/explosion effects also freeze behind the message and continue afterward without changing their state.

The breakpoint is a space/capability heuristic: compact tablets or touch laptops with very short landscape windows also receive the message. Physical browser toolbar behavior and safe-area insets still require device verification.

## Android landscape regression and caching

The previous query required *all* of landscape, height ≤500px, width ≤1000px, and a coarse pointer. Chromium reproduction showed 915×412 correctly paused, but 1040×448 and 1100×520 remained PLAYING. Width was the wrong constraint for wide phones, and layout-only media queries did not account for the visual viewport shrinking independently. The new regression suite covers those sizes, wider 1280×540 layouts, pointer fallback, visual-viewport-only resizes, both orientation event sources, manual resume, resource preservation, zoom normalization, and desktop/tablet exceptions. These are emulated cases, not measurements from a physical Samsung A17.

Inspection of public GitHub Pages HTML, `game.js`, and `styles.css` during investigation found all three byte-identical to merged main, with `Cache-Control: max-age=600`. There is no service worker in this application. A previously loaded page or a fresh browser cache can therefore still run older code after deployment; device caching was not directly observed. The HTML now versions controller and stylesheet URLs (`?v=20261109-landscape2`) so refreshed HTML requests fresh assets. Already-open or cached HTML still requires a reload/revalidation (or a private tab); versioned assets cannot replace JavaScript in a running tab. Bump the revision when changing these assets in future.

Physical A17 viewport metrics, Chrome Desktop site mode, toolbar changes, and device cache contents could not be measured remotely. They remain manual checks; the exact cause on the reported handset is not established by emulation alone.
