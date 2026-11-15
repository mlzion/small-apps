# Brittz Puzzle Palace v0.2

A buildless collection of stained-glass assembly puzzles. Launch `brittz-puzzle-palace/` from App Lab through a static HTTP server. Relative URLs support GitHub Pages at `/small-apps/`. No backend, runtime dependencies, external fonts, image services, or build step.

The gallery shows each completed thumbnail, title, piece count, and progress. Choose a picture to resume; Back to Gallery saves the current puzzle. Completed cards offer Replay or open the completed board and certificate. The original 23-piece Sea Turtle is unchanged. A four-piece Tropical Gem provides a small second puzzle for switching and content-system testing.

## Play and certificates

The v0.1 phone layout and controls are retained:

- Tap a tray slot to transfer that piece to the board. Swipe the tray to browse without selecting. Tap any loose board piece to select it again.
- Drag the circular handle to move; drag its thin connecting line to rotate. The handle is 44 CSS pixels across and the line has a 30 CSS pixel invisible touch target, independent of zoom.
- Return restores the selected loose piece to its original place in the randomized tray order, retaining its rotation. Multiple loose pieces are supported; locked pieces cannot be returned.
- Drag empty space to pan. Pinch, use the mouse wheel, or use +/− to zoom. Fit restores the whole rectangle. Selection keeps the piece in view.
- Puzzle and Reference have independent cameras. Switching views preserves game state and selection. Selected-piece keyboard controls: arrows move, brackets rotate, Shift increases the step, Enter tries snapping, Escape clears selection.
- Snapping requires both position and orientation on release: within 20 screen pixels (capped at 28 SVG units) and 9°. `engine.js` contains those settings. Sound controls confirmation and completion chimes.
- Restart confirms before clearing only the selected puzzle. Completion offers Play again. Progress survives reloads; if local storage is blocked or full, it remains in memory during the current visit.

On a completed **Puzzle** board, enter a name and choose **Export JPG**. The browser creates a 1600-pixel-wide JPEG at quality .95, with the exact source artwork, puzzle title/count, and “Completed by [Name]”. The name is editable and remembered locally. Download JPG remains available if the automatic download does not start. No certificate control is enabled on an unfinished puzzle or in Reference. Leaving the puzzle, restarting, or entering Reference cancels any in-flight export. Names stay on the device. Physical Android download/save behavior still needs device testing.

## Add a puzzle using content files only

1. Copy [`examples/puzzle.template.json`](examples/puzzle.template.json) to `puzzles/my-puzzle/puzzle.json`. This is a complete, valid four-piece example, with a different ID from the published demo.
2. Replace its metadata, deliberate polygon mesh, colors, optional decorations, and canonical placement. Keep the data contract below. Create the actual artwork as stained-glass regions; this app does not cut uploaded JPGs or PNGs.
3. Validate the file before registering it:

   ```sh
   node brittz-puzzle-palace/validate.mjs brittz-puzzle-palace/puzzles/my-puzzle/puzzle.json
   ```

4. Add an entry to `brittz-puzzle-palace/catalog.json` inside `puzzles`:

   ```json
   {
     "id": "my-puzzle",
     "version": 1,
     "title": "My Puzzle",
     "pieceCount": 4,
     "data": "puzzles/my-puzzle/puzzle.json",
     "thumbnail": "puzzles/my-puzzle/thumbnail.svg"
   }
   ```

5. Generate thumbnails from the actual geometry, then validate the complete catalog:

   ```sh
   node brittz-puzzle-palace/preview.mjs
   node brittz-puzzle-palace/validate.mjs
   ```

6. Commit/upload `puzzle.json`, `thumbnail.svg`, and the updated `catalog.json` to GitHub. No JavaScript engine edit is needed. After the normal GitHub Pages publication, reload the app to see the new card. GitHub Pages cannot enumerate directories: uploading a folder alone does **not** register a puzzle. Paths in the catalog are relative to the app directory, not to the puzzle's directory. The CLI checks that the listed thumbnail exists.

If authoring through GitHub's upload UI, generate/validate the files locally first, then upload the resulting files and edit the catalog in GitHub. Keep the root catalog's `schemaVersion: 1`. Remove a catalog entry to hide a puzzle without erasing players' saved progress.

### Schema 1

Each puzzle JSON contains:

- `schemaVersion: 1`, a unique lowercase hyphen-separated `id`, positive integer `version`, nonempty `title`, numeric `width` and `height` between 100 and 4096, `pieceCount` from 1–50, and `pieces` of exactly that length.
- Optional `trayRows` (1–3; defaults to 1) and optional text `subtitle`, `emptyMessage`, `completionTitle`, `completionMessage`. The turtle uses the original v0.1 messages. Text is limited to 160 characters.
- Each piece has a unique `id`, `name`, hex `color`, `points`, `correct`, and optional `details`.
- `points` is a single simple polygon in **completed artwork coordinates**, with 3–64 distinct `[x, y]` vertices in clockwise SVG winding (positive signed area). The final edge is implicitly closed: do not repeat the first vertex. The renderer generates an SVG path with `Z`. Holes, self-intersections, self-touching paths, disconnected fragments, and open/arbitrary SVG path commands are outside this schema.
- Adjacent regions must use the **same vertices in reverse order** along each shared boundary, including any collinear subdivisions. All unmatched edges must lie on the rectangle boundary. No gaps, overlaps, or out-of-bounds coordinates are allowed.
- `correct` is `{ "x": centerX, "y": centerY, "angle": 0 }`. Centers are the bounding-box centers: `(minX + maxX) / 2` and `(minY + maxY) / 2`. Angle zero is the completed orientation because the vertices already describe the completed image. Random rotations are applied separately by the engine.
- Optional `details` supports up to 20 circles per piece: `{ "type": "circle", "cx": 100, "cy": 80, "r": 7, "fill": "#143d48" }`. Circles must be contained within their piece. These are decoration, not extra pieces. Scripts, external images, raw SVG markup, and remote assets are not accepted. The turtle eye uses two circles.
- Keep pieces comfortable to use. The validator requires a minimum edge length of `min(width,height)/16`, minimum bounding dimension of `min(width,height)/8`, and a sampled usable interior radius of `min(width,height)/24`. These preserve the original turtle's size standards while scaling for new artwork. Avoid tiny fragments and thin slivers.

