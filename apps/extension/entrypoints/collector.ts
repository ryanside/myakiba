import type { PortPicture } from "@myakiba/mfc/bridge";
import { scrubMfcPage } from "@myakiba/mfc/capture";
import type { MfcItemId } from "@myakiba/mfc/page";
import { Panic, Result } from "better-result";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import {
  NO_STATUS,
  PAGE_TIMEOUT_MS,
  pageAnswerCodec,
  pictureAnswerCodec,
  reportDefect,
  runArmed,
} from "../lib/collect";
import type { CollectedPage, PictureFailure } from "../lib/collect";
import { ORIGINS } from "../lib/config";
import { MfcPageFetchFailed } from "../lib/errors/mfc-page-fetch-failed";
import { PictureFetchFailed } from "../lib/errors/picture-fetch-failed";
import { PictureTimedOut } from "../lib/errors/picture-timed-out";
import { summarize } from "../lib/errors/summary";
import { toConfiguredUrl } from "../lib/origins";
import { PICTURE_TIMEOUT_MS, pictureToRead, readPicture } from "../lib/picture";

async function fetchItemPage(
  mfcItemId: MfcItemId,
  signal: AbortSignal,
): Promise<Result<CollectedPage, MfcPageFetchFailed>> {
  const fetched = await Result.tryPromise({
    try: async () => {
      const response = await fetch(`/item/${mfcItemId}`, {
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(PAGE_TIMEOUT_MS)]),
      });
      return { response, html: await response.text() };
    },
    catch: (cause) => new MfcPageFetchFailed({ mfcItemId, cause: summarize(cause) }),
  });
  return fetched.map(({ response, html }) => ({
    status: response.status,
    cfMitigated: response.headers.get("cf-mitigated"),
    retryAfter: response.headers.get("retry-after"),
    html: scrubMfcPage(new DOMParser().parseFromString(html, "text/html")),
  }));
}

function loadedItemPage(): CollectedPage {
  const navigation = performance
    .getEntriesByType("navigation")
    .find((entry) => entry instanceof PerformanceNavigationTiming);
  return {
    status: navigation?.responseStatus ?? NO_STATUS,
    cfMitigated: null,
    retryAfter: null,
    html: scrubMfcPage(document),
  };
}

async function fetchPicture(
  url: URL | null,
  cache: RequestCache,
  signal: AbortSignal,
): Promise<Result<PortPicture | null, PictureFailure>> {
  if (url?.origin !== location.origin) return Result.ok(null);
  const read = await Result.tryPromise({
    try: async () =>
      readPicture(
        await fetch(url, {
          credentials: "include",
          cache,
          signal: AbortSignal.any([signal, AbortSignal.timeout(PICTURE_TIMEOUT_MS)]),
        }),
      ),
    catch: (cause) => {
      if (Panic.is(cause)) throw cause;
      const summary = summarize(cause);
      return summary.name === "TimeoutError"
        ? new PictureTimedOut({ timeoutMs: PICTURE_TIMEOUT_MS })
        : new PictureFetchFailed({ cause: summary });
    },
  });
  return Result.flatten(read);
}

/** A picture is optional, but a defect while reading one is not, so it crosses to the background as a defect. */
async function answerPicture(url: URL | null, cache: RequestCache, signal: AbortSignal) {
  try {
    return pictureAnswerCodec.serializeUnsafe(await fetchPicture(url, cache, signal));
  } catch (error) {
    return reportDefect(error);
  }
}

export default defineUnlistedScript(async () =>
  runArmed(async (request, signal) => {
    if (request.kind === "gated-picture") {
      return answerPicture(toConfiguredUrl(request.url, ORIGINS), "default", signal);
    }
    if (request.kind === "public-picture") {
      // The tab just loaded the picture, so the browser's copy saves the CDN a second request.
      return answerPicture(
        pictureToRead(request.url, location.href, ORIGINS),
        "force-cache",
        signal,
      );
    }
    const page =
      request.mode === "document"
        ? Result.ok(loadedItemPage())
        : await fetchItemPage(request.mfcItemId, signal);
    return pageAnswerCodec.serializeUnsafe(page);
  }),
);
