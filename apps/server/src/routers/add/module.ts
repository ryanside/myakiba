import { inArray, sql } from "drizzle-orm";
import { Result } from "better-result";
import { item } from "@myakiba/db/schema/figure";
import { command, query } from "@/domain/kernel";
import { itemSummaryColumns } from "@/lib/item-summaries";
import { latestRelease } from "@/lib/latest-release";
import { writeCommit } from "./commit";
import { commitOnce } from "./commit-record";
import type { AddCommit, AddItemsQuery } from "./model";

export const Add = {
  items: query(
    { action: "add.items", failure: "Failed to load the items to add", snapshot: true },
    async (scope, { ids }: AddItemsQuery) => {
      const release = latestRelease(scope.tx);
      const rows = await scope.tx
        .select({
          itemId: item.id,
          externalId: item.externalId,
          title: item.title,
          image: item.image,
          category: item.category,
          releaseId: release.id,
          releaseDate: release.date,
          releasePrice: release.price,
          releasePriceCurrency: release.priceCurrency,
          ...itemSummaryColumns(scope.tx, scope.viewer.userId),
        })
        .from(item)
        .leftJoinLateral(release, sql`TRUE`)
        .where(inArray(item.id, ids));
      const rowById = new Map(rows.map((row) => [row.itemId, row]));

      const items = ids.flatMap((id) => {
        const row = rowById.get(id);
        if (!row) return [];
        return [
          {
            itemId: row.itemId,
            externalId: row.externalId,
            title: row.title,
            image: row.image,
            category: row.category,
            latestRelease:
              row.releaseId === null || row.releaseDate === null
                ? null
                : {
                    id: row.releaseId,
                    date: row.releaseDate,
                    price: row.releasePrice,
                    priceCurrency: row.releasePriceCurrency,
                  },
            collectionCount: row.collectionCount,
            wishlisted: row.wishlisted,
          },
        ];
      });
      scope.log.set({ add: { requested: ids.length, found: items.length } });
      return Result.ok({ items });
    },
  ),

  commit: command(
    { action: "add.commit", failure: "Failed to add the items" },
    async (scope, input: AddCommit & { readonly currency: string }) => {
      const { commitId, currency, ...choices } = input;
      const { ownership } = choices;
      scope.log.set({
        add: {
          rows: choices.rows.length,
          ownership: ownership.kind === "order" ? `order:${ownership.order.kind}` : ownership.kind,
          wishlist: choices.wishlist,
          lists: choices.listIds.length,
        },
      });
      const userId = scope.viewer.userId;
      const once = await commitOnce(scope.tx, { userId, commitId }, choices, () =>
        writeCommit(scope.tx, userId, choices, currency),
      );
      if (once.isErr()) return once;
      scope.log.set({ add: { repeated: once.value.repeated } });
      return Result.ok(once.value.answer);
    },
  ),
};
