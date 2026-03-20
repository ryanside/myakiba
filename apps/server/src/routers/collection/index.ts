import { Elysia, status } from "elysia";
import CollectionService from "./service";
import {
  collectionQuerySchema,
  collectionParamSchema,
  collectionUpdateSchema,
  collectionDeleteSchema,
} from "./model";
import { tryCatch } from "@myakiba/utils/result";
import { betterAuth } from "@/middleware/better-auth";
import { evlog } from "evlog/elysia";

const collectionRouter = new Elysia({ prefix: "/collection" })
  .use(betterAuth)
  .use(evlog())
  .get(
    "/",
    async ({ query, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({ action: "collection.list", user: { id: user.id } });

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
          query.search,
        ),
      );

      if (error) {
        log.error(error, { step: "getCollection", outcome: "error" });
        return status(500, "Failed to get collection table");
      }

      const serializedItems = collection.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }));

      log.set({ collection: { resultCount: serializedItems.length }, outcome: "success" });
      return serializedItems;
    },
    { query: collectionQuerySchema, auth: true },
  )
  .get(
    "/:id",
    async ({ params, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({ action: "collection.get", user: { id: user.id }, collection: { id: params.id } });

      const { data: collectionItem, error } = await tryCatch(
        CollectionService.getCollectionItem(user.id, params.id),
      );

      if (error) {
        if (error.message === "COLLECTION_ITEM_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Collection item not found");
        }

        log.error(error, { step: "getCollectionItem", outcome: "error" });
        return status(500, "Failed to get collection item");
      }

      log.set({ outcome: "success" });
      return {
        collectionItem: {
          ...collectionItem,
          createdAt: collectionItem.createdAt.toISOString(),
          updatedAt: collectionItem.updatedAt.toISOString(),
        },
      };
    },
    { params: collectionParamSchema, auth: true },
  )
  .put(
    "/:id",
    async ({ params, body, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "collection.update",
        user: { id: user.id },
        collection: { id: params.id },
      });

      const { data: update, error } = await tryCatch(
        CollectionService.updateCollectionItem(user.id, params.id, body),
      );

      if (error) {
        if (error.message === "COLLECTION_ITEM_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Collection item not found");
        }

        log.error(error, { step: "updateCollectionItem", outcome: "error" });
        return status(500, "Failed to update collection item");
      }

      log.set({ outcome: "success" });
      return { update };
    },
    { body: collectionUpdateSchema, params: collectionParamSchema, auth: true },
  )
  .delete(
    "/:id",
    async ({ params, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "collection.delete",
        user: { id: user.id },
        collection: { id: params.id },
      });

      const { data: deleted, error } = await tryCatch(
        CollectionService.deleteCollectionItem(user.id, params.id),
      );

      if (error) {
        if (error.message === "COLLECTION_ITEM_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Collection item not found");
        }

        log.error(error, { step: "deleteCollectionItem", outcome: "error" });
        return status(500, "Failed to delete collection item");
      }

      log.set({ outcome: "success" });
      return { deleted };
    },
    { params: collectionParamSchema, auth: true },
  )
  .delete(
    "/",
    async ({ body, user, log }) => {
      if (!user) {
        log.set({ outcome: "unauthorized" });
        return status(401, "Unauthorized");
      }

      log.set({
        action: "collection.bulkDelete",
        user: { id: user.id },
        collection: { itemCount: body.ids.length },
      });

      const { error } = await tryCatch(CollectionService.deleteCollectionItems(user.id, body.ids));

      if (error) {
        if (error.message === "COLLECTION_ITEMS_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Collection item(s) not found");
        }

        log.error(error, { step: "deleteCollectionItems", outcome: "error" });
        return status(500, "Failed to delete collection item(s)");
      }

      log.set({ outcome: "success" });
      return "Collection item(s) deleted successfully";
    },
    { body: collectionDeleteSchema, auth: true },
  );

export default collectionRouter;
