import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { evlog } from "evlog/elysia";
import { env } from "@myakiba/env/server";
import { openapi } from "@elysiajs/openapi";
import { staticPlugin } from "@elysiajs/static";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as z from "zod";
import { routes } from "./routes";

export type OpenAPIDocumentation = NonNullable<
  NonNullable<Parameters<typeof openapi>[0]>["documentation"]
>;

type AppOptions = {
  readonly drain: NonNullable<Parameters<typeof evlog>[0]>["drain"];
  readonly authDocs: OpenAPIDocumentation | undefined;
};

const resolveServerDistPath = (): string => {
  const candidates: readonly string[] = [
    ...(env.STATIC_ASSETS_DIR ? [env.STATIC_ASSETS_DIR] : []),
    path.resolve(process.cwd(), "dist"),
    path.resolve(process.cwd(), "apps/server/dist"),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.resolve(candidate, "index.html"))) return candidate;
  }

  return path.resolve(process.cwd(), "dist");
};

const serveIndexHtml = async (distDir: string): Promise<Response> => {
  const indexHtmlPath: string = path.resolve(distDir, "index.html");
  const indexHtml: string = await readFile(indexHtmlPath, "utf-8");
  return new Response(indexHtml, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};

/** The whole server: the API, the auth handler and the web app's files. `index.ts` starts it. */
export function createApp({ drain, authDocs }: AppOptions) {
  const serverDistPath = resolveServerDistPath();
  return (
    new Elysia()
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
          exposeHeaders: ["Retry-After"],
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
  );
}

export type App = ReturnType<typeof createApp>;
