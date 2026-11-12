import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { initLogger } from "evlog";

const THEME_SCRIPT = `
      document.documentElement.classList.add("dark");
    `;
const INDEX_HTML =
  `<!doctype html><html><head><script>${THEME_SCRIPT}</script>` +
  `<script type="module" src="/assets/index.js"></script></head><body></body></html>`;
const dist = await mkdtemp(path.join(tmpdir(), "html-headers-"));
await mkdir(path.join(dist, "nested"));
await mkdir(path.join(dist, "assets"));
await writeFile(path.join(dist, "assets", "index.js"), "export {};");
await writeFile(path.join(dist, "index.html"), INDEX_HTML);
await writeFile(path.join(dist, "nested", "index.html"), INDEX_HTML);
await writeFile(path.join(dist, "nested", "page.html"), INDEX_HTML);
const htmlFiles = [...new Bun.Glob("**/*.html").scanSync(dist)];

const saved = { STATIC_ASSETS_DIR: process.env.STATIC_ASSETS_DIR, NODE_ENV: process.env.NODE_ENV };
process.env.STATIC_ASSETS_DIR = dist;
afterAll(async () => {
  Object.assign(process.env, saved);
  await rm(dist, { recursive: true, force: true });
});

initLogger({ enabled: false });
const { createApp } = await import("./app");

// The static plugin reads NODE_ENV when it is created: production registers every file as its own route.
function createAppIn(mode: string) {
  process.env.NODE_ENV = mode;
  const app = createApp({ drain: undefined, authDocs: undefined });
  process.env.NODE_ENV = saved.NODE_ENV;
  return app;
}
const apps = { test: createAppIn("test"), production: createAppIn("production") };

function directives(policy: string | null): Record<string, string[]> {
  return Object.fromEntries(
    (policy ?? "")
      .split(";")
      .map((directive) => directive.trim().split(/\s+/u))
      .filter(([name]) => name)
      .map(([name = "", ...sources]) => [name, sources]),
  );
}

describe.each(Object.entries(apps))("in %s mode", (_mode, app) => {
  const page = (pathname: string) =>
    app.handle(new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }));

  test.each([
    "/",
    "/dashboard",
    "/item/some-item",
    "/index.html",
    "/index.html?x=1",
    "/index.html/",
  ])(
    "the web app at %s may not be framed and runs only its own scripts and Turnstile",
    async (pathname) => {
      const response = await page(pathname);
      const hash = createHash("sha256").update(THEME_SCRIPT).digest("base64");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(directives(response.headers.get("content-security-policy"))).toMatchObject({
        "default-src": ["'self'"],
        "script-src": ["'self'", "https://challenges.cloudflare.com", `'sha256-${hash}'`],
        "frame-src": ["https://challenges.cloudflare.com"],
        "frame-ancestors": ["'none'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'", "http://localhost:3000"],
      });
    },
  );

  test.each(
    htmlFiles.flatMap((file) => {
      const url = `/${file.split(path.sep).join("/")}`;
      const folder = url.slice(0, -"index.html".length);
      return url.endsWith("/index.html") ? [url, folder, folder.slice(0, -1) || "/"] : [url];
    }),
  )("%s serves no HTML without the frame and script headers", async (pathname) => {
    const response = await page(pathname);

    if (!response.headers.get("content-type")?.startsWith("text/html")) return;
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(directives(response.headers.get("content-security-policy"))).toMatchObject({
      "frame-ancestors": ["'none'"],
    });
  });
});

test("production still serves the bundle's other files", async () => {
  const response = await apps.production.handle(new Request("http://localhost/assets/index.js"));

  expect(response.status).toBe(200);
  expect(await response.text()).toBe("export {};");
});
