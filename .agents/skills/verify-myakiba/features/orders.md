# Orders

A user creates an Order holding one or more Items, follows it from Ordered to Owned, marks it paid, and reshapes Orders by merging two into one or moving items into a new Order. Orders are created on the Add page.

## Sub-features

- `order-create` creates an Order from the toolbar's `Add` link, which opens the Add page with `New Order` preset.
- `order-add-item` adds an Item to an existing Order from the Order page's items grid.
- `order-status` changes an Order's status in the orders table, which also updates its items.
- `order-paid` marks an Order paid from the orders table or the dashboard board. Paid covers the Order's items and fees; items have no Paid of their own.
- `order-fill` writes one field to every selected Order and its items, except Paid, which it writes to the Orders alone.
- `order-merge` merges two or more selected Orders into a new one.
- `order-split` moves selected items from an Order to a new Order.
- `order-delete` deletes an Order and keeps its `Owned` items.

## How to get to it (user POV)

- Sidebar link `Orders`, or `<url>/orders`. The toolbar's `Add` link opens `/add?to=order-new&returnTo=%2Forders`.
- An Order's title in the table opens `<url>/orders/<id>`.
- The dashboard's board has columns `Ordered`, `Shipped` and `Owned`.

## Driving it with preview tools

Preconditions:

- Signed in per `sign-in.md`. `$H seed-items <run>` has run.

- **Empty state.** `preview_navigate` to `<url>/orders`. The title is `Orders - myakiba`, the table shows `No data available`, and the cards are `total orders`, `order spend`, `active orders` and `unpaid costs`.
- **Create.** Click `main a[href^='/add?to=order-new']` and follow **New Order details** in `add.md`. Back on `/orders`, the row shows `Verify Figure Beta`, `1 items`, `$110.00` and `Ordered`, and `unpaid costs` reads `$110.00`.
- **Open the Order.** Read the Order's id with the SQL under Gotchas and `preview_navigate` to `<url>/orders/<id>`. The row's `View Verify Figure Beta` link leads there too. The page shows `Items (1)`, a `Cost breakdown` of `Items $100.00`, `Shipping $10.00` and `Total $110.00`, and the buttons `Add to List`, `Edit` and `Delete order`.
- **Add an Item.** Follow **Existing Order** in `add.md`. The heading becomes `Items (2)`.
- **Change status.** On `/orders`, click `role=main >> role=combobox[name='Status']` and then `role=option[name='Shipped']`. The options are `Ordered`, `Shipped` and `Owned`. The toast reads `Order updated`, `$H logs <run>` has `PUT /api/orders/<id>`, and both `"order".status` and its `collection` rows read `Shipped`.
- **Mark paid.** Click `role=checkbox[name='Verify Figure Beta paid']`. `$H psql <run> "select paid from \"order\""` returns `t`, `order spend` reads `$110.00` and `unpaid costs` reads `$0.00`.
- **Select Orders.** Create a second Order from `900001`. Click `role=main >> role=checkbox[name='Select all']`. The page reads `2 of 2 row(s) selected`, and a toolbar shows `Merge`, `Move Item`, `Fill`, `Add selected orders to List`, `Delete Orders`, `Delete Items` and `Clear selection`.
- **Fill.** Click `role=toolbar >> role=button[name='Fill']`. The dialog `Fill all` lists `Status`, `Paid`, `Shop`, four dates and `Shipping Method`. Click `Shop`, type `Verify Shop` into `role=dialog[name='Fill all'] >> role=combobox[name='Shop']`, and click `role=button[name='Fill 2 selected']`. The toast reads `Filled Shop on 2 orders and their items`, the selection stays, `$H logs <run>` has `PUT /api/orders/fill`, and `shop` reads `Verify Shop` on both Orders and on their `collection` rows.
- **Merge.** Click `role=toolbar >> role=button[name='Merge']`. The dialog `Merge Orders` opens with the title `New Merged Order` and the Shop `Verify Shop`. Click `role=dialog[name='Merge Orders'] >> role=button[name='Merge']`. `$H logs <run>` has `POST /api/orders/merge`, and one Order titled `New Merged Order` holds all three items.
- **Split.** Open the merged Order and click `role=main >> role=checkbox[name='Select row'] >> nth=0`. A toolbar shows `Move Item`, `Fill`, `Delete Items` and `Clear selection`. Click `Move Item`. In the dialog `Move Items`, click `role=radio[name='New Order']`, type `Verify Split Order` into `input[placeholder='Enter order title']` with `clear: true`, and click `role=button[name='Move to New Order']`. `$H logs <run>` has `POST /api/orders/split`, the merged Order shows `Items (2)`, and `Verify Split Order` holds one item.
- **Delete.** Open `Verify Split Order`, click `role=button[name='Delete order']`, then `role=dialog >> role=button[name='Delete']` in the `Delete order?` dialog. The toast reads `Order deleted`, the page returns to `/orders`, `$H logs <run>` has `DELETE /api/orders`, and the Order and its `Ordered` item are gone from SQL.
- **Dashboard board.** `preview_navigate` to `<url>/dashboard`. The Order's card sits in the `Ordered` column. Click `role=checkbox[name='New Merged Order paid']`. `$H logs <run>` has `PUT /api/orders/fill`, `"order".paid` is `t`, and the `unpaid costs` card reads `$0.00`.
- **Proof.** Save the snapshot of the Order page, the SQL rows and the log lines to `evidence/orders/`.

## Gotchas

- The useful SQL is `$H psql <run> "select o.id, o.title, o.status, o.paid, count(c.id) from \"order\" o left join collection c on c.order_id = o.id group by o.id"`. `order` is a reserved word, so quote the table as `"order"`.
- Paid is a checkbox, not a status. `order spend` counts paid money and `unpaid costs` counts the rest.
- Merge and `Move to New Order` change only the moved items' Order. Every item keeps its own Status, Shop, dates and shipping method, and counts as its new Order's Paid. The `Merge Orders` dialog opens on what the source Orders share: their Shop when it is the same, the earliest Order Date, the latest other dates, Paid only when all are paid, and every fee summed. `Move to New Order` opens on what the selected items share, by the same rules, with every fee at zero; its Paid starts checked only when every item is outside an Order or in a Paid Order.
- `Move Items` opens on `Existing Order`. Choose `New Order` to split. Its title defaults to `New Order`.
- On `/orders`, `Move Item` and `Delete Items` are disabled while only Orders are selected. Select items on the Order page instead.
- Deleting an Order deletes its items that are not `Owned`. The dialog says `Owned` items stay. From source: that part was not driven.
- From source: the board moves a card between columns with drag, and dnd-kit's keyboard sensor should drive it.
