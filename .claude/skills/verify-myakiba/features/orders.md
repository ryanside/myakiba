# Orders

A user creates an order holding one or more catalog items, follows it from Ordered to Owned, and reshapes orders by merging two into one or splitting items into a new order.

## Sub-features

- `order-create` creates an order with title, status, shipping method and items from the `Create order` sheet.
- `order-add-item` adds an item to an existing order from its detail page.
- `order-status` changes an order's status from the orders table or the dashboard board, which also updates its collection rows.
- `order-merge` merges two or more selected orders.
- `order-split` moves items from an order to a new order.
- `order-delete` deletes an order and keeps its owned items.

## How to get to it (user POV)

- Sidebar link `Orders`, or `<url>/orders`. The toolbar's `Add` button opens `Create order`.
- An order's title in the table opens `<url>/orders/<id>`.
- The dashboard's order board has columns Ordered, Paid, Shipped and Owned.

## Driving it with preview tools

Preconditions:

- Signed in per `sign-in.md`. `$H seed-items <run>` has run.

- **Open create.** `preview_navigate` to `<url>/orders`, then `preview_click` with `selector: "button[aria-label='Add']"`. A dialog titled `Create order` opens.
- **Fill the order.** `preview_type` with `locator: "input[placeholder='Enter order title']"` and `text: "Verify Order One"`. Pick a status and a shipping method from their selects. `preview_type` with `locator: "role=dialog >> input[placeholder='MyFigureCollection item link or ID']"` and `text: "900001"`.
- **Submit.** `preview_click` with `locator: "role=dialog >> role=button[name='Create order']"`. `preview_wait_for` with `text: "Verify Order One"`.
- **Confirm the write.** `$H psql <run> "select o.title, o.status, count(c.id) from \"order\" o left join collection c on c.order_id = o.id group by o.id"` returns `Verify Order One|<status>|1`. `$H logs <run>` has `POST /api/sync/order`.
- **Add an item.** Open the order from the table, click the page's `Add`, and submit `900002` with `role=button[name='Add to order']`. The `Items (2)` heading appears and `$H logs` has `POST /api/sync/order-item`.
- **Change status.** In the orders table, open the order's Status cell select and choose `Owned`. `$H logs` has `PUT /api/orders/<id>`. Both `"order".status` and its `collection` rows read `Owned`.
- **Merge.** Create a second order `Verify Order Two` with `900003`. Check both rows' `Select row` checkboxes and click `Merge`. In the `Merge Orders` dialog, click `Merge`. One order holds all three items and `$H logs` has `POST /api/orders/merge`.
- **Split.** From an order's item, open `Move Item` and submit `Move to New Order` in the `Move Items` dialog. A new order holds the moved item and `$H logs` has `POST /api/orders/split`.
- **Proof.** Save the snapshot of the order detail page, the SQL rows and the log lines to `evidence/orders/`.

## Gotchas

- None of these steps has been driven yet. The handles come from source. Correct them on the first run.
- Order creation goes through the same sync route as the collection Add sheet. Use only seeded IDs `900001` to `900003`, or the worker queue swallows it.
- The table's Status cell select has no accessible name. Target it by row with `preview_evaluate` or by a `role=combobox` scoped to the row.
- `Merge` stays disabled until at least two rows are selected.
- The order board lives on `/dashboard`, not `/orders`. Drag works with dnd-kit's keyboard sensor, but that path is unverified.
- `order` is a reserved word in SQL. Quote the table as `"order"`.
