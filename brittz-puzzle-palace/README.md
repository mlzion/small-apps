# Brittz Puzzle Palace v1.1

A buildless, phone-first geometric mosaic game. Launch **`brittz-puzzle-palace/`** from App Lab, or `/small-apps/brittz-puzzle-palace/` on GitHub Pages. Upload a square JPG/PNG, choose **50, 100, 150 or 200 pieces**, optionally show piece outlines, then **Shuffle & play**. Images remain in the browser; there is no backend, runtime dependency or build step.

Every new puzzle receives a fresh validated mosaic. Restart and replay reshuffle its existing pieces; resuming never regenerates cuts. The proven v0.4 generator, geometric constraints, image renderer, snapping rules and persistence schema are unchanged. See [cutting/README.md](cutting/README.md) for the algorithm, exact geometry checks and limits.

## Crop a photo and use fullscreen

Selecting a non-square JPG/PNG opens the cropper automatically with that photo loaded; square images stay ready for puzzle creation. **Crop Photo** also opens the dedicated crop view manually for reframing square photos. Choose a browser-supported photo, drag underneath the fixed square, adjust zoom, rotate in 90° steps or reset, edit the filename, then **Save cropped JPG**. Export creates a new 1024px square JPEG; the original is unchanged. Downloads cannot be confirmed by page scripts, so verify it in Downloads/Files, then choose **Continue to Puzzle**. The crop transfers to setup in memory; choose difficulty and use Shuffle & play normally. No geometry or saved-puzzle replacement occurs during cropping/handoff.

The fullscreen box is immediately beside the page title with a 44px touch target. It uses supported standard/prefixed page APIs and remains visible with Home Screen guidance when unavailable on Apple devices. See [CROPPER.md](CROPPER.md) for the workflow, compatibility findings, test details and device-check limits.

## Play

- **SELECT** displays a two-row horizontally scrolling piece gallery. Tap a thumbnail to place/select it, or tap a loose board piece. Several loose pieces can remain on the board.
- **MOVE** displays the unchanged 120px relative movement trackpad and stationary rotation wheel. The wheel contains no degree readout or orientation markings. Switching workspace mode is strictly manual; selecting, snapping and returning never switch it.
- The selected polygon has a bright **#FF2020**, four-CSS-pixel outline that follows its rotation and stays visible at different zoom levels. Unselected outlined pieces use black, and locked pieces lose the selection highlight. Only paint changes: clipping, paths, piece dimensions and hit-target sizes remain unchanged.
- The SELECT gallery and thumbnail backgrounds are **#E8E8E8**, with the same slot sizes and spacing. The puzzle board remains white.
- **Fit | − | + | Return** share the existing row, with an 18px gap before Return. Correctly snapped pieces cannot be returned. The counter remains immediately below Puzzle/Reference.
- Empty-canvas dragging pans only above 1×, within the existing bounds. Fit restores the full square. Zoom anchors on the selected piece above 1×, otherwise on the visible center. The final zoom-out to 1× fits the board. No pinch or mouse-wheel zoom is enabled; moving/rotating pieces never moves the camera.
- Puzzle/Reference, sounds, restart confirmation, completion celebration and replay retain their tested behavior.

## Saves and upgrade behavior

The main app and [development lab](cutting/) intentionally share the existing **`brittz-mosaic-lab` IndexedDB database**. This name and schema stay unchanged so a v0.4 lab save resumes directly at the main URL. It stores the original image Blob, exact polygons, seed/generator version, outlines preference, tray order, every position/full fractional rotation/locked state and sound setting. Reload restores that record without recutting or clamping loose poses.

Only the latest mosaic is retained. Creating another replaces the current mosaic save, as stated on setup. Browser storage can be cleared/evicted; there is no cloud backup. Storage/corruption failures remain visible. Reload begins with the existing initial camera, selection and SELECT workspace state while restoring every piece's pose. Switching modes/views during play preserves selection and camera.

The original Sea Turtle, Tropical Gem and Clownfish remain available at **[legacy.html](legacy.html)**. Their catalog, source artwork, vector engine and local-storage save keys are retained. Old vector progress is not converted into a different mosaic or overwritten. If old save keys exist, setup shows a recovery link; the archive link also remains available without storage access. The old collection supports its original controls and certificates. Its publishing instructions are preserved in [LEGACY.md](LEGACY.md).

## Completion certificates

After completing a puzzle in **Puzzle** view, enter a name and choose **Export JPG**. The browser generates a **1600 × 1890** JPEG at quality .95 for the square mosaic, with:

- Brittz Puzzle Palace branding and completion wording.
- The uploaded image, drawn directly at 1400 × 1400 with its original appearance/proportions, without piece outlines or selection highlights. Transparent PNG pixels are composited over white, matching the puzzle board.
- Puzzle title (the source filename), piece count, and **Completed by [Name]**.

