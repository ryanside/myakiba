import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Variables } from "../..";
import { csvItemSchema } from "./model";
import SyncService from "./service";
import { tryCatch } from "@/lib/utils";

const syncRouter = new Hono<{
  Variables: Variables;
}>()
  .get(
    "/",
    zValidator("query", z.object({ jobId: z.string() }), (result, c) => {
      if (!result.success) {
        return c.text("Invalid request!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedQuery = c.req.valid("query");

      const { data: jobStatus, error } = await tryCatch(
        SyncService.getJobStatus(validatedQuery.jobId)
      );

      if (error) {
        if (error.message === "SYNC_JOB_NOT_FOUND") {
          return c.text("Sync job not found", 404);
        }

        console.error("Error fetching job status:", error, {
          userId: user.id,
          jobId: validatedQuery.jobId,
        });

        return c.text("Failed to get sync job status", 500);
      }

      return c.json({
        status: jobStatus.status,
        finished: jobStatus.finished,
        createdAt: jobStatus.createdAt,
      });
    }
  )
  .post(
    "/",
    zValidator("json", z.array(csvItemSchema), (result, c) => {
      if (!result.success) {
        return c.text("Invalid request!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedJSON = c.req.valid("json");

      const items = SyncService.assignOrderIdsAndSanitizeDates(validatedJSON);

      const { data: result, error: processItemsError } = await tryCatch(
        SyncService.processItems(items, user.id)
      );

      if (processItemsError) {
        console.error("Error during processItems:", processItemsError, {
          userId: user.id,
          itemCount: validatedJSON.length,
        });
        return c.text("Failed to process sync request", 500);
      }

      const {
        collectionItems,
        orderItems,
        csvItemsToScrape: scrapeItems,
      } = result;

      if (collectionItems.length > 0) {
        const { error: insertToCollectionAndOrdersError } = await tryCatch(
          SyncService.insertToCollectionAndOrders(collectionItems, orderItems)
        );

        if (insertToCollectionAndOrdersError) {
          console.error(
            "Error during insert to collection and orders:",
            insertToCollectionAndOrdersError,
            {
              userId: user.id,
              itemCount: validatedJSON.length,
            }
          );
          return c.text("Failed to insert to collection and orders", 500);
        }
      }

      let jobId: string | null | undefined = null;
      if (scrapeItems.length > 0) {
        const { data: jobIdData, error: queueNewItemsError } = await tryCatch(
          SyncService.queueNewItems(scrapeItems, user.id)
        );

        if (queueNewItemsError) {
          if (queueNewItemsError.message === "FAILED_TO_QUEUE_SYNC_JOB") {
            return c.text(
              "Failed to queue new items that need to be scraped",
              500
            );
          }
          if (
            queueNewItemsError.message === "FAILED_TO_SET_JOB_STATUS_IN_REDIS"
          ) {
            return c.text("Failed to set job status", 500);
          }
          console.error("Error during queue new items:", queueNewItemsError, {
            userId: user.id,
            itemCount: validatedJSON.length,
          });
          return c.text("Failed to queue new items", 500);
        }

        jobId = jobIdData;
      }

      return c.json({
        message: jobId ? "Job added to queue." : "Sync completed",
        success: true,
        existingItemsToInsert: collectionItems.length,
        newItems: scrapeItems.map((item) => item.id),
        jobId,
      });
    }
  );

export default syncRouter;
