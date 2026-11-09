# Level Builder: edit, test, publish a file

Open App Lab → Developer Tools and enter **FUSE-LAB-3**. This public disposable code is a casual deterrent, not authentication. Change `ACCESS_CODE` in `builder/builder.js` to replace it, update the documentation/tests, and bump the HTML script revision.

Every new editor page loads a fresh, validated copy of **`d-fuze/published-levels.json`**, the same source used by normal gameplay. Serve the repository over HTTP; browser file URLs cannot reliably fetch configuration. Failed or invalid loads show an error rather than substituting defaults. Requests use `cache: no-store`.

## Workflow

1. Edit the level table, ring settings, and shared Ring/Assembly Motion Editor. Changes live only in this tab's memory. There is no autosave, saved draft, or automatic restoration. Closing or reloading the page discards edits. Old browser drafts are ignored and are not deleted.
2. **Test Level** opens the actual game in a separate tab with a validated snapshot of the experimental configuration. Keep the editor open. Retry uses that test snapshot; Return to Editor closes the test tab and focuses the original editor. Editing or publishing in the editor cannot alter an already running test. If the original editor has been closed, returning opens a fresh published-data session instead. All one- through four-ring configurations are playable, including levels beyond 12.
3. **Publish (Download JSON)** validates the complete document and its compatibility with the game's published loader. It downloads **`published-levels.json`**, including all levels, ring profiles, assembly profiles, and settings in schema v3. Invalid configurations produce errors and no download. The file is **not live**: give it to Codex to install in the repository through review and GitHub Pages deployment. The editor does not contact GitHub, write repository files, or change published gameplay.
4. **Reload Published Data** fetches the source again. If edits differ from the last source load, confirm before discarding them. A failed reload keeps the current edits.

**Import JSON** explicitly validates and replaces the in-memory workspace. v1/v2 files migrate to v3 with reported changes (gate widths normalized to 10° increments, all-family eligibility, always-active assembly, editable ring library). No prior browser workspace is imported automatically. Exported v3 files can be imported again or installed unchanged as the published JSON source. CSV and draft controls have been removed.

Configurations support 1–200 consecutive levels starting at Level 1, with 1–4 rings at any level number. Normal progression ends after the final level in the game session’s published snapshot. Adding Level 13 or 20 requires no engine changes. Validation checks structure and engine compatibility, not human difficulty.

## Storage and isolation

Only the disposable access-code marker and temporary selected-level Test Mode payload use session storage. The full editor workspace is never persisted. The game's existing mute preference remains unchanged. Normal gameplay captures the complete published JSON once per game session; Test Mode loads its experimental snapshot, with no progression into other levels. Later loader updates cannot mutate existing game sessions.

See [motion editing and migration details](UNIFIED-MOTION.md). Changes to profile pools intentionally affect seeded choices; the same seed plus the same complete configuration remain reproducible.

## Verification

`test-publish.cjs` checks that exported JSON loads through the actual published loader and normal engine, including edited profiles, and rejects invalid or unavailable source data without fallback. `test-publish-browser.py` checks fresh startup, old-storage isolation, memory-only editing, reload confirmation, separate-tab testing/return, blocked invalid exports, complete downloads, and normal gameplay using an installed exported file, under both `/` and `/small-apps/`.

Chromium emulation covers Android-sized touch screens and desktop. Physical phone download/file-picker behavior, audible sound quality, other browsers, and live GitHub Pages deployment require manual verification. Browsers may block new test tabs; the editor reports this and preserves edits.
