# Collection

A user sees the Items they own in table, grid and gallery views with running totals, searches them, edits a row, fills one field across selected rows, and deletes a row. Items join the Collection through the Add page.

## Sub-features

- `collection-add` adds Items from the toolbar's `Add` link, which opens the Add page with the Collection preset.
- `collection-views` switches between compact table, table, grid and gallery views.
- `collection-search` filters the list from the search box.
- `collection-edit` edits a row's fields in the `Edit Item` sheet.
- `collection-fill` writes one field to every selected row.
- `collection-delete` deletes a row after confirmation.

## How to get to it (user POV)

- Sidebar link `Collection`, or `<url>/collection`.
- The page toolbar's `Add` link opens `/add?to=collection&returnTo=%2Fcollection`.
- A row's `Edit item` and `Open menu` buttons, and the action bar that appears when a row is selected.

## Driving it with preview tools

Preconditions:

- Signed in per `sign-in.md`. `$H seed-items <run>` has run. The user has no collection rows: `$H psql <run> "select count(*) from collection"` is `0`.

- **Empty state.** `preview_navigate` to `<url>/collection`. The title is `Collection - myakiba`, the table shows `No data available`, and the `total items` card shows `0`. The other cards are `item spend`, `added this month` and `average cost`.
- **Add an Item.** Follow **Preset destination** in `add.md`. Back on `/collection`, the row reads `Verify Figure Alpha`, `MFC #900001`, `Prepainted`, and `total items` shows `1`.
- **Switch views.** Click `role=button[name='Grid view']`, then `Gallery view`, then `Table view`. Each view lists the same title, the clicked button has `aria-pressed="true"`, and `localStorage` key `collection:viewMode` holds `"grid"`, `"gallery"`, then `"table"`.
- **Search.** Type `Plush` into `role=textbox[name='Search Collection']`, then `preview_wait_for` with `urlIncludes: "search=Plush"`. Only titles containing `Plush` remain, or `No data available`. Navigate back to `<url>/collection` to clear it.
- **Edit.** Click `role=button[name='Edit item'] >> nth=0`. The sheet `Edit Item` opens. Click `role=dialog >> role=button[name='8 stars']`, then `role=dialog >> role=button[name='Update']`. The toast reads `Collection updated`, the row's Score reads `8.0`, `$H logs <run>` has `PUT /api/collection/<id>`, and `$H psql <run> "select score from collection"` returns `8.0`.
- **Select a row.** Click `role=main >> role=checkbox[name='Select row'] >> nth=0`. The page reads `1 of 1 row(s) selected`, and a toolbar shows `Assign Order`, `Fill`, `Add selected items to List`, `Delete` and `Clear selection`.
- **Fill.** Click `role=toolbar >> role=button[name='Fill']`. The dialog `Fill all` lists `Price`, `Count`, `Condition`, `Shop`, four dates, `Shipping Method`, `Score`, `Tags` and `Notes`. Click `Shop`, type `Verify Shop` into `role=dialog[name='Fill all'] >> role=combobox[name='Shop']`, and click `role=button[name='Fill 1 selected']`. The toast reads `Filled Shop on 1 item`, the selection stays, `$H logs <run>` has `PUT /api/collection/fill`, and `$H psql <run> "select shop from collection"` returns `Verify Shop`.
- **Escape order.** Open `Fill` again and press `Escape`. The `Fill all` dialog closes and the toolbar and selection stay.
- **Delete.** Click `role=button[name='Open menu'] >> nth=0`, then `role=menuitem[name='Delete item']`, then `role=dialog >> role=button[name='Delete']` in the `Delete item?` dialog. The toast reads `Collection item(s) deleted`, the row disappears, `$H logs <run>` has `DELETE /api/collection`, and `$H psql` no longer returns it.
- **Proof.** Save the snapshot with the row, the evaluate JSON of rows and `total items`, the SQL result and the log lines to `evidence/collection/`.

## Gotchas

- The page lists `Owned` rows only. An Order Item that is `Ordered` or `Shipped` is a `collection` row in SQL but does not show here, and `total items` does not count it.
- The row menu holds `View details` (to `/item/<externalId>`), `Open on MFC` (a link to `https://myfigurecollection.net/item/<externalId>` that opens a new tab, absent on a custom Item), `Add to List`, `Assign order` and `Delete item`.
- The `Edit Item` sheet also edits `Price`, `Count`, `Status`, `Condition`, `Shop`, the release, four dates, `Shipping Method`, `Tags` and `Notes`.
- The search box has the placeholder `Search`, but its accessible name is `Search Collection`.
- The view mode persists in `localStorage` under `collection:viewMode` for this origin.
- From source: below the `md` width, `Filters`, `Sort` and `Columns` lose their visible text. Keep the preview at its default width.
