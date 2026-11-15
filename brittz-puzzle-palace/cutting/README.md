# Image Cutting Engine — v0.3 Phase 1

Open **`brittz-puzzle-palace/cutting/`** through the normal static server, including at `/small-apps/brittz-puzzle-palace/cutting/` on GitHub Pages. This development page is separate from the published gallery. Load a square JPG/PNG, choose 50/100/150/200 pieces and a 0°/90°/180°/270° cutting orientation, then **Shuffle & play**. **Use test picture** supplies a coordinate/checker image. The lab uses the manual Phase 1C SELECT / MOVE workspace and shared zoom row described below; tray, snapping, Puzzle/Reference, sound, return and restart remain shared with the published app.

## Fixed masters

`patterns/50.json`, `100.json`, `150.json` and `200.json` are permanent, versioned assets with exactly their stated counts. Each is an integer-lattice partition of a 1,000,000 × 1,000,000 square. IDs are stable within each master. Master orientation rotates vertices with exact integer quarter-turn formulas; it never rotates/reconstructs the source image. Starting a game/restarting only shuffles order and initial piece angles. It does **not** create new cuts.

The offline `generate.mjs` authoring tool creates a jittered Voronoi partition, globally collapses short ridges, and authors asymmetric angular seam profiles with broad peaks, notches, angled shoulders and bends. There are no round jigsaw tabs. Profile vertices stay in the two adjacent edge-to-cell-center triangles, preventing neighboring seam corridors from crossing. Geometry is shared, in reverse order, between incident faces. An offline deterministic optimizer changes seams until outlines pass the similarity test. Runtime does not import this generator.

To deliberately author replacement masters (not a normal publishing or gameplay step):

```sh
node brittz-puzzle-palace/cutting/generate.mjs
# Or regenerate a single master, e.g.:
node brittz-puzzle-palace/cutting/generate.mjs 100
node brittz-puzzle-palace/cutting/validate.mjs --report
```

Generation is seeded and deterministic, uses Node only, and refuses to write invalid geometry. Changing the algorithm requires a new pattern ID/version and review; keep the checked-in assets unchanged for normal use. `patterns/validation.json` records their SHA-256 fingerprints and measured validation results.

## Exact geometry and quantitative usability

`geometry.js` is the reusable geometry validator. Tests validate every master and all four quarter-turns:

- Exact counts, stable unique piece IDs, finite integer coordinates, simple closed positive-area polygons, no repeated vertices.
- Every internal edge must have exactly two incident faces with identical reversed endpoints. No crossing, overlapping, self-touching or unmatched internal edges are allowed. The adjacency graph must be connected.
- Signed shoelace areas are summed using **BigInt** and must equal twice the exact square area: no area epsilon or raster coverage approximation. Each of the four exterior sides must be covered by contiguous, non-overlapping straight intervals from 0 to 1,000,000.
- Exactly four distinct pieces own the four corners; no piece may own multiple corners.
- Let `d = 1,000,000 / sqrt(pieceCount)` be the nominal piece width. Piece areas must lie in `[0.30 d², 2.40 d²]`, bounding-box aspect ratios must be ≤2.6, segments must be ≥0.012 d and both convex peaks and concave notches must have angles ≥25°. Each piece must contain a sampled usable disk of radius ≥0.16 d. Disk sampling uses a deterministic grid with step `min(bounding width,height)/24`; it is a conservative usability check, not the coverage proof. These checks reject tiny pieces, thin slivers and fragile-looking geometry.

## No identical or near-identical outlines

`shape-distance.js` compares **every pair within each master**, independent of artwork. Each closed outline is sampled at 128 equal arc-length positions, centered, normalized by the square root of its polygon area, and normalized to one winding. The comparator removes translation, uniform scale, arbitrary planar rotation, cyclic start phase and reflection. For every discrete phase it solves the best rotation analytically (complex Procrustes correlation). A radix-2 FFT computes those correlations; a test compares it with an independent direct implementation to `1e-10`.