Stable IDs and versions are important. Keep both unchanged for metadata-only changes that leave geometry, piece IDs, and canonical placement unchanged. Increment `version` for incompatible geometry changes to start a separate save namespace; the previous version's saved data stays on the device. Avoid reusing a puzzle ID for unrelated artwork.

## Architecture and saves

`catalog.json` is fetched when the gallery opens; the selected `puzzles/.../puzzle.json` is fetched and validated on demand. Validated content is cached during the visit. Errors identify the puzzle/piece and leave the gallery usable. Request tokens prevent a slower earlier selection from replacing a newer one.

`content.js` is shared by the browser and Node tools. It validates metadata and the polygon mesh, derives paths/bounds/centers, and serializes completed artwork. Board pieces, reference view, thumbnails, and JPG certificate all use this source geometry. `engine.js` retains the v0.1 snap/shuffle/bounds logic. `game.js` adds gallery and export orchestration around the original input handlers. `progress.js` isolates persistence. `certificate.js` renders a self-contained SVG to a browser canvas, then encodes JPG without a server or third-party assets.

Saves use `brittz-puzzle:<id>:v<version>`. The original turtle keeps `id: sea-turtle-v1`, `version: 1`, and every original piece ID/coordinate/fill/eye detail. On first opening it, v0.2 accepts the old `brittz-sea-turtle-v1` save and writes the new key, preserving tray order, loose positions/rotations, and locked/completed status. The old key is left untouched. Valid locked pieces are normalized to their exact canonical placement; corrupt saves recover to a new game. Sound preference is shared; progress is independent. A regression hash checks the entire original turtle geometry and appearance against v0.1.

The root App Lab card continues to use the unchanged `preview.svg`; in-app thumbnails are generated from content data. Existing apps and their navigation are unchanged.

## Verification

Run from the repository root (Node 22+):

```sh
node brittz-puzzle-palace/validate.mjs
node brittz-puzzle-palace/engine.test.mjs
node brittz-puzzle-palace/content.test.mjs
```

The reusable CLI accepts a puzzle JSON path, or validates all catalog entries and their matching metadata/thumbnail files. It rejects invalid IDs/metadata, counts outside 1–50, bad dimensions/coordinates, self-intersecting or unusably thin pieces, mismatched boundaries, crossing faces, and gaps/overlaps. Identical opposite shared edges, simple positive-area faces, the exact exterior perimeter, and total rectangular area validate coverage without raster approximation. Interior-size sampling is only used for the usability threshold.

There are four gameplay-model tests and nine content/persistence tests. They cover zoom-aware snap tolerances, position versus rotation, bounds, canonical assembly, exact legacy turtle appearance, invalid data/errors, 1- and 50-piece content, migration, independent saves/restart, blocked-storage fallback, and shared-artwork serialization.

Browser tests (development-only Python Playwright, Pillow, and Chromium; set `CHROMIUM_PATH` if needed):

```sh
python brittz-puzzle-palace/check_browser.py
python brittz-puzzle-palace/check_collection.py
python tests/check_site.py
```

These serve local files through Playwright routing without an HTTP server or external network. They cover desktop mouse and emulated touch movement versus rotation, tray swipes, return, reference/persistence, snapping/completion at different zooms, replay, both URL roots, gallery layouts at phone/tablet/desktop widths, legacy migration, independent switching/restart, content-only registration, visible invalid-content errors, completed-only certificate gating, downloaded JPG format/width/artwork pixels/name/title/count, remembered names, export cancellation on Reference, and existing Small Apps gallery/calculator/navigation regressions. Screenshots and downloaded certificate samples go to `/tmp/brittz-*`.

Automated geometry/content/engine and all three browser suites passed during implementation; screenshots and an actual exported certificate were visually inspected. Chromium needed execution outside the command sandbox because sandbox socket restrictions prevented startup. Physical Android touchscreen ergonomics and Android's actual download/share UI remain untested. Before merging, check long tray swipes, pinch/rotation near board edges, several loose pieces, and certificate download/save on a real Android browser.

## v0.3 Phase 1 development lab

The separate [image cutting lab](cutting/) accepts a local square JPG/PNG and uses permanent 50/100/150/200-piece angular masters with the same gameplay controls. The published catalog and vector puzzles remain unchanged. See [cutting/README.md](cutting/README.md) for architecture, deterministic geometry/similarity tolerances, image-pixel tests, regeneration tools and Phase 1 limitations.
