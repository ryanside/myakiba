import { Elysia } from "elysia";
import { privateApi } from "./boundary/private-api";
import { publicRoutes } from "./boundary/public-routes";
import analyticsRouter from "./routers/analytics";
import calendarRouter from "./routers/calendar";
import collectionRouter from "./routers/collection";
import dataTransferRouter from "./routers/data-transfer";
import dashboardRouter from "./routers/dashboard";
import expensesRouter from "./routers/expenses";
import itemRouter from "./routers/item";
import listsRouter from "./routers/lists";
import ordersRouter from "./routers/orders";
import searchRouter from "./routers/search";
import settingsRouter from "./routers/settings";
import syncRouter from "./routers/sync";
import wishlistRouter from "./routers/wishlist";

export const routes = new Elysia()
  .use(publicRoutes)
  .use(
    privateApi("/api")
      .use(analyticsRouter)
      .use(calendarRouter)
      .use(collectionRouter)
      .use(dataTransferRouter)
      .use(dashboardRouter)
      .use(expensesRouter)
      .use(itemRouter)
      .use(listsRouter)
      .use(ordersRouter)
      .use(searchRouter)
      .use(settingsRouter)
      .use(syncRouter)
      .use(wishlistRouter),
  );
