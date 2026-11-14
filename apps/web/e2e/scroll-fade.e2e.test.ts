// A list's foot fade, painted by real browsers with the app's stylesheet. Firefox has no scroll
// timelines, so it takes shadcn's fallback, which a DOM without CSS cannot show.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import type { Browser, BrowserType, Page } from "playwright";

setDefaultTimeout(120_000);

const WEB = path.join(import.meta.dir, "..");
const out = mkdtempSync(path.join(tmpdir(), "scroll-fade-"));
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  const build = Bun.spawnSync(
    [
      "bun",
      "run",
      "e2e:build:scroll-fade",
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
  if (build.exitCode !== 0) throw new Error("The scroll fade harness did not build");
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const file = Bun.file(path.join(out, pathname === "/" ? "index.html" : pathname));
      return (await file.exists()) ? new Response(file) : new Response("", { status: 404 });
    },
  });
});

afterAll(async () => {
  await server.stop(true);
  rmSync(out, { recursive: true, force: true });
});

const painted = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/** How white, from 0 to 255, the last 3px of a list's last visible white bar paint. */
async function footBrightness(page: Page, testId: string): Promise<number> {
  await painted(page);
  const clip = await page.getByTestId(testId).evaluate((list) => {
    const last = [...list.querySelectorAll("[data-bar]")].at(-1);
    if (!last) throw new Error("The list has no bars");
    const box = list.getBoundingClientRect();
    const bottom = Math.min(box.bottom, last.getBoundingClientRect().bottom);
    return { x: box.left + 8, y: bottom - 4, width: box.width - 16, height: 3 };
  });
  const png = await page.screenshot({ clip });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2d canvas");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      sum += ((pixels[index] ?? 0) + (pixels[index + 1] ?? 0) + (pixels[index + 2] ?? 0)) / 3;
    }
    return sum / (pixels.length / 4);
  }, png.toString("base64"));
}

const toEnd = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((list) => {
    list.scrollTop = list.scrollHeight;
  });

const UNFADED = 230;
const FADED = 128;

function paintsInEveryBrowser(name: string, type: BrowserType) {
  describe(name, () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
      browser = await type.launch();
      page = await browser.newPage({ viewport: { width: 1280, height: 600 } });
      await page.goto(server.url.href);
      await page.getByTestId("command").waitFor();
    });

    afterAll(async () => {
      await browser.close();
    });

    test("a list with more below fades its foot", async () => {
      expect(await footBrightness(page, "long")).toBeLessThan(FADED);
    });

    test("a list with nothing to scroll shows its foot unfaded", async () => {
      expect(await footBrightness(page, "short")).toBeGreaterThan(UNFADED);
    });

    test("a list scrolled to its end shows its foot unfaded", async () => {
      await toEnd(page, "long");
      expect(await footBrightness(page, "long")).toBeGreaterThan(UNFADED);
    });

    test("a menu's command list shows its last item unfaded", async () => {
      await toEnd(page, "command");
      expect(await footBrightness(page, "command")).toBeGreaterThan(UNFADED);
    });

    test("a list at its end fades its foot again when more grows below", async () => {
      await toEnd(page, "growing");
      expect(await footBrightness(page, "growing")).toBeGreaterThan(UNFADED);
      await page.getByRole("button", { name: "More" }).click();
      expect(await footBrightness(page, "growing")).toBeLessThan(FADED);
    });
  });
}

paintsInEveryBrowser("Firefox", firefox);
paintsInEveryBrowser("Chromium", chromium);
