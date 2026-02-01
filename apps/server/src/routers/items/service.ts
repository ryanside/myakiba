import { db } from "@myakiba/db";
import {
  collection,
  entry,
  entry_to_item,
  item,
  item_release,
  order,
} from "@myakiba/db/schema/figure";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { ItemReleasesResponse, ItemRelease, EntriesWithRoles, CustomItemInput } from "./model";

class ItemService {
  async createCustomItem(input: CustomItemInput) {
    return await db.transaction(async (tx) => {
      const [createdItem] = await tx
        .insert(item)
        .values({
          title: input.title,
          category: input.category,
          version: input.version ?? [],
          scale: input.scale ?? undefined,
          height: input.height ?? null,
          width: input.width ?? null,
          depth: input.depth ?? null,
          image: input.image ?? null,
          source: "custom",
          externalId: null,
        })
        .returning({
          id: item.id,
          externalId: item.externalId,
          source: item.source,
          title: item.title,
          category: item.category,
          version: item.version,
          scale: item.scale,
          height: item.height,
          width: item.width,
          depth: item.depth,
          image: item.image,
        });

      if (!createdItem) {
        throw new Error("FAILED_TO_CREATE_CUSTOM_ITEM");
      }

      const entryLinks = input.entries ?? [];
      const entryIds = [
        ...new Set(
          entryLinks
            .map((entryLink) => entryLink.entryId)
            .filter((entryId): entryId is string => Boolean(entryId)),
        ),
      ];

      const existingEntries =
        entryIds.length > 0
          ? await tx
              .select({
                id: entry.id,
                name: entry.name,
                category: entry.category,
              })
              .from(entry)
              .where(inArray(entry.id, entryIds))
          : [];

      const existingEntriesById = new Map(
        existingEntries.map((existingEntry) => [existingEntry.id, existingEntry]),
      );

      if (entryIds.length > existingEntries.length) {
        throw new Error("ENTRY_NOT_FOUND");
      }

      for (const entryLink of entryLinks) {
        if (!entryLink.entryId) {
          continue;
        }
        const matchedEntry = existingEntriesById.get(entryLink.entryId);
        if (!matchedEntry) {
          throw new Error("ENTRY_NOT_FOUND");
        }
        if (matchedEntry.category !== entryLink.category) {
          throw new Error("ENTRY_CATEGORY_MISMATCH");
        }
      }

      const namedEntryLinks = entryLinks.filter(
        (entryLink) => !entryLink.entryId && entryLink.name,
      );
      const uniqueNamedEntries = [
        ...new Map(
          namedEntryLinks.map((entryLink) => [
            `${entryLink.name}|${entryLink.category}`,
            entryLink,
          ]),
        ).values(),
      ];

      const existingNamedEntries =
        uniqueNamedEntries.length > 0
          ? await tx
              .select({
                id: entry.id,
                name: entry.name,
                category: entry.category,
              })
              .from(entry)
              .where(
                or(
                  ...uniqueNamedEntries.map((entryLink) =>
                    and(
                      eq(entry.name, entryLink.name ?? ""),
                      eq(entry.category, entryLink.category),
                    ),
                  ),
                ),
              )
          : [];

      const existingNamedEntriesByKey = new Map(
        existingNamedEntries.map((existingEntry) => [
          `${existingEntry.name}|${existingEntry.category}`,
          existingEntry,
        ]),
      );

      const entriesToCreate = uniqueNamedEntries.filter(
        (entryLink) => !existingNamedEntriesByKey.has(`${entryLink.name}|${entryLink.category}`),
      );

      const entriesToInsert: Array<typeof entry.$inferInsert> = entriesToCreate.map(
        (entryLink) => ({
          name: entryLink.name ?? "",
          category: entryLink.category,
          source: "custom",
          externalId: null,
        }),
      );

      const createdEntries =
        entriesToInsert.length > 0
          ? await tx.insert(entry).values(entriesToInsert).returning({
              id: entry.id,
              name: entry.name,
              category: entry.category,
            })
          : [];

      const entriesByNameCategory = new Map(
        [...existingNamedEntries, ...createdEntries].map((entryRecord) => [
          `${entryRecord.name}|${entryRecord.category}`,
          entryRecord,
        ]),
      );

      const entryToItemLinks = entryLinks
        .map((entryLink) => {
          if (entryLink.entryId) {
            return {
              entryId: entryLink.entryId,
              role: entryLink.role ?? "",
              category: entryLink.category,
              name: existingEntriesById.get(entryLink.entryId)?.name ?? "",
            };
          }

          const lookupKey = `${entryLink.name}|${entryLink.category}`;
          const matchedEntry = entriesByNameCategory.get(lookupKey);
          if (!matchedEntry) {
            return null;
          }
          return {
            entryId: matchedEntry.id,
            role: entryLink.role ?? "",
            category: matchedEntry.category,
            name: matchedEntry.name,
          };
        })
        .filter(
          (
            entryLink,
          ): entryLink is {
            entryId: string;
            role: string;
            category: string;
            name: string;
          } => entryLink !== null,
        );

      if (entryToItemLinks.length > 0) {
        await tx
          .insert(entry_to_item)
          .values(
            entryToItemLinks.map((entryLink) => ({
              entryId: entryLink.entryId,
              itemId: createdItem.id,
              role: entryLink.role,
            })),
          )
          .onConflictDoNothing({
            target: [entry_to_item.entryId, entry_to_item.itemId],
          });
      }

      const releasesToInsert = (input.releases ?? []).map((release) => ({
        itemId: createdItem.id,
        date: release.date,
        type: release.type ?? null,
        price: release.price ?? null,
        priceCurrency: release.priceCurrency ?? null,
        barcode: release.barcode ?? null,
      }));

      const createdReleases =
        releasesToInsert.length > 0
          ? await tx.insert(item_release).values(releasesToInsert).returning({
              id: item_release.id,
              itemId: item_release.itemId,
              date: item_release.date,
              type: item_release.type,
              price: item_release.price,
              priceCurrency: item_release.priceCurrency,
              barcode: item_release.barcode,
            })
          : [];

      const entrySummary = entryToItemLinks.map((entryLink) => ({
        id: entryLink.entryId,
        category: entryLink.category,
        name: entryLink.name,
        role: entryLink.role,
      }));

      return {
        item: {
          ...createdItem,
          releases: createdReleases,
          entries: entrySummary,
        },
      };
    });
  }

