import { Elysia, status } from "elysia";
import AnalyticsService from "./service";
import { tryCatch } from "@myakiba/utils/result";
import { betterAuth } from "@/middleware/better-auth";
import { evlog } from "evlog/elysia";
import {
  analyticsSectionItemsQuerySchema,
  analyticsSectionParamSchema,
  analyticsSectionQuerySchema,
} from "./model";

const analyticsRouter = new Elysia({ prefix: "/analytics" })
  .use(betterAuth)
  .use(evlog())
  .get(
    "/",
    async ({ user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({ user: { id: user.id } });

      const { data: analytics, error } = await tryCatch(AnalyticsService.getAnalytics(user.id));

      if (error) {
        log.error(error, { step: "getAnalytics" });
        return status(500, "Failed to get analytics");
      }

      log.set({ outcome: "success" });
      return { analytics };
    },
    { auth: true },
  )
  .get(
    "/:sectionName",
    async ({ params, query, user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({
        action: "analytics.section",
        user: { id: user.id },
        analytics: { section: params.sectionName },
      });

      const { data: analytics, error } = await tryCatch(
        AnalyticsService.getSectionAnalytics(
          user.id,
          params.sectionName,
          query.limit,
          query.offset,
          query.search,
        ),
      );

      if (error) {
        log.error(error, { step: "getSectionAnalytics" });
        return status(500, "Failed to get analytics section");
      }

      log.set({
        analytics: {
          section: params.sectionName,
          resultCount: analytics.rows.length,
          totalCount: analytics.totalCount,
        },
        outcome: "success",
      });
      return { analytics };
    },
    {
      params: analyticsSectionParamSchema,
      query: analyticsSectionQuerySchema,
      auth: true,
    },
  )
  .get(
    "/:sectionName/items",
    async ({ params, query, user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({
        action: "analytics.section_items",
        user: { id: user.id },
        analytics: { section: params.sectionName, match: query.match },
      });

      const { data: items, error } = await tryCatch(
        AnalyticsService.getSectionItems(
          user.id,
          params.sectionName,
          query.match,
          query.limit,
          query.offset,
        ),
      );

      if (error) {
        log.error(error, { step: "getSectionItems" });
        return status(500, "Failed to get analytics section items");
      }

      log.set({
        analytics: {
          section: params.sectionName,
          match: query.match,
          resultCount: items.items.length,
          totalCount: items.totalCount,
        },
        outcome: "success",
      });
      return items;
    },
    {
      params: analyticsSectionParamSchema,
      query: analyticsSectionItemsQuerySchema,
      auth: true,
    },
  );

export default analyticsRouter;
