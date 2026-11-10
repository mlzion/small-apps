# Synth Lab 0.1 — First Oscillator

A small educational instrument built with native Web Audio, Canvas, and browser modules. No runtime dependencies, remote audio, framework, or build step. Only the oscillator is implemented in 0.1.

## Try it

Serve the repository root, for example with `python -m http.server 8000`, and visit `/synth-lab/`. Browser modules need an HTTP(S) origin. All links and assets are relative, including the App Lab return link, and work under GitHub Pages at `/small-apps/synth-lab/`.

Enable audio, then hold a piano key with a mouse or finger. Keys release on pointer up/cancellation even outside the keyboard. Multiple fingers can play independent notes, including the same pitch. The keyboard stays at the bottom while the instrument scrolls; short landscape screens use a compact keyboard.

Tab to a piano key and hold Space or Enter, or play C4–C5 with `A W S E D F T G Y H U J K` outside editable controls. Releasing a computer key releases its voice. Focus loss, page hiding, and page exit release all voices. A short tap during delayed browser audio unlock cannot create a stuck note.

Reference tuning sets **A4**, from 400 to 480 Hz (default 440 Hz). Every key follows equal temperament: `reference * 2 ** ((midi - 69) / 12)`. Keyboard pitches therefore stay coherent with the frequency control. Waveforms and tuning update held notes. Master volume starts at 20%; voice headroom, a 15 ms attack, and a 60 ms release keep playback conservative and avoid abrupt note edges. Up to sixteen input voices can sound together.

## Lessons and free play

The five-step **Meet the Oscillator** lesson follows the supplied script. The first-note step sets Sine on entry and enables Next after a real note starts; Skip step is always available. Other steps allow manual progression and experimentation. Back, Restart lesson, completion, Repeat Lesson, and Free Play are available. Switching Guided / Free Play preserves the current sound and lesson position. Entering the first-note step intentionally selects Sine as required by the lesson.

Lesson cards sit in document flow beside their topic, with usable outlined controls and no overlay blocking the instrument. Navigation focuses the new lesson heading and scrolls it into view, respecting reduced motion and the keyboard dock. Free Play retains all controls, both displays, and contextual explanations. Returning to Guided resumes the lesson; Restart begins it again.

## Modules

- `engine.js`: audio-only voice lifecycle and settings. Each input owns an ID, independent of pitch. Oscillators → per-voice attack/release gains → master gain → analyser → destination. Ended voices disconnect their nodes.
- `lessons.js`: editable lesson text, target IDs, placement slots, and entry/action declarations.
- `tutorial.js`: reusable lesson state/navigation, completion and action gating, with callbacks instead of audio dependencies.
- `visualizer.js`: actual post-volume analyser samples, fixed buffers, zero-crossing scope trigger, and logarithmic spectrum with peak aggregation. Canvas resolution is capped at 2× CSS size and rendering at 30 fps; drawing pauses when hidden. The scope shows a fixed 12 ms window with fixed visual magnification, described in Help.
- `app.js`: accessible controls, pointer/computer-key ownership, delayed audio unlock handling, lesson presentation, mode switching, and contextual help.

The separate engine, parameter setters, tutorial data, and display controller leave room for later blocks and focused parameter modulation editors. No modulation, effects, saving, or routing UI is included.

## Verification

Development tools only: Node 22+ for module-aware tests, Python with Playwright, and Chromium (`CHROMIUM_PATH` can override `/usr/bin/chromium`). Run from the repository root:

```sh
node synth-lab/test-engine.cjs
python synth-lab/test-browser.py
python tests/check_site.py
```

Engine tests verify reference pitches, audio routing, attack/release scheduling, disconnection, independent shared-pitch voices, waveform selection, live tuning/volume, voice limit, and tutorial transitions/gating.

Browser tests observe native AudioContext nodes rather than replacing synthesis with mocks. They verify generated frequency and samples, spectrum harmonics, all four waveforms, held-note tuning/volume, cancellation/blur/pagehide/visibility cleanup, delayed unlock, keyboard controls, CDP multitouch and independent releases, mode preservation, every tutorial step, repeat/skip/back, explanations and focus, six viewport sizes from 320×568 to 1440×900 including landscape, Canvas resizing, relative gallery navigation at both deployment roots, error handling, and asset/browser errors. Screenshots go to `/tmp/synth-lab-desktop.png` and `/tmp/synth-lab-mobile.png`.

Existing-app regression checks include the gallery/calculator browser suite, the main Breakout, Falling Blocks, D::FUZE, and Celphonica browser suites, and all existing `*/test-*.cjs` engine suites. No other application files are changed.

Physical-device testing is still required for perceived loudness, timbre, click-free playback, touch ergonomics, and platform audio behavior, especially iOS Safari interruptions and Android/browser differences. Automated Chromium checks establish signal generation and interaction behavior; they do not establish listening quality or cross-browser equivalence. The compact one-octave keyboard and conservative voice levels are intentional prototype limits.
