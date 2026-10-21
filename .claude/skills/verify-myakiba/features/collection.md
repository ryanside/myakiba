# Collection

A user adds catalog items to their collection from the Add sheet, sees them in table, grid and gallery views with running totals, edits a row and deletes it.

## Sub-features

- `collection-add` adds items by MyFigureCollection link or ID from the page toolbar's Add sheet.
- `collection-views` switches between compact table, table, grid and gallery views.
- `collection-search` filters the list from the search box.
- `collection-edit` edits a row's fields in the `Edit Item` sheet.
- `collection-delete` deletes a row after confirmation.

## How to get to it (user POV)

- Sidebar link `Collection`, or `<url>/collection`.
- The page toolbar's `Add` button opens `Add to collection`.
- The header's `Add` button opens the same choice from any page.

## Driving it with preview tools

Preconditions:

- Signed in per `sign-in.md`. `$H seed-items <run>` has run. The user has no collection rows: `$H psql <run> "select count(*) from collection"` is `0`.

- **Empty state.** `preview_navigate` to `<url>/collection`. The table shows `No data available` and the `Total Items` card shows `0`.
- **Open the sheet.** `preview_click` with `selector: "button[aria-label='Add']"`. A dialog titled `Add to collection` opens with a textbox `MyFigureCollection item link or ID`. Driven.
- **Add an item.** `preview_type` with `locator: "role=dialog >> role=textbox[name='MyFigureCollection item link or ID']"` and `text: "900001"`, then `preview_click` with `locator: "role=dialog >> role=button[name='Add to collection']"`. Driven.
- **See the row.** `preview_wait_for` with `text: "Verify Figure Alpha"`. The row reads `Verify Figure Alpha MFC #900001 • Prepainted 1/7` and the `Total Items` card shows `1`. Driven.
- **Confirm the write.** `$H psql <run> "select c.status, i.title from collection c join item i on i.id = c.item_id"` returns `Owned|Verify Figure Alpha`. `$H logs <run>` has `"method":"POST","path":"/api/sync/collection"`. Driven.
- **Add several.** Reopen the sheet, choose `Add another item`, and enter `900002` and `900003`. Both titles appear and `Total Items` shows `3`.
- **Switch views.** `preview_click` with `locator: "role=button[name='Grid view']"`, then `Gallery view`, then `Table view`. Each view lists the same titles.
- **Search.** `preview_type` with `locator: "input[placeholder='Search']"` and `text: "Plush"`. Only `Verify Plush Gamma` remains after the debounce.
- **Edit.** `preview_click` with `locator: "role=button[name='Edit item'] >> nth=0"`. The sheet `Edit Item` opens. Change a field and click `role=button[name='Update']`. `$H logs <run>` has `PUT /api/collection/<id>` and the row shows the new value.
- **Delete.** `preview_click` with `locator: "role=button[name='Open menu'] >> nth=0"`, then `role=menuitem[name='Delete item']`, then confirm with `role=button[name='Delete']` inside the `Delete item?` dialog. The row disappears and `$H psql` no longer returns it.
- **Proof.** Save the snapshot with the new row, the evaluate JSON of rows and `Total Items`, the SQL result and the log line to `evidence/collection/`.

## Gotchas

- Three buttons are named `Add`: the sidebar, the header and the page toolbar. Only the toolbar's has `aria-label="Add"`. `role=button[name='Add']` is ambiguous and the click fails.
- The sheet's submit shows the text `Add`, but its accessible name is `Add to collection`.
- Added rows default to status `Owned`. Dashboard `Total Items` and analytics count `Owned` rows only.
- An ID that is not seeded goes to the worker queue, which this harness does not run. The sheet then never completes. Use only `900001` to `900003`.
- The view mode persists in `localStorage` under `collection:viewMode` for this origin.
- Below the `md` width, `Filters`, `Sort By` and `Columns` lose their visible text. Keep the preview at its default width.
