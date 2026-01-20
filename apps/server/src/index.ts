import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { logixlysia } from "logixlysia";
import { auth } from "@myakiba/auth";
import { env } from "@myakiba/env/server";
import { openapi } from "@elysiajs/openapi";
import { OpenAPI } from "@myakiba/auth";
import { staticPlugin } from "@elysiajs/static";
import { resolve } from "path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as z from "zod";
import analyticsRouter from "./routers/analytics";
import collectionRouter from "./routers/collection";
import dashboardRouter from "./routers/dashboard";
import entriesRouter from "./routers/entries";
import itemsRouter from "./routers/items";
import ordersRouter from "./routers/orders";
import searchRouter from "./routers/search";
import settingsRouter from "./routers/settings";
import syncRouter from "./routers/sync";
import waitlistRouter from "./routers/waitlist";

const resolveServerDistPath = (): string => {
  const fromEnv: string | undefined = process.env.STATIC_ASSETS_DIR;

  const candidates: readonly string[] = [
    ...(fromEnv ? [fromEnv] : []),
    resolve(process.cwd(), "dist"),
    resolve(process.cwd(), "apps/server/dist"),
  ];

  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, "index.html"))) return candidate;
  }

  // Fall back to the most common runtime layout.
  return resolve(process.cwd(), "dist");
};

const serverDistPath = resolveServerDistPath();

const isHtmlNavigationRequest = (request: Request): boolean => {
  const acceptHeader: string = request.headers.get("accept") ?? "";
  return acceptHeader.includes("text/html");
};

const isAssetPath = (pathname: string): boolean => pathname.includes(".");

const serveIndexHtml = async (distDir: string): Promise<Response> => {
  const indexHtmlPath: string = resolve(distDir, "index.html");
  const indexHtml: string = await readFile(indexHtmlPath, "utf8");
  return new Response(indexHtml, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const app = new Elysia()
  .use(logixlysia())
  .use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-captcha-response"],
      credentials: true,
    })
  )
  .use(
    openapi({
      mapJsonSchema: {
        zod: z.toJSONSchema,
      },
      documentation: {
        components: await OpenAPI.components,
        paths: await OpenAPI.getPaths(),
      },
    })
  )
  .get("/api/auth/*", ({ request }) => auth.handler(request))
  .post("/api/auth/*", ({ request }) => auth.handler(request))
  .get("/health", () => ({ status: "ok" }))
  .group("/api", (app) =>
    app
      .get("/version", () => ({ buildId: env.BUILD_ID }), {
        response: z.object({ buildId: z.string() }),
      })
      .use(analyticsRouter)
      .use(collectionRouter)
      .use(dashboardRouter)
      .use(entriesRouter)
      .use(itemsRouter)
      .use(ordersRouter)
      .use(searchRouter)
      .use(settingsRouter)
      .use(syncRouter)
      .use(waitlistRouter)
  )
  .get("/", () => serveIndexHtml(serverDistPath))
  .use(
    staticPlugin({
      assets: serverDistPath,
      prefix: "/",
      ignorePatterns: ["index.html"],
    })
  )
  // SPA fallback (TanStack Router) for deep links, but only for real HTML navigations.
  .onError(({ code, request }) => {
    if (code !== "NOT_FOUND") return;

    const pathname: string = new URL(request.url).pathname;
    if (pathname.startsWith("/api")) return;
    if (isAssetPath(pathname)) return;
    if (!isHtmlNavigationRequest(request)) return;

    return serveIndexHtml(serverDistPath);
  })
  .listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
  });

export type App = typeof app;
