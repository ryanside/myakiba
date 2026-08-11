# Context Glossary

## Expenses

### Collection Spend

The sum of prices on collection rows whose own status is `Owned`. An Owned row can be standalone or linked to an order.

### Scoped Shop Spend

Spend attributed to a shop within one Expenses dashboard. Collection uses `collection.shop` and Owned item prices. Orders uses `order.shop`, attached item prices, and paid-order fees. Shipping uses `order.shop` and paid-order shipping fees. Blank shops appear as Unassigned.

### Order Spend

Spend represented by paid orders: paid order item prices plus paid order fees. Orders with status `Ordered` are not included.

### Shipping Spend

Shipping fees on paid orders. Orders with status `Ordered` are not included. Free-shipping orders remain in Shipping counts and average denominators.

### Collection Item Spend

Spend represented by collection items. In expenses spend charts, this means items with status `Owned`.

### Order Item Spend

Item subtotals attached to paid orders. Orders with status `Ordered` are not included.

### Fee Spend

Fees attached to paid orders, including shipping, taxes, duties, tariffs, and miscellaneous fees. Orders with status `Ordered` are not included.

### Average Order Spend

Average full paid-order spend (items on the order plus fees), divided by paid order count.

### Average Collection Item Spend

Average price of Owned collection items.

### Average Order Item Spend

Average item price within paid orders, divided by paid order item count.

### Unpaid Costs

Liability from orders with status `Ordered`: item prices on those orders plus attached fees. Filtered by the same realized expense date axis and shop filters as paid spend. Expenses shows this amount as the Orders dashboard's Unpaid KPI. It is not part of paid Order or Shipping spend.

### Expense Item Count

Expenses counts collection rows, not `collection.count`. This rule applies to Collection Items, Order Items, Shops averages, and shipping item-count cohorts.

### Undated spend in charts

Collection items and orders without a realized expense date appear in summaries, KPIs, Breakdown, and Shops when the active date bounds do not exclude them. Chronological charts omit them because they have no period bucket. A dashboard total can therefore differ from its final cumulative chart point.