The reported RMS boundary distance is in units of square-root area. To account conservatively for continuous start phases between the 128 samples, the comparator subtracts the larger half-sample arc length, also normalized by square-root area. This gives the reported **distance lower bound**. Every pair must have a lower bound ≥**0.065**. The authoring optimizer targets an extra 0.002 margin. Identical outlines, small perturbations, translated/scaled copies, arbitrary rotations and reflections are explicit rejection fixtures. The checked-in report records each master's closest pair; all four minima currently exceed 0.067.

This is a documented deterministic geometric definition of “near-identical”, not a claim about every player's perception. Geometry-only identification is possible without relying on color/image detail. Tests also sample non-grid points independently to check one and only one region owns each point.

## Original image clipping

`image-puzzle.js` accepts JPG/PNG by file signature and browser decode, rejects non-square sources, and retains an object URL for the **original unmodified file bytes**. It does not trace, simplify, crop, recolor or re-encode them. Pattern geometry is mapped to a 1000 × 1000 board; images remain at the global artwork origin inside every piece.

`render.js` renders the same original `<image>` through a unique `clipPath` for each piece (`userSpaceOnUse`). The outer piece group carries movement/rotation, so the correct patch travels with its geometry. Tray and board use the same renderer. Quarter-turning the master changes only the clipping geometry relative to the original artwork. Outlines are optional; selection still highlights an outline.

Browsers anti-alias individual SVG clipping boundaries, which can leave a transient subpixel seam while pieces are assembled. Once all pieces lock, `completedImage()` renders the original image once, with optional seam outlines, eliminating compositing seams and preserving the exact complete picture. Reference always shows the original image. This is a rendering optimization after correct assembly, not altered artwork or ghost placement guidance. Pixel tests compare both actual clipped-piece interiors and every pixel of the completed picture with the original reference.

## Gameplay architecture and compatibility

The published `game.js` exposes a small `mountPuzzle()` entry point used by both the existing catalog loader and the separate lab. The original vector pointer controls and `engine.js` snapping/shuffle rules remain compatible; the image lab uses the Phase 1B input and camera policy below. Image rendering branches for `kind: 'image'` and the lab enables its Phase 1B input/camera policy; vector puzzles still use their existing renderer, content validation, saved progress and JPG certificates. The catalog, existing puzzle data, gallery, other apps and published URLs are unchanged.

The lab is selected by `data-cutting-lab` on its own HTML document. Its setup form replaces only that page's gallery area; the play controls retain the existing phone layout. The lab picker uses two rows for every master in the shared SELECT workspace; published vector trays retain their existing row counts. Shared local-storage progress and sound preference writes are disabled for ephemeral lab sessions, so uploaded images/testing cannot overwrite published saves.

## Verification

From the repository root:

```sh
node brittz-puzzle-palace/cutting/validate.mjs
node brittz-puzzle-palace/cutting/patterns.test.mjs
node brittz-puzzle-palace/validate.mjs
node brittz-puzzle-palace/content.test.mjs
node brittz-puzzle-palace/engine.test.mjs
python brittz-puzzle-palace/cutting/check_images.py
python brittz-puzzle-palace/check_browser.py
python brittz-puzzle-palace/check_collection.py
```

Browser tests use the existing local Playwright routing method, installed Chromium (or `CHROMIUM_PATH`), and Pillow; these are development-only dependencies. The image suite uses high-frequency PNG/JPG fixtures and all **32** image-format/pattern/quarter-turn combinations. It verifies original bytes, clipped interior pixels (maximum channel error 1; only a 2.5-pixel boundary band is excluded for SVG anti-aliasing), and **exact every-pixel equality** of the outline-free completion versus the same browser's reference rendering. It also completes a 50-piece image with the Phase 1B panel using real mouse and emulated-touch gestures (without injecting game state), checks completion/replay, and checks trackpad movement versus wheel rotation, preserved Puzzle/Reference state, external control dimensions, a two-row SELECT picker, return, unchanged cut geometry after restart, save isolation and invalid image errors. `CUTTING_SKIP_PIXELS=1` runs only the control/input checks when diagnosing those separately. Screenshots go to `/tmp/cutting-lab-*`.

## Phase 1 limitations

