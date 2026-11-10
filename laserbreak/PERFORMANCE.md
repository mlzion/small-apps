# LaserBreak playtest performance investigation

The Android report included slow Setup opening and slider movement, so the investigation covered raster work, pixel count, simulation, DOM/layout activity, and panel compositing. Spinning bars were retained.

## Evidence

A preserved pre-revision build was profiled in desktop Chromium with an 844×390 mobile viewport, DPR 3, 4× CPU throttling, and 60 objects. An ablation run measured the actual animation loop without adding extra draws:

| Original build variant | Mean frame interval | Mean CPU render submission | Canvas pixels |
| --- | ---: | ---: | ---: |
| Original shadows and DPR 3 | 68.3 ms | 3.54 ms | 1,964,844 |
| Canvas shadows disabled | 24.4 ms | 2.16 ms | 1,964,844 |
| Shadows disabled, DPR 1.5 | 16.6 ms | 1.39 ms | 491,211 |

The large frame-interval change relative to JavaScript submission time points to raster/compositing pressure from blurred strokes and pixel count, rather than bar rotation arithmetic. This is evidence from this environment, not a GPU trace or a measurement on the reported Android device. The old 240 Hz subdivisions and repeated collision scans also did unnecessary work, especially during firing, and were removed as requested. Setup's translucent backdrop blur was removed rather than retained over the animated scene.

A final comparison used the same deterministic 60-object fixture for the original and revised builds, with one draw per actual animation opportunity. The revised fixture kept all 60 objects active and bars rotating. Both builds were measured in one test invocation:

| Metric | Original build | Revised build |
| --- | ---: | ---: |
| Mean animation frame interval | 55.8 ms | 18.5 ms |
| 95th percentile frame interval | 115.7 ms | 39.4 ms |
| Mean CPU render submission | 1.84 ms | 1.20 ms |
| 95th percentile CPU render submission | 5.9 ms | 3.9 ms |
| Mean CPU simulation update | 0.47 ms | 0.10 ms |
| 95th percentile CPU simulation update | 3.2 ms | 0.6 ms |
| Mean slider event → next animation opportunity | 59.9 ms | 16.7 ms |
| 95th percentile slider event → next animation opportunity | 88.7 ms | 29.4 ms |
| Canvas backing pixels | 1,964,844 | 407,169 |

This run also overlapped the gallery regression process, so host contention contributes noise. An earlier isolated revision run measured 16.5 ms mean frame interval and 18.2 ms 95th percentile slider response. Results vary with the machine, Chromium renderer, and load. Neither run establishes physical-phone frame rate, input latency, or thermal behavior. Render time measures Canvas command submission on the main thread, not GPU completion; the frame interval captures broader delivery cost.

## Changes addressing the measured costs

- One elapsed-time simulation pass per frame replaces 240 Hz subdivision. Each object's stored speed/rotation advances once. No active pulse state or per-frame laser/explosion collision scans remain.
- Instant beams and blast intersection tests run synchronously in `World.fire()`. Object/effect arrays compact in place during normal updates.
- Canvas DPR is limited to 1.5 and its total backing store to one megapixel. Wider pads reduce the central backing store further on phones.
- Neon circle halos are cached in two small sprites. Runtime bars are filled rectangles, beams are layered strokes, and there are no runtime Canvas shadows. The grid is a static CSS background.
- Setup is opaque with no backdrop filter or large shadow. Sliders update one setting/output synchronously instead of reassigning every control. Layout reads occur on resize, and pointer indicator DOM writes occur on input, not on every frame.
- The readiness HUD checks at 10 Hz, writes only changed text, and diagnostics text refreshes at 2 Hz only when enabled. Paused/stopped scenes repaint only when dirty.
- Limits: 60 objects, 160 effects, 12 placement probes per spawn, at most one spawn attempt per frame. Sustained slow frame delivery selects a 30 FPS budget; stable delivery and low CPU cost restore 60 FPS.

## Reproduce and regression guardrails

```sh
python laserbreak/test-performance.py
# Compare against the original Phase 1 source, already in local Git history:
python laserbreak/test-performance.py --baseline-ref 64e37cc
```

The test uses local request routing, Chromium, a 60-object fixture, mobile landscape/DPR 3 emulation, and 4× CPU throttling. It checks these broad regression budgets rather than asserting an exact FPS on shared infrastructure:

