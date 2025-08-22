import { Hono } from "hono";
import type { Variables } from "../..";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import CollectionService from "./service";

export const collectionRouter = new Hono<{
  Variables: Variables;
}>()
  .get(
    "/",
    zValidator(
      "query",
      z.object({
        limit: z.coerce.number().optional().default(10),
        offset: z.coerce.number().optional().default(0),
        paid: z.array(z.string()).optional(),
        shop: z
          .union([z.string(), z.array(z.string())])
          .transform((val) => (Array.isArray(val) ? val : [val]))
          .optional(),
        payDate: z.array(z.string()).optional(),
        shipDate: z.array(z.string()).optional(),
        colDate: z.array(z.string()).optional(),
        shipMethod: z
          .union([z.string(), z.array(z.string())])
          .transform((val) => (Array.isArray(val) ? val : [val]))
          .optional(),
        shipFee: z.array(z.string()).optional(),
        relDate: z.array(z.string()).optional(),
        relPrice: z.array(z.string()).optional(),
        relCurrency: z
          .union([z.string(), z.array(z.string())])
          .transform((val) => (Array.isArray(val) ? val : [val]))
          .optional(),
        category: z
          .union([z.string(), z.array(z.string())])
          .transform((val) => (Array.isArray(val) ? val : [val]))
          .optional(),
        entries: z
          .union([z.string(), z.array(z.string())])
          .transform((val) => (Array.isArray(val) ? val : [val]))
          .optional(),
        scale: z
          .union([z.string(), z.array(z.string())])
          .transform((val) => (Array.isArray(val) ? val : [val]))
          .optional(),
        sort: z
          .enum([
            "release",
            "paid",
            "price",
            "score",
            "payDate",
            "shipDate",
            "colDate",
            "shipFee",
            "createdAt",
            "height",
          ])
          .optional()
          .default("createdAt"),
        order: z.enum(["asc", "desc"]).optional().default("desc"),
        group: z
          .enum([
            "Origins",
            "Characters",
            "Companies",
            "Artists",
            "Classifications",
            // "category", // TODO: add category, scale, release grouping
            // "scale",
            // "release",
          ])
          .optional()
          .default(undefined),
      }),
      (result, c) => {
        if (!result.success) {
          console.log(result.error);
          return c.text("Invalid request!", 400);
        }
      }
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validated = c.req.valid("query");

      const collection = await CollectionService.getCollection(
        user.id,
        validated.limit,
        validated.offset,
        validated.paid,
        validated.shop,
        validated.payDate,
        validated.shipDate,
        validated.colDate,
        validated.shipMethod,
        validated.shipFee,
        validated.relDate,
        validated.relPrice,
        validated.relCurrency,
        validated.category,
        validated.entries,
        validated.scale,
        validated.sort,
        validated.order,
        validated.group
      );

      return c.json({ collection });
    }
  )
  .get("/:id", zValidator("param", z.object({ id: z.string() })), async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const validated = c.req.valid("param");

    const collectionItem = await CollectionService.getCollectionItem(
      user.id,
      c.req.param("id")
    );

    return c.json({ collectionItem });
  })
  .put(
    "/:id",
    zValidator(
      "param",
      z.object({
        id: z.string(),
      }),
      (result, c) => {
        if (!result.success) {
          console.log(result.error);
          return c.text("Invalid request param!", 400);
        }
      }
    ),
    zValidator(
      "json",
      z.object({
        status: z.enum(["Owned", "Ordered", "Sold"]),
        count: z.number(),
        score: z.string(),
        price: z.string(),
        shop: z.string(),
        paymentDate: z.string(),
        shippingDate: z.string(),
        collectionDate: z.string(),
        shippingMethod: z.string(),
        shippingFee: z.string(),
        notes: z.string(),
        releaseId: z.uuidv4(),
      }),
      (result, c) => {
        if (!result.success) {
          console.log(result.error);
          return c.text("Invalid request json!", 400);
        }
      }
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validated = c.req.valid("json");

      const update = await CollectionService.updateCollectionItem(
        user.id,
        c.req.param("id"),
        {
          status: validated.status,
          count: validated.count,
          score: validated.score,
          price: validated.price,
          shop: validated.shop,
          paymentDate: validated.paymentDate,
          shippingDate: validated.shippingDate,
          collectionDate: validated.collectionDate,
          shippingMethod: validated.shippingMethod,
          shippingFee: validated.shippingFee,
          notes: validated.notes,
          releaseId: validated.releaseId,
        }
      );

      return c.json({ update });
    }
  )
  .delete("/:id", async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const deleted = await CollectionService.deleteCollectionItem(
      user.id,
      c.req.param("id")
    );

    return c.json({ deleted });
  })
  .delete(
    "/",
    zValidator(
      "json",
      z.object({
        ids: z.array(z.string()),
      }),
      (result, c) => {
        if (!result.success) {
          console.log(result.error);
          return c.text("Invalid request!", 400);
        }
      }
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validated = c.req.valid("json");

      const deleted = await CollectionService.deleteCollectionItems(
        user.id,
        validated.ids
      );

      return c.json({ deleted });
    }
  );
