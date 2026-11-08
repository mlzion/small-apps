# Pull request previews

## Provider and isolation

GitHub Pages has one published site per repository and does not provide isolated PR deployments. This setup uses **Cloudflare Pages Direct Upload** for previews, with GitHub Actions posting the deployment URL on each PR. Static hosting is available on Cloudflare's free plan; standard GitHub-hosted Actions runners are free for this public repository, subject to provider limits.

Cloudflare's native GitHub integration was considered, but it skips PRs from forks. This workflow also supports public fork PRs by downloading the exact public head commit as static data. It never checks out or runs PR scripts in the deployment job.

Previews live on a separate `*.pages.dev` project. Every PR deploys to a `pr-N` branch, and every deployment has its own immutable URL. There are no custom domains, GitHub Pages API calls, `pages: write` permissions, `gh-pages` pushes, or changes to the live site's publishing settings.

## One-time owner setup

The repository files alone cannot activate hosting. A Cloudflare account, a Pages project, Actions secrets, and the reviewed workflow on the default branch are required. No credentials belong in source code or PR comments.

1. In your Cloudflare account, create a **Pages Direct Upload** project dedicated to previews, for example `small-apps-previews`. Do not connect the repository through Cloudflare's Git integration; Actions handles uploads. One way to create the project from your own terminal is:

   ```sh
   npx --yes wrangler@4.45.0 login
   npx --yes wrangler@4.45.0 pages project create small-apps-previews --production-branch preview-production-disabled
   ```

   Keep the production branch set to `preview-production-disabled`. The workflow only uses branches named `pr-N`, so it cannot make a production deployment in this project. This project is independent of the existing GitHub Pages site.

2. Leave previews public: do not enable Cloudflare Access or a login requirement for this project. The default `pages.dev` HTTPS URLs work on mobile and desktop; no domain or DNS changes are needed.

3. In Cloudflare, create an API token with **Account → Cloudflare Pages → Edit**, restricted to the account containing this preview project. Find the account ID in the Cloudflare dashboard. In GitHub **Settings → Secrets and variables → Actions**, add:

   | Type | Name | Value |
   | --- | --- | --- |
   | Repository secret | `CLOUDFLARE_API_TOKEN` | The Cloudflare token |
   | Repository secret | `CLOUDFLARE_ACCOUNT_ID` | The 32-character Cloudflare account ID |
   | Repository variable | `CLOUDFLARE_PAGES_PROJECT` | The actual project name, e.g. `small-apps-previews` |

   Cloudflare's Pages Edit token is account-scoped, rather than project-scoped. Use a dedicated preview account if you need to isolate it from other Cloudflare projects. GitHub Pages uses separate credentials and is unaffected.

4. Enable GitHub Actions for the repository and allow the pinned checkout, setup-node, and github-script actions used in the workflow. The workflow requests only `contents: read` and `pull-requests: write`; repository or organization policy must permit PR comments.

5. After owner review, the workflow must be added to the default branch (`main`) to receive `pull_request_target` events. **This setup PR is not merged automatically. Until it is reviewed and added to `main`, automatic preview deployment is not active.** The separate tooling-check workflow can run on the setup PR before that.

6. Open a PR, push a new commit to an existing PR, or close and reopen an existing PR to trigger its first preview. Once this setup is on `main`, PR #2 (`add-app-lab-gallery`) can be previewed without merging the gallery. A failed Actions run can also be rerun after secrets are configured.

## Everyday use

Open a pull request normally. After **Pull request preview** succeeds, the `github-actions[bot]` comment contains a public preview link, a Calculator link, and the short commit ID. It updates the same comment after subsequent pushes; it does not merge the PR.

The comment uses the immutable deployment URL for the tested commit. The branch alias `https://pr-N.<project>.pages.dev` also follows the newest completed deployment. The workflow cancels superseded runs and checks the current PR head before updating the comment. If a build fails, the earlier comment still identifies its earlier commit; check Actions for the latest status.

Use the preview in a phone browser or share its HTTPS URL with reviewers. Test the gallery at the root and launch Calculator at `calculator/`. Relative HTML, CSS, JavaScript, image, audio, MIDI, and WebAssembly paths are preserved. A branch with only app subdirectories gets a preview-only index linking to them. This does not add a homepage to source or the live site.

Previews remain public after the PR closes until deleted. Remove old deployments from the preview project's Cloudflare dashboard as needed. Cloudflare preview deployments and the generated `_headers` file request that search engines not index previews.

## What is deployed

`scripts/prepare_preview.py` downloads a public GitHub archive for the exact PR head SHA and copies ordinary static files to a fresh temporary directory. The production website is never used as a deployment target. App file bytes and relative directory structure are preserved.

The staging step omits hidden files, development tooling, tests, docs, dependencies, symlinks, traversal paths, Cloudflare Functions/Workers, and PR-supplied hosting configuration. There is no dependency install or build step from PR source. Wrangler is pinned and runs from the runner's temporary directory using trusted workflow commands. Do not change this workflow to execute PR-controlled scripts with deployment credentials. If a future app needs a build, keep that build in a separate unprivileged job.

The initial allowlist supports the repository's HTML/CSS/JS apps and common media/font formats. Add a required extension to `STATIC_EXTENSIONS` through review if a new asset type is needed. Static files are limited to 25 MiB each and 100 MiB total in this setup. Private fork repositories are not supported by the unauthenticated archive download; the current `mlzion/small-apps` repository and its public forks are supported.

## Checks and troubleshooting

Run the development-only tests with Python; no packages are required:

```sh
python -m unittest discover -s tests -p 'test_*.py' -v
```

The tests check static asset and calculator byte preservation, preview-only fallback pages, unsafe archive entry exclusions, and deployment URL parsing. The **Preview tooling checks** workflow runs these checks on tooling changes.

- **No deployment run:** the deployment workflow must be on `main`; after adding it, push a commit or reopen the PR. Check Actions is enabled and policy allows `pull_request_target`.
- **Missing hosting configuration:** add the secrets and variable listed above, then rerun.
- **Cloudflare authentication/project error:** verify account ID, token permission, project name, and that the project is Direct Upload in that account. Rotate expired tokens through GitHub secrets.
- **Deployment succeeds but no comment:** inspect the comment step for GitHub permission restrictions. A closed PR or superseded commit intentionally skips comment updates.
- **App asset is missing:** use relative paths and a supported static extension. Root-relative `/assets/...` links do not work under the production `/small-apps/` prefix.
- **Preview asks for login:** disable Cloudflare Access for the dedicated preview project.

Live Cloudflare deployment and bot-comment verification require owner activation above. Local tests do not establish that hosting or credentials are configured.

References: [Cloudflare preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/), [GitHub integration and fork limitation](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/), [Direct Upload with CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/), [Cloudflare free-plan limits](https://developers.cloudflare.com/pages/platform/limits/).
