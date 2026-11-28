// The Orders table's expand button, laid out by a real browser with the app's stylesheet. Unit
// tests run in a DOM that applies no CSS, so they cannot see a neighbouring cell cover the button.
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import type { Browser } from "playwright";

setDefaultTimeout(120_000);

const WEB = path.join(import.meta.dir, "..");
const out = mkdtempSync(path.join(tmpdir(), "row-expand-"));
let server: ReturnType<typeof Bun.serve>;
let browser: Browser;

beforeAll(async () => {
  const build = Bun.spawnSync(
    ["bun", "run", "e2e:build:row-expand", "--outDir", out, "--emptyOutDir", "--logLevel", "error"],
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
  if (build.exitCode !== 0) throw new Error("The row expand harness did not build");
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

/** For each expand button: whether its left edge, centre and right edge hit it, and its gap to the thumbnail. */
function expandButtons() {
  return [...document.querySelectorAll<HTMLElement>("section[aria-label]")].flatMap((section) =>
    [...section.querySelectorAll<HTMLElement>("button[aria-label='Expand row']")].map((button) => {
      const box = button.getBoundingClientRect();
      const y = box.top + box.height / 2;
      const hits = [box.left + 1, box.left + box.width / 2, box.right - 1].map((x) =>
        button.contains(document.elementFromPoint(x, y)),
      );
      const thumbnail = button.closest("tr")?.querySelector("td[data-col='title'] a");
      const gap = thumbnail ? Math.round(thumbnail.getBoundingClientRect().left - box.right) : null;
      return { view: section.getAttribute("aria-label"), hits, gap };
    }),
  );
}

test.each([1280, 360])(
  "at %d px the whole expand button takes the click and sits clear of the thumbnail",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(server.url.href);
    await page.getByRole("button", { name: "Expand row" }).first().waitFor();

    const measured = await page.evaluate(expandButtons);
    const buttons = measured.map(({ view, hits, gap }) => ({
      view,
      hits,
      clearOfThumbnail: gap !== null && gap >= 8,
    }));
    expect(buttons).toEqual(
      ["Compact", "Compact", "Table", "Table"].map((view) => ({
        view,
        hits: [true, true, true],
        clearOfThumbnail: true,
      })),
    );

    for (const view of ["Compact", "Table"]) {
      const button = page.getByRole("region", { name: view }).getByRole("button", {
        name: "Expand row",
      });
      const box = await button.first().boundingBox();
      if (!box) throw new Error(`The ${view} view has no expand button`);
      await page.mouse.click(box.x + box.width - 1, box.y + box.height / 2);
      expect(
        await page
          .getByRole("region", { name: view })
          .getByRole("button", { name: "Collapse row" })
          .count(),
      ).toBe(1);
    }
    await page.close();
  },
);
