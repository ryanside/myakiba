import { Result } from "better-result";
import type { StandardSchemaOutput, StandardSchemaV1 } from "better-result";
import type * as z from "zod";
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import type { SessionValue } from "../lib/clock";
import { systemClock } from "../lib/clock";
import {
  armCollector,
  pageAnswerCodec,
  pictureAnswerCodec,
  readAnswer,
  stopCollector,
} from "../lib/collect";
import type { AnswerCodec, CollectRequest } from "../lib/collect";
import { ORIGINS } from "../lib/config";
import type { CollectorAnswerInvalid } from "../lib/errors/collector-answer-invalid";
import { CollectorInjectionFailed } from "../lib/errors/collector-injection-failed";
import { createFetcher } from "../lib/fetcher";
import { ownedTabSchema } from "../lib/owned-tab";
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

async function runCollector<Ok extends StandardSchemaV1, Fails extends StandardSchemaV1>(
  tabId: number,
  request: CollectRequest,
  codec: AnswerCodec<Ok, Fails>,
  signal?: AbortSignal,
): Promise<
  Result<
    StandardSchemaOutput<Ok>,
    StandardSchemaOutput<Fails> | CollectorInjectionFailed | CollectorAnswerInvalid
  >
> {
  const inject = <R>(script: () => Promise<R>) =>
    Result.tryPromise({
      try: script,
      catch: (cause) => new CollectorInjectionFailed({ tabId, kind: request.kind, cause }),
    });
  signal?.throwIfAborted();
  const armed = await inject(() =>
    browser.scripting.executeScript({ target: { tabId }, func: armCollector, args: [request] }),
  );
  if (armed.isErr()) return Result.err(armed.error);
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
    const injected = await inject(() =>
      browser.scripting.executeScript({ target: { tabId }, files: ["/collector.js"] }),
    );
    if (injected.isErr()) return Result.err(injected.error);
    return await readAnswer(codec, injected.value[0], tabId, request.kind);
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
    collectPage: (tabId, request, signal) => runCollector(tabId, request, pageAnswerCodec, signal),
    fetchGatedPicture: (tabId, url, signal) =>
      runCollector(tabId, { kind: "gated-picture", url }, pictureAnswerCodec, signal),
    fetchPublicPicture: (tabId, url, signal) =>
      runCollector(tabId, { kind: "public-picture", url }, pictureAnswerCodec, signal),
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
