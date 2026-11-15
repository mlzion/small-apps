# Image-cutting lab — v0.4 procedural geometric mosaics

Open `brittz-puzzle-palace/cutting/` through a static server, including `/small-apps/brittz-puzzle-palace/cutting/` on GitHub Pages. Choose a square JPG/PNG, select **50, 100, 150 or 200 pieces**, then **Shuffle & play**. **Use test picture** supplies a coordinate/checker image. Creating another puzzle generates new cuts, even for the same image and count. There is no pattern-rotation selector and the artwork is never rotated or reconstructed.

The published vector gallery, content files, controls, saves and JPG certificates are separate and unchanged.

## Geometry generation and validation

`mosaic.js` generates geometry independently of artwork. A worker (`mosaic-worker.js`) performs generation and candidate validation before handing results to the interface; stored records are also revalidated on creation/restore:

1. Seeded best-candidate sampling scatters sites without rectangular grid bands.
2. A capacity-balanced power diagram clips each cell against its neighbors. Bounded centroid and weight relaxation brings cell areas near their common target.
3. Short shared ridges are collapsed globally, preserving identical vertices in every incident piece and straight square edges.
4. Selected shared edges receive one angular V-bend. Notches vary in depth (0.12–0.18 nominal piece widths), position and direction; the adjacent piece receives the exact complementary boundary. Neither participant receives a second notch. All resulting pieces have 3–7 sides, predominantly quadrilaterals, pentagons and hexagons.
5. Every candidate passes validation before play. Failure retries another deterministic layout derived from the seed. The normal limit is **12 attempts**, with a hard API cap of 24. Exhaustion reports a visible error; invalid geometry is never accepted. A worker startup failure is also reported.

The seed is a random unsigned 32-bit integer. Immediate reuse of the previous seed is prevented. The successful seed, retry index, generator/data version and actual polygons are retained. Restart/replay reshuffles the existing cuts; it does not generate another arrangement. Creating a new puzzle does.

Geometry uses a **1,000,000 × 1,000,000 integer lattice**. Rounding is at most half a lattice unit per coordinate; all validation happens after rounding. Shared endpoint coordinates and reversed edge lists must match **exactly**, with no seam-matching epsilon. `geometry.js` supplies the common exact partition validator; `validateMosaic()` adds stricter v0.4 requirements:

- Exactly the requested number of pieces, unique IDs, distinct vertices, positive winding and simple polygons with no crossing, self-touching or partially overlapping boundaries.
- Every piece area is **80–120%** of `square area / count`, without an area tolerance. Twice-area totals use `BigInt` and must equal twice the square area exactly.
- Every internal edge appears twice in opposite directions; every unmatched edge belongs to the square perimeter. Sorted exterior intervals cover each side exactly once. There are exactly four distinct corner owners and one connected adjacency graph. Together with noncrossing boundaries and positive winding, these checks establish a complete partition without gaps, overlaps or nested duplicate regions.
- Piece angles are at least **35°**, segments at least **0.045 nominal widths**, axis-aligned and minimum-area oriented bounding-box ratios at most **2.2**. Oriented bounds prevent diagonal needles from passing an axis-aligned check.
- A sampled inscribed disk has radius at least **0.23 nominal widths**. The deterministic sample grid uses `min(bounds width,height)/24`; actual point-to-segment distances make this a conservative disk test, not an artwork/raster approximation.
- Vertex-to-nonincident-edge clearance is at least **0.10 nominal widths**, rejecting narrow necks and fragile arms even when a piece has a large core. Here nominal width is `square width / sqrt(count)`.
- **15–20%** of pieces have a concave vertex. This target never overrides the validity checks; a candidate that fails either is retried.

Area and incidence checks are exact on the stored lattice. Angles, distances and aspect ratios use ordinary double-precision calculations against the documented conservative limits. There is no requirement that every outline be distinct under normalized rotation/reflection as in the archived jagged masters; v0.4 favors compact, balanced geometric polygons.

## Original image rendering

`openSquareImage()` accepts JPG/PNG signatures up to 24 MB and square images 32–8192 pixels wide. It rejects nonsquare sources instead of cropping or stretching them. Original bytes are decoded through an object URL and saved unchanged, including JPEG data; no resized image tiles are created.

`mosaicPuzzle()` converts the validated polygon coordinates to the shared 1000-unit board. `render.js` clips the same full image, at the same origin and scale, to each piece. Moving/rotating a piece transforms its image and geometry together. Reference and completion use the original source image, with optional completion outlines from the same polygons. Completed rendering therefore reproduces the source exactly. Browser SVG anti-aliasing may show a thin transient seam while separate pieces are loose; completed flattening removes it. The renderer and existing snapping tolerances are unchanged.

## Local persistence

The latest lab puzzle is stored in its own **`brittz-mosaic-lab` IndexedDB database**:

- `source`: original Blob/name, exact validated polygons, seed/version/retry index, outlines preference and session identity.
- `progress`: matching session identity, randomized tray order, every piece's tray/loose/locked location, x/y, full fractional angle and sound preference.

