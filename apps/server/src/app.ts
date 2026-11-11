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

/** Room for an upload's multipart framing, which measured 505 bytes, and long file names. */
const MULTIPART_SLACK_BYTES = 64 * 1024;
/** The largest legitimate request is an Item upload: its page and its picture. */
const MAX_REQUEST_BODY_BYTES = MAX_ITEM_PAGE_BYTES + MAX_ITEM_PICTURE_BYTES + MULTIPART_SLACK_BYTES;

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

/** The static plugin tests a string pattern with `pattern.includes(file)`, so only a RegExp excludes. */
const HTML_FILE = /\.html$/u;
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gu;

/**
 * Images allow any `https:` source because a custom Item's picture may be any URL. The charts,
 * Base UI and index.html add `<style>` elements, so styles need `'unsafe-inline'`.
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
      // privateApi checks the session only after Elysia parses the body, so a request with no
      // session cookie is refused here, before its body is read. Preflights carry no cookie.
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
      // Every HTML response comes from serveIndexHtml, which sets the CSP and X-Frame-Options.
      .get("/", () => serveIndexHtml(serverDistPath))
      .get("/index.html", () => serveIndexHtml(serverDistPath))
      .use(
        staticPlugin({
          assets: serverDistPath,
          prefix: "/",
          ignorePatterns: [HTML_FILE],
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
