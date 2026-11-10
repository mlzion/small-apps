# Performance layout (v0.4)

The performance view is landscape-only, divided left to right into thumb expression, a large circular motion preview, and the full three-row keyboard. Available notes, scale ordering, octave bounds, pointer tracking, discrete sliding, and momentary note release remain unchanged. Pitch and octave are stacked on each key so sharps fit narrow chromatic keys. The circle is approximately 190 CSS pixels across at 844×390, compared with 68 pixels in the previous phone layout; it scales with width and usable height on short screens.

The gear opens a modal drawer from the right. It contains root, scale, waveform, expression mode, master volume, motion sensitivity, octave, sensor enable/disable and separate pitch/volume motion switches. The sticky close button is on the left of the drawer heading, away from the gear. Close with that button, a tap outside, or Escape. Keyboard focus stays in the modal and returns to the gear on closure. A second thumb can open/close settings during a held touch; actions do not depend on secondary touches producing clicks. Opening releases notes and expression drags. Background controls are inert while it is open; values remain after closing.

The vertical volume fader has a 56×34 CSS pixel console-style handle. Its full-width track area handles Pointer Events directly, so tapping away from the handle jumps immediately and dragging continues with capture. Native range semantics retain keyboard input. The XY pad is square at supported landscape sizes, has a larger inset ring marker, and accepts touches throughout its full square hit area, including rounded visual corners. Its square size is bounded by available width and short-screen height. About 10% of the previous keyboard width is reassigned to expression; all notes and stacked pitch/octave labels remain. Manual controls compose with the optional motion volume multiplier; see [MOTION_AUDIO.md](MOTION_AUDIO.md).

The center display retains two-axis math, 45 ms sensor smoothing, sensitivity, circular bounds, manual recenter, permission handling and gravity fallback. Motion enable/disable and optional audio mappings are in Settings; the circle remains visible and recenterable during playing. The header consistently shows actual key/scale and the most recently pressed/slid-to note or compact chord, retaining it after release.

## Orientation and fullscreen

Portrait hides the entire instrument and shows a rotate-phone message. A **Try full screen** button is available there if fullscreen is supported, so the user can request landscape through the browser without changing system rotation settings. The normal landscape view also keeps its fullscreen button outside Settings.

After fullscreen succeeds, the interface attempts `screen.orientation.lock('landscape')`. Unsupported or rejected lock requests leave fullscreen usable and show a rotate hint. A failed fullscreen request is handled separately. Any lock acquired by this page is released on fullscreen exit/page exit, including when exit happens before a pending lock resolves. The app does not modify system rotation settings or promise orientation control on browsers that do not expose it.

Resize, orientation-change events, fullscreen transitions, and entering portrait stop held notes. Entering portrait also closes Settings. Returning to landscape preserves settings but never restarts old touches. Pointer handlers reject hidden portrait notes and reject new playing while Settings is open. The UI lifecycle is isolated in `performance-ui.js`; it receives only a callback to release the instrument's held pointers.

## Automated verification

All tests run from the repository root using development-only Python Playwright and Chromium; the deployed app has no runtime dependencies.

- `python celphonica/test-performance.py`: three-region order, enlarged circular level, all 15/21/36 notes and unclipped pitch/octave labels across 1280×720, 915×412, 844×390, 800×360, 740×360, 667×320, 640×280, and 568×320; note/control hit targets; no page overflow; drawer close/outside/Escape, focus wrapping/restoration, persistent values, and real touch scrolling; actual second-touch settings opening while a note is held; volume-only slider and independent master gain; simultaneous slider/note touches; portrait note release, hidden-input guard and modal closure; fullscreen entry/exit, successful/rejected/missing landscape-lock API, late lock completion after exit, and failed fullscreen. Screen-lock outcomes are simulated; fullscreen calls use real Chromium except the rejection case.
- `python celphonica/test-browser.py`: existing triggering/release, multitouch, shared pitches, mouse/touch slides, cancellation, delayed unlock, scales/root/octaves, waveforms, expression, and both hosting paths. Updated to use Settings and require a rotate message in portrait; the slider expectation now checks level rather than brightness.
- `python celphonica/test-motion.py`: existing simulated orientation/gravity, smoothing/calibration, independent axes, radial bounds, concurrent motion/touch/audio, permissions/fallback and lifecycle checks. Updated for hidden settings and portrait behavior.
- `python celphonica/test-latency.py`: same-event starts before display work, compressor-free graph, fullscreen, and production Synth offline onset/release at both sample rates. The silent warmup action now uses the gear.
- `python tests/check_site.py`: existing gallery/calculator regressions.

Screenshots: `/tmp/celphonica-v03-844.png`, `/tmp/celphonica-v03-640.png`, `/tmp/celphonica-v03-settings.png`, and `/tmp/celphonica-v03-portrait.png`.

## Physical Android follow-up

On the Samsung phone, test both landscape grips, normal browser chrome and fullscreen, notch/safe-area insets, system autorotation enabled/disabled, actual orientation-lock support, and exiting fullscreen while rotating. Confirm that no note survives rotation, opening Settings, cancellation, lock/unlock, or backgrounding. No system-setting change should be required by the app; unsupported browser locks must fall back to the rotate message.

Assess right-thumb reach across every scale, especially the narrower 12-column chromatic row; left-thumb XY/volume travel; key label readability; simultaneous notes and expression; and whether the central level is useful at a normal viewing distance. Browser hit testing cannot establish comfortable reach, fatigue, palm rejection, or edge-gesture behavior. Check drawer scrolling, taps outside, and the gear while another finger holds a note on actual Android Chrome.

Retest hardware sensor axes, reference capture, jitter, sensitivity access, gravity fallback, permission prompts and recovery. Confirm that the fader changes only volume and that motion is inaudible when its mappings are off; with mappings on, check bends, modest volume changes and smooth neutral recovery. Listen for clicks, distortion and release behavior. Automated audio-graph and sensor tests do not measure physical touch-to-speaker latency, actual orientation-lock behavior, sensor quality, or hand ergonomics.
