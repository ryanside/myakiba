import { mfcPictureUrl } from "@myakiba/contracts/add/constants";
import type { PortPicture } from "@myakiba/mfc/bridge";
import { scrubMfcPage } from "@myakiba/mfc/capture";
import { readMfcEnvelope } from "@myakiba/mfc/page";
import { Result } from "better-result";
import type * as z from "zod";
import { CapturePictureFailed } from "../errors/capture-picture-failed";
import { CaptureRefused } from "../errors/capture-refused";
import type { CaptureRefusal } from "../errors/capture-refused";
import type { pickCaptureSchema } from "../messages";
import { toConfiguredUrl } from "../origins";
import type { Origins } from "../origins";
import { PICTURE_TIMEOUT_MS, readPicture } from "../picture";
import type { ItemOnPage } from "./item-page";

type PickCapture = z.output<typeof pickCaptureSchema>;

export type PageFetch = (url: URL, init: RequestInit) => Promise<Response>;

export type CaptureDeps = {
  readonly fetch: PageFetch;
  readonly origins: Origins;
};

function refusalOf(html: string, item: ItemOnPage): CaptureRefusal | null {
  const envelope = readMfcEnvelope({ status: 200, cfMitigated: null, html });
  if (envelope.kind !== "item") return "not_an_item_page";
  if (envelope.mfcItemId !== item.mfcItemId) return "wrong_item";
  return envelope.ogImage.kind === "sfw_hidden" ? "sfw_hidden" : null;
}

/** One request, to the address that serves the picture for public and gated Items alike. No picture still picks. */
async function fetchPicture(item: ItemOnPage, deps: CaptureDeps): Promise<PortPicture | null> {
  const failed = (cause: unknown) => new CapturePictureFailed({ mfcItemId: item.mfcItemId, cause });
  const read = await Result.tryPromise({
    try: async () => {
      const url = toConfiguredUrl(mfcPictureUrl(item.mfcItemId), deps.origins);
      if (url === null) throw new Error("the commit picture URL is not on MFC's origin");
      const response = await deps.fetch(url, {
        credentials: "include",
        cache: "force-cache",
        signal: AbortSignal.timeout(PICTURE_TIMEOUT_MS),
      });
      return readPicture(response);
    },
    catch: failed,
  });
  const picture = Result.flatten(read);
  if (picture.isOk()) return picture.value;
  const failure = CapturePictureFailed.is(picture.error) ? picture.error : failed(picture.error);
  console.warn(`${failure._tag}: ${failure.message}`);
  return null;
}

/** Runs only on a click: the page as it stands now, scrubbed, and its Item's picture. */
export async function capturePage(
  doc: Document,
  item: ItemOnPage,
  deps: CaptureDeps,
): Promise<Result<PickCapture, CaptureRefused>> {
  const html = scrubMfcPage(doc);
  const reason = refusalOf(html, item);
  if (reason !== null) {
    return Result.err(new CaptureRefused({ mfcItemId: item.mfcItemId, reason }));
  }
  const picture = await fetchPicture(item, deps);
  return Result.ok({ mfcItemId: item.mfcItemId, title: item.title, html, picture });
}
