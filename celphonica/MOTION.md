# v0.2 motion sensing prototype

This experiment shows two independent axes of phone movement as a bubble in a circular level beside the note readout. It does not route sensors to the audio engine, pitch, gain, filter, XY pad, or slider. `synth.js` is unchanged. There are no dependencies, MIDI, recordings, sensor uploads, or persistence of sensor readings or permissions in application storage.

## Playing and calibration

1. Open Celphonica over HTTPS (or localhost for development). Tap **Enable motion**. The page requests orientation/motion permission only from this explicit action, where the browser requires it. Android Chrome commonly has no JavaScript permission prompt; delivery still depends on site/browser/OS policy and hardware.
2. Hold the phone comfortably, then press a note. The latest raw orientation becomes the neutral reference and the bubble centers immediately. Each new physical pointer press, including a second chord finger, captures a new reference. This happens after the existing audio input handler, so sensor work never delays the initial audio start.
3. Tilt relative to that reference. Horizontal and vertical motion represent rotation about two axes in the neutral phone frame, mapped into the screen's current portrait/landscape coordinates. Motion remains visible after note release. Sliding to another note preserves the reference so movement can be explored while sliding.
4. Tap the circle to **Recenter** without playing a note. If a note is pressed before a valid sensor sample arrives, the first valid sample establishes neutral. A stale stream is centered and marked unavailable rather than using an old pose.
5. Adjust **Sensitivity** from 0.5× to 4×. At 1×, a combined tilt of about 25° reaches the circular boundary; higher sensitivity requires less movement. Scaling is applied before radial clamping, so diagonal movement stays inside the same boundary.
6. Tap **Disable motion** to remove sensor listeners and stop the stale-stream timer. Notes, XY expression, vertical slider, and fullscreen continue to work in either state.

## Sensor and display design

`motion.js` owns sensor lifecycle and visual controls. It listens to `deviceorientation` when valid beta/gamma readings are available. Alpha is used if available and otherwise assumed zero. `devicemotion.accelerationIncludingGravity` supplies approximate tilt if orientation is unavailable or has stopped for at least one second. It does not integrate gyroscope rates. Returning to a preferred source recenters to avoid mixing incompatible references.

`motion-math.js` converts orientation's Z-X-Y rotations to quaternions and computes the shortest relative rotation. This avoids simple Euler subtraction jumps at ±180°. Two components of the relative rotation vector drive the bubble; pure rotation about the neutral phone's third axis is not a third expression control. Results rotate with screen orientation. Gravity fallback is tilt-only: translation/acceleration contaminates it, yaw cannot be recovered, and behavior at extreme/inverted grips may differ from fused orientation readings.

The bubble uses a time-based exponential lowpass with a 45 ms time constant, then a single batched `requestAnimationFrame` paint per sensor burst. This attenuates jitter without depending on a particular sensor frequency. Radial clamping and an inset radius keep the full bubble, including its radius, within the circle. No continuous rendering loop or audio callback is added. Sensor smoothing is confined to the visual preview.

Screen rotation and page visibility changes clear the reference; the next valid reading establishes a new frame. Hidden pages ignore samples. After 1.5 seconds without a valid reading, the bubble centers, the recenter button disables, and a message explains that notes remain usable. Resuming valid samples establishes a fresh reference. Page exit disables sensing. Unsupported APIs, insecure contexts, denied/rejected permission requests, null readings, and gravity-free samples are handled without blocking the instrument. After denial, **Enable motion** can be tried again if browser settings have changed.

## Automated verification

Run `python celphonica/test-motion.py` from the repository root with development-only Python Playwright and Chromium. It dispatches simulated orientation and gravity events through the actual browser listeners and mocks permission outcomes. It checks:

- No sensor permission requests before opt-in; granted, denied, rejected, absent, insecure, no-prompt, and retry cases; null values and stalled streams.
- Independent axes, quaternion angle wrapping, all four screen rotation angles, rate-independent smoothing, alternating jitter attenuation, adjustable sensitivity, and circular limits.
- First reading, raw note/manual recenter, subsequent chord press, reference preservation during sliding, source fallback/preference, rotation, background, recovery, and disabling.
- Actual bubble pixel movement and containment, real CDP touch notes/XY expression with concurrent sensor input, unchanged audio frequency/gain/filter during motion, note release, and continued notes when sensors are denied/unavailable.
- Both hosting roots, all four scales, all note centers and motion controls, and seven desktop/portrait/landscape viewports (1280×800, 844×390, 844×320, 740×360, 667×375, 375×812, 320×568), including a short landscape viewport with browser chrome taking space.

The existing `test-browser.py`, `test-latency.py`, and gallery/calculator suite remain applicable. These validate software behavior and simulated inputs, not the accuracy, latency, or availability of real sensors.

## Physical Android checklist

On the Samsung phone and at least one other phone if available:

- Confirm browser/site sensor permissions, HTTPS delivery, the initial sample, and recovery after changing denied permission in browser settings.
- Try both landscape directions and portrait. Verify axis direction and independence at the actual playing grip; check angle-wrap/extreme-tilt behavior, recenter repeatability, and whether source switching causes disruptive resets.
- Compare sensitivity settings and the smoothing feel during slow tilt, fast gestures, natural hand tremor, and walking. Confirm the bubble follows responsively and stays inside the circle.
- Play two-thumb notes, chords, and slides while moving the phone and using XY/slider controls. Assess the intended recenter-on-each-new-finger behavior, note target sizes, visibility, fatigue, and whether the upper bubble distracts from playing.
- Test fullscreen/browser chrome, screen rotation, background/return, screen lock/unlock, interruption during permission prompts, and readings that pause or stop. Notes must release correctly throughout.
- Confirm that motion has no audible effect and that the existing low-latency response, envelopes, and speaker sound remain unchanged.

Hardware sensor fusion, sampling rate, coordinate conventions, gravity contamination, OS/browser policy, actual gesture latency, battery use, and thumb ergonomics require the phone; simulated events cannot establish those outcomes.
