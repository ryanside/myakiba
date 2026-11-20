# myakiba verification map

This directory is the maintained source for verifying myakiba's user-facing web features. Read this index before driving the app, then use the matching feature file as the recipe. `$H` is `.agents/skills/verify-myakiba/scripts/verify.sh`, relative to the root of the checkout under test. `<url>` and `<run>` are what `$H up` printed.

## Baseline preconditions

- A run started with `$H up`, and `$H doctor <run>` ends in `doctor ok`.
- `$H seed-user <run>` has created `verify@example.com` with password `verify-password-1` and a verified email.
- `$H seed-items <run>` has put three Items in that user's Item Database: `900001` Verify Figure Alpha (item id `verifyitem1`), `900002` Verify Figure Beta (`verifyitem2`) and `900003` Verify Plush Gamma (`verifyitem3`). Each has one release 20 days from today at ¥25,000. They stand in for the browser extension's Picks, so the Add page finds them with `Search myakiba`.
- A preview tab of your own, opened on `<url>/login` and signed in per `sign-in.md`, with the onboarding dialog closed.
- Never drive the operator's `bun dev` app on `localhost:3000` or `localhost:3001`.

## Driving conventions

The recipes name an action and its target. Each maps to one tool call:

- "Click X" is `preview_act` with `action: "click"` and X as `locator`, or as `selector` when X is CSS.
- "Type T into X" is `action: "type"` with `text: T`. Add `clear: true` to replace the field's value.
- "Hover X" is `action: "hover"`. "Press K" is `action: "press"` with `key: K`.
- "Read" is `preview_evaluate`.

The handles follow these rules:

- Prefer `role=<role>[name='<name>']`. Scope a dialog by its title, as in `role=dialog[name='Fill all'] >> ...`.
- A toast is also a `role=dialog`, so a bare `[role=dialog]` count includes any toast on screen.
- Toasts render in the `Notifications` region. Wait with `preview_wait_for` on `locator: "[aria-label=Notifications] >> text=/./"`, then read `document.querySelector("[aria-label=Notifications]").innerText`. They auto-dismiss, so read right after the action.
- `main` holds the header too. `main a[href^='/add']` matches the header's `Add` link and the page toolbar's. Match the toolbar's by its preset, as in `main a[href^='/add?to=collection']`.
- Some card controls ignore clicks until their card is hovered: `Remove <title> from List`, `Remove <title> from Wishlist` and `Actions for <list>`. Hover the card's title link first.
- Stat card labels read lowercase in `innerText`, for example `total items`.
- Read a Postgres row with `$H psql <run> "<sql>"` after every write.
- Mutations persist for the run. Use new titles per journey, or start a new run, rather than deleting rows to restore a baseline.

## Proof and skip reporting

- Store artifacts under `~/.cache/verify-myakiba/<run>/evidence/<feature>/`.
- Capture the user action and the resulting state: a saved `preview_snapshot`, the `preview_evaluate` JSON of the state, the Postgres row and the request line from `$H logs <run>`.
- When `preview_snapshot` times out, record that no screenshot was captured and keep the evaluate and database proof.
- Report an unreachable entry point with the attempted step and the unmet precondition. Do not report it as verified through a different entry point.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then has four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with preview tools` and `Gotchas`. The driving section starts with `Preconditions:` and pairs each user action with its target and observable result.

## Features

Every step was driven against a real run of build `4023b6303` on 2026-11-16, except a step that says `From source`. Confirm or correct a `From source` step the first time a run drives it.

- [Sign in and sign out](./sign-in.md). Email sign-in, redirects, the error toasts, the onboarding dialog, sign-out.
- [Add page](./add.md). Searching the Item Database, choosing a destination, new Order details, Fill all, the commit.
- [Collection](./collection.md). The views, search, editing a row, Fill, deleting a row.
- [Orders](./orders.md). Creating an Order, status and Paid, Fill, merging, splitting, deleting, the dashboard board.
- [Lists and wishlist](./lists-and-wishlist.md). Creating, renaming and deleting a List, adding and removing members, the wishlist toggle.
- [Settings](./settings.md). Display currency and date format, where they show, renaming a shop.
- [Overview pages](./overview.md). Dashboard, calendar, expenses, analytics, the Item Database, the Item page, the command palette.

## Unreachable in this harness

Each needs something the harness does not have. Report them as unreachable, with the prerequisite.

- Picks and `Add to item database` need the browser extension holding a MyFigureCollection page. The Add page shows only search rows.
- Item Refresh needs the extension. `Refresh item details` on an Item page opens the dialog `Install the myakiba extension first`, with the link `Install from the Chrome Web Store`, instead.
- Item pictures and the picture quota need a Pick. The S3 store runs, but nothing sends it a picture.
- `Continue with Google` and the Account section's Google `Connect` need real OAuth credentials.
- The verification email and the password-reset link need a real Resend key.
- From source: nothing creates a custom Item, so `/item/custom/<id>` has no way in.
