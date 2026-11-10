# v0.4 motion-to-audio experiment

Enable sensors in Settings, then separately enable **Pitch bend** and/or **Volume expression**. Both switches default **OFF** on each fresh page. Sensors can remain enabled for visual exploration with both mappings off. Mappings are not persisted. Opening Settings still releases held notes, as in v0.3.

## Mapping and calibration

`motion.js` publishes the same calibrated, smoothed, circle-clamped `x,y` coordinates used to paint the bubble. The existing `motion-math.js` calculations are unchanged. `instrument.js` applies the switches and sends targets to `Synth.setMotion`:

| Input | Target |
| --- | --- |
| Horizontal x, −1…+1 | −200…+200 cents (±2 semitones) |
| Vertical y, −1…+1 | Volume multiplier `1 − 0.15y` (1.15…0.85) |
| Center x=0, y=0 | Zero bend, multiplier 1 |

Upward bubble movement increases volume; downward movement decreases it. Circle clamping means diagonal gestures share the circular range. Sensitivity changes how much physical tilt is needed, not the maximum bend or volume multiplier. Pitch uses each oscillator's `detune` AudioParam, leaving its base MIDI frequency intact. No oscillator is recreated or restarted to bend a held note.

Output gain before the safety stage is `master volume × manual expression level × motion multiplier`. The XY pad still controls brightness and level; the vertical fader controls level only. Motion never changes filter cutoff or overwrites manual expression. A manual zero remains silent even with motion volume enabled.

Each new note press captures the latest raw orientation before creating the new voice, so its original pitch is the new center. Existing voices approach neutral smoothly. Sliding keeps the reference and remains the existing discrete note transition; this is not a glide mode. Tapping the bubble recenters, including with a second pointer while a note is held. Note release still uses the 35 ms fade and scheduled stop at 40 ms; pitch updates cannot sustain a released voice.

## Smoothing and safety

The sensor model retains its 45 ms time-based smoothing. Audio targets additionally use 25 ms exponential smoothing with cancellation/hold at the current audio time. Typical settling takes several time constants. Enabling/disabling mappings, recentering, source changes, sensor loss, and sensor disable target neutral rather than jumping parameters. Fresh voices initialize to the current target; calibration puts that target at center. Release tails remain subject to smooth pitch neutralization but still end on schedule.

Invalid motion API values are bounded or neutralized: bend is limited to ±200 cents and volume to 0.85–1.15. Sensor streams that stop for 1.5 seconds center the model and publish neutral immediately, independently of whether a visual animation frame runs. Hidden pages/orientation changes and page exit also publish neutral. Returning sensor data establishes a new reference instead of restoring stale modulation. Failed/denied sensor access leaves normal playing available.

A memoryless WaveShaper after master gain is unity below magnitude 0.85 and smoothly approaches a 0.925 ceiling. It uses no oversampling, compressor, look-ahead, or continuous source. Normal low-level signals are unchanged; extreme voice sums are softly saturated to prevent digital output clipping, including release-tail overlap and the modest motion boost. This can color overloaded chords; it cannot guarantee that a physical phone amplifier or speaker will never distort. The existing 1 ms attack, interactive latency hint and same-event note scheduling remain intact.

## Automatic checks

`python celphonica/test-v04.py` verifies:

- Non-overlapping left-side close button, sensor toggle in Settings, independent mapping defaults, fresh-page reset, square pad geometry at eight landscape sizes, readable full keyboard, and approximately 10% width reallocation.
- Real CDP touch taps at XY edges/corners/label/marker, immediate position changes and visible marker bounds; fader taps away from its handle, dragging, cancellation and keyboard control.
- Actual selected key/scale, retained notes, compact chords with full accessible names, and release without erasing the readout.
- Real oscillators controlled by simulated sensor events: coordinates agree with bend/gain targets; pitch/volume toggle independently; manual volume multiplies motion; recenter/loss/disable return to neutral; fresh calibrated voices start at original pitch; modulation does not retrigger voices; release still stops them.
- Production Synth audio samples rendered with OfflineAudioContext: an existing A4 oscillator bends up and down two semitones, uses 115%/85% gain, returns to 440 Hz and normal gain, then becomes silent. Controls are applied at actual suspended rendering boundaries to match live scheduling.
- Forty simultaneous voices at maximum gain for sine, triangle and sawtooth stay below the output ceiling and become silent after release. All rendered samples must be finite.

The existing note/touch, performance, sensor, latency and gallery suites are also run. Old sensor tests deliberately leave audio mappings off. The latency suite still verifies no compressor, synchronous starts before readout updates and unchanged offline onset thresholds. Automation measures browser software and rendered samples, not physical touch-to-speaker latency or perceived musical quality.

## Physical Android follow-up

On the Samsung phone, test left/right bend direction, forward/back volume direction, ±2-semitone range against a reference pitch, natural held-note vibrato, smoothing feel, thumb reach, square-pad corners and fader track/handle travel. Compare mapping-off sound with the previous release, and confirm that manual volume zero remains silent. Try chords, fast slides, repeated note calibration, and second-thumb recentering while moving the phone.

Check enabling/disabling each mapping, sensor denial/loss/recovery, both landscape directions, fullscreen, permission interruptions, background/return and screen lock/unlock. Listen for clicks, overshoot, unwanted pitch resets, distortion on loud chords and unchanged note release. Assess whether recentering on every chord finger is musically useful. Hardware sensor fusion, speaker quality, physical latency, palm/edge gestures and hand comfort remain physical-device tests.
