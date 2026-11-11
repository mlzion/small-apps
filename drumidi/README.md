# DruMidi — Drum MIDI Creator, Phase 1

A static, portrait-first acoustic drum sketchpad for App Lab. Launch `drumidi/` from the gallery. Serve the repository using any static HTTP server; there is no build, runtime dependency, account, or external audio service. All links and samples are relative, supporting both `/drumidi/` and GitHub Pages `/small-apps/drumidi/`.

## Working with patterns

- P1–P8 share one configurable GM percussion list. Each has 1–4 bars in 4/4.
- Select a drum/eighth-note cell, then toggle its eight 64th-note subdivisions below the grid. The blue cell dots show activity; small counts show multiple hits. Green subdivision buttons indicate notes. Bar tabs and arrows navigate the selected pattern.
- Only the drum rows scroll. Subdivisions remain below them, with the rhythm display and transport anchored at the bottom.
- Add Drum offers the remaining General MIDI percussion notes, 35–81. Initial rows include acoustic kick, snare, closed/open hats, ride, three toms, and crash.
- Notes retain their individual velocity. New kicks/snares default to 106, hats/ride to 78, and other instruments to 94. Existing notes are never regenerated during navigation.
- Reducing a pattern's length retains notes in the hidden bars. Increasing its length brings them back. Hidden notes do not play or export. A length change that would invalidate existing arrangement clips is rejected with an explanation.

## Arrangement and transport

The timeline is 1–8 bars, with independent **A — Backbone** and **B — Fills** lanes. Drag copies from the library to whole bars, or tap a library pattern and then an empty bar. Each clip spans the stored pattern's actual length. Clips on the same lane cannot overlap or extend past the timeline; gaps remain silent.

Drag an existing clip to move it. Tap, long press, or right-click a clip for explicit Move, Copy, and Delete actions, with lane/start-bar selectors. These controls also work with keyboard navigation. Every instance references the same stored pattern; edits update every instance. There is no implicit repetition between clips.

Play/Pause, Stop, and BPM apply to the active page. Playback loops automatically. Switching pages/patterns, changing composition data, or hiding the browser tab stops/reset playback. Pause retains the playback position. BPM changes restart a playing loop at the new tempo. Browser background playback is intentionally stopped because mobile browsers throttle scheduling.

The rhythm display is a visualization: faint lines at 64th resolution, blue lane A hits, orange lane B hits, a fixed red playhead, and scrolling notes. One bar spans its width; loop boundaries wrap. It cannot edit notes.

## Sound and licensing

Native Web Audio plays one consistent **FluidR3 GM standard acoustic kit**. The AudioContext is created and resumed from the Play gesture. Active instruments are fetched and decoded before playback; additional instruments load on the next Play. Velocity controls sample gain. Closed/pedal hats choke open hats.

The scheduler runs every 25 ms, scheduling 120 ms ahead using absolute AudioContext times. A 64th is `60 / BPM / 16` seconds. Graphics do not drive note timing. Stale events after a long foreground stall are skipped rather than emitted in a burst.

FluidR3 is MIT licensed. We investigated the WebAudioFont player (GPLv3) and use our own player. The separate **WebAudioFont data repository is MIT licensed**; the 47 bundled MP3s are extracted, unmodified FluidR3 sample payloads from that repository, about 1 MB total. The original FluidR3 and data-packaging notices are preserved in [samples/LICENSE.txt](samples/LICENSE.txt). See [samples/SOURCE.md](samples/SOURCE.md) for immutable upstream commit, extraction/tuning recipe, and verification sources. [samples/manifest.json](samples/manifest.json) records SHA-256 hashes. No upstream JavaScript is executed or bundled. No samples are embedded in exported MIDI.

## Saving, importing, and MIDI

Project settings (gear) provides **Save Project**, **Load Project**, and **New Project**. Every edit automatically saves `app-lab-drumidi-v1` in localStorage. Refreshing restores the complete project. Storage failures are reported with a reminder to download a JSON backup.

A portable JSON includes `format: "drumidi"`, `version: 1`, BPM, all eight patterns/lengths/notes/velocities, instrument names/GM assignments/default velocities, arrangement length, and clips on both lanes. Notes use integer `step` positions (0–255), measured in 64ths from the pattern start. Clip starts use zero-based bars. The importer validates shape, version, ranges, drum references, duplicate notes, clip IDs, overlap, and bounds. Imports are normalized into known fields. Invalid files leave the current session intact. Files over 16 MB are rejected. A valid import and New Project require confirmation before replacement.

MIDI export produces Standard MIDI File **type 1**, **960 PPQ**, percussion **channel 10**, a tempo/time-signature conductor track, and either one selected-pattern note track or two separate arrangement lane tracks. A 64th is exactly **60 ticks**; note-offs follow 30 ticks later. Simultaneous events, individual velocities, silent gaps, and complete loop length (end-of-track timestamps) are preserved. MIDI uses General MIDI note numbers and requires only the DAW's own percussion instrument.

## Verification

From the repository root:

```sh
node drumidi/test-core.cjs
node drumidi/test-audio.cjs
python drumidi/test-browser.py
python tests/check_site.py
```

Browser checks require Python Playwright and Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`). The tests intercept a local HTTPS origin to serve repository files, including real sample decoding, without an external server.

- Core: independent SMF parser verifies 64ths, simultaneous notes, velocity, tempo, channel 10, conductor/two-lane track structure, silent gaps and end-of-track lengths; JSON roundtrip/validation; shared references; collision/bounds checks; retained hidden notes; SHA-256 for all 47 samples.
- Audio clock: deterministic simultaneous/64th scheduling, loop seam, gain/tuning, pause/resume/reset, hi-hat choking and stall recovery.
- Browser: creates a four-bar pattern with all eight subdivisions and a final 64th hit, additional mixed-length patterns, and independent lanes; touch placement/actions/long press and desktop drag/move; full arrangement loop and Web Audio scheduling; pause/resume/stop/page reset; actual MIDI/JSON downloads; project replacement confirmation and invalid import; reload persistence; all 47 sample decodes; six widths (320–1440); gallery launch at both hosting roots; no browser errors or missing assets. Screenshots are written to `/tmp/drumidi-*.png`.
- Gallery: existing responsive, no-JavaScript, calculator, launch/link and asset regressions, with collection counts updated to 11 apps / 8 available.

## Phase 1 limits

4/4 only, 1–4 bar patterns, two lanes, 1–8 bar arrangement, integer BPM 30–300, a single acoustic kit. Touch uses tap-to-place and explicit clip actions; native drag is provided for desktop. No whole-song arrangement, undo, velocity-curve UI, audio export, MIDI import, or offline service worker. Composition edits stop playback. The future velocity editor can operate on an eighth-note group or entire pattern with slope/Bézier curves; the existing per-note velocities support that extension without changing timing data.

Automated touch checks emulate mobile Chromium. Physical Android devices, device-speaker listening, and importing into a running REAPER instance require manual acceptance checks; binary MIDI timing/mapping/structure are verified independently here. MP3 samples use one recorded velocity layer with velocity-sensitive gain, rather than multiple sample layers.
