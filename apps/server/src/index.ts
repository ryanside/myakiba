import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { evlog } from "evlog/elysia";
import { initLogger, log } from "evlog";
import type { DrainContext } from "evlog";
import { createPostHogDrain } from "evlog/posthog";
import { createDrainPipeline } from "evlog/pipeline";
import { OpenAPI } from "@myakiba/auth/server";
import { env } from "@myakiba/env/server";
import { openapi } from "@elysiajs/openapi";
import { staticPlugin } from "@elysiajs/static";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as z from "zod";
import { routes } from "./routes";

const pipeline = createDrainPipeline<DrainContext>({
  batch: { size: 50, intervalMs: 5000 },
  retry: { maxAttempts: 3 },
});
const drain = env.POSTHOG_API_KEY
  ? pipeline(
      createPostHogDrain({
        apiKey: env.POSTHOG_API_KEY,
      }),
    )
  : undefined;
initLogger({ env: { service: "api" } });

log.info({
  msg: "server booting",
  buildId: env.BUILD_ID,
  nodeEnv: process.env.NODE_ENV,
  optionals: {
    posthog: env.POSTHOG_API_KEY !== undefined,
    betterAuthDashboard: env.BETTER_AUTH_API_KEY !== undefined,
  },
});

const includeAuthDocs: boolean = process.env.OPENAPI_AUTH_DOCS === "true";
type OpenAPIDocumentation = NonNullable<
  NonNullable<Parameters<typeof openapi>[0]>["documentation"]
>;

const authDocs = includeAuthDocs
  ? ({
      components: await OpenAPI.components,
      paths: await OpenAPI.getPaths(),
    } as OpenAPIDocumentation)
  : undefined;

log.info({ msg: "auth docs resolved", includeAuthDocs });

const resolveServerDistPath = (): string => {
  const fromEnv: string | undefined = process.env.STATIC_ASSETS_DIR;

  const candidates: readonly string[] = [
    ...(fromEnv ? [fromEnv] : []),
    path.resolve(process.cwd(), "dist"),
    path.resolve(process.cwd(), "apps/server/dist"),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.resolve(candidate, "index.html"))) return candidate;
  }

  return path.resolve(process.cwd(), "dist");
};

const serverDistPath = resolveServerDistPath();

const serveIndexHtml = async (distDir: string): Promise<Response> => {
  const indexHtmlPath: string = path.resolve(distDir, "index.html");
  const indexHtml: string = await readFile(indexHtmlPath, "utf-8");
  return new Response(indexHtml, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};

const app = new Elysia()
  .use(
    evlog({
      drain,
      exclude: ["/health"],
    }),
  )
  .use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-captcha-response"],
      credentials: true,
    }),
  )
  .use(
    openapi({
      mapJsonSchema: {
        zod: z.toJSONSchema,
      },
      documentation: authDocs,
    }),
  )
  .use(routes)
  .get("/", () => serveIndexHtml(serverDistPath))
  .use(
    staticPlugin({
      assets: serverDistPath,
      prefix: "/",
      ignorePatterns: ["index.html"],
    }),
  )
  // SPA fallback (TanStack Router) for deep links, but only for real HTML navigations.
  .get("/*", ({ request, status }) => {
    const pathname: string = new URL(request.url).pathname;
    if (pathname.startsWith("/api")) return status(404, "Not Found");
    if (pathname.includes(".")) return status(404, "Not Found");
    if (!(request.headers.get("accept") ?? "").includes("text/html")) {
      return status(404, "Not Found");
    }

    return serveIndexHtml(serverDistPath);
  })
  .listen(3000, () => {
    log.info({
      msg: "server started",
      port: 3000,
      url: "http://localhost:3000",
    });
  });

export type App = typeof app;
