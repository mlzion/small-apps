# Brittz Puzzle Palace v0.1

A standalone, buildless stained-glass assembly game. Launch `brittz-puzzle-palace/` from the App Lab gallery through a static HTTP server. All URLs are relative and support GitHub Pages at `/small-apps/`. No backend, runtime dependencies, external fonts, or network services.

## Play

- Tap a tray slot to transfer that piece to the board. Swipe the tray to browse; a scrolling gesture does not select a piece.
- Tap any loose board piece to select it. Drag the circular handle to move; drag the thin connecting line to rotate. The line has a 30 CSS pixel invisible target and the handle is 44 CSS pixels across at every zoom.
- Return sends the selected loose piece back to its original place in the randomized tray order, retaining its rotation. Locked pieces cannot be selected or returned.
- Drag empty board space to pan; pinch, use the mouse wheel, or press +/− to zoom. Fit restores the whole rectangle. Selecting a loose piece brings it into view and limits zoom enough to keep its shape visible.
- Puzzle and Reference have independent cameras. Switching views preserves selection, loose pieces, locked pieces, and tray order. Progress and sound preference also persist locally across reloads when browser storage is available.
- Selected-piece keyboard controls: arrows move, brackets rotate, Shift uses larger steps, Enter tries snapping, Escape clears selection. Board pieces can be revisited by tapping/clicking them.
- Snap requires both correct position and orientation on release. Position tolerance is 20 screen pixels, capped at 28 SVG units; rotation tolerance is 9°. Settings are in `engine.js`. Confirmation sounds use Web Audio, with a separate completion chime and a sound toggle.
- Restart asks before discarding progress; completion offers Play again.

## Artwork and engine

`puzzle.js` is the single source of truth: original polygon geometry, stable piece IDs, fills, detail, canonical centers, and bounding boxes. Ten ocean regions surround six turtle limbs/head/tail and seven shell regions, totaling 23. The eye is decoration inside the connected head, not a puzzle fragment. Every region is a simple polygon; shared vertices and edges are exact. The rectangular image contains no holes or overlapping regions. Black seams come from the same constant-width path strokes in the reference and pieces.

`engine.js` holds configurable snapping, shuffle, rotated bounds, and containment logic. `game.js` handles rendering, persistence, pointer capture, two-pointer zoom, audio, view switching, and lifecycle. Tray rows use a shared horizontal CSS grid scroller, with `turtle.trayRows` supporting 1–3; v0.1 uses one row. Slot shapes retain their aspect ratios and identity. New artwork should export the same data contract with a new versioned ID to isolate saves.

`preview.svg` is generated from the actual puzzle data, not a separate drawing:

```sh
node brittz-puzzle-palace/preview.mjs
```

## Verification

From the repository root, Node 22+:

```sh
node brittz-puzzle-palace/validate.mjs
node brittz-puzzle-palace/engine.test.mjs
```

The validator checks all 23 IDs, bounds, simple connected polygons, positive area, minimum 30-unit edges, minimum 60-unit bounds, a usable interior of at least 40 units across, exact opposing shared edges, the exterior perimeter, total area, cross-face intersections, and dense coverage samples. Engine tests check position/orientation independently, zoom-dependent snap thresholds, angle wrap, shuffle identity, bounds at 52 rotations for every piece, and canonical placement of all pieces.

Browser checks (development-only Python Playwright plus Chromium):

```sh
python brittz-puzzle-palace/check_browser.py
python tests/check_site.py
```

The browser acceptance script covers desktop mouse and emulated touchscreen handle movement vs line rotation, return/order, reference and selection preservation, reload, final-piece completion at multiple zooms, replay, responsive overflow, and both URL roots. Screenshots go to `/tmp/brittz-desktop.png` and `/tmp/brittz-mobile.png`. Existing gallery checks include the added card and launch link.

Implementation verification: geometry validation, four engine tests, JavaScript syntax checks, and Python test compilation passed. The SVG artwork was rendered and visually inspected. Browser acceptance and gallery browser checks were not run: the managed environment did not expose its required browser-control tool. Physical Android testing also remains outstanding.

Before release, on an actual Android phone and desktop browser:

- Scroll the tray repeatedly without placing a piece; then select edge, corner, shell, and limb pieces.
- Move with the circle and rotate with the line; confirm the piece stays visible and that actions remain distinct after pinch zoom and pointer cancellation.
- Place several loose pieces, select each again, return one, and verify its identity and tray order.
- Test false snaps with correct position/wrong angle and wrong position/correct angle at several zooms, then assemble all pieces.
- Pan and zoom both views; switch while a piece is selected; reload and confirm progress.
- Check sound on/off, snap locking, completion artwork/message/chime, Replay, and Restart cancellation.
