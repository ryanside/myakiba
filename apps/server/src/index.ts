import "dotenv/config";
import { auth } from "@myakiba/auth";
import { env } from "@myakiba/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import syncRouter, { websocket } from "./routers/sync";
import dashboardRouter from "./routers/dashboard";
import analyticsRouter from "./routers/analytics";
import ordersRouter from "./routers/orders";
import collectionRouter from "./routers/collection";
import itemsRouter from "./routers/items";
import entriesRouter from "./routers/entries";
import searchRouter from "./routers/search";
import settingsRouter from "./routers/settings";
import waitlistRouter from "./routers/waitlist";

const app = new Hono<{
  Variables: Variables;
}>();

app.use(logger());
app.use(
  "/*",
  cors({
    origin:
      env.CORS_ORIGIN.split(",").map((origin: string) => origin.trim()),
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-captcha-response"],
    credentials: true,
  })
);

app.use(
  csrf({
    origin:
      env.CORS_ORIGIN.split(",").map((origin: string) => origin.trim()),
  })
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }

  c.set("user", session.user);
  c.set("session", session.session);
  return next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

const routes = app
  .basePath("/api")
  .get("/version", (c) => c.json({ buildId: env.BUILD_ID }))
  .route("/sync", syncRouter)
  .route("/dashboard", dashboardRouter)
  .route("/analytics", analyticsRouter)
  .route("/orders", ordersRouter)
  .route("/collection", collectionRouter)
  .route("/items", itemsRouter)
  .route("/entries", entriesRouter)
  .route("/search", searchRouter)
  .route("/settings", settingsRouter)
  .route("/waitlist", waitlistRouter);

app.get("*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

export default {
  fetch: app.fetch,
  websocket,
};

export type AppType = typeof routes;
export type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};