Creation atomically replaces the previous source and removes its old progress. Subsequent saves update only progress, avoiding repeated image writes. A session-identity guard prevents an older open tab from overwriting a newer puzzle's progress. The lab does not read/write public puzzle progress or the gallery sound preference.

Reload automatically validates and restores the saved geometry and image, then mounts the exact game state without recutting, rounding angles or clamping loose poses. **Resume saved mosaic** also returns to it from setup. Camera, selection and workspace begin in their normal initial state on a page reload; in-session mode/view changes preserve the existing camera and selection behavior. Stored locked pieces retain their exact target transforms. Independently randomized starting angles span **0–360°**, with no angle readout or moving orientation indicator.

Storage is required for a new lab puzzle. A denied/quota-failed initial write reports an error before play. A later progress-write failure displays a warning to keep the tab open and recover storage before reloading. Corrupt saved geometry/progress is reported rather than replaced silently. Browser storage can still be cleared or evicted; there is no cloud backup. Only the latest lab puzzle is retained, and creating a new one replaces it.

## Preserved phone controls

The manual **SELECT | MOVE** toggle shares one 188px workspace. SELECT has a two-row horizontal picker; MOVE has the unchanged 120px relative trackpad and 120px rotation-wheel target/96px stationary unmarked ring. Selecting, snapping, returning, restarting or replaying never changes modes. New puzzle setup starts in SELECT.

**Fit | − | + | Return** remain together with at least 44px touch targets and an 18px separation before Return. The live counter stays below Puzzle/Reference above the canvas. The compact phone header/chrome does not shrink the canvas or controls. No angle information is visible or announced. No wheel/pinch zoom or direct canvas piece dragging is enabled.

Camera rules remain unchanged: Fit/1× shows the full square and cannot pan; explicit panning above 1× is bounded. Piece manipulation never changes the camera. Zoom anchors on the selected piece above 1×, or on the viewport center without one. The final zoom-out to 1× fits the square. An anchored zoom-out above 1× may temporarily be outside pan limits to preserve its anchor; the next explicit pan applies the bounds. Puzzle and Reference share the camera.

## Verification

Run from the repository root:

```sh
node brittz-puzzle-palace/cutting/mosaic.test.mjs
node --test brittz-puzzle-palace/cutting/patterns.test.mjs brittz-puzzle-palace/precision-controls.test.mjs brittz-puzzle-palace/content.test.mjs brittz-puzzle-palace/engine.test.mjs
python brittz-puzzle-palace/cutting/check_mosaic.py
python brittz-puzzle-palace/cutting/check_precision.py
python brittz-puzzle-palace/cutting/check_precision_layout.py
python brittz-puzzle-palace/cutting/check_images.py
python brittz-puzzle-palace/check_browser.py
python brittz-puzzle-palace/check_collection.py
```

Browser tests use development-only Playwright, Pillow and Chromium (`CHROMIUM_PATH` may override `/usr/bin/chromium`). No application dependencies were added.

- Geometry tests exercise **32 seeds at each count (128 complete layouts)**, exact seams/coverage, independent point ownership, all area/shape limits, concavity, deterministic regeneration, different seeds, real bounded retries, invalid candidates and storage serialization.
- `check_mosaic.py` tests actual IndexedDB reloads at **320/360/390px with emulated touch**: original bytes, continuous starting angles, native wheel/pad snapping, locked and loose transforms, all four counts, fresh same-image cuts, no fixed-master fetches, corrupt saves and storage denial.
- `check_precision.py` tests desktop and all three phone widths: manual switching, two-row scrolling/all 200 pieces accessible, selection, movement/rotation, stationary wheel/accessibility, return/counter, bounded panning, selected zoom anchors, Fit, no pinch/wheel zoom, no overlap/overflow, completion and replay. Full 50-piece native-control assembly runs on desktop and 360px touch.
- `check_precision_layout.py` measures actual 120px controls and the shared workspace/action row at all three widths, with enabled/disabled states, generic-button conflicts and real HTTP caching of pre-precision CSS. Routed browser tests disable caching, so this separate native-HTTP regression is retained. Versioned entry/controller/image-adapter URLs protect changed module contracts from stale caches.
- Image tests check **32 PNG/JPG × count × seed combinations**, original byte equality, clipped interior channel error at most 1 outside a 2.5px anti-aliasing boundary band, and exact every-pixel completion equality. `CUTTING_SKIP_PIXELS=1` runs the interaction/input portion only.
- Existing public vector controls, independent saves, gallery navigation, deployment roots and completed-only personalized certificates retain their regressions.

Physical Samsung Galaxy A17 ergonomics and mobile performance still require device testing. No external/cloud backup or multi-puzzle lab library is provided.

## Archived fixed masters

`patterns/50.json`, `100.json`, `150.json`, `200.json`, their fingerprint report, `generate.mjs`, `validate.mjs`, `shape-distance.js` comparisons and their tests remain as unchanged archival development assets. The v0.4 lab does not fetch or select these masters and offers no master rotation. The legacy `loadMaster()` / `imagePuzzle()` exports remain for those archival regressions; the runtime uses `generateMosaic()` / `mosaicPuzzle()`.
