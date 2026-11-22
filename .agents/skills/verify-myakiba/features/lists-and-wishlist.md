# Lists and wishlist

A user groups Items, Collection Items and Orders into named Lists, and keeps a Wishlist of Items from their Item Database that they do not own yet.

## Sub-features

- `list-create` creates a List with a title and optional description.
- `list-edit` renames a List.
- `list-delete` deletes a List after confirmation and keeps its members' records.
- `list-add-member` adds an Item, Collection Item or Order to one or more Lists.
- `list-remove-member` removes a member at once. The toast's `Undo` returns it to the slot it held in the List; if the List was reordered since, that slot can sit between different members than before. When another member holds that slot's number, or the number is past the end, the member goes to the end. `Undo` skips a member that is back in the List or whose record was deleted. Removals from one List while its toast is open join that toast, up to 1,000 members; while `Undo` restores, Remove waits; and leaving the List page closes it.
- `wishlist-toggle` adds and removes an Item from the Wishlist on its Item page.

## How to get to it (user POV)

- Sidebar link `Lists`, or `<url>/lists`. A List opens at `<url>/lists/<listId>`.
- `Add Item to List` on an Item page, `Add to List` in a collection row's `Open menu`, and `Add to List` on an Order page. All three open the same `Add to List` dialog.
- Sidebar link `Wishlist`, or `<url>/wishlist`. The toggle sits on `<url>/item/<externalId>`.

## Driving it with preview tools

Preconditions:

- Signed in per `sign-in.md`. `$H seed-items <run>` has run. No List exists yet. One Collection Item for `Verify Figure Alpha` exists per `collection.md`, and one Order per `orders.md`.

- **Empty lists.** `preview_navigate` to `<url>/lists`. The page shows `No Lists yet`.
- **Create.** Click `role=button[name='New List']`. In the `Create List` dialog, type `Verify List` into `role=dialog >> role=textbox[name='Title']`, then click `role=dialog >> role=button[name='Create']`. The toast reads `List created`, the page reads `1 List`, `$H logs <run>` has `POST /api/lists`, and `$H psql <run> "select title from list"` returns `Verify List`.
- **Add a Collection Item.** On `/collection`, click the row's `role=button[name='Open menu']`, then `role=menuitem[name='Add to List']`. In the `Add to List` dialog, click `role=dialog[name='Add to List'] >> role=checkbox[name='Verify List']`, then `role=button[name='Save']`. The toast reads `1 Collection Item added to 1 List`, `$H logs <run>` has `PUT /api/lists/targets`, and `$H psql <run> "select item_id, collection_id, order_id from list_member"` returns one row with only `collection_id` set.
- **See the member.** `preview_navigate` to `<url>/lists/<listId>`. The title is `List - myakiba`, the page reads `1 in this List`, and the member card reads `Collection Item` above `Verify Figure Alpha`.
- **Rename.** On the List page, click `role=main >> role=button[name='Edit']`. In `Edit List`, type `Verify List Renamed` into `role=dialog >> role=textbox[name='Title']` with `clear: true` and click `Save`. The heading shows the new title and `$H logs <run>` has `PUT /api/lists/<id>`.
- **Remove the member.** Hover `role=main >> role=link[name='Verify Figure Alpha'] >> nth=0`, then click `role=button[name='Remove Verify Figure Alpha from List']`. No dialog opens. The toast reads `Verify Figure Alpha removed from List` with an `Undo` button, the page shows `This List is empty`, and `$H logs <run>` has `DELETE /api/lists/<id>/members`.
- **Undo the remove.** Click `role=button[name='Undo']` in that toast within 10 s, or press F6 and Tab to it. The member returns, `$H logs <run>` has `POST /api/lists/<id>/members/restore`, and `$H psql <run> "select collection_id, position from list_member"` shows the same row as before the remove. Remove it again before the next step.
- **Add an Item.** On `<url>/item/900002`, click `role=button[name='Add Item to List']`, check `Verify List Renamed` in the same dialog, and click `Save`. The toast reads `1 Item added to 1 List`, and `list_member` has one row with only `item_id` set.
- **Delete.** On `/lists`, hover `role=main >> role=link[name='Verify List Renamed']`, click `role=button[name='Actions for Verify List Renamed']`, then `role=menuitem[name='Delete']`, then `role=dialog >> role=button[name='Delete']` in `Delete List?`. `No Lists yet` returns, `$H logs <run>` has `DELETE /api/lists`, `list_member` is empty, and the `item` row for `verifyitem2` is still in SQL.
- **Add an Order with a new List.** On an Order page, click `role=main >> role=button[name='Add to List']`. Type `Verify Inline List` into `role=dialog[name='Add to List'] >> role=textbox[name='New List']` and click `role=button[name='Create']`. The new List appears already checked. Click `Save`. The toast reads `1 Order added to 1 List`, and `list_member` has one row with only `order_id` set. This List stays for the rest of the run.
- **Wishlist add.** `preview_navigate` to `<url>/item/900002`. Click `role=button[name='Add to Wishlist']`. The button becomes `Remove from Wishlist` with `aria-pressed="true"`, `$H logs <run>` has `PUT /api/wishlist/verifyitem2`, and `$H psql <run> "select count(*) from wishlist_item"` is `1`.
- **Wishlist page.** `preview_navigate` to `<url>/wishlist`. The page reads `1 Item` and lists `Verify Figure Beta`. Hover `role=main >> role=link[name='Verify Figure Beta'] >> nth=0`, then click `role=button[name='Remove Verify Figure Beta from Wishlist']`. `Your Wishlist is empty` shows, `$H logs <run>` has `DELETE /api/wishlist/verifyitem2`, and the count is `0`.
- **Proof.** Save snapshots of the List page and the wishlist page, the SQL rows and the log lines to `evidence/lists-and-wishlist/`.

## Gotchas

- A List page has no picker for new members. Members are added from the Item, Collection Item or Order that will join the List.
- `Save` in `Add to List` stays disabled until a List is checked.
- An Item, its Collection Item and its Order are three different members.
- The remove buttons and `Actions for <list>` time out with `element is visible, enabled and stable` unless the card is hovered first.
- The List page's `More List actions` menu also deletes the List. From source: not driven.
- The Wishlist is its own `wishlist_item` table, not a collection status. Its routes use the internal item id, not the MFC id.
- Adding to and removing from the Wishlist shows no toast, and removing has no confirmation.
