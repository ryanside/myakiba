# myakiba verification map

This directory is the maintained source for verifying myakiba's user-facing web features. Read this index before driving the app, then use the matching feature file as the recipe. `$H` is `.claude/skills/verify-myakiba/scripts/verify.sh`. `<url>` and `<run>` are what `$H up` printed.

## Baseline preconditions

- A run started with `$H up`, and `$H doctor <run>` ends in `doctor ok`.
- `$H seed-user <run>` has created `verify@example.com` with password `verify-password-1` and a verified email.
- `$H seed-items <run>` has created three catalog items: `900001` Verify Figure Alpha, `900002` Verify Figure Beta and `900003` Verify Plush Gamma. Each has one release 20 days from today at ¥25,000.00. They stand in for MyFigureCollection items, so the Add sheets complete without the worker or the network.
- A preview tab of your own, opened on `<url>/login` and signed in per `sign-in.md`, with the onboarding dialog closed.
- Never drive the operator's `bun dev` app on `localhost:3000` or `localhost:3001`.

## Driving conventions

- Prefer `locator: "role=<role>[name='<name>']"`. Scope with `role=dialog >> ...` when the page has the same name elsewhere.
- The header, the sidebar and the page toolbar each have a button with the name `Add`. Target the page toolbar's with `selector: "button[aria-label='Add']"`.
- Toasts render in the `Notifications` region. Wait with `preview_wait_for` on `locator: "[aria-label=Notifications] >> text=/./"`, then read `document.querySelector("[aria-label=Notifications]").innerText` with `preview_evaluate`. They auto-dismiss, so read right after the action.
- Read a Postgres row with `$H psql <run> "<sql>"` after every write.
- Mutations persist for the run. Use new titles per journey, or start a new run, rather than deleting rows to restore a baseline.

## Proof and skip reporting

- Store artifacts under `~/.cache/verify-myakiba/<run>/evidence/<feature>/`.
- Capture the user action and the resulting state: a saved `preview_snapshot`, the `preview_evaluate` JSON of the state, the Postgres row and the request line from `$H logs <run>`.
- When `preview_snapshot` times out, record that no screenshot was captured and keep the evaluate and database proof.
- Report an unreachable entry point with the attempted step and the unmet precondition. Do not report it as verified through a different entry point.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then has four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with preview tools` and `Gotchas`. The driving section starts with `Preconditions:` and pairs each user action with its exact tool call and observable result.

## Features

Handles marked as driven were exercised against a real run on 2026-10-20. The rest come from reading the source. Confirm or correct them the first time a run drives them.

- [Sign in and sign out](./sign-in.md). Email sign-in, the redirect for a signed-in user, the onboarding dialog, sign-out. Driven.
- [Collection](./collection.md). Adding items through the Add sheet, the views, editing and deleting a row. Add was driven.
- [Orders](./orders.md). Creating an order, adding items, changing status, merging, splitting.
- [Lists and wishlist](./lists-and-wishlist.md). Creating, renaming and deleting a list, adding members, the wishlist toggle.
- [Settings](./settings.md). Display currency and date format, and where they show.
