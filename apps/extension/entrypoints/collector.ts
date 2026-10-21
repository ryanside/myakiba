import { scrubMfcPage } from "@myakiba/mfc/capture";
import { readMfcEnvelope } from "@myakiba/mfc/page";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { PAGE_TIMEOUT_MS, collectRequestSchema } from "../lib/collect";
import type { CollectedPage } from "../lib/collect";
import { ORIGINS } from "../lib/config";
import { toConfiguredUrl } from "../lib/origins";
import { readPicture } from "../lib/picture";

type LoadedPage = Omit<CollectedPage, "picture">;

async function fetchItemPage(mfcItemId: number): Promise<LoadedPage> {
  const response = await fetch(`/item/${mfcItemId}`, {
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });
  const html = await response.text();
  return {
    status: response.status,
    cfMitigated: response.headers.get("cf-mitigated"),
    retryAfter: response.headers.get("retry-after"),
    html: scrubMfcPage(new DOMParser().parseFromString(html, "text/html")),
  };
}

function loadedItemPage(): LoadedPage {
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

async function fetchGatedPicture(canonical: string): Promise<CollectedPage["picture"]> {
  const url = toConfiguredUrl(canonical, ORIGINS);
  if (url?.origin !== location.origin) return null;
  try {
    return await readPicture(
      await fetch(url, { credentials: "include", signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) }),
    );
  } catch {
    return null;
  }
}

export default defineUnlistedScript(async (): Promise<CollectedPage> => {
  const request = collectRequestSchema.parse(globalThis.myakibaCollectRequest);
  globalThis.myakibaCollectRequest = undefined;
  const page = request.mode === "fetch" ? await fetchItemPage(request.mfcItemId) : loadedItemPage();
  const envelope = readMfcEnvelope(page);
  const gated =
    envelope.kind === "item" &&
    envelope.mfcItemId === request.mfcItemId &&
    envelope.ogImage.kind === "picture" &&
    envelope.ogImage.picture.access === "gated"
      ? envelope.ogImage.picture.url
      : null;
  return { ...page, picture: gated ? await fetchGatedPicture(gated) : null };
});
