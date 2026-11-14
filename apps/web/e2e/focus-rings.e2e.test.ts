// A focused field's ring, laid out by a real browser with the app's stylesheet. Unit tests run in a
// DOM that applies no CSS, so they cannot see an overflow container cut a ring off at its edge.
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import type { Browser } from "playwright";

setDefaultTimeout(120_000);

const WEB = path.join(import.meta.dir, "..");
const out = mkdtempSync(path.join(tmpdir(), "focus-rings-"));
let server: ReturnType<typeof Bun.serve>;
let browser: Browser;

beforeAll(async () => {
  const build = Bun.spawnSync(
    [
      "bun",
      "run",
      "e2e:build:focus-rings",
      "--outDir",
      out,
      "--emptyOutDir",
      "--logLevel",
      "error",
    ],
    {
      cwd: WEB,
      env: {
        ...process.env,
        VITE_SERVER_URL: "http://127.0.0.1:9",
        VITE_TURNSTILE_SITE_KEY: "e2e",
      },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if (build.exitCode !== 0) throw new Error("The focus ring harness did not build");
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const file = Bun.file(path.join(out, pathname === "/" ? "index.html" : pathname));
      return (await file.exists()) ? new Response(file) : new Response("", { status: 404 });
    },
  });
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
  await server.stop(true);
  rmSync(out, { recursive: true, force: true });
});

type Cut = { readonly control: string; readonly clippedBy: string; readonly px: number };

/** How far each ancestor that clips cuts into the focused element's ring, on any side. */
function cutsOfFocused(): { control: string; cuts: Cut[] } | null {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement) || element === document.body) return null;
  const px = (value: string) => Number.parseFloat(value) || 0;
  const style = getComputedStyle(element);
  const outset = Math.max(
    0,
    ...style.boxShadow
      .split(/,(?![^(]*\))/)
      .filter((shadow) => shadow !== "none" && !/\binset\b/.test(shadow))
      .map((shadow) => {
        const [x = 0, y = 0, blur = 0, spread = 0] = (
          shadow.replaceAll(/[a-z-]+\([^)]*\)/g, "").match(/-?[\d.]+px/g) ?? []
        ).map(px);
        return spread + blur + Math.max(Math.abs(x), Math.abs(y));
      }),
    style.outlineStyle === "none" ? 0 : px(style.outlineWidth) + px(style.outlineOffset),
  );
  const box = element.getBoundingClientRect();
  const control =
    element.getAttribute("aria-label") ||
    (element.id.startsWith("base-ui") ? "" : element.id) ||
    `${element.dataset.slot ?? element.tagName.toLowerCase()} "${element.textContent?.trim()}"`;
  const cuts: Cut[] = [];
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const clip = getComputedStyle(ancestor);
    const edge = ancestor.getBoundingClientRect();
    const sides = [
      clip.overflowX === "visible" ? 0 : edge.left + px(clip.borderLeftWidth) - (box.left - outset),
      clip.overflowX === "visible"
        ? 0
        : box.right + outset - (edge.right - px(clip.borderRightWidth)),
      clip.overflowY === "visible" ? 0 : edge.top + px(clip.borderTopWidth) - (box.top - outset),
      clip.overflowY === "visible"
        ? 0
        : box.bottom + outset - (edge.bottom - px(clip.borderBottomWidth)),
    ];
    const deepest = Math.max(...sides);
    if (deepest > 0.5) {
      const slot = ancestor.dataset.slot ? `[data-slot=${ancestor.dataset.slot}]` : "";
      cuts.push({
        control,
        clippedBy: `${ancestor.tagName.toLowerCase()}${slot}.${[...ancestor.classList].slice(0, 3).join(".")}`,
        px: Math.round(deepest * 10) / 10,
      });
    }
  }
  return { control, cuts };
}

test("no container cuts off the focus ring of a field, cell or header it holds", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(server.url.href);
  await page.getByRole("textbox", { name: "Shop" }).first().waitFor();

  const visited: string[] = [];
  const cuts: Cut[] = [];
  for (let step = 0; step < 200; step++) {
    await page.keyboard.press("Tab");
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const focused = await page.evaluate(cutsOfFocused);
    if (!focused) break;
    if (visited.length > 0 && focused.control === visited[0]) break;
    visited.push(focused.control);
    cuts.push(...focused.cuts);
  }

  expect(visited).toEqual(
    expect.arrayContaining([
      "price",
      "shop",
      "status",
      "orderDate",
      "notes",
      'button "Shop"',
      "Shop",
      "$170.00, edit Price",
      'select-trigger "Select release"',
    ]),
  );
  expect(cuts).toEqual([]);
  await page.close();
});
