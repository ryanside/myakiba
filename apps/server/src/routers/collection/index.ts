import { Elysia, status } from "elysia";
import CollectionService from "./service";
import {
  collectionQuerySchema,
  collectionParamSchema,
  collectionUpdateSchema,
  collectionDeleteSchema,
} from "./model";
import { tryCatch } from "@myakiba/utils";
import { betterAuth } from "@/middleware/better-auth";
import type { CollectionItem, CollectionQueryResponse } from "@myakiba/types";

const collectionRouter = new Elysia({ prefix: "/collection" })
  .use(betterAuth)
  .get(
    "/",
    async ({ query, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { data: collection, error } = await tryCatch(
        CollectionService.getCollection(
          user.id,
          query.limit,
          query.offset,
          query.sort,
          query.order,
          query.paidMin,
          query.paidMax,
          query.shop,
          query.payDateStart,
          query.payDateEnd,
          query.shipDateStart,
          query.shipDateEnd,
          query.colDateStart,
          query.colDateEnd,
          query.shipMethod,
          query.relDateStart,
          query.relDateEnd,
          query.relPriceMin,
          query.relPriceMax,
          query.relCurrency,
          query.category,
          query.entries,
          query.scale,
          query.tags,
          query.condition,
          query.search
        )
      );

      if (error) {
        console.error("Error fetching collection table:", error, {
          userId: user.id,
          limit: query.limit,
          offset: query.offset,
          sort: query.sort,
          order: query.order,
        });

        return status(500, "Failed to get collection table");
      }

      const serializedItems: readonly CollectionItem[] =
        collection.collectionItems.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        }));

      const response: CollectionQueryResponse = {
        collection: {
          collectionItems: [...serializedItems],
          collectionStats: collection.collectionStats,
        },
      };

      return response;
    },
    { query: collectionQuerySchema, auth: true }
  )
  .get(
    "/:id",
    async ({ params, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { data: collectionItem, error } = await tryCatch(
        CollectionService.getCollectionItem(user.id, params.id)
      );

      if (error) {
        if (error.message === "COLLECTION_ITEM_NOT_FOUND") {
          return status(404, "Collection item not found");
        }

        console.error("Error fetching collection item:", error, {
          userId: user.id,
          collectionId: params.id,
        });

        return status(500, "Failed to get collection item");
      }

      return {
        collectionItem: {
          ...collectionItem,
          createdAt: collectionItem.createdAt.toISOString(),
          updatedAt: collectionItem.updatedAt.toISOString(),
        },
      };
    },
    { params: collectionParamSchema, auth: true }
  )
  .put(
    "/:id",
    async ({ params, body, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { data: update, error } = await tryCatch(
        CollectionService.updateCollectionItem(user.id, params.id, body)
      );

      if (error) {
        if (error.message === "COLLECTION_ITEM_NOT_FOUND") {
          return status(404, "Collection item not found");
        }

        console.error("Error updating collection item:", error, {
          userId: user.id,
          collectionId: params.id,
          updateData: body,
        });

        return status(500, "Failed to update collection item");
      }

      return { update };
    },
    { body: collectionUpdateSchema, params: collectionParamSchema, auth: true }
  )
  .delete(
    "/:id",
    async ({ params, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { data: deleted, error } = await tryCatch(
        CollectionService.deleteCollectionItem(user.id, params.id)
      );

      if (error) {
        if (error.message === "COLLECTION_ITEM_NOT_FOUND") {
          return status(404, "Collection item not found");
        }

        console.error("Error deleting collection item:", error, {
          userId: user.id,
          collectionId: params.id,
        });

        return status(500, "Failed to delete collection item");
      }

      return { deleted };
    },
    { params: collectionParamSchema, auth: true }
  )
  .delete(
    "/",
    async ({ body, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { error } = await tryCatch(
        CollectionService.deleteCollectionItems(user.id, body.ids)
      );

      if (error) {
        if (error.message === "COLLECTION_ITEMS_NOT_FOUND") {
          return status(404, "Collection item(s) not found");
        }

        console.error("Error deleting collection item(s):", error, {
          userId: user.id,
          collectionIds: body.ids,
        });

        return status(500, "Failed to delete collection item(s)");
      }

      return "Collection item(s) deleted successfully";
    },
    { body: collectionDeleteSchema, auth: true }
  );

export default collectionRouter;
