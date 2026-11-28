# myakiba

myakiba helps collectors track Japanese pop-culture collectibles, purchases, Orders, personal Lists, and spending. Item means collectible information in a user's own Item Database, Collection Item means one user's purchase or ownership details, and Order Item means that Collection Item when it is linked to an Order.

## Language

### Item database

**Item Database**:
All of one user's Items and their details. Each user has their own, and nobody else sees or changes it. It holds at most 20,000 Items.
_Avoid_: Catalog, library, shared database

**Item**:
The description of one collectible in one user's Item Database, separate from that user's purchase or ownership details. An Item can come from MyFigureCollection or be custom. Two users who save the same MyFigureCollection page each have their own Item.
_Avoid_: Catalog Item, database item, global item

**Item Picture**:
The picture an Item shows, stored by its content, so two Items with the same picture share one stored copy. It is public but unlisted: its link is served for myakiba's own pages. Each picture a user saves is recorded in their picture ledger, and the ledger holds at most 2 GiB, each distinct picture counted once, whether or not an Item still shows it.
_Avoid_: Thumbnail when the stored picture is meant

**Item Release**:
A dated release of an Item for sale. One Item can have several Item Releases. Its date is known to the day, the month or the year, as MyFigureCollection printed it, and is shown only that far: a month reads "Jun 2026" and a year "2026". When dates are sorted or compared, a date known only to its month or year counts as the first day of that period, but the Calendar never places it on that day. For an Item Release saved before precision was recorded, its precision is a guess from the stored date until an Item Refresh reads the page.
_Avoid_: Catalog Release, release when Order Release Date could also be meant

**Selected Item Release**:
An optional Item Release picked for a Collection Item. It must be a release of that Collection Item's Item.
_Avoid_: Selected Release, Latest release, Order Release Date

**Item Entry**:
A named detail linked to one or more of one user's Items, such as an artist, character, or company. Its link to an Item can include extra context, such as an artist's job. Each user has their own Item Entries, so a page renames only its uploader's.
_Avoid_: Catalog Entry, Item Attribute, Entry, tag

**Item Entry Category**:
The type of detail an Item Entry describes: Artists, Characters, Origins, Companies, Classifications, Events, or Materials.

**Item Category**:
The product type of an Item, such as Prepainted, Plushes, or Books. It is different from a Classification, which is an Item Entry, and from an Item Category Group.
_Avoid_: Category when its kind is unclear

**Item Category Group**:
A larger group of Item Categories. The groups are Figures, Goods, and Media.
_Avoid_: Category Group

### Collection items

**Collection**:
All the Collection Items a user owns. An Owned Order Item is also in the Collection because it is still a Collection Item.

**Collection Item**:
One user's purchase or ownership details for an Item. A Collection Item can exist before the user owns it, and several Collection Items can point to the same Item. Outside an Order it is always Owned, so only an Order Item can be Ordered or Shipped.
_Avoid_: Collection row, Item, owned item

**Order Item**:
A Collection Item attached to an Order. Order Item is another name for that Collection Item while it belongs to the Order, not a separate thing.
_Avoid_: Item, line item

**Acquisition Status**:
An Order and each Collection Item have their own Acquisition Status, which says where the package is. Ordered means not yet sent, Shipped means sent but not received, and Owned means received. It says nothing about money; Paid does.
_Avoid_: Ownership status, Collected status

**Paid**:
A yes or no on an Order, apart from its Acquisition Status, so a Shipped Order can be unpaid and an Ordered one paid up front. It covers every Order Item in the Order and all of its Order Fees, so every Order is Paid or Unpaid. A Collection Item has no Paid of its own: an Order Item counts as its Order's Paid, and a Collection Item outside an Order always counts as paid. A Payment Date does not make anything Paid, and marking an Order Paid does not set a Payment Date.
_Avoid_: Paid status

**Collection Date**:
The date a collector received an Order or Collection Item. Collection Date and Acquisition Status are separate; the final status is called Owned, not Collected.

**Collection Item Count**:
The number of Collection Items, not the number of copies saved inside them. Collection, Order, Calendar, Analytics, and Expense counts all work this way.
_Avoid_: Item count, count when the unit is unclear

**Fill all**:
Writing one value to one field of every selected row at once: the Add Page's rows, saved Collection Items on the Collection page, or Orders and Order Items on the Orders page and an Order's page, including selected ones on pages not shown. Tags are added to each row's own tags; every other field is replaced, and a blank Shop or Notes or an empty date clears it. An Order fills its Paid, which is written to the Orders alone, and its Cascade to Items fields, which always cascade: the value is written to the Orders and to every item in them. A fill of saved rows changes all of them or none.
_Avoid_: Bulk edit, batch update