- The lab is development-only and deliberately not registered in the public puzzle catalog. It has no uploaded-image persistence, gallery publishing workflow or raster completion certificates. Existing vector certificates continue to work.
- Lab progress remains while switching Puzzle/Reference. Loading/shuffling another setup or reloading the page starts a fresh session. The original image is local to the current browser tab and is never uploaded.
- Sources are limited to 24 MB and square dimensions from 32 through 8192 pixels to bound phone decoding/memory pressure. Animated PNG playback, non-square cropping, arbitrary cutting, and format conversion are outside this phase.
- Browser decoding/color management follows the browser's normal JPG/PNG rendering, including embedded orientation. No image editor or custom color processing is applied.
- Emulated touch is automated; physical Android touchscreen ergonomics, memory use with maximum-size images still require real-device testing. Tablet redesign remains deferred.

## Phase 1B — precision control panel

The image lab now uses external **MOVE**, **ROTATE** and **ZOOM** controls immediately below the canvas. The public gallery and all published vector puzzles keep their existing handle/line controls and save compatibility. The four permanent master files and validation fingerprints are unchanged.

- **MOVE** is a 120 × 120 CSS pixel relative trackpad. Each drag starts from the finger's current position and adds only its motion; lifting and repositioning does not reset the piece. A CSS pixel of finger motion corresponds to a CSS pixel of piece motion at any board zoom. Higher zoom therefore gives smaller world-coordinate adjustments. Movement is constrained to the visible board where the piece fits; if a rotation or explicit pan put an extent outside that interval, the next stroke recovers gradually rather than teleporting it. If the piece is larger than the viewing window, its center is constrained instead.
- **ROTATE** has a 120-pixel circular hit target around a compact 96-pixel wheel, including its outer ring. Incremental `atan2` differences are unwrapped across ±180°: clockwise gestures add positive rotation, counterclockwise gestures subtract it, and sub-degree changes are retained. Lifting/restarting a stroke preserves the existing angle. A small hub dead zone prevents a half-turn jump when a finger crosses the wheel's center. The wheel never changes piece x/y. Normal position-and-angle snapping remains on gesture release; a successful snap can of course correct the pose precisely.
- Pad and wheel use pointer capture, cancel on blur, resize, pointer cancellation, selection/view change or restart, and ignore stale post-release motion. They are disabled without a loose selection and in Reference. Mouse and touch use the same implementation.
- The canvas only selects loose pieces on a stationary tap and pans from empty space. Dragging a piece does not move/rotate it or pan. Locked pieces remain nonselectable. Multi-pointer canvas gestures are blocked until all fingers lift; pinch and mouse-wheel zoom are disabled. Keyboard piece controls remain available.
- Fit, − and + are outside the canvas. Zoom stays between 1× and 4×. In Puzzle view a selected piece's current center is the anchor, preserving its exact screen position; otherwise the visible viewport center is the anchor. Fit is the explicit full-board reset.

### Camera fix and architecture

The former `revealSelected()` path changed camera zoom and translation during selection and rotation. It also ran before a render-time camera clamp, so its requested translation could be replaced again on the next frame. The rotation path additionally clamped piece coordinates against rotated bounds, moving a piece near an edge while turning it.

For the lab, `camera()` now only paints the existing transform. Selection, movement, rotation, snapping, return and rendering never fit, translate or clamp the camera. Rotation does not clamp the piece center. Only explicit canvas panning, zoom buttons and Fit change the current camera after initial puzzle setup. Restart/replay preserves it. Puzzle and Reference share the lab camera, so switching views cannot jump to a separate remembered transform. The existing vector-camera policy remains unchanged.

`../precision-controls.js` contains reusable, artwork-independent pointer controls and pure relative-motion/zoom/angle math. `game.js` supplies the selection, scale and scene callbacks. This keeps the panel suitable for eventual main-game adoption without enabling it on published puzzles in this phase. Selected-piece zoom deliberately does not clamp camera translation afterward: that would break the anchor, particularly when zooming out near an edge. Phase 1C now bounds explicit panning and fits at 1× as described below; manipulation still never moves the camera. At high zoom, a rotated piece can extend beyond the viewport while its center stays stationary.

### Precision regressions

```sh
node brittz-puzzle-palace/precision-controls.test.mjs
python brittz-puzzle-palace/cutting/check_precision.py
python brittz-puzzle-palace/cutting/check_images.py
```

