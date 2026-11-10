import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { initLogger } from "evlog";

const THEME_SCRIPT = `
      document.documentElement.classList.add("dark");
    `;
const dist = await mkdtemp(path.join(tmpdir(), "html-headers-"));
await writeFile(
  path.join(dist, "index.html"),
  `<!doctype html><html><head><script>${THEME_SCRIPT}</script>` +
    `<script type="module" src="/assets/index.js"></script></head><body></body></html>`,
);
const saved = process.env.STATIC_ASSETS_DIR;
process.env.STATIC_ASSETS_DIR = dist;
afterAll(async () => {
  process.env.STATIC_ASSETS_DIR = saved;
  await rm(dist, { recursive: true, force: true });
});

initLogger({ enabled: false });
const { createApp } = await import("./app");
const app = createApp({ drain: undefined, authDocs: undefined });

const page = (pathname: string) =>
  app.handle(new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }));

function directives(policy: string | null): Record<string, string[]> {
  return Object.fromEntries(
    (policy ?? "")
      .split(";")
      .map((directive) => directive.trim().split(/\s+/u))
      .filter(([name]) => name)
      .map(([name = "", ...sources]) => [name, sources]),
  );
}

test.each(["/", "/dashboard", "/item/some-item"])(
  "the web app at %s may not be framed and runs only its own scripts and Turnstile",
  async (pathname) => {
    const response = await page(pathname);
    const hash = createHash("sha256").update(THEME_SCRIPT).digest("base64");

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