### Orders

**Order**:
An Order groups one user's purchase details and Order Fees with any Order Items attached to it. The Order and its Order Items can have different details and statuses.

**Order Fees**:
Amounts saved on the whole Order instead of one Order Item: Shipping Fee, Taxes, Duties, Tariffs, and Miscellaneous Fees.
_Avoid_: Misc, Other fees

**Order Total**:
The saved price of each attached Order Item, added once regardless of its copy count, plus all Order Fees.

**Active Order**:
An Order with a status of Ordered or Shipped. An Owned Order is no longer active.

**Paid Order**:
An Order whose Paid is yes. Its whole Order Total is Spend. A Payment Date by itself does not make an Order a Paid Order.

**Unpaid Order**:
An Order whose Paid is no, whatever its Acquisition Status. Its whole Order Total counts as Unpaid Costs, not Spend.

**Order Merge**:
Moving the Order Items of several Orders into one new Order and deleting those Orders. The new Order starts from them: their Shop when they all share it, the least advanced Acquisition Status, Paid only when every one is a Paid Order, the earliest Order Date, the latest Release, Payment, Shipping and Collection Dates, their Shipping Method when they all share it, every Order Fee summed, and their Notes. The user can change any of it before merging. Moving or assigning Collection Items to a new Order starts that Order from the items by the same rules, with no Order Fees and no Notes; it starts Paid only when every item counts as paid, being outside an Order or in a Paid Order.
_Avoid_: Combine

**Order Release Date**:
The date the whole Order is expected to release. Like an Item Release's date, it can be known only to its month or year: a date copied from an Item Release is known as far as that release's, and a date picked on the calendar is known to the day. It remains separate from Selected Item Releases, but adding Order Items or changing an attached Order Item's Selected Item Release advances it to the latest relevant date when later. Automatic changes never move it earlier, clear it, or replace a later user-entered date.
_Avoid_: Item Release, Selected Item Release

**Cascade to Items**:
Copying an Order's Acquisition Status, Shop, Order Date, Payment Date, Shipping Date, Collection Date, or Shipping Method to its Order Items. An Order edit, from Edit Order, the Orders table or the Dashboard board, copies each of these details it changes, and only to the Order Items that still held the Order's old value, so a detail set on one Order Item stays. Edit Order with "Also update matching items in this order" unticked writes the Order alone. Merging Orders and moving Order Items to a new Order copy nothing, so every moved Order Item keeps its own details, and an Order fill copies to every Order Item. Paid is not copied, since an Order Item has no Paid of its own.
_Avoid_: Cascade when the copied details and affected Order Items are unclear

**Shop**:
The seller name entered on an Order or Collection Item. Each can have its own Shop, and the Expense Scope decides which one to use.
_Avoid_: Merchant, retailer when referring to the saved Shop name

### Lists and wishlist

**List**:
A private group owned and arranged by one user. It can hold Items, Collection Items, and Orders, but not other Lists.

**List Member**:
An Item, Collection Item, or Order placed at a chosen spot in a List. Each can appear only once per List, but an Item, its Collection Item, and its Order count separately; any of them can appear in several Lists.
_Avoid_: Item when the type is unclear; Member or Membership in user-facing text

**Wishlist**:
One user's private, manually arranged set of Items they plan to get. Each user has one Wishlist, and it remains separate from a List even when someone names a List "Wishlist."
_Avoid_: Saved list, reading list, release watchlist

**Wishlist Item**:
One Item included in a Wishlist. An Item can appear only once and stays until the user removes it, even if the user adds a Collection Item or Order Item for that Item.
_Avoid_: Wishlist Entry, List Member, wished Item

**Wishlist Release Filter**:
One of three Wishlist views: All, Upcoming, or Available, based on the Item Release with the latest date and the viewer's local date. All includes every Wishlist Item, including Items with no Item Release, and is the only view with ranks and manual reordering.

**Upcoming**:
A Wishlist Release Filter for Items whose latest Item Release date is after today.

**Available**:
A Wishlist Release Filter for Items whose latest Item Release date is today or earlier. Available describes the release date, not whether a Shop has stock.

### Expenses

**Expense Scope**:
One of three expense views: Collection, Orders, or Shipping. Each has its own rules for what counts, which Shop to use, and how averages work, so totals from different views can overlap.

**Spend**:
Money that an Expense Scope counts as spent, which is money paid. Unpaid Costs are shown separately and never count as Spend.
_Avoid_: Cost, Spending, Total Spent when referring to this exact number

**Collection Spend**:
The saved price of each Owned Collection Item that counts as paid, added once regardless of its copy count: every one outside an Order, and every Order Item of a Paid Order. An Owned Order Item of an Unpaid Order counts as Unpaid Costs, not Collection Spend, until it is removed from that Order.
_Avoid_: Collection Item Spend

