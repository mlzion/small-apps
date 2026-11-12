# ChordMidi v0.1

A static, portrait-first chord progression composer. Launch `chordmidi/` from App Lab, or serve this repository with any static server. No build, account, CDN or runtime dependencies. All paths are relative and work at `/chordmidi/` and GitHub Pages `/small-apps/chordmidi/`.

## Compose

Six three-position thumbwheels select key, major/natural minor, scale degree, chord quality, inversion and octave. Swipe vertically, drag with a mouse, use a mouse wheel, tap adjacent options, or focus a wheel and use Up/Down/Home/End. Two-choice mode shows each available option once. The center is always selected. `◇` marks diatonic triads and sevenths; the third dyad is also derived from the scale. Alternative major/minor/diminished/augmented, power, suspended, sixth and seventh qualities remain available on every degree. Spellings follow scale letters, including E♯, C♭ and double accidentals where necessary.

Choose **RH** or **LH** above the builder to retain independent degree, quality, inversion and octave settings. Key and mode are shared. Octave 4 starts the tonic in MIDI register C4–B4 (C4 = MIDI 60); degrees above the tonic can cross into the next register, and inversions lift the lowest voices by an octave. The readout gives full quality, inversion, octave, spelled notes and exact MIDI pitches. **Drop** auditions the current builder chord without placing it.

- Tap an empty eighth-note pad to place a chord or passing note. Desktop: drag horizontally from the pad to extend its duration. Touch: **hold an empty pad for 260 ms, then drag**; a normal swipe scrolls the timeline.
- Tap an event to select it and restore its saved key/mode and lane builder settings. Selecting never changes its stored pitches. Drag its right edge to resize. Hold any part of the event for 650 ms to delete; moving cancels deletion.
- **Copy** snapshots selected pitches, settings and duration. **Paste** arms placement; tap an empty pad in either chord lane, or the passing lane for a copied note. Paste again cancels. Lengths that exceed the grid are refused. A chord cannot be pasted into the single-note lane.
- Keyboard: Enter/Space places or selects, Delete removes a focused event, Shift+Left/Right resizes it.
- Passing Notes offers scale notes or current RH chord tones and its own octave. Events always hold a single actual pitch.
- Choose 1–8 bars and 2/4, 3/4, 4/4 or 6/8. Length is in eighths: 4, 6, 8 or 6 per bar. Shortening is refused if it would cut off events; resize/delete those events first. Existing onsets retain their eighth-note offsets when changing meter.

Each event stores actual pitches, start, duration and builder metadata. Subsequent builder changes never transpose placed events. Overlaps are supported; same-pitch overlaps within a lane sound/export as a continuous held note, while adjacent events retrigger. RH and LH use independent MIDI channels.

## Audio and transport

All three lanes and Drop share a selectable instrument from the bundled **TimGM6mb SF2**, containing 128 bank-zero GM presets, including piano, guitar, organ, strings and brass. The approximately 6 MB bank loads on the first Play/Drop gesture and is then cached in memory; the first sound can take a moment. No network access is needed beyond fetching the app's own static files.

DruMidi was reviewed before implementation: `core.js` is a browser/Node model, `audio.js` uses native Web Audio sources with a 25 ms pump and 120 ms lookahead, `app.js` supplies autosave/JSON workflows, and its MIDI writer emits sorted delta-time events. Its browser playback uses decoded MP3 percussion samples; its standalone SF2 has a drum preset only. ChordMidi follows these working architecture and UI conventions with a separate melodic SF2 reader. No DruMidi files or assets are changed.

The native SF2 reader supports preset/instrument global/local zones, key and velocity ranges, sample offsets and loops, tuning, attenuation, pan and volume ADSR. Polyphonic sources have scheduled releases and note-offs. A master compressor provides headroom. It is a focused sample player for this bundled bank, not a complete SoundFont synthesizer: SF2 filter/modulator effects, chorus and reverb are not implemented, and user-supplied SF2 files are not supported. Sounds can differ from a full FluidSynth renderer. Pitches outside an acoustic preset’s natural sample range use its nearest zone, transposed to the requested pitch.

The fixed bottom transport offers return to start, Stop, Play/Pause, Loop, 30–300 BPM and metronome. Instrument selection stays directly above it; scroll the page on shorter displays to reach all editing controls. Audio time drives the cursor and all lanes. Pause silences voices and resumes held notes at the saved position. Stop/return/new/load/edit cancel scheduled sources. Backgrounding the page stops playback to avoid a burst of stale notes. 6/8 uses dotted-quarter metronome beats; other meters use quarter notes.

## Projects and MIDI

The top-right **Setup** gear contains project name, New, Save, Load and Export MIDI. Autosave uses a separate `app-lab-chordmidi-v1` localStorage key. **Save Project** downloads a complete JSON backup; Load validates the format, settings, event bounds and MIDI pitches before asking to replace the project. New also asks before replacement. Invalid imports leave the current project intact. Storage/audio failures are reported with recovery instructions.

**Export MIDI** downloads SMF format 1 at 480 PPQ with exactly three named tracks: RH Chords, LH Chords, Passing Notes, on channels 1–3. Each has the selected GM program. Track 1 also includes tempo and time signature. Each eighth is 240 ticks. Inversions/octaves are already encoded as pitches; ends are exact and note-offs precede same-tick retriggers. Same-pitch overlaps in a lane are unioned to avoid premature note-offs in DAWs. Arrangement overlaps across lanes remain independent. Metronome is a playback aid and is not exported.

## Checks

From repository root, with Node, Python Playwright and Chromium available:

```sh
node chordmidi/test-core.cjs
node chordmidi/test-audio.cjs
python chordmidi/test-browser.py
python tests/check_site.py
node drumidi/test-core.cjs
node drumidi/test-audio.cjs
```

Set `CHROMIUM_PATH` if Chromium is elsewhere. Browser checks route an HTTPS test origin to local files and load the real soundfont; they do not use a mock audio bank. Screenshots go to `/tmp/chordmidi-*.png`.

The model suite checks all 12 keys, both modes, all qualities/degrees/inversions at three registers, explicit pitch and spelling examples, JSON validation/roundtrips, meter lengths and an independent MIDI decoder checking tracks, metadata, instrument/channel, overlapping pitches, onsets and note durations. Browser checks exercise actual CDP touch gestures, mouse and keyboard, editing/scroll cancellation, independent lanes and fixed pitches, all meters, 8 bars, every GM preset's sample decoding, actual audio-clock scheduling, polyphony, passing notes, note-off/stop, pause/resume, looping/metronome, JSON/MIDI downloads, malformed imports, storage/audio failures, fullscreen, six viewport sizes and both hosting roots. Gallery checks preserve the existing apps and navigation.

Physical Android testing is still required for speaker/Bluetooth latency and sound quality, fast thumbwheel flicks, gesture feel under browser chrome, long presses versus OS menus, pinch/scroll behavior, fullscreen/system navigation, safe-area insets and file download/import integration. Browser emulation does not establish these hardware behaviors. No live GitHub Pages deployment is performed by this PR; `/small-apps/` asset and gallery routing are tested locally. Verify the published Pages URL after review/merge.

## Soundfont attribution

`TimGM6mb.sf2` is included unmodified from Debian's `timgm6mb-soundfont` package. Copyright 2004 Tim Brechbill and 2010 David Bolton, licensed GPL v2. See [attribution and source provenance](soundfont/ATTRIBUTION.txt), [full license](soundfont/LICENSE.txt), and [checksum](soundfont/SHA256SUMS). The SF2 is its editable source asset; the license applies to that bundled bank. Application code is original for this repository.
