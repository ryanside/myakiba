import { Hono } from "hono";
import type { Variables } from "../..";
import { zValidator } from "@hono/zod-validator";
import GalleryService from "./service";
import { galleryQuerySchema } from "./model";
import { tryCatch } from "@/lib/utils";

const galleryRouter = new Hono<{
  Variables: Variables;
}>().get(
  "/",
  zValidator("query", galleryQuerySchema, (result, c) => {
    if (!result.success) {
      console.log(result.error);
      return c.text("Invalid request!", 400);
    }
  }),
  async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const validatedQuery = c.req.valid("query");

    const { data: gallery, error } = await tryCatch(
      GalleryService.getGallery(
        user.id,
        validatedQuery.group,
        validatedQuery.paid,
        validatedQuery.shop,
        validatedQuery.payDate,
        validatedQuery.shipDate,
        validatedQuery.colDate,
        validatedQuery.shipMethod,
        validatedQuery.relDate,
        validatedQuery.relPrice,
        validatedQuery.relCurrency,
        validatedQuery.category,
        validatedQuery.entries,
        validatedQuery.scale,
        validatedQuery.tags,
        validatedQuery.condition
      )
    );

    if (error) {
      if (error.message === "UNSUPPORTED_GROUPING_TYPE") {
        return c.text("Unsupported grouping type", 400);
      }

      console.error("Error fetching gallery:", error, {
        userId: user.id,
        group: validatedQuery.group,
        filters: {
          paid: validatedQuery.paid,
          shop: validatedQuery.shop,
          category: validatedQuery.category,
          entries: validatedQuery.entries,
          scale: validatedQuery.scale,
        },
      });

      return c.text("Failed to get gallery", 500);
    }

    return c.json({ gallery });
  }
);

export default galleryRouter;