The existing editable name is remembered locally, including names from the original collection. The certificate never revokes the puzzle's source URL. Download JPG remains available if an automatic download is unsupported. Unfinished puzzles and Reference cannot export; leaving, restarting or switching into Reference cancels stale exports/downloads. The archive's existing SVG certificates remain compatible.

## Architecture and changed files

- `index.html` keeps the promoted mosaic interface at the existing public URL and adds the v1.1 crop view/title control. `setup.js`, `cropper.js`, `crop-math.js`, `cropper.css` and `fullscreen.js` handle photo preparation and browser fullscreen independently of gameplay. `cutting/index.html` keeps the same interface for development. Both load the same versioned `cutting/lab.js` entry/controller and precision styles; the internal `data-cutting-lab` marker continues to select the proven mosaic control path.
- `legacy.html` retains the original SVG entry point beside its unchanged catalog/data. `game.js` still supports both modes. Its certificate gate now accepts completed image puzzles.
- `certificate.js` selects either the original uploaded image or the archived vector renderer. `style.css` enables certificate controls; `cutting/precision-controls.css` adds the two paint refinements.
- App Lab's existing link remains `brittz-puzzle-palace/`; only its description changes. Other applications and their code are untouched.
- The procedural generator, worker, geometry/shape validation, image clipping renderer, snapping engine, storage database/schema and fixed archival masters are unchanged.

## Verification

Run from the repository root with Node. Browser checks use development-only Python Playwright, Pillow and Chromium (`CHROMIUM_PATH` may override `/usr/bin/chromium`).

```sh
node --test brittz-puzzle-palace/cropper.test.mjs brittz-puzzle-palace/migration.test.mjs brittz-puzzle-palace/cutting/mosaic.test.mjs brittz-puzzle-palace/cutting/patterns.test.mjs brittz-puzzle-palace/content.test.mjs brittz-puzzle-palace/engine.test.mjs brittz-puzzle-palace/precision-controls.test.mjs
python brittz-puzzle-palace/check_main.py
python brittz-puzzle-palace/check_cropper.py
# Optional Safari/WebKit engine checks when installed:
CROP_WEBKIT=1 python brittz-puzzle-palace/check_cropper.py
MOSAIC_ENTRY=/small-apps/brittz-puzzle-palace/ python brittz-puzzle-palace/cutting/check_mosaic.py
MOSAIC_ENTRY=/small-apps/brittz-puzzle-palace/ python brittz-puzzle-palace/cutting/check_precision.py
python brittz-puzzle-palace/cutting/check_precision_layout.py
python brittz-puzzle-palace/cutting/check_images.py
python brittz-puzzle-palace/check_browser.py
python brittz-puzzle-palace/check_collection.py
python brittz-puzzle-palace/check_clownfish.py
```

`check_main.py` covers lab-to-main saves, old-save recovery, gallery navigation at both deployment roots, red/gray paint, unchanged polygon paths, original-image JPG content/proportions/branding/name/count, completed-only eligibility, remembered names and geometry-preserving replay across 50/100/150/200 pieces and desktop/320/360/390px touch.

The shared persistence/control suites default to the lab URL; `MOSAIC_ENTRY` runs them unchanged at the promoted main URL. They cover all counts, exact bytes/geometry/pose reloads, continuous angles, two-row scrolling, manual modes, movement/rotation/snapping, camera stability/bounds/zoom, no overflow and full native 50-piece completion/replay. Cache tests retain real HTTP caching. Image tests retain all 32 PNG/JPG × count × seed pixel cases. Node tests retain 128 seeded geometry layouts and add frozen hashes for all legacy puzzle files/catalog/engine. Original SVG browser checks now target `legacy.html` and still verify their saves, controls, content and certificates.

The user confirmed v0.4 generation/gameplay/save-resume on a physical Android phone, including 200 pieces. The v1.0 visual refinements and certificate downloads are covered by desktop and emulated-touch automation; a physical-device certificate download check remains useful. Storage eviction, download handling and available memory depend on the browser/device.

The v1.1 crop/fullscreen tests also check portrait/landscape/square/EXIF images, downloaded JPG pixels, clamped crop edges, original-image integrity, canceled/failed downloads, in-memory handoff, existing-save protection, title alignment and API fallback behavior. Chromium and persistent-profile WebKit runs passed; see [CROPPER.md](CROPPER.md) for the limits of iOS emulation and physical-device follow-up.

Automatic-selection routing is transactional: decoding and cropping do not replace the current setup image. Cancel/Back restores its ready message and file selection, and invalid files retain it. Only Continue to Puzzle accepts the exported JPG; only Shuffle & play replaces the saved puzzle. Regressions cover empty/prior selection cancellation, square readiness, portrait/landscape/EXIF automatic loading, manual square reframing and save/continue on Chromium and persistent WebKit profiles.
