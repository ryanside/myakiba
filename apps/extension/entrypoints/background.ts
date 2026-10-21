import type * as z from "zod";
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import type { SessionValue } from "../lib/clock";
import { systemClock } from "../lib/clock";
import { collectedPageSchema } from "../lib/collect";
import type { CollectRequest, CollectedPage } from "../lib/collect";
import { ORIGINS } from "../lib/config";
import { createFetcher } from "../lib/fetcher";
import { ownedTabSchema } from "../lib/mfc-tab";
import { readPicture } from "../lib/picture";
import { servePort } from "../lib/port-host";
import { OPEN_THROTTLE, throttleStateSchema } from "../lib/throttle";

function sessionValue<T>(key: string, schema: z.ZodType<T>, fallback: T): SessionValue<T> {
  return {
    async load() {
      const stored = await browser.storage.session.get(key);
      const parsed = schema.safeParse(stored[key]);
      return parsed.success ? parsed.data : fallback;
    },
    async save(value) {
      await browser.storage.session.set({ [key]: value });
    },
  };
}

async function runCollector(tabId: number, request: CollectRequest): Promise<CollectedPage> {
  await browser.scripting.executeScript({
    target: { tabId },
    func: (value: CollectRequest) => {
      globalThis.myakibaCollectRequest = value;
    },
    args: [request],
  });
  const [injection] = await browser.scripting.executeScript({
    target: { tabId },
    files: ["/collector.js"],
  });
  return collectedPageSchema.parse(injection?.result);
}

export default defineBackground(() => {
  const fetcher = createFetcher({
    tabs: browser.tabs,
    windows: browser.windows,
    clock: systemClock,
    random: Math.random,
    origins: ORIGINS,
    throttleState: sessionValue("throttle", throttleStateSchema, OPEN_THROTTLE),
    ownedTab: sessionValue("ownedTab", ownedTabSchema, null),
    collect: runCollector,
    fetchPublicPicture: async (url) =>
      readPicture(await fetch(url, { credentials: "omit", cache: "no-store" })),
  });

  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      await fetcher.noteTabActivated(tabId);
    } catch (error) {
      console.error("could not record a tab focus", error);
    }
  });
  browser.runtime.onConnect.addListener((port) => {
    servePort(port, fetcher, { extensionId: browser.runtime.id, webOrigin: ORIGINS.web });
  });
});
