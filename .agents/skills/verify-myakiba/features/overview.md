# Overview pages

A user reads their totals on the dashboard, upcoming releases on the calendar, spending on the expenses page and breakdowns on the analytics page. They browse every Item they have saved in the Item Database, open an Item's page, and jump anywhere with the command palette. These pages read what the Add page, Collection and Orders wrote.

## Sub-features

- `dashboard-cards` shows total items, total spent, active orders and unpaid costs.
- `dashboard-board` shows Orders as cards in `Ordered`, `Shipped` and `Owned` columns. `orders.md` drives its Paid checkbox.
- `calendar-releases` shows release dates of Items by month.
- `expenses` shows spend by collection, orders and shipping, with a shops table.
- `analytics` shows counts and spend by artist, character, origin, company and more.
- `item-database` lists every Item in the user's Item Database.
- `item-page` shows one Item with its releases and the user's Collection Item, and starts adds, the Wishlist toggle and List adds.
- `command-palette` searches pages, Orders and Collection Items from the header.

## How to get to it (user POV)

- Sidebar links `Dashboard`, `Calendar`, `Analytics`, `Expenses` and `Item Database`, at `/dashboard`, `/calendar`, `/analytics`, `/expenses` and `/items`.
- An Item's title anywhere links to `<url>/item/<externalId>`, for example `/item/900001`.
- The header's `Search` button opens the command palette.

## Driving it with preview tools

Preconditions:

- Signed in per `sign-in.md`. `$H seed-items <run>` has run. One Collection Item and one unpaid Order exist per `collection.md` and `orders.md`.

- **Dashboard.** `preview_navigate` to `<url>/dashboard`. The title is `Dashboard - myakiba`. Read `document.querySelector('main').innerText`. With one `Owned` Collection Item and one unpaid `Ordered` Order, `total items` reads `1`, `active orders` reads `1` with `1 unpaid`, and `unpaid costs` reads the Order's total. The board's columns are `Ordered`, `Shipped` and `Owned`. `$H logs <run>` has `GET /api/dashboard`.
- **Calendar.** `preview_navigate` to `<url>/calendar`, then click `role=button[name='Next month']` until the URL's `month` is the seeded release month. The calendar shows a release only when a Collection Item of yours uses it, in an Order or not. With all three seeded Items added, the day's button is named `filter <date> (3 releases)` and the page lists the three titles under that date. With fewer added, it counts and lists only those.
- **Expenses.** `preview_navigate` to `<url>/expenses`. The title is `Expenses - myakiba`. The page has the views `Collection`, `Orders` and `Shipping`, the ranges `3M`, `6M`, `12M`, `24M` and `All time`, and a `Shops` table that names each shop in use.
- **Analytics.** `preview_navigate` to `<url>/analytics`. The title is `Analytics - myakiba`. Sections `artists`, `characters`, `origins` and `companies` each show `Top by Count` and `Top by Spend`, and link to `/analytics/<section>`. Seeded Items have no entries, so each reads `No data`.
- **Item Database.** `preview_navigate` to `<url>/items`. The title is `Item Database - myakiba`, the page reads `3 Items`, and each seeded title links to its Item page. The search box is `Search the Item Database`.
- **Item page.** `preview_navigate` to `<url>/item/900002`. The title is `Verify Figure Beta - myakiba`. The page shows `Releases` with the seeded date, `Standard` and `¥25,000`, the category and scale, and under `Your Collection` either the Collection Item or the links `Add to collection` and `Add to an order`.
- **Item Refresh is gated.** Click `role=button[name='Refresh item details']`. The dialog `Install the myakiba extension first` opens with the link `Install from the Chrome Web Store`, and nothing is fetched.
- **Command palette.** Click `header >> role=button[name='Search']`. The dialog `Global Command Palette` opens. Type the title of an Item in the Collection into `role=dialog[name='Global Command Palette'] >> role=combobox`, wait for its option, and click it. The URL becomes that Item's page.
- **Proof.** Save a snapshot of each page, the `innerText` that holds the totals, and the SQL that explains them to `evidence/overview/`.

## Gotchas

- The command palette searches Orders and Collection Items, not the Item Database. An Item that is only in the Item Database reads `No items matched`, and that option is disabled.
- An Item page is addressed by the MFC id. The item's own id, such as `verifyitem2`, appears only in Add links and wishlist routes.
- An Item page for an owned Item replaces the two Add links with `Edit collection item`, `Add collection item to List`, `Assign order` and `Delete collection item`.
- The calendar's month and year live in the URL as `?month=12&year=2026`.
- Totals read in the user's display currency, per `settings.md`.
