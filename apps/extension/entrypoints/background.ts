import { Result } from "better-result";
import type { StandardSchemaOutput, StandardSchemaV1 } from "better-result";
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { systemClock } from "../lib/clock";
import {
  armCollector,
  pageAnswerCodec,
  pictureAnswerCodec,
  readAnswer,
  stopCollector,
} from "../lib/collect";
import type { AnswerCodec, CollectRequest, CollectorFailure } from "../lib/collect";
import { ORIGINS } from "../lib/config";
import { CollectorInjectionFailed } from "../lib/errors/collector-injection-failed";
import { createFetcher } from "../lib/fetcher";
import { ownedTabSchema } from "../lib/owned-tab";
import { servePort } from "../lib/port-host";
import { sessionValue } from "../lib/session-value";
import { throttleStateSchema } from "../lib/throttle";

async function runCollector<Ok extends StandardSchemaV1, Fails extends StandardSchemaV1>(
  tabId: number,
  request: CollectRequest,
  codec: AnswerCodec<Ok, Fails>,
  signal?: AbortSignal,
): Promise<Result<StandardSchemaOutput<Ok>, StandardSchemaOutput<Fails> | CollectorFailure>> {
  const inject = <R>(script: () => Promise<R>) =>
    Result.tryPromise({
      try: script,
      catch: (cause) => new CollectorInjectionFailed({ tabId, kind: request.kind, cause }),
    });
  // Each step that touches the tab first checks the signal, so a stopped load starts no new script.
  const stopped = () =>
    Result.err(new CollectorInjectionFailed({ tabId, kind: request.kind, cause: signal?.reason }));
  if (signal?.aborted) return stopped();
  const armed = await inject(() =>
    browser.scripting.executeScript({ target: { tabId }, func: armCollector, args: [request] }),
  );
  if (armed.isErr()) return Result.err(armed.error);
  if (signal?.aborted) return stopped();
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
    throttleState: sessionValue(browser.storage.session, "throttle", throttleStateSchema),
    ownedTab: sessionValue(browser.storage.session, "ownedTab", ownedTabSchema),
    ownedPictureTab: sessionValue(browser.storage.session, "ownedPictureTab", ownedTabSchema),
    collectPage: (tabId, request, signal) => runCollector(tabId, request, pageAnswerCodec, signal),
    fetchGatedPicture: (tabId, url, signal) =>
      runCollector(tabId, { kind: "gated-picture", url }, pictureAnswerCodec, signal),
    fetchPublicPicture: (tabId, url, signal) =>
      runCollector(tabId, { kind: "public-picture", url }, pictureAnswerCodec, signal),
  });

  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    const notFocused = (cause: unknown) => {
      console.error("could not record a tab focus", cause);
    };
    try {
      const noted = await fetcher.noteTabActivated(tabId);
      noted.tapError(notFocused);
    } catch (error) {
      notFocused(error);
    }
  });
  browser.runtime.onConnect.addListener((port) => {
    servePort(port, fetcher, { extensionId: browser.runtime.id, webOrigin: ORIGINS.web });
  });
  fetcher.resume();
});
