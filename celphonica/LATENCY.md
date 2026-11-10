# Note latency investigation

The Samsung phone report establishes a perceived difference between Celphonica and D::FUZE. This environment cannot measure that phone's physical touch-to-speaker delay. The findings below isolate avoidable application delays; they do not prove these explain the entire reported delay.

## Comparing the original paths

| Part | Celphonica v0.1 | D::FUZE |
| --- | --- | --- |
| Context | Created on first note with `latencyHint: 'interactive'` | Created on Start/menu/input gestures with browser defaults (normally interactive) |
| Running-context trigger | `pointerdown`, but initial hit test and full note display update precede audio start | `pointerdown` invokes fire; game event immediately invokes `tone` |
| Source | Creates an oscillator and envelope for each voice | Creates an oscillator and envelope for each effect |
| Scheduling | Starts at `context.currentTime`; waits for resume only if context is not running | Starts at `context.currentTime` when running |
| Envelope | Linear 8 ms attack, 35 ms release | Immediate nonzero gain followed by exponential decay |
| Output | Envelope → lowpass → master → dynamics compressor → destination | Envelope → destination |
| Typical onset | Default C3 sine, relatively soft/low | Fire is a 900→220 Hz square chirp with an abrupt onset |

Both apps already use immediate oscillator scheduling. Oscillator allocation alone is not evidence of the difference: D::FUZE does the same work. The interactive context hint is already appropriate; it is a browser request, not a guaranteed Android output latency. Forcing a sample rate could introduce resampling, so the device/browser choice is retained.

The compressor is the clearest unnecessary fixed delay: Web Audio dynamics compression uses look-ahead (roughly 6 ms in this Chromium). An 8 ms ramp further softens the onset; this does not mean 8 ms of silence. The lowpass is an ordinary biquad, without look-ahead. Its phase response can affect onset, especially at low cutoff, but its default setting contributed little in the isolated test. D::FUZE's sharper, higher-frequency fire sound may also be easier to hear promptly through a phone speaker.

Cold context creation/resume can delay the first note after startup or interruption. It cannot by itself explain every note while the context remains running. Initial hit testing and DOM work before audio scheduling are additional avoidable main-thread work, whose cost depends on the phone.

## Changes

- Remove the dynamics compressor entirely. Retain the lowpass because both expression modes depend on it.
- Shorten attack from 8 ms to 1 ms, retaining a small ramp to avoid hard gain steps. Preserve the 35 ms release, oscillator stop at 40 ms, polyphony, and per-pointer cleanup.
- Reduce peak per-voice gain from 0.14 to 0.08 to provide fixed mixing headroom without look-ahead. Ten simultaneous full-level voices sum to at most 0.8 before master gain, ignoring release tails/filter transients. This is not a hard limiter: extreme overlapping release tails or large artificial pointer counts can still overload the output.
- Start a running-context note synchronously within `pointerdown` before updating the readout/highlights. Use the event's note target directly rather than a layout hit test for initial presses. Sliding retains coordinate hit testing.
- Prepare the audio context silently on settings/expression/fullscreen pointer gestures. This can pay cold startup cost before the first note, as D::FUZE's Start gesture does. No continuous oscillator, silent keep-alive, new permission, or background playback is added.
- Set initial filter/master values directly. Keep smoothing for subsequent expression/volume changes. Running notes never await a resume promise; interrupted contexts retain asynchronous resume and the guard against reviving released notes.

The grid, scales, octave controls, expression mappings, fullscreen behavior, and D::FUZE files are unchanged. No runtime dependencies are added.

## Automatic measurements

`python celphonica/test-latency.py` renders real Web Audio samples using `OfflineAudioContext`. Production Synth code runs through a scheduling adapter; the old topology and individual stages are reference graphs with settled master/filter settings (no cold-start smoothing). There is no real output device in this measurement. At the default C3 pitch and default expression settings, time from scheduled start to 10% / 50% of each render's steady peak was:

| Graph | 44.1 kHz (ms) | 48 kHz (ms) |
| --- | --- | --- |
| Direct oscillator/gain | 0.136 / 0.658 | 0.125 / 0.646 |
| Lowpass only | 0.159 / 0.680 | 0.167 / 0.667 |
| 8 ms attack only | 1.066 / 4.966 | 1.062 / 4.979 |
| Compressor only | 6.259 / 15.102 | 6.292 / 15.125 |
| Original complete graph | 7.778 / 15.125 | 7.792 / 15.146 |
| Revised production Synth | 0.340 / 0.703 | 0.333 / 0.708 |

These are signal thresholds, not psychoacoustic audibility thresholds. Each render uses its own steady peak, so thresholds also reflect compressor dynamics and envelope shape; effects are not necessarily additive. Values can vary across browser implementations. Tests repeat at A4 as well, assert the onset improvement, verify eventual silence after release, reject compressor creation, and require repeated running-context starts within the same pointer event before UI writes. They do not set a flaky wall-clock performance threshold on the test machine.

The existing browser suite covers both hosting paths, six viewports, scales/octaves, waveforms/volume, touch/mouse sliding, chords/shared pitches, expressions, cancellation, and late resume after release. It verifies functional behavior rather than acoustic latency. Browser `baseLatency` and `outputLatency`, when supported, are useful estimates of parts of the output pipeline, but do not include the physical touch sensor, complete OS/speaker processing, or human perception.

## Samsung follow-up

Compare the original and revised versions on the same phone, Chrome version, speaker route, volume, waveform, pitch, and expression settings. Compare repeated notes after warming audio separately from the first note after page load, backgrounding, or lock/unlock. Keep D::FUZE as a separate perceptual reference; its different timbre makes it an imperfect latency benchmark.

Use high-frame-rate video with recorded audio, or a synchronized external touch/contact trigger and microphone, to estimate physical touch-to-speaker onset across many taps. Check synchronization/calibration and report distributions rather than one tap. Merely measuring `performance.now()` at pointerdown and oscillator scheduling omits the largest unknown device stages. Confirm that the shorter attack remains free of objectionable clicks, fast slides/chords do not distort, and background/lock recovery and release behavior remain correct. If substantial repeated-note delay persists, capture the phone's output-latency estimates and a browser performance trace before introducing oscillator pools, worklets, or keep-alives without evidence.
