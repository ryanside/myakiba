# Settings

A user picks a display currency and a date format, and money and dates across the app then render in those formats. The same page renames shops, and holds the profile, account, appearance and layout sections.

## Sub-features

- `settings-currency` changes the display currency.
- `settings-date-format` changes the date format.
- `settings-save` saves both, and nothing saves until the user clicks `Save formats`.
- `settings-applied` shows the new currency and date format on other pages.
- `settings-shops` renames a shop on every Order and Collection Item that uses it.

## How to get to it (user POV)

- `Settings` in the account menu, or `<url>/settings?section=<id>`.
- The settings nav links are `Preferences`, `Appearance`, `Layout`, `Shops`, `Profile`, `Account` and `About`. The section ids are their lowercase names.
- The onboarding dialog's Preferences step edits the same currency and date format.

## Driving it with preview tools

Preconditions:

- Signed in per `sign-in.md`. For `settings-applied`, one Order exists per `orders.md`. For `settings-shops`, one Collection Item has a shop: follow `collection.md` through **Fill** and stop before **Delete**.

- **Open preferences.** `preview_navigate` to `<url>/settings?section=preferences`. The title is `Preferences Settings - myakiba`. The `Currency` button reads `USD — United States Dollar`, `MM/DD/YYYY` has `aria-pressed="true"`, and `role=button[name='Save formats']` is disabled.
- **Change currency.** Click `role=button[name='Currency']`, type `JPY` into `input[placeholder='Search currencies...']`, then click `role=option[name=/JPY/]`. The button reads `JPY — Japanese Yen`.
- **Change date format.** Click `role=main >> role=button[name='YYYY/MM/DD']`. The preview card switches to `¥` amounts and `YYYY/MM/DD` dates, and the page reads `Unsaved changes`.
- **Save.** Click `role=button[name='Save formats']`. The `Notifications` region shows `Preferences updated successfully` and the button is disabled again.
- **Confirm the write.** `$H psql <run> "select currency, date_format from \"user\" where email = 'verify@example.com'"` returns `JPY|YYYY/MM/DD`. `$H logs <run>` has `POST /api/auth/update-user`.
- **See it applied.** `preview_navigate` to an Order page. Its `Cost breakdown` reads in `¥`, and its `Created` and `Release` dates read as `YYYY/MM/DD`. The `/collection` cards read in `¥` too.
- **Rename a shop.** `preview_navigate` to `<url>/settings?section=shops`. The row reads `Verify Shop`, `1 Collection Item`. Click `role=button[name='Rename Verify Shop']`, type `Verify Shop Two` into `role=dialog >> role=combobox[name='New name']` with `clear: true`, and click `role=dialog >> role=button[name='Rename']`. The toast starts with `Saved as`, the row reads `Verify Shop Two`, `$H logs <run>` has `POST /api/vocabulary/shops/rename`, and `$H psql <run> "select distinct shop from collection where shop <> ''"` returns `Verify Shop Two`.
- **Proof.** Save the snapshot after save, the SQL row and a snapshot of an Order page to `evidence/settings/`.

## Gotchas

- Saving goes through Better Auth's `update-user`, not a settings router. Look for that path in the logs.
- The display currency relabels stored amounts and does not convert them. `$100.00` reads `¥100` after the switch. Release prices keep the currency they were listed in.
- A new user starts with `USD` and `MM/DD/YYYY`.
- The other feature files quote `$` amounts. Drive them before this file, or read `¥` where they say `$`.
- The Shops section reads `No shops yet` until an Order or a Collection Item has a shop.
- The other sections were read, not driven. `Account` has `Change password`, Google `Connect`, the device list and `Delete Account`. `Profile` has a `Username` textbox and `Save changes`. `Layout` sets each page's default view on this device.
- From source: session data is cached in a cookie for up to 5 minutes, so another tab may show the old formats until it refetches the session.
