import "dotenv/config";
import { auth } from "./lib/auth";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import syncRouter from "./routers/sync";
import dashboardRouter from "./routers/dashboard";
import analyticsRouter from "./routers/analytics";
import galleryRouter from "./routers/gallery";
import ordersRouter from "./routers/orders";
import managerRouter from "./routers/manager";
import wrappedRouter from "./routers/wrapped";
import itemsRouter from "./routers/items";

const app = new Hono<{
  Variables: Variables;
}>();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN || "",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-captcha-response"],
    credentials: true,
  })
);

app.use(
  csrf({
    origin: process.env.CORS_ORIGIN || "",
  })
);

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

app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

const routes = app
  .basePath("/api")
  .route("/sync", syncRouter)
  .route("/dashboard", dashboardRouter)
  .route("/analytics", analyticsRouter)
  .route("/gallery", galleryRouter)
  .route("/orders", ordersRouter)
  .route("/manager", managerRouter)
  .route("/wrapped", wrappedRouter)
  .route("/items", itemsRouter);

app.get("*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

export default app;
export type AppType = typeof routes;
export type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};