The new math tests cover 320/360/390/842-pixel board sizes and multiple zooms, continuous wrap-around rotation, exact selected/visible-center anchoring including limits, unchanged camera objects, and non-jumping boundary recovery. The mouse/touch browser checks use a 360 × 800 phone viewport for Samsung Galaxy A17-class CSS dimensions. They check repeated strokes, both rotation directions, center dead-zone crossing, edge rotation without translation, no camera changes during selection/manipulation, zoom-out anchors, reference switching, canvas piece-drag blocking, empty-space panning, disabled pinch/wheel zoom, cancellation, non-overlapping controls/tray, all 50 pieces assembled with the new panel, completion and replay. The existing image-pixel suite invokes the same panel protocol instead of the retired lab handle/line protocol. Screenshots are written to `/tmp/precision-mobile.png` and `/tmp/precision-desktop.png`.

Physical Samsung Galaxy A17 touch ergonomics remain a device-testing item; automated touch emulation does not replace that check. Lab upload/progress lifetime, image limits and other Phase 1 limitations above still apply.

### Precision layout fix and cache regression

The panel now loads `precision-controls.css?v=compact-1` after a versioned shared stylesheet. Its scoped ID selectors explicitly fix MOVE/ROTATE to 120 × 120 border-box pixels, including min/max dimensions, padding and native button appearance. A two-column MOVE grid prevents intrinsic button sizing or flex shrinking from stacking the controls. Labels stay in the row above each control; zoom is a separate row. The original shared rules remain as a fallback for older cached HTML. Increment the CSS URL versions when changing these assets.

Investigation found no overriding size rule in the fresh checked-in CSS: fresh mobile Chromium already rendered the old rules at 120 × 120. Serving current markup with a cached stylesheet from before Phase 1B reproduced the reported narrow, vertically stacked controls (approximately 42 × 54). This is a confirmed reproduction of a cache mismatch, not confirmation of the physical Samsung's network/cache state. The fix protects against both stale shared CSS and later generic button/disabled-button theme rules.

The previous browser checks used Playwright request routing, which disables HTTP caching. They therefore always tested current local CSS. The old layout assertion also checked only minimum widths and panel ordering at 360px/desktop; it did not check heights, horizontal alignment, 320/390px widths, or compare enabled and disabled geometry.

```sh
python brittz-puzzle-palace/cutting/check_precision_layout.py
```

This regression uses a self-cleaning loopback HTTP server **without Playwright routing**, so real browser caching stays enabled. At 320, 360 and 390 CSS pixels (touch/mobile mode, DPR 2.75), it checks fresh navigation and navigation after caching pre-Phase-1B CSS, reproduces the broken arrangement, then verifies the new versioned resources load without clearing the cache. It measures `getBoundingClientRect()` for 120 × 120 control sizes, 96px wheel face, side-by-side placement, labels, separate zoom row, canvas/tray order and no horizontal overflow. It exercises initial-disabled, selected-enabled, Reference-disabled and returned-disabled states, and injects later generic button rules to check specificity. The shared gameplay browser helper now runs these stronger geometry assertions too. Screenshots go to `/tmp/precision-layout-{width}-{fresh|cached}.png`.

Physical Galaxy A17 confirmation is still needed; browser emulation and the cache reproduction cannot establish which cached resource was present on that device.

## Phase 1C — manual SELECT / MOVE workspace

The lab has one 188px-high workspace immediately below a prominent **SELECT | MOVE** toggle. Only one panel is visible:

- SELECT shows the existing piece thumbnails in two rows, with 80 × 76px touch slots and a single horizontal scroller for all remaining pieces. There is no additional tray below the workspace. Tray order, rotation and scroll position survive mode changes and returned pieces.
- MOVE shows the same 120 × 120px trackpad and 120px wheel target/96px wheel face from Phase 1B. Movement sensitivity, angle accumulation, cancellation and release snapping are unchanged. Controls are disabled without a loose selection and in Reference.
- Fit, −, +, the completion counter, Return Piece and the other existing actions stay outside the canvas and available in either mode.

