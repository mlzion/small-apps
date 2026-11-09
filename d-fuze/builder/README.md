# D::FUZE Level Builder

Open the App Lab homepage's **Developer Tools** button, or navigate directly to `d-fuze/builder/` under the site root or `/small-apps/`. Enter **FUSE-LAB-3**. This disposable public code deters casual visitors; it is not secure authentication. Change `ACCESS_CODE` in `builder.js`, update docs/tests and bump the script revision to replace it.

Every new editor page loads a fresh validated copy of `../published-levels.json`, including all levels and both motion libraries. Serve the site over HTTP. Edits live only in the open tab: no drafts, autosave, automatic restoration or repository writes.

## Workflow

1. Edit the level table. Select a row for its seed/name, ring configuration and assembly selection. Add appends a copy of the selected level; Duplicate inserts one; Delete/Move maintain consecutive numbering. Configurations support 1–200 levels and any 1–4 rings at any level number. The table scrolls internally on phones.
2. Configure each ring from inside outward: width 10°–120° in ten-degree steps and gate health. One Motion Family selector applies to the entire level. Its six profiles shuffle every ten seconds with distinct assignments and no immediate per-ring repeats.
3. Use the shared **Ring Profiles | Assembly Profiles** keyframe editor. Ring duration, zero start and guaranteed holds are protected. Six profiles per family remain editable; ring creation/duplication/deletion is removed. Assembly profile management remains available. Assembly duration/keys are independently editable. Negative angles have a +/− button. Each type has its own graph and animated preview with clearly labeled 60° reference gates.
4. Level Preview displays actual configured widths and world angles for up to four rings. Play starts at zero and continues across shared ten-second ring cycles and independent assembly loops; live gate-width edits do not stop it. Stop resets to zero. No preview scrubbing or speed controls are present.
5. **TEST LEVEL** opens the actual game in another tab for any valid level, including four-ring Level 13+. Retry preserves the configuration/seed snapshot unless explicitly choosing a new seed. Test Mode never advances or edits the published file. Return to Editor focuses the original tab, keeping its unsaved in-memory changes. Keep that tab open.
6. **PUBLISH (DOWNLOAD JSON)** validates and downloads the complete versioned `published-levels.json`. The file is **NOT LIVE**. Give it to Codex to install through PR review and GitHub Pages deployment. Normal gameplay remains on the published source; existing game sessions retain their snapshots.

Import JSON explicitly validates/migrates a file before replacing the workspace. Reload Published Data fetches the source again and confirms before discarding unsaved changes. Closing/reloading the editor loses edits; use Publish to retain them in a file. No direct GitHub publishing, authentication, drafts or autosaving are implemented.

See [Phase 5.1 shuffle/migration/Android checks](../PHASE51.md), [publishing details](../PUBLISHING.md), [motion editing and schema migrations](../UNIFIED-MOTION.md), and [Phase 5 settings/limits/testing](../PHASE5.md). Structural validation is not a human difficulty guarantee. Older phase documents describe historical behavior.
