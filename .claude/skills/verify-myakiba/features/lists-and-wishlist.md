# Lists and wishlist

A user groups items, collection rows and orders into named lists, and keeps a wishlist of catalog items they do not own yet.

## Sub-features

- `list-create` creates a list with a title and optional description.
- `list-edit` renames a list.
- `list-delete` deletes a list after confirmation.
- `list-add-member` adds an item, collection row or order to one or more lists.
- `list-remove-member` removes a member after confirmation.
- `wishlist-toggle` adds and removes a catalog item from the wishlist on its item page.

## How to get to it (user POV)

- Sidebar link `Lists`, or `<url>/lists`. A list opens at `<url>/lists/<listId>`.
- `Add to List` in a collection row's `Open menu`, or `Add Item to List` on an item page.
- Sidebar link `Wishlist`, or `<url>/wishlist`. The toggle sits on `<url>/item/<externalId>`.

## Driving it with preview tools

Preconditions:

- Signed in per `sign-in.md`. `$H seed-items <run>` has run. For members, one collection row exists per `collection.md`.

- **Empty lists.** `preview_navigate` to `<url>/lists`. The page shows `No Lists yet`.
- **Create.** `preview_click` with `locator: "role=button[name='New List']"`. In the `Create List` dialog, `preview_type` into `role=textbox[name='Title']` with `Verify List`, then click `role=button[name='Create']`. The list appears and `$H psql <run> "select title from list"` returns `Verify List`.
- **Add a member.** On `/collection`, open the row's `Open menu` and choose `Add to List`. In the `Add to List` dialog, check `Verify List` and click `Save`. `$H logs` has `PUT /api/lists/targets` and `$H psql <run> "select count(*) from list_member"` is `1`.
- **See the member.** Open `Verify List`. The member `Verify Figure Alpha` is listed.
- **Rename.** On `/lists`, open `role=button[name='Actions for Verify List']`, choose `Edit`, change the title in `Edit List`, and click `Save`. The new title shows and `$H logs` has `PUT /api/lists/<id>`.
- **Delete.** Open the actions menu, choose `Delete`, and confirm in `Delete List?`. `No Lists yet` returns.
- **Wishlist add.** `preview_navigate` to `<url>/item/900002`. Click `role=button[name='Add to Wishlist']`. The button becomes `Remove from Wishlist` with `aria-pressed="true"`, and `$H psql <run> "select count(*) from wishlist_item"` is `1`.
- **Wishlist page.** `preview_navigate` to `<url>/wishlist`. `Verify Figure Beta` is listed. Click `Remove Verify Figure Beta from Wishlist`. `Your Wishlist is empty` shows.
- **Proof.** Save snapshots of the list page and the wishlist page, the SQL counts and the log lines to `evidence/lists-and-wishlist/`.

## Gotchas

- None of these steps has been driven yet. The handles come from source. Correct them on the first run.
- A list page has no picker for new members. Members are added from the item, collection or order that will join the list.
- `Save` in `Add to List` stays disabled until a list is checked.
- The wishlist is its own `wishlist_item` table, not a collection status. It needs only a catalog `item` row.
- Removing from the wishlist page has no confirmation.
