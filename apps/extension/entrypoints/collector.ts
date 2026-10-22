import type { PortPicture } from "@myakiba/mfc/bridge";
import { scrubMfcPage } from "@myakiba/mfc/capture";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { PAGE_TIMEOUT_MS, collectRequestSchema } from "../lib/collect";
import type { CollectedPage } from "../lib/collect";
import { ORIGINS } from "../lib/config";
import { toConfiguredUrl } from "../lib/origins";
import { PICTURE_TIMEOUT_MS, readPicture } from "../lib/picture";

async function fetchItemPage(mfcItemId: number, signal: AbortSignal): Promise<CollectedPage> {
  const response = await fetch(`/item/${mfcItemId}`, {
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(PAGE_TIMEOUT_MS)]),
  });
  const html = await response.text();
  return {
    status: response.status,
    cfMitigated: response.headers.get("cf-mitigated"),
    retryAfter: response.headers.get("retry-after"),
    html: scrubMfcPage(new DOMParser().parseFromString(html, "text/html")),
  };
}

function loadedItemPage(): CollectedPage {
  const navigation = performance
    .getEntriesByType("navigation")
    .find((entry) => entry instanceof PerformanceNavigationTiming);
  return {
    status: navigation?.responseStatus || 200,
    cfMitigated: null,
    retryAfter: null,
    html: scrubMfcPage(document),
  };
}

async function fetchGatedPicture(canonical: string): Promise<PortPicture | null> {
  const url = toConfiguredUrl(canonical, ORIGINS);
  if (url?.origin !== location.origin) return null;
  try {
    return await readPicture(
      await fetch(url, { credentials: "include", signal: AbortSignal.timeout(PICTURE_TIMEOUT_MS) }),
    );
  } catch {
    return null;
  }
}

export default defineUnlistedScript(async (): Promise<CollectedPage | PortPicture | null> => {
  const request = collectRequestSchema.parse(globalThis.myakibaCollectRequest);
  globalThis.myakibaCollectRequest = undefined;
  if (request.kind === "gated-picture") return fetchGatedPicture(request.url);
  if (request.mode === "document") return loadedItemPage();
  const controller = new AbortController();
  globalThis.myakibaCollectAbort = controller;
  return fetchItemPage(request.mfcItemId, controller.signal);
});
