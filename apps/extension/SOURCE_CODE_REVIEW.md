# Build the myakiba extension from source

This zip holds the files of the myakiba monorepo that the browser extension's build reads. The extension is in `apps/extension`. Its code imports `packages/env`, `packages/mfc`, `packages/contracts` and `packages/utils`. The other workspaces are here only as `package.json` files, so that `bun install --frozen-lockfile` sees the same workspaces that `bun.lock` lists.

## Requirements

- macOS or Linux. The build was checked on macOS 15 on arm64.
- Bun 1.4.0. To install it, run `curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.0"`.
- Node.js 24. WXT, the extension framework, runs on Node. The build was checked with Node 24.14.0.
- No environment variables and no `.env` file. A release build uses the production origins in `packages/env/src/extension.ts`. If a `WXT_WEB_ORIGIN`, `WXT_MFC_ORIGIN` or `WXT_MFC_STATIC_ORIGIN` variable names another origin, the build stops with an error.

## Build

1. Unzip the sources: `unzip myakiba-1.0.0-sources.zip -d myakiba`.
2. Go to the repo root: `cd myakiba`.
3. Install the dependencies: `bun install --frozen-lockfile`.
4. Go to the extension: `cd apps/extension`.
5. Build and zip it: `bun run zip`.

The Firefox package is `apps/extension/.output/myakiba-1.0.0-firefox.zip`, and its unpacked files are in `apps/extension/.output/firefox-mv3/`. The same command also writes the Chrome package and this sources zip. Each zip is byte for byte the same as the one submitted.

## What the build changes

WXT bundles and minifies three entry points with Vite:

- `entrypoints/background.ts` becomes `background.js`.
- `entrypoints/collector.ts` becomes `collector.js`, the script the extension runs in its MyFigureCollection tab.
- `entrypoints/myakiba.content.ts` becomes `content-scripts/myakiba.js`, the content script on myakiba.app.

The icons in `public/` are copied as they are. `scripts/icons.ts` draws them from the myakiba logo, and the build does not run it.

## Linter warnings

- "The Function constructor is eval" appears once in each script. It is zod 4.6.7's check in `zod/v4/core/util.js`, which calls `Function("")` to learn whether the page allows `eval`. When it does, zod builds parser functions from the extension's own schemas. No text from a web page or the network reaches it.
- "Manifest key not supported by the specified minimum Firefox for Android version" refers to `data_collection_permissions`. The extension is for Firefox on desktop only, because it opens and focuses tabs and windows with `browser.windows`, which Firefox for Android does not have.
