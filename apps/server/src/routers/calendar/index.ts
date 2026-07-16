import { Elysia, status } from "elysia";
import { betterAuth } from "@/middleware/better-auth";
import { evlog } from "evlog/elysia";
import { tryCatch } from "@myakiba/utils/result";
import CalendarService from "./service";
import { calendarQuerySchema } from "./model";

const calendarRouter = new Elysia({ prefix: "/calendar" })
  .use(betterAuth)
  .use(evlog())
  .get(
    "/",
    async ({ query, user, log }) => {
      log.set({
        action: "calendar.get",
        user: { id: user.id },
        calendar: { view: query.view, month: query.month, year: query.year },
      });

      if (query.view === "items") {
        const { data, error } = await tryCatch(
          CalendarService.getItems(user.id, query.month, query.year),
        );
        if (error) {
          log.error(error, { step: "calendar.getItems" });
          log.set({ outcome: "error" });
          return status(500, "Failed to get calendar items");
        }
        log.set({ outcome: "success", calendar: { resultCount: data.length } });
        return {
          view: "items" as const,
          month: query.month,
          year: query.year,
          items: data,
        };
      }

      const { data, error } = await tryCatch(
        CalendarService.getOrders(user.id, query.month, query.year),
      );
      if (error) {
        log.error(error, { step: "calendar.getOrders" });
        log.set({ outcome: "error" });
        return status(500, "Failed to get calendar orders");
      }
      log.set({ outcome: "success", calendar: { resultCount: data.length } });
      return {
        view: "orders" as const,
        month: query.month,
        year: query.year,
        orders: data,
      };
    },
    { query: calendarQuerySchema, auth: true },
  );

export default calendarRouter;
