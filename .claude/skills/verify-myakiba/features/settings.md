# Settings

A user picks a display currency and a date format. Money and dates across the dashboard, orders and item pages then render in those preferences.

## Sub-features

- `settings-currency` changes the display currency.
- `settings-date-format` changes the date format.
- `settings-save` saves both, and nothing saves until the user clicks save.
- `settings-applied` shows the new currency and date format on other pages.

## How to get to it (user POV)

- Sidebar link `Settings`, or `<url>/settings?section=preferences`. The settings nav has a `Preferences` button.
- The onboarding dialog edits the same preferences on first visit.

## Driving it with preview tools

Preconditions:

- Signed in per `sign-in.md`. For `settings-applied`, one collection row exists per `collection.md`.

- **Open preferences.** `preview_navigate` to `<url>/settings?section=preferences`. `role=button[name='Save preferences']` is disabled.
- **Change currency.** `preview_click` with `locator: "role=button[name='Display currency']"`, `preview_type` into `input[placeholder='Search currencies...']` with `JPY`, then click the `JPY` option.
- **Change date format.** In the `Date format` toggle group, click `YYYY/MM/DD`.
- **Save.** `preview_click` with `locator: "role=button[name='Save preferences']"`. The `Notifications` region shows `Preferences updated successfully`.
- **Confirm the write.** `$H psql <run> "select currency, date_format from \"user\" where email = 'verify@example.com'"` returns `JPY|YYYY/MM/DD`. `$H logs <run>` has `POST /api/auth/update-user`.
- **See it applied.** `preview_navigate` to `<url>/dashboard`. The `Total Spent` card formats in yen. An order detail page shows `Created` in `YYYY/MM/DD`.
- **Persist.** Reload `<url>/settings?section=preferences`. The currency button and the date toggle show the saved values.
- **Proof.** Save the snapshot after save, the SQL row and a snapshot of the dashboard card to `evidence/settings/`.

## Gotchas

- None of these steps has been driven yet. The handles come from source. Correct them on the first run.
- Saving goes through Better Auth's `update-user`, not a settings router. Look for that path in the logs.
- Session data is cached in a cookie for up to 5 minutes. Another tab may show the old preference until it refetches the session.
