import { Hono } from "hono";
import type { Variables } from "../..";
import { zValidator } from "@hono/zod-validator";
import CollectionService from "./service";
import {
  collectionQuerySchema,
  collectionParamSchema,
  collectionUpdateSchema,
  collectionDeleteSchema,
} from "./model";
import { tryCatch } from "@myakiba/utils";

const collectionRouter = new Hono<{
  Variables: Variables;
}>()
  .get(
    "/",
    zValidator("query", collectionQuerySchema, (result, c) => {
      if (!result.success) {
        console.log(result.error);
        return c.text("Invalid request!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedQuery = c.req.valid("query");

      const { data: collection, error } = await tryCatch(
        CollectionService.getCollection(
          user.id,
          validatedQuery.limit,
          validatedQuery.offset,
          validatedQuery.sort,
          validatedQuery.order,
          validatedQuery.paidMin,
          validatedQuery.paidMax,
          validatedQuery.shop,
          validatedQuery.payDateStart,
          validatedQuery.payDateEnd,
          validatedQuery.shipDateStart,
          validatedQuery.shipDateEnd,
          validatedQuery.colDateStart,
          validatedQuery.colDateEnd,
          validatedQuery.shipMethod,
          validatedQuery.relDateStart,
          validatedQuery.relDateEnd,
          validatedQuery.relPriceMin,
          validatedQuery.relPriceMax,
          validatedQuery.relCurrency,
          validatedQuery.category,
          validatedQuery.entries,
          validatedQuery.scale,
          validatedQuery.tags,
          validatedQuery.condition,
          validatedQuery.search
        )
      );

      if (error) {
        console.error("Error fetching collection table:", error, {
          userId: user.id,
          limit: validatedQuery.limit,
          offset: validatedQuery.offset,
          sort: validatedQuery.sort,
          order: validatedQuery.order,
        });

        return c.text("Failed to get collection table", 500);
      }

      return c.json({ collection });
    }
  )
  .get(
    "/:id",
    zValidator("param", collectionParamSchema, (result, c) => {
      if (!result.success) {
        console.log(result.error);
        return c.text("Invalid request param!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedParam = c.req.valid("param");

      const { data: collectionItem, error } = await tryCatch(
        CollectionService.getCollectionItem(user.id, validatedParam.id)
      );

      if (error) {
        if (error.message === "COLLECTION_ITEM_NOT_FOUND") {
          return c.text("Collection item not found", 404);
        }

        console.error("Error fetching collection item:", error, {
          userId: user.id,
          collectionId: validatedParam.id,
        });

        return c.text("Failed to get collection item", 500);
      }

      return c.json({ collectionItem });
    }
  )
  .put(
    "/:id",
    zValidator("param", collectionParamSchema, (result, c) => {
      if (!result.success) {
        console.log(result.error);
        return c.text("Invalid request param!", 400);
      }
    }),
    zValidator("json", collectionUpdateSchema, (result, c) => {
      if (!result.success) {
        console.log(result.error);
        return c.text("Invalid request!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedJSON = c.req.valid("json");
      const validatedParam = c.req.valid("param");

      const { data: update, error } = await tryCatch(
        CollectionService.updateCollectionItem(
          user.id,
          validatedParam.id,
          validatedJSON
        )
      );

      if (error) {
        if (error.message === "COLLECTION_ITEM_NOT_FOUND") {
          return c.text("Collection item not found", 404);
        }

        console.error("Error updating collection item:", error, {
          userId: user.id,
          collectionId: validatedParam.id,
          updateData: validatedJSON,
        });

        return c.text("Failed to update collection item", 500);
      }

      return c.json({ update });
    }
  )
  .delete(
    "/:id",
    zValidator("param", collectionParamSchema, (result, c) => {
      if (!result.success) {
        console.log(result.error);
        return c.text("Invalid request param!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedParam = c.req.valid("param");

      const { data: deleted, error } = await tryCatch(
        CollectionService.deleteCollectionItem(user.id, validatedParam.id)
      );

      if (error) {
        if (error.message === "COLLECTION_ITEM_NOT_FOUND") {
          return c.text("Collection item not found", 404);
        }

        console.error("Error deleting collection item:", error, {
          userId: user.id,
          collectionId: validatedParam.id,
        });

        return c.text("Failed to delete collection item", 500);
      }

      return c.json({ deleted });
    }
  )
  .delete(
    "/",
    zValidator("json", collectionDeleteSchema, (result, c) => {
      if (!result.success) {
        console.log(result.error);
        return c.text("Invalid request!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedJSON = c.req.valid("json");

      const { error } = await tryCatch(
        CollectionService.deleteCollectionItems(user.id, validatedJSON.ids)
      );

      if (error) {
        if (error.message === "COLLECTION_ITEMS_NOT_FOUND") {
          return c.text("Collection item(s) not found", 404);
        }

        console.error("Error deleting collection item(s):", error, {
          userId: user.id,
          collectionIds: validatedJSON.ids,
        });

        return c.text("Failed to delete collection item(s)", 500);
      }

      return c.text("Collection item(s) deleted successfully");
    }
  );

export default collectionRouter;
