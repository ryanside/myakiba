import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { z } from "zod";
import { launchFirefox, releaseFirefox } from "./firefox";
import { E2E_ORIGINS, GATED_ID, PICTURE_SHA256, PUBLIC_ID, startMocks } from "./mock-mfc";

const EXTENSION = path.join(import.meta.dir, "../.output/firefox-mv3-e2e");
const MFC = E2E_ORIGINS.WXT_MFC_ORIGIN;
const SCENARIO_TIMEOUT_MS = 60_000;
const SETUP_TIMEOUT_MS = 600_000;

const helloSchema = z.object({ type: z.string() }).nullable();
const picksSchema = z.array(
  z.object({ mfcItemId: z.number(), pictureBytes: z.number().nullable() }),
);
const runSchema = z.object({
  reason: z.string(),
  items: z.array(
    z.object({
      mfcItemId: z.number(),
      ok: z.boolean(),
      error: z.string().nullable(),
      picture: z.object({ sha256: z.string() }).nullable(),
    }),
  ),
});
const boxSchema = z.object({ x: z.number(), y: z.number(), height: z.number() }).nullable();

type Bridge = {
  hello: (timeoutMs: number) => Promise<z.output<typeof helloSchema>>;
  takePicks: () => Promise<z.output<typeof picksSchema>>;
  picksSaved: (mfcItemIds: number[]) => Promise<string>;
  fetchItems: (mfcItemIds: number[]) => Promise<z.output<typeof runSchema>>;
};
declare const bridge: Bridge;

const mocks = startMocks();
let firefox: Awaited<ReturnType<typeof launchFirefox>>;
let closeFirefox = async () => {};

beforeAll(async () => {
  const build = Bun.spawnSync(["bunx", "wxt", "build", "-b", "firefox", "--mode", "e2e"], {
    cwd: path.join(import.meta.dir, ".."),
    env: { ...process.env, ...E2E_ORIGINS },
  });
  if (build.exitCode !== 0) throw new Error(`the e2e build failed\n${build.stderr.toString()}`);
  firefox = await launchFirefox(await releaseFirefox());
  closeFirefox = () => firefox.close();
  await firefox.installExtension(EXTENSION);
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
  try {
    await closeFirefox();
  } finally {
    await mocks.stop();
  }
});

async function myakibaPage(): Promise<string> {
  const page = await firefox.newTab(`${E2E_ORIGINS.WXT_WEB_ORIGIN}/`);
  const answer = await firefox.evaluate(page, helloSchema, () => bridge.hello(5000));
  expect(answer?.type).toBe("announce");
  return page;
}

describe("the extension in Firefox", () => {
  test(
    "answers the myakiba page's hello",
    async () => {
      const page = await myakibaPage();

      await firefox.closeTab(page);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "hands a Pick to the myakiba page and forgets it once saved",
    async () => {
      const mfc = await firefox.newTab(`${MFC}/item/${PUBLIC_ID}`);
      let box: z.output<typeof boxSchema> = null;
      for (const deadline = Date.now() + 10_000; box === null && Date.now() < deadline;) {
        box = await firefox.evaluate(mfc, boxSchema, () => {
          const rect = document
            .querySelector('[data-myakiba-pick="toggle"]')
            ?.getBoundingClientRect();
          return rect ? { x: rect.x, y: rect.y, height: rect.height } : null;
        });
      }
      if (box === null) throw new Error("the Pick toggle never showed");
      // The button sits at the start of its host, and its closed shadow root hides it from selectors.
      await firefox.click(mfc, box.x + 24, box.y + box.height / 2);
      const page = await myakibaPage();

      let picks: z.output<typeof picksSchema> = [];
      for (const deadline = Date.now() + 10_000; picks.length === 0 && Date.now() < deadline;) {
        picks = await firefox.evaluate(page, picksSchema, () => bridge.takePicks());
      }
      const saved = await firefox.evaluate(
        page,
        z.string(),
        (id) => bridge.picksSaved([id]),
        PUBLIC_ID,
      );
      const left = await firefox.evaluate(page, picksSchema, () => bridge.takePicks());

      expect(picks.map(({ mfcItemId }) => mfcItemId)).toEqual([PUBLIC_ID]);
      expect(picks[0]?.pictureBytes).toBeGreaterThan(0);
      expect(saved).toBe("complete");
      expect(left).toEqual([]);
      await Promise.all([firefox.closeTab(mfc), firefox.closeTab(page)]);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "refreshes an Item through the collector, with its gated picture intact",
    async () => {
      const page = await myakibaPage();

      const run = await firefox.evaluate(
        page,
        runSchema,
        (id) => bridge.fetchItems([id]),
        GATED_ID,
      );

      expect(run.reason).toBe("complete");
      expect(run.items).toEqual([
        {
          mfcItemId: GATED_ID,
          ok: true,
          error: null,
          picture: { sha256: PICTURE_SHA256.gated },
        },
      ]);
      await firefox.closeTab(page);
    },
    SCENARIO_TIMEOUT_MS,
  );

  test(
    "refreshes an Item in the MFC tab the user has open, and opens none",
    async () => {
      const mfc = await firefox.newTab(`${MFC}/`);
      const page = await myakibaPage();

      let run: z.output<typeof runSchema> | undefined;
      const opened = await firefox.tabsOpenedDuring(async () => {
        run = await firefox.evaluate(page, runSchema, (id) => bridge.fetchItems([id]), GATED_ID);
      });

      expect(run?.items[0]?.picture?.sha256).toBe(PICTURE_SHA256.gated);
      expect(opened).toEqual([]);
      await Promise.all([firefox.closeTab(mfc), firefox.closeTab(page)]);
    },
    SCENARIO_TIMEOUT_MS,
  );
});
