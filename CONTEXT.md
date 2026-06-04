# Context Glossary

## Expenses

### Total Spend

The full realized spend view for expenses: non-Ordered collection item prices plus paid order fees.

### Shop Spend

Total Spend attributed to a single shop: non-Ordered collection item prices at `collection.shop` plus paid order fees at `order.shop`, each gated by its own expense date axis.

### Order Spend

Spend represented by paid orders: paid order item prices plus paid order fees. Orders with status `Ordered` are not included.

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

Liability from orders with status `Ordered`: item prices on those orders plus attached fees. Filtered by the same realized expense date axis and shop filters as paid spend. Shown separately on Overview; not included in Total Spend, trends, or shipping analytics.

### Undated spend in trends

Collection items and orders without a realized expense date are included in trends **totals** when viewing all time, but excluded from **time-series buckets** (no date to bucket). Overview totals and trends totals should match for the same filters; chart bars may not sum to the header total when undated spend exists.