**Order Spend**:
The Order Total of each Paid Order: its Order Item Spend plus its Fee Spend. An Order's Spend and Unpaid Costs together make its Order Total.

**Order Item Spend**:
The part of Order Spend that comes from Order Item prices: the saved price of each Order Item of a Paid Order, added once regardless of its copy count.

**Fee Spend**:
The part of Order Spend that comes from Order Fees.

**Shipping Spend**:
The part of Fee Spend that comes from Shipping Fees on Paid Orders. Paid Orders with free shipping still count when myakiba calculates the number of Orders and any average based on that number.

**Unpaid Costs**:
The Order Total of each Unpaid Order: its Order Fees and the saved price of each of its Order Items. They are what is still owed, so a date range does not narrow them, and they do not count as Order Spend or Shipping Spend.
_Avoid_: Unpaid commitments, Unpaid

**Scoped Shop Spend**:
Spend assigned to a Shop in one Expense Scope. Collection uses the Collection Item's Shop; Orders and Shipping use the Order's Shop, and a blank Shop is shown as Unassigned.

**Realized Expense Date**:
For an Order, the Realized Expense Date is the first available Payment Date, Collection Date, Shipping Date, Order Date, or Order Release Date, checked in that order. A Collection Item checks its own first four dates in the same order, then all five dates on its linked Order.
_Avoid_: Transaction date

**Undated Spend**:
Spend with no Realized Expense Date. It appears in all-time totals and breakdowns that do not use dates, but not in views with a date range or charts arranged by date.

**Average Order Spend**:
Order Spend divided by the number of Paid Orders.

**Average Collection Item Spend**:
Collection Spend divided by the number of Collection Items whose prices it adds.

**Average Order Item Spend**:
Order Item Spend divided by the number of Order Items it counts.

### Analytics

**Analytics Spend**:
Collection Spend shown under a matching Item Entry, the Collection Item's named Shop, or the Scale of a Prepainted Item. One Collection Item can add its full price to several Item Entries, so Item Entry row totals should not be added together.

**Unique Count**:
How many different Item Entries, Shops, or Scales appear in one Analytics section. It is not the number of different Collection Items.
_Avoid_: Unique Owned

### Adding items

Use Add for the header button and the Add Page; keep full action names for destinations.

**Add Page**:
The page where a user chooses where Items go. Its rows come from Picks and from a search of your Item Database; one commit sends the selected rows to the Collection, a new or existing Order, or neither, and optionally to the Wishlist and Lists. Its rows live only in that browser tab. It shows at most 100 rows; Items past that wait and become rows as rows are committed or removed.
_Avoid_: Add menu, Add tray, sheet

**Pick**:
Choosing the MyFigureCollection Item page you are viewing with the Browser Extension's Pick for myakiba button. The extension keeps the page and its picture in the browser until the Add Page saves the Item.
_Avoid_: Import, bookmark

**Add to item database**:
Saving a Pick: myakiba reads the picked page and adds its Item to your Item Database, or reuses your Item already there. It never reuses or changes another user's Item for the same page, and it creates no Collection Item.
_Avoid_: Sync Items, Add to collection when only Items are being added to the Item Database

**Add to collection**:
On the Add Page, creating one Owned Collection Item per selected row. Items not yet owned go through Create order or Add to order.
_Avoid_: Sync Collection

**Create order**:
On the Add Page, creating an Order whose Order Items copy its status, Shop, dates and Shipping Method.
_Avoid_: Sync Order, Add to order when creating a new Order

**Add to order**:
On the Add Page, adding Order Items to an existing Order; they copy its status, Shop, dates and Shipping Method.
_Avoid_: Sync Order Items

**Item Refresh**:
An update of a MyFigureCollection Item using current MyFigureCollection data. The action is called Refresh item details, and its update is visible only to you. On each Collection Item linked to that Item, a Selected Item Release stays when the page still lists it, moves to the Item Release it became when Item Refresh can tell which one, and is cleared otherwise.
_Avoid_: Catalog Item Refresh, Item Resync, refresh my item

**Browser Extension**:
The myakiba extension for desktop Chrome, other Chromium browsers, and Firefox. It keeps the MFC Item page a user picks, and fetches an MFC page only for an Item Refresh, with the user's own MFC sign-in.
_Avoid_: Plugin, add-on

**Extension Listing**:
A store's public page for the Browser Extension: the Chrome Web Store for Chromium browsers, and Firefox Add-ons for Firefox. Each store reviews and lists it on its own; until a store has an Extension Listing, visitors whose browser uses that store are told the extension is under review.
_Avoid_: Release state, released when a store is meant
