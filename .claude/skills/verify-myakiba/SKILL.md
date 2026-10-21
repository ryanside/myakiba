---
name: verify-myakiba
description: Launch an isolated production build of myakiba (the Elysia server plus its bundled React web app, against throwaway Postgres and Redis in Docker) and drive the web UI in T3's preview browser to prove a change works. Use when asked to verify, demo, screenshot or reproduce a myakiba behavior in the real app rather than in unit tests, or when a poteto-mode playbook needs runtime evidence for a myakiba change.
---

# Verify myakiba

All commands run from the repo root. `H=.claude/skills/verify-myakiba/scripts/verify.sh`.

The helper builds this checkout's `packages/db/Dockerfile` and `apps/server/Dockerfile` images, the same ones CI smokes and production runs. It serves the API and the web app from one origin, `http://localhost:<free port>`. It never touches the operator's `bun dev` stack on ports 3000, 3001, 5432 and 6379, or Compose's `myakiba-*` containers. Each run is labeled `verify-myakiba.run=<run>`, so runs can sit side by side.

The scraper surfaces (sync, import, item resync) need the worker, S3 and MyFigureCollection. This harness starts no worker. Do not verify them here.

## Launch

```bash
$H up
```

It prints `ready: run=<run> url=<url> build=<build> evidence=<dir>` once `/health` and `/api/auth/ok` answer 200 and `/login` serves the web bundle. Allow about 30 s with a warm Docker cache and several minutes cold. `db-push` creates the schema on an empty database before the server starts.

The web bundle has `VITE_SERVER_URL=<url>` baked in at build time. Rebuild after every source change with a new `$H up`. A running instance does not hot-reload.

Seed a signed-up, email-verified user. Defaults are `verify@example.com` and `verify-password-1`.

```bash
$H seed-user <run> [email] [password]
```

Seeding signs up through the real `/api/auth/sign-up/email` route with Cloudflare's always-pass Turnstile test keys. It then sets `email_verified` in Postgres, because Resend runs with a fake key and no mail arrives. Seeding is setup. The sign-in itself is driven through the UI (see `features/sign-in.md`). Turnstile needs internet access to `challenges.cloudflare.com`.

## Doctor

```bash
$H doctor <run>
```

Read-only. It checks that the run's Postgres, Redis and server containers run, that the server owns `127.0.0.1:<port>`, that `/health` is `{"status":"ok"}`, and that `/api/version` reports the build the run was started from. It warns when the checkout changed since the build. Run it first, and again whenever anything looks off. `$H list` shows every live run.

## Drive

Use T3's `preview_*` tools on the run's URL. Open your own tab with `preview_open` and `reuseExistingTab: false`, and pass its `tabId` on every call.

- Target elements by ARIA role and accessible name: `locator: "role=button[name='Login']"`. Scope inside a dialog with `role=dialog >> role=button[name='Close']`.
- Wait on outcomes with `preview_wait_for` (`urlIncludes`, `text`, `locator`), never fixed sleeps.
- Read state with `preview_evaluate`, for example `fetch('/api/auth/get-session').then(r => r.json())` for the signed-in user, or `document.body.innerText` for visible text.
- Check side effects outside the browser. `$H psql <run> "<sql>"` reads Postgres. `$H logs <run>` shows the server's request log, one JSON line per request with method, path and status.

`features/README.md` indexes the user-facing features. Each feature file is the recipe for that feature. A proof covers every entry point the feature file lists, not just the most convenient one.

## Evidence

Save everything under `~/.cache/verify-myakiba/<run>/evidence/<feature>/`. `$H down` keeps this directory.

- Capture the action and the resulting state. Save a `preview_snapshot` with `save: true`, then copy the returned `screenshotPath` into the evidence directory. Save the `preview_evaluate` result that shows the state as JSON next to it.
- Prove side effects with a second view: the Postgres row after a write, the request line in `$H logs`, the session in `/api/auth/get-session`.
- Drive the real user path. Do not call API routes in place of clicking the UI, except for `seed-user` setup.
- Record the run, build and URL in each evidence file. `$H doctor` prints all three.

## Cleanup

```bash
$H down <run>
```

It removes only the run's labeled containers and network, its two images, and its state and logs. It prints the evidence path it kept. Close your preview tabs with `t3_preview_close`. Run `down` after every failed attempt too. Never `docker rm` by name pattern or kill processes by name.

## Gotchas

- `preview_snapshot` can time out on every page, even `https://example.com`, while click, type, wait and evaluate still work. The T3 preview host is wedged, not the app. Ask the operator to show the browser pane, then retry. Until then, read state with `preview_evaluate` and say in the report that no screenshot was captured.
- A new user sees a `Welcome to myakiba.` onboarding dialog over the dashboard. Its state is in `localStorage` under `myakiba:onboarding-v2`, and each run has a new origin, so it shows on every run. Dismiss it with `role=dialog >> role=button[name='Close']`.
- `seed-user` with an email that already exists still answers 200. Better Auth hides whether an account exists. The password stays the original one.
- `CORS_ORIGIN`, `BETTER_AUTH_URL` and the baked `VITE_SERVER_URL` all use `localhost`. Open the exact `url` that `up` printed, not `127.0.0.1:<port>`.
- Visiting `/login` while signed in redirects to `/dashboard`. Sign out first, or open an `incognito` profile tab, to drive sign-in again.