Only the workspace buttons switch modes after setup. Picking a piece, selecting an existing loose piece, snapping, returning, changing Puzzle/Reference, restarting and replaying never switch it. A fresh image/pattern setup starts in SELECT. Restart/replay preserves the chosen mode. Mode changes preserve selection, all loose/locked poses, camera and progress. Pointer gestures are cancelled before hiding their panel; no pose or camera correction is applied.

### Camera policy

The lab still shares one camera between Puzzle and Reference and never adjusts it while selecting, moving, rotating, snapping or switching workspace modes.

- Fit resets to exactly `zoom=1, x=0, y=0`. Empty-canvas panning at 1× is a no-op in either view.
- Above 1×, **explicit pan gestures** clamp x to `[width × (1−zoom), 0]` and y to `[height × (1−zoom), 0]`. Normal panning cannot expose an exterior gutter or drag the puzzle away.
- Zoom buttons retain exact selected-piece anchoring above 1×. Without an active selection in Puzzle, and in Reference, the visible viewport center is the anchor. Rendering/manipulation does not clamp an anchored zoom afterward: clamping would move the anchor. An anchored zoom-out can therefore temporarily have an offset outside the pan interval; the next explicit pan applies the bounds, or Fit resets the view.
- The final zoom-out step to **1× fits the entire square**. Exact off-center screen anchoring and a full-frame 1× square are mathematically incompatible; the full-image requirement takes precedence at that final step. Floating-point values within `1e-9` of 1× are treated as Fit.

The new `panCamera()` and `zoomWorkspace()` policies are used only by the image lab. Published vector puzzles retain their existing camera/controls and saved progress. The four masters, artwork, renderer, snapping rules and public catalog are unchanged. The lab's HTML, entry module, controller import and precision CSS have versioned URLs so cached Phase 1B assets cannot leave the new toggle inert or unstyled.

### Phase 1C verification

`check_precision.py` covers desktop and emulated touch at 320, 360 and 390 CSS pixels. It checks the equal panel slot, two-row scrolling without accidental selection, all 200 thumbnail identities reaching the viewport, manual-only mode changes, multiple loose pieces and canvas re-selection, unchanged poses/camera across switches, unchanged 120px controls, rotation and movement stability, 1× pan lock and both pan limits in Puzzle/Reference, zoom anchors, Fit, no pinch/wheel zoom, no overflow, save isolation, restart, completion and replay. Full 50-piece native-control assembly runs on desktop and the 360px touch viewport. Existing image tests use the same manual mode sequence and still check all 32 PNG/JPG/pattern/rotation fidelity combinations.

```sh
node brittz-puzzle-palace/precision-controls.test.mjs
python brittz-puzzle-palace/cutting/check_precision.py
python brittz-puzzle-palace/cutting/check_precision_layout.py
python brittz-puzzle-palace/cutting/check_images.py
```

The cached-CSS layout regression now switches modes explicitly and measures the visible panel rather than assuming that the picker and precision controls are simultaneously visible. Physical Galaxy A17 ergonomics remain unverified; the earlier image-lab lifetime and input limits still apply.


## Compact UI and rotation display

The lab's shared action row is **Fit | − | + | Return**, with 44px-high targets (48px zoom buttons and 76px Return) at 320/360/390px widths. The original status row is removed. The live piece counter now sits directly under Puzzle/Reference, above the canvas.

On phones, the active game uses a smaller header, single-line puzzle title, and reduced navigation, instruction and footer spacing. The setup page keeps its original header. The canvas width, 188px SELECT/MOVE slot, two-row picker, and 120px movement/rotation targets are unchanged; scrolling remains available on shorter screens rather than shrinking the artwork or controls.

The wheel is a stationary, unmarked ring. There is no numeric readout, tick, absolute-angle transform or accessible angle announcement. Internal piece angles, pointer math, sensitivity, snapping, progress and camera policies are unchanged. Lab entry/controller/style URLs are bumped together to avoid loading old degree-display code against the new markup.

The shared browser regressions measure the four-button row and counter placement, guard canvas size and compact phone chrome, and check after each rotation that the wheel markup is unchanged, its face has no markings, no element has a transform, and its accessible name/status contain no angle information. Existing native mouse/touch completion, return, manual workspace, picker, camera and image-pixel checks continue to run. Physical Samsung Galaxy A17 testing remains pending.
