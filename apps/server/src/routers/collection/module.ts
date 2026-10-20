import { and, arrayContains, eq, gte, ilike, inArray, lte, sql } from "drizzle-orm";
import { advanceOrderReleaseDatesForCollectionItems } from "@myakiba/db/order-release-date";
import { collection, entry_to_item, item, item_release } from "@myakiba/db/schema/figure";
import { command, fail, ok, paginate, query } from "@/domain/kernel";
import type { CollectionQuery, CollectionUpdateType } from "./model";

const withTimestampStrings = <T extends { readonly createdAt: Date; readonly updatedAt: Date }>(
  row: T,
) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });

export const Collection = {
  list: query(
    { action: "collection.list", failure: "Failed to get collection table" },
    async (scope, input: CollectionQuery) => {
      const filters = and(
        eq(collection.userId, scope.viewer.userId),
        eq(collection.status, "Owned"),
        input.shop ? inArray(collection.shop, input.shop) : undefined,
        input.paidMin === undefined ? undefined : gte(collection.price, input.paidMin),
        input.paidMax === undefined ? undefined : lte(collection.price, input.paidMax),
        input.payDateStart ? gte(collection.paymentDate, input.payDateStart) : undefined,
        input.payDateEnd ? lte(collection.paymentDate, input.payDateEnd) : undefined,
        input.shipDateStart ? gte(collection.shippingDate, input.shipDateStart) : undefined,
        input.shipDateEnd ? lte(collection.shippingDate, input.shipDateEnd) : undefined,
        input.colDateStart ? gte(collection.collectionDate, input.colDateStart) : undefined,
        input.colDateEnd ? lte(collection.collectionDate, input.colDateEnd) : undefined,
        input.shipMethod ? inArray(collection.shippingMethod, input.shipMethod) : undefined,
        input.category ? inArray(item.category, input.category) : undefined,
        input.scale ? inArray(item.scale, input.scale) : undefined,
        input.tags ? arrayContains(collection.tags, input.tags) : undefined,
        input.condition ? inArray(collection.condition, input.condition) : undefined,
        input.relDateStart ? gte(item_release.date, input.relDateStart) : undefined,
        input.relDateEnd ? lte(item_release.date, input.relDateEnd) : undefined,
        input.relPriceMin === undefined ? undefined : gte(item_release.price, input.relPriceMin),
        input.relPriceMax === undefined ? undefined : lte(item_release.price, input.relPriceMax),
        input.relCurrency && input.relCurrency.length > 0
          ? inArray(item_release.priceCurrency, input.relCurrency)
          : undefined,
        input.entries && input.entries.length > 0
          ? inArray(
              item.id,
              scope.tx
                .select({ itemId: entry_to_item.itemId })
                .from(entry_to_item)
                .where(inArray(entry_to_item.entryId, input.entries)),
            )
          : undefined,
        input.search ? ilike(item.title, `%${input.search}%`) : undefined,
      );

      const select = {
        id: collection.id,
        orderId: collection.orderId,
        itemId: item.id,
        itemExternalId: item.externalId,
        itemTitle: item.title,
        itemImage: item.image,
        itemCategory: item.category,
        itemScale: item.scale,
        status: collection.status,
        count: collection.count,
        score: collection.score,
        price: collection.price,
        shop: collection.shop,
        condition: collection.condition,
        orderDate: collection.orderDate,
        paymentDate: collection.paymentDate,
        shippingDate: collection.shippingDate,
        collectionDate: collection.collectionDate,
        shippingMethod: collection.shippingMethod,
        tags: collection.tags,
        notes: collection.notes,
        releaseId: collection.releaseId,
        releaseDate: item_release.date,
        releasePrice: item_release.price,
        releaseCurrency: item_release.priceCurrency,
        releaseBarcode: item_release.barcode,
        releaseType: item_release.type,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      };
      const rows = (fields: typeof select) =>
        scope.tx
          .select(fields)
          .from(collection)
          .innerJoin(item, eq(collection.itemId, item.id))
          .leftJoin(item_release, eq(collection.releaseId, item_release.id))
          .where(filters)
          .$dynamic();

      const page = await paginate(scope, input, {
        select,
        rows,
        sortBy: {
          itemTitle: item.title,
          itemCategory: item.category,
          itemScale: item.scale,
          status: collection.status,
          count: collection.count,
          score: collection.score,
          price: collection.price,
          shop: sql`LOWER(${collection.shop})`,
          orderDate: collection.orderDate,
          paymentDate: collection.paymentDate,
          shippingDate: collection.shippingDate,
          releaseDate: item_release.date,
          collectionDate: collection.collectionDate,
          createdAt: collection.createdAt,
        },
        tiebreak: [collection.createdAt, collection.id],
        totals: {
          totalValue: { sum: collection.price },
          totalItemsThisMonth: {
            count: sql`${collection.collectionDate} >= date_trunc('month', CURRENT_DATE)::date`,
          },
        },
      });

      const result = {
        ...page,
        items: page.items.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
      };
      scope.log.set({ collection: { resultCount: result.items.length } });
      return ok(result);
    },
  ),

  get: query(
    { action: "collection.get", failure: "Failed to get collection item" },
    async (scope, input: { readonly id: string }) => {
      scope.log.set({ collection: { id: input.id } });
      const [found] = await scope.tx
        .select({
          id: collection.id,
          orderId: collection.orderId,
          itemId: item.id,
          itemExternalId: item.externalId,
          itemTitle: item.title,
          itemImage: item.image,
          itemCategory: item.category,
          itemScale: item.scale,
          status: collection.status,
          count: collection.count,
          score: collection.score,
          price: collection.price,
          shop: collection.shop,
          orderDate: collection.orderDate,
          paymentDate: collection.paymentDate,
          shippingDate: collection.shippingDate,
          collectionDate: collection.collectionDate,
          shippingMethod: collection.shippingMethod,
          tags: collection.tags,
          notes: collection.notes,
          releaseId: collection.releaseId,
          releaseDate: item_release.date,
          releasePrice: item_release.price,
          releaseCurrency: item_release.priceCurrency,
          createdAt: collection.createdAt,
          updatedAt: collection.updatedAt,
        })
        .from(collection)
        .innerJoin(item, eq(collection.itemId, item.id))
        .leftJoin(item_release, eq(collection.releaseId, item_release.id))
        .where(and(eq(collection.userId, scope.viewer.userId), eq(collection.id, input.id)));
      if (!found) return fail("not_found", "Collection item not found");

      return ok({
        collectionItem: {
          ...found,
          createdAt: found.createdAt.toISOString(),
          updatedAt: found.updatedAt.toISOString(),
        },
      });
    },
  ),

  update: command(
    { action: "collection.update", failure: "Failed to update collection item" },
    async (scope, input: { readonly id: string; readonly update: CollectionUpdateType }) => {
      scope.log.set({ collection: { id: input.id } });
      const selected = and(eq(collection.userId, scope.viewer.userId), eq(collection.id, input.id));
      const [existing] = await scope.tx
        .select({ releaseId: collection.releaseId })
        .from(collection)
        .where(selected);
      if (!existing) return fail("not_found", "Collection item not found");

      const updated = await scope.tx
        .update(collection)
        .set({ ...input.update, updatedAt: new Date() })
        .where(selected)
        .returning();

      if (input.update.releaseId !== null && input.update.releaseId !== existing.releaseId) {
        await advanceOrderReleaseDatesForCollectionItems(
          scope.tx,
          updated.map(({ id }) => id),
        );
      }

      const [update] = updated;
      return ok({ update: update && withTimestampStrings(update) });
    },
  ),

  remove: command(
    { action: "collection.delete", failure: "Failed to delete collection item" },
    async (scope, input: { readonly id: string }) => {
      scope.log.set({ collection: { id: input.id } });
      const [deleted] = await scope.tx
        .delete(collection)
        .where(and(eq(collection.userId, scope.viewer.userId), eq(collection.id, input.id)))
        .returning();
      if (!deleted) return fail("not_found", "Collection item not found");

      return ok({ deleted: withTimestampStrings(deleted) });
    },
  ),

  removeMany: command(
    { action: "collection.bulkDelete", failure: "Failed to delete collection item(s)" },
    async (scope, input: { readonly ids: string[] }) => {
      scope.log.set({ collection: { itemCount: input.ids.length } });
      const deleted = await scope.tx
        .delete(collection)
        .where(and(eq(collection.userId, scope.viewer.userId), inArray(collection.id, input.ids)))
        .returning();
      if (deleted.length === 0 || deleted.length < new Set(input.ids).size) {
        return fail("not_found", "Collection item(s) not found");
      }

      return ok("Collection item(s) deleted successfully");
    },
  ),
};
