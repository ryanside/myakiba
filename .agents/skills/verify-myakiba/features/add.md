# Add page

A user gathers Items in a table, chooses where they go, and commits them in one step. The page adds to the Collection, to a new or an existing Order, and to the Item Database alone. Every `Add` control in the app leads here.

## Sub-features

- `add-search` finds Items already in the user's Item Database and puts them in the table as rows.
- `add-destination` chooses `Collection`, `New Order`, `Existing Order` or `Item Database` in `Where these go`.
- `add-preset` opens the page with the destination, and sometimes the Item, already chosen by the link that led there.
- `add-order-details` edits the new Order's title, status, Paid, shop, dates and fees before the commit.
- `add-fill-all` writes one value to every selected row.
- `add-commit` writes every row in one request and returns to the page the user came from.
- `add-picks` lists Items the browser extension picked on MyFigureCollection. Unreachable here, see `README.md`.

## How to get to it (user POV)

- The header's `Add` link, or `<url>/add`. Onboarding's last button lands here too: `Get started`, or `Open the Add page` while the extension holds picks.
- The `Add` link in a page's toolbar, which presets the destination and the way back:
  - `/collection` links to `/add?to=collection&returnTo=%2Fcollection`.
  - `/orders` links to `/add?to=order-new&returnTo=%2Forders`.
  - An Order page's items grid links to `/add?to=order%3A<orderId>&returnTo=%2Forders%2F<orderId>`.
  - `/wishlist` links to `/add?to=wishlist&returnTo=%2Fwishlist`.
  - `/items` links to `/add?to=none&returnTo=%2Fitems`.
- An Item page's `Add to collection` and `Add to an order` links, which also preset the Item with `item=<itemId>`. They show only while the Item has no Collection Item.

## Driving it with preview tools

Preconditions:

- Signed in per `sign-in.md`. `$H seed-items <run>` has run.
- The steps run in order on a fresh run, and each names the Item it uses. Rows from earlier steps stay, so each SQL check names the row to look for.

- **Empty page.** Click `header a[href='/add']`. The title is `Add items - myakiba`, the table reads `No items yet`, and the commit button is `Select items to add`, disabled.
- **Search.** Click `role=main >> role=button[name=/Search\s+myakiba/]`. The dialog `Add from myakiba` opens. Type `Verify` into `role=dialog[name='Add from myakiba'] >> role=combobox`, then `preview_wait_for` with `locator: "role=dialog >> text=Verify Figure Alpha"`. Three options show, and `$H logs <run>` has `GET /api/search/items`. An MFC ID such as `900002` finds its Item too.
- **Add a row.** Click `role=dialog[name='Add from myakiba'] >> role=option[name=/Verify Plush Gamma/]`. The row joins the table behind the dialog, which stays open for more. Press `Escape` to close it. The destination reads `choose where` and the commit button is `Choose where these go`, disabled.
- **Choose the destination.** Click `role=combobox[name='Where these go']`. The options are `Collection`, `New Order`, `Existing Order` and `Item Database`. Click `role=option[name='New Order']`. The commit button becomes `Create order with 1`.
- **Commit.** Click `role=button[name='Create order with 1']`. The toast reads `Created order`. `$H logs <run>` has `"method":"POST","path":"/api/add/commit"`, and `$H psql <run> "select o.title, o.status, o.paid, count(c.id) from \"order\" o left join collection c on c.order_id = o.id group by o.id"` has the row `Verify Plush Gamma|Ordered|f|1`. With no `returnTo` the page stays on `/add` and empties.
- **Preset destination.** Click `main a[href^='/add?to=collection']` on `/collection`, add `Verify Figure Alpha`, and click `role=button[name='Add 1 to collection']`. The toast reads `Added 1 to your collection`, the page returns to `/collection`, and `$H psql <run> "select c.status, c.paid, i.title from collection c join item i on i.id = c.item_id"` has the row `Owned|t|Verify Figure Alpha`.
- **Preset Item.** On `<url>/item/900002`, an Item with no Collection Item yet, click `role=main >> role=link[name='Add to collection']`. The link is `/add?item=verifyitem2&to=collection&returnTo=%2Fitem%2F900002`, and the row is already in the table with `Add 1 to collection` ready. The commit returns to the Item page, which now shows `Your Collection`.
- **New Order details.** Open `<url>/add?to=order-new&returnTo=%2Forders` and add `900002`. A `New Order` section shows the title button `Verify Figure Beta, edit Order title`, `Status`, `Paid`, `Shop`, `Shipping Method`, five dates, the fee textboxes `Shipping Fee`, `Taxes`, `Duties`, `Tariffs` and `Miscellaneous Fees`, and `Notes`. Type `100` into `role=textbox[name='Price for Verify Figure Beta']` and `10` into `role=textbox[name='Shipping Fee']`, then click `Create order with 1`. `$H psql <run> "select title, status, paid, shipping_fee from \"order\""` has the row `Verify Figure Beta|Ordered|f|1000`, and `/orders` shows `unpaid costs` of `$110.00`.
- **Existing Order.** On that Order's page, click `main a[href^='/add?to=order%3A']`, add `900003`, and click `role=button[name='Add 1 to order']`. The Order page returns with the heading `Items (2)`.
- **Fill all.** With a row in the table, click `role=button[name='Fill all']`. The dialog `Fill all` lists `Price`, `Count`, `Condition`, `Score`, `Tags` and `Notes`. Click `Price`, type `50` into `role=dialog[name='Fill all'] >> role=textbox[name='Price']`, and click `role=button[name='Fill 1 selected']`. The row's price box reads `$50`.
- **Proof.** Save a snapshot of the table before the commit, the SQL rows and the `POST /api/add/commit` log lines to `evidence/add/`.

## Gotchas

- Money is stored in minor units. `100` typed in USD is `10000` in `collection.price`.
- A new Order's title defaults to its first row's Item title.
- A row added to the Collection is `Owned` and paid. A row added to an Order takes the Order's status and Paid.
- The page drops an `item` preset whose id does not match `^[a-z0-9]{8,64}$` and opens empty. `seed-items` uses ids that match. After it reads the preset, the page removes `item=` from the URL.
- The empty page says to install the extension and links `Install from the Chrome Web Store`. That text is expected here.
- From source: the `Wishlist` checkbox and the `Lists` button in the sentence put the same rows on the Wishlist and on Lists in the same commit. The `Item Database` destination keeps the rows in the Item Database only, with the button `Keep 1 in Item Database`.
