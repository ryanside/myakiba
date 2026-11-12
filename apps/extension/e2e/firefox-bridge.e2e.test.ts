import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import path from "node:path";
import { Browser as BrowserName, install } from "@puppeteer/browsers";
import { launch } from "puppeteer-core";
import type { Browser } from "puppeteer-core";
import { E2E_ORIGINS, PUBLIC_ID, startMocks } from "./mock-mfc";

const EXTENSION = path.join(import.meta.dir, "../.output/firefox-mv3-e2e");
const FIREFOX = "stable_160.0";
const SCENARIO_TIMEOUT_MS = 60_000;

type Bridge = {
  hello: (timeoutMs: number) => Promise<{ type: string } | null>;
  takePicks: () => Promise<{ mfcItemId: number; pictureBytes: number | null }[]>;
  picksSaved: (mfcItemIds: number[]) => Promise<string>;
};
declare const bridge: Bridge;

const mocks = startMocks();
let browser: Browser;

beforeAll(async () => {
  const build = Bun.spawnSync(["bunx", "wxt", "build", "-b", "firefox", "--mode", "e2e"], {
    cwd: path.join(import.meta.dir, ".."),
    env: { ...process.env, ...E2E_ORIGINS },
  });
  if (build.exitCode !== 0) throw new Error(`the e2e build failed\n${build.stderr.toString()}`);
  // Playwright's Firefox cannot load extensions, so a release Firefox installs it over WebDriver BiDi.
  const firefox = await install({
    browser: BrowserName.FIREFOX,
    buildId: FIREFOX,
    cacheDir: path.join(homedir(), ".cache", "myakiba-e2e"),
  });
  browser = await launch({
    browser: "firefox",
    executablePath: firefox.executablePath,
    headless: true,
  });
  await browser.installExtension(EXTENSION);
}, SCENARIO_TIMEOUT_MS);

afterAll(async () => {
  await browser.close();
  await mocks.stop();
});

async function myakibaPage() {
  const page = await browser.newPage();
  await page.goto(`${E2E_ORIGINS.WXT_WEB_ORIGIN}/`);
  return page;
}

describe("the extension in Firefox", () => {
  test(
    "answers the myakiba page's hello",
    async () => {
      const page = await myakibaPage();

      const answer = await page.evaluate(() => bridge.hello(2000));

      expect(answer?.type).toBe("announce");
      await page.close();
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "hands a Pick to the myakiba page and forgets it once saved",
    async () => {
      const mfc = await browser.newPage();
      await mfc.goto(`${E2E_ORIGINS.WXT_MFC_ORIGIN}/item/${PUBLIC_ID}`);
      const toggle = await mfc.waitForSelector('[data-myakiba-pick="toggle"]');
      const box = await toggle?.boundingBox();
      if (!box) throw new Error("the Pick toggle has no box");
      // The button sits at the start of its host, and its closed shadow root hides it from selectors.
      await mfc.mouse.click(box.x + 24, box.y + box.height / 2);
      const page = await myakibaPage();

      let picks: Awaited<ReturnType<Bridge["takePicks"]>> = [];
      for (const deadline = Date.now() + 10_000; picks.length === 0 && Date.now() < deadline;) {
        picks = await page.evaluate(() => bridge.takePicks());
      }
      const saved = await page.evaluate((id) => bridge.picksSaved([id]), PUBLIC_ID);
      const left = await page.evaluate(() => bridge.takePicks());

      expect(picks.map(({ mfcItemId }) => mfcItemId)).toEqual([PUBLIC_ID]);
      expect(picks[0]?.pictureBytes).toBeGreaterThan(0);
      expect(saved).toBe("complete");
      expect(left).toEqual([]);
      await Promise.all([mfc.close(), page.close()]);
    },
    SCENARIO_TIMEOUT_MS,
  );
});
