# Celphonica v0.1

A browser instrument for landscape Android phones, played with two thumbs. Launch from App Lab or serve the repository and open `/small-apps/celphonica/` (a domain-root deployment also works). No runtime dependencies or build step. Serve over HTTP/HTTPS; ES modules do not load reliably from `file://`.

Touch a note to unlock audio. Hold for sound, release to stop, or slide between notes for discrete pitch changes. Multiple pointers can play chords, including two fingers on the same pitch. Sliding outside the notes stops that pointer; sliding back in starts it again. There is no sustain. Low notes are on the bottom row. Each row contains one cycle of the chosen scale from its root, without duplicating the next row's root. Sharp note names are used consistently (including enharmonic equivalents).

Choose the root, chromatic/major/natural minor/major pentatonic scale, sine/triangle/sawtooth sound, and master volume. Octave buttons shift all three rows together; the starting root octave is bounded to 1–6. Changes to root, scale, or octave release held notes. Full screen provides more playing space where supported. Portrait works as a fallback with notes wrapping within each octave row.

The left XY pad maps horizontal position to filter brightness and vertical position to expression level. It retains its values after release but never sustains a note. Vertical slider mode controls brightness and restores expression level to 100%; master volume remains independent. The pad and notes support simultaneous touches. There are no sensor permissions or motion controls in this version.

`music.js` defines scale intervals and pitch labels. `instrument.js` owns DOM, pointer capture, hit testing, cancellation and expression mapping. `synth.js` owns the lazily created interactive AudioContext, per-pointer oscillators, 8 ms attack / 35 ms release, lowpass filter, master gain, and output compressor. `Synth.setExpression({brightness, level})` accepts normalized values so future motion inputs can use the same engine interface. Oscillators and envelopes disconnect after release. Backgrounding, blur, page exit, and resize clear held notes; late audio unlock promises cannot restart released pointers.

## Verification

Run `python celphonica/test-browser.py` from the repository root with development-only Python Playwright and Chromium installed. It exercises real browser audio nodes, delayed unlock/release, mouse dragging, Android-style CDP multitouch, cancellation, settings, expressions, viewport layouts, and navigation at `/` and `/small-apps/`. Screenshots are written to `/tmp/celphonica-desktop.png`, `/tmp/celphonica-landscape.png`, and `/tmp/celphonica-portrait.png`. Run the existing regression commands in `tests/README.md` and each app's README as well.

Physical Android testing remains necessary: speaker audibility and distortion, perceived latency and click suppression, thumb reach and fatigue (especially 12-column chromatic mode), real multitouch/palm behavior, browser edge gestures, full screen and browser chrome, interruptions/audio focus, and recovery after lock/unlock. Browser automation verifies audio graph behavior; it cannot establish perceived sound quality or hardware ergonomics.