- 95th percentile CPU render submission below 16 ms, update below 5 ms, animation opportunity below 75 ms, and slider event → next opportunity below 100 ms.
- At most one million backing pixels, all 60 fixture objects retained, and no Setup backdrop filter.
- Zero per-frame positive `shadowBlur` assignments, Canvas layout reads, or DOM mutations while the stable ready HUD is visible and diagnostics are hidden.
- The 30 FPS fallback and 60 FPS recovery logic, without depending on host load to trigger them.

The engine suite additionally verifies a single motion/rotation write per frame and no collision-geometry reads during ordinary updates. Timings are observational guardrails, not a promise that a given phone sustains 60 FPS. Use the physical Android acceptance checklist in [README.md](README.md), with the hidden diagnostics enabled, to validate the actual success criterion.


## Visual polish verification

The visual-polish revision retains the same DPR/pixel budgets, one-pass update, render pacing, input handling, and no-blur policy. Default target diameter increases to 40 logical pixels; beams still resolve only when firing, now across the full field. Destruction adds at most 128 short-lived fragments, drawn as layered small squares, with no particle collision work.

`python laserbreak/test-performance.py --baseline-ref 01cc5ff` compares against PR #25. The fixture now uses radius-20 targets in both builds. In one 844×390 / DPR 3 / 4× CPU-throttled run:

| Metric | PR #25 | Visual polish |
| --- | ---: | ---: |
| Mean animation interval, 60 objects | 16.4 ms | 16.5 ms |
| 95th percentile CPU render, 60 objects | 3.1 ms | 2.2 ms |
| Mean slider event → next frame | 16.4 ms | 16.1 ms |
| Mean animation interval, 60 objects + sustained 128 particles | — | 16.5 ms |
| 95th percentile CPU render with particles | — | 4.2 ms |
| Canvas backing pixels | 407,169 | 407,169 |

The additional particle stress case maintains all 60 objects, replenishes to the cap during 90 animation opportunities, checks the existing 16 ms render / 5 ms update / 75 ms frame p95 budgets, then verifies all particles expire. The stable HUD test still reports zero per-frame DOM mutations, Canvas layout reads, or positive shadow-blur assignments. These desktop-emulation measurements vary with host load; use the README's phone checklist for fullscreen, touch comfort, and sustained real-device performance.

## Release-only and full-screen Setup refinement

This revision preserves the PR #25/#26 renderer, instant collision path, DPR/pixel bounds, and particle budgets. Setup now freezes the simulation and avoids repainting its covered field while open. Slider changes update one output; touch geometry is cached at gesture start, with explicit horizontal-adjustment versus vertical-scroll intent. Audio is event-driven with six voices per shot/eight globally, reusable noise, and no frame-loop processing. Spawn balancing adds a ten-entry shuffle only when a bag empties or Bar Percentage changes; repeated input at the same value does not rebuild it.

`python laserbreak/test-performance.py --baseline-ref 68b5e40` passed the existing guardrails without widening budgets. In an isolated 844×390 / DPR 3 / 4× CPU-throttled run, 60 objects had 5.0 ms p95 CPU render / 0.4 ms update; 60 objects plus sustained 128 particles had 3.6 ms p95 CPU render / 0.5 ms update and a 16.7 ms mean frame interval. Slider event-to-next-frame p95 was 20.2 ms. Canvas pixels stayed at 407,169, with zero stable-HUD per-frame layout reads, blur assignments, or DOM mutations. The PR #26 fixture's mean frame interval was 17.6 ms; this revision's initial 60-object sample was 21.8 ms, reflecting timing variability rather than a changed renderer. These are observational measurements, not physical-phone FPS.

A first run overlapped fullscreen/browser testing and exceeded the 75 ms p95 frame budget during particle stress (93.9 ms). Re-running with other browser suites finished passed (22.8 ms p95 for the same particle case); no thresholds were relaxed. Run throttled performance checks on their own to reduce contention. Setup's responsiveness measurement now occurs while gameplay is intentionally frozen, as required, whereas the old panel left the field animated.

Additional checks render audio through OfflineAudioContext: the double-hit sound has a substantial low rumbling tail after 150 ms, while the single-hit sound has ended. A representative maximum aggregate shot peaked around 0.116 full scale; the global voice/envelope/master limits leave headroom. These checks cannot establish phone speaker quality or perceived loudness. Use the README's acceptance checklist for touch scrolling, fullscreen, sound, interruptions, and sustained physical Android performance.
