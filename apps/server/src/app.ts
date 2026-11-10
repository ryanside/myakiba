import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { evlog } from "evlog/elysia";
import { hasSessionCookie } from "@myakiba/auth/server";
import { MAX_ITEM_PAGE_BYTES, MAX_ITEM_PICTURE_BYTES } from "@myakiba/contracts/mfc-items/schema";
import { env } from "@myakiba/env/server";
import { openapi } from "@elysiajs/openapi";
import { staticPlugin } from "@elysiajs/static";
import { createHash } from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as z from "zod";
import { publicRoutes } from "./boundary/public-routes";
import { routes } from "./routes";

export type OpenAPIDocumentation = NonNullable<
  NonNullable<Parameters<typeof openapi>[0]>["documentation"]
>;

type AppOptions = {
  readonly drain: NonNullable<Parameters<typeof evlog>[0]>["drain"];
  readonly authDocs: OpenAPIDocumentation | undefined;
};

/**
 * The largest legitimate request is an Item upload: a 2 MB page and a 10 MB picture. Their
 * multipart framing measured 505 bytes, so 64 KiB leaves room for long file names.
 */
const MAX_REQUEST_BODY_BYTES = MAX_ITEM_PAGE_BYTES + MAX_ITEM_PICTURE_BYTES + 64 * 1024;

const PUBLIC_PATHS = publicRoutes.routes.map((route) => route.path);
const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATHS.some((publicPath) =>
    publicPath.endsWith("*")
      ? pathname.startsWith(publicPath.slice(0, -1))
      : pathname === publicPath,
  );
const needsSession = (pathname: string): boolean =>
  (pathname === "/api" || pathname.startsWith("/api/")) && !isPublicPath(pathname);

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

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gu;

/**
 * The web app runs its bundle and the inline scripts in its own index.html, hashed here so an edit
 * to one cannot slip past, plus Turnstile's widget. Images are `https:` because a custom Item's
 * picture may be any URL; MFC pictures come from the bucket, also `https:`. Its charts and
 * components set inline styles.
 */
function contentSecurityPolicy(html: string): string {
  const hashes = [...html.matchAll(INLINE_SCRIPT)].map(
    ([, script = ""]) => `'sha256-${createHash("sha256").update(script).digest("base64")}'`,
  );
  return [
    "default-src 'self'",
    `script-src 'self' ${TURNSTILE_ORIGIN} ${hashes.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    `connect-src 'self' ${new URL(env.BETTER_AUTH_URL).origin}`,
    `frame-src ${TURNSTILE_ORIGIN}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

const serveIndexHtml = async (distDir: string): Promise<Response> => {
  const indexHtmlPath: string = path.resolve(distDir, "index.html");
  const indexHtml: string = await readFile(indexHtmlPath, "utf-8");
  return new Response(indexHtml, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": contentSecurityPolicy(indexHtml),
      "x-frame-options": "DENY",
    },
  });
};

/** The whole server: the API, the auth handler and the web app's files. `index.ts` starts it. */
export function createApp({ drain, authDocs }: AppOptions) {
  const serverDistPath = resolveServerDistPath();
  return (
    new Elysia({ serve: { maxRequestBodySize: MAX_REQUEST_BODY_BYTES } })
      .use(
        evlog({
          drain,
          // A reset link carries its token in the path, and evlog logs the path.
          exclude: ["/health", "/api/auth/reset-password/*"],
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
      // privateApi checks the session after Elysia parses the body; this refuses a signed-out
      // request before anything reads it. A preflight carries no cookie, so it passes.
      .onRequest(({ request, status }) => {
        if (request.method === "OPTIONS") return;
        if (!needsSession(new URL(request.url).pathname)) return;
        if (!hasSessionCookie(request.headers)) return status(401);
      })
      // The docs page loads an unpinned script from a CDN, so it stays off the production origin.
      .use(
        env.NODE_ENV === "production"
          ? new Elysia()
          : openapi({
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
