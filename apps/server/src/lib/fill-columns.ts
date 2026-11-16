import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { ItemFill } from "@myakiba/contracts/collection/fill";
import type { OrderFill } from "@myakiba/contracts/orders/fill";
import { collection } from "@myakiba/db/schema/figure";

type CollectionColumns = typeof collection.$inferInsert;

/** What an Order fill writes to each Order and, by Cascade to Items, to each of its items. */
export type CascadeColumns = Partial<Pick<CollectionColumns, OrderFill["field"]>>;

type ItemColumns = Partial<Pick<CollectionColumns, Exclude<ItemFill["field"], "tags">>> & {
  readonly tags?: SQL<string[]>;
};

/** The row's own tags, then each added tag it lacks, in the order sent. */
function withAddedTags(added: readonly string[]): SQL<string[]> {
  const tags = sql.join(
    [...new Set(added)].map((tag) => sql`${tag}`),
    sql`, `,
  );
  return sql<string[]>`${collection.tags} || ARRAY(
    SELECT tag FROM unnest(ARRAY[${tags}]::text[]) WITH ORDINALITY AS added(tag, position)
    WHERE tag <> ALL(${collection.tags})
    ORDER BY position
  )`;
}

/** The column a fill writes. A tags fill adds to each row's tags; every other fill replaces. */
export function fillColumns(fill: OrderFill): CascadeColumns;
export function fillColumns(fill: ItemFill): ItemColumns;
export function fillColumns(fill: ItemFill): ItemColumns {
  switch (fill.field) {
    case "status":
      return { status: fill.value };
    case "paid":
      return { paid: fill.value };
    case "price":
      return { price: fill.value };
    case "count":
      return { count: fill.value };
    case "condition":
      return { condition: fill.value };
    case "shop":
      return { shop: fill.value };
    case "orderDate":
      return { orderDate: fill.value };
    case "paymentDate":
      return { paymentDate: fill.value };
    case "shippingDate":
      return { shippingDate: fill.value };
    case "collectionDate":
      return { collectionDate: fill.value };
    case "shippingMethod":
      return { shippingMethod: fill.value };
    case "score":
      return { score: fill.value };
    case "tags":
      return { tags: withAddedTags(fill.value) };
    case "notes":
      return { notes: fill.value };
  }
}
