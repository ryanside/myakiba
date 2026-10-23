import { portPictureSchema } from "@myakiba/mfc/bridge";
import type * as z from "zod";
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import type { SessionValue } from "../lib/clock";
import { systemClock } from "../lib/clock";
import { armCollector, collectedPageSchema, stopCollector } from "../lib/collect";
import type { CollectRequest } from "../lib/collect";
import { ORIGINS } from "../lib/config";
import { createFetcher } from "../lib/fetcher";
import { ownedTabSchema } from "../lib/mfc-tab";
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

async function runCollector<T>(
  tabId: number,
  request: CollectRequest,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  await browser.scripting.executeScript({ target: { tabId }, func: armCollector, args: [request] });
  signal?.throwIfAborted();
  const stop = async () => {
    try {
      await browser.scripting.executeScript({ target: { tabId }, func: stopCollector });
    } catch {
      // The tab closed or moved on, which stops the collector as well.
    }
  };
  signal?.addEventListener("abort", stop, { once: true });
  try {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId },
      files: ["/collector.js"],
    });
    return schema.parse(injection?.result);
  } finally {
    signal?.removeEventListener("abort", stop);
  }
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
    ownedPictureTab: sessionValue("ownedPictureTab", ownedTabSchema, null),
    collectPage: (tabId, request, signal) =>
      runCollector(tabId, request, collectedPageSchema, signal),
    fetchGatedPicture: (tabId, url, signal) =>
      runCollector(tabId, { kind: "gated-picture", url }, portPictureSchema.nullable(), signal),
    fetchPublicPicture: (tabId, signal) =>
      runCollector(tabId, { kind: "public-picture" }, portPictureSchema.nullable(), signal),
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
  fetcher.resume();
});