  async getItemReleases(itemId: string): Promise<ItemReleasesResponse> {
    const releases = await db
      .select({
        id: item_release.id,
        itemId: item_release.itemId,
        date: item_release.date,
        type: item_release.type,
        price: item_release.price,
        priceCurrency: item_release.priceCurrency,
        barcode: item_release.barcode,
      })
      .from(item_release)
      .where(eq(item_release.itemId, itemId))
      .orderBy(item_release.date);

    if (!releases) {
      throw new Error("FAILED_TO_GET_ITEM_RELEASES");
    }

    return {
      releases,
    };
  }

  async getItem(itemId: string) {
    const itemData = await db
      .select({
        id: item.id,
        externalId: item.externalId,
        source: item.source,
        title: item.title,
        category: item.category,
        version: item.version,
        scale: item.scale,
        height: item.height,
        width: item.width,
        depth: item.depth,
        image: item.image,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        releases: sql<ItemRelease[]>`
          COALESCE(
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', ir.id,
                  'itemId', ir.item_id,
                  'date', ir.date,
                  'type', ir.type,
                  'price', ir.price::text,
                  'priceCurrency', ir.price_currency,
                  'barcode', ir.barcode
                )
                ORDER BY ir.date DESC
              )
              FROM ${item_release} ir
              WHERE ir.item_id = ${item}.id
            ),
            '[]'::json
          )
        `,
        entries: sql<EntriesWithRoles[]>`
          COALESCE(
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', e.id,
                  'category', e.category,
                  'name', e.name,
                  'role', eti.role
                )
              )
              FROM ${entry_to_item} eti
              LEFT JOIN ${entry} e ON eti.entry_id = e.id
              WHERE eti.item_id = ${item}.id
            ),
            '[]'::json
          )
        `,
      })
      .from(item)
      .where(eq(item.id, itemId));

    if (!itemData || itemData.length === 0) {
      throw new Error("ITEM_NOT_FOUND");
    }

    return itemData[0];
  }
  async getItemRelatedOrders(userId: string, itemId: string) {
    const orders = await db
      .select({
        id: order.id,
        title: order.title,
        shop: order.shop,
        releaseDate: order.releaseDate,
        shippingFee: order.shippingFee,
        taxes: order.taxes,
        duties: order.duties,
        tariffs: order.tariffs,
        miscFees: order.miscFees,
      })
      .from(order)
      .leftJoin(collection, eq(order.id, collection.orderId))
      .where(and(eq(collection.itemId, itemId), eq(order.userId, userId)))
      .groupBy(order.id)
      .orderBy(desc(order.releaseDate));

    if (!orders) {
      throw new Error("FAILED_TO_GET_ITEM_RELATED_ORDERS");
    }

    return orders;
  }
  async getItemRelatedCollection(userId: string, itemId: string) {
    const collectionItems = await db
      .select({
        id: collection.id,
        itemId: collection.itemId,
        orderId: collection.orderId,
        status: collection.status,
        count: collection.count,
        releaseId: collection.releaseId,
        score: collection.score,
        price: collection.price,
        shop: collection.shop,
        orderDate: collection.orderDate,
        paymentDate: collection.paymentDate,
        shippingDate: collection.shippingDate,
        collectionDate: collection.collectionDate,
        shippingMethod: collection.shippingMethod,
        tags: collection.tags,
        condition: collection.condition,
        notes: collection.notes,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      })
      .from(collection)
      .where(and(eq(collection.itemId, itemId), eq(collection.userId, userId)))
      .groupBy(collection.id);

    if (!collectionItems) {
      throw new Error("FAILED_TO_GET_ITEM_RELATED_COLLECTION");
    }

    return collectionItems;
  }
}

export default new ItemService();
