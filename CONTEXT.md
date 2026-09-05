# myakiba

myakiba helps collectors track Japanese pop-culture collectibles, purchases, Orders, personal Lists, and spending. Item means shared collectible information in the Item Database, Collection Item means one user's purchase or ownership details, and Order Item means that Collection Item when it is linked to an Order.

## Language

### Item database

**Item Database**:
All the Items and information about them shared across myakiba.
_Avoid_: Catalog, library

**Item**:
The shared description of one collectible, separate from any one user's purchase or ownership details. An Item can come from MyFigureCollection or be custom.
_Avoid_: Catalog Item, database item, global item

**Item Release**:
A dated release of an Item for sale. One Item can have several Item Releases.
_Avoid_: Catalog Release, release when Order Release Date could also be meant

**Selected Item Release**:
An optional Item Release picked for a Collection Item. It must be a release of that Collection Item's Item.
_Avoid_: Selected Release, Latest release, Order Release Date

**Item Entry**:
A named detail that can be shared by one or more Items, such as an artist, character, or company. Its link to an Item can include extra context, such as an artist's job.
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
One user's purchase or ownership details for an Item. A Collection Item can exist before the user owns it, and several Collection Items can point to the same Item.
_Avoid_: Collection row, Item, owned item

**Order Item**:
A Collection Item attached to an Order. Order Item is another name for that Collection Item while it belongs to the Order, not a separate thing.
_Avoid_: Item, line item

**Acquisition Status**:
An Order and each Collection Item have their own Acquisition Status. Ordered means unpaid, Paid means paid but not shipped, Shipped means sent but not received, and Owned means received.
_Avoid_: Ownership status, Collected status

**Collection Date**:
The date a collector received an Order or Collection Item. Collection Date and Acquisition Status are separate; the final status is called Owned, not Collected.

**Collection Item Count**:
The number of Collection Items, not the number of copies saved inside them. Collection, Order, Calendar, Analytics, and Expense counts all work this way.
_Avoid_: Item count, count when the unit is unclear

### Orders

**Order**:
An Order groups one user's purchase details and Order Fees with any Order Items attached to it. The Order and its Order Items can have different details and statuses.

**Order Fees**:
Amounts saved on the whole Order instead of one Order Item: Shipping Fee, Taxes, Duties, Tariffs, and Miscellaneous Fees.
_Avoid_: Misc, Other fees

**Order Total**:
The saved price of each attached Order Item, added once regardless of its copy count, plus all Order Fees.

**Active Order**:
An Order with a status of Ordered, Paid, or Shipped. An Owned Order is no longer active.

**Paid Order**:
An Order with a status of Paid, Shipped, or Owned. A Payment Date by itself does not make an Order a Paid Order.

**Unpaid Order**:
An Order with an Acquisition Status of Ordered. Its Order Fees and the prices of Order Items whose own Acquisition Status is also Ordered count as Unpaid Costs, not Spend.

**Order Release Date**:
The release date saved for the whole Order. It is separate from the Item Releases picked for its Order Items.
_Avoid_: Item Release, Selected Item Release

**Cascade to Items**:
A choice to copy an Order's Acquisition Status, Shop, Order Date, Payment Date, Shipping Date, Collection Date, or Shipping Method to its Order Items. Details not selected stay separate on the Order and its Order Items.
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

### Expenses

**Expense Scope**:
One of three expense views: Collection, Orders, or Shipping. Each has its own rules for what counts, which Shop to use, and how averages work, so totals from different views can overlap.

**Spend**:
Money that an Expense Scope counts as spent. Unpaid Costs are shown separately and do not count as Spend.
_Avoid_: Cost, Spending, Total Spent when referring to this exact number

**Collection Spend**:
The saved price of each Owned Collection Item, added once regardless of its copy count. This includes both Collection Items outside Orders and Order Items.
_Avoid_: Collection Item Spend

**Order Spend**:
Order Item Spend plus Fee Spend for Paid Orders.

**Order Item Spend**:
The part of Order Spend that comes from Order Item prices.

**Fee Spend**:
The part of Order Spend that comes from Order Fees.

**Shipping Spend**:
The part of Fee Spend that comes from Shipping Fees on Paid Orders. Paid Orders with free shipping still count when myakiba calculates the number of Orders and any average based on that number.

**Unpaid Costs**:
The Order Fees on Unpaid Orders, plus prices from their Order Items whose own Acquisition Status is Ordered. They do not count as Order Spend or Shipping Spend.
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
Collection Spend divided by the number of Owned Collection Items.

**Average Order Item Spend**:
Order Item Spend divided by the number of Order Items attached to Paid Orders.

### Analytics

**Analytics Spend**:
Collection Spend shown under a matching Item Entry, the Collection Item's named Shop, or the Scale of a Prepainted Item. One Collection Item can add its full price to several Item Entries, so Item Entry row totals should not be added together.

**Unique Count**:
How many different Item Entries, Shops, or Scales appear in one Analytics section. It is not the number of different Collection Items.
_Avoid_: Unique Owned

### Imports and data transfer

**Sync**:
Sync brings data from MyFigureCollection into myakiba by finding existing or adding missing shared Items. It can add Collection Items, create Orders, or add Order Items, but it never sends changes back to MyFigureCollection.
_Avoid_: Two-way sync

**Sync Session**:
A saved history of one Sync request and the results it tracks for MyFigureCollection Items. The same MyFigureCollection ID can appear more than once when separate Collection Items were requested.

**Item Refresh**:
An update of a MyFigureCollection Item using current MyFigureCollection data. The shared update is visible to every user and may change or clear Selected Item Releases on Collection Items linked to that Item.
_Avoid_: Catalog Item Refresh, Item Resync, refresh my item

**Data Transfer Archive**:
A myakiba export of all a user's Orders and Collection Items, available only when every Collection Item uses a MyFigureCollection Item. It stores Item references instead of a copy of the Item Database and leaves out Lists, Wishlist, preferences, and Sync Sessions.
_Avoid_: Backup, all your data

**Data Transfer Import**:
Each new Data Transfer Import reuses or adds the needed shared Items and creates new Orders and Collection Items without changing existing ones. Importing the same archive again can create duplicates, and myakiba may replace a missing Selected Item Release with another Item Release or leave it unselected.
