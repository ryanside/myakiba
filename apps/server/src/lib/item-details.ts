import { MFC_ITEM_METADATA_VERSION } from "@myakiba/contracts/shared/constants";
import type { MfcItemPage } from "@myakiba/mfc/parse";

export function itemFields(page: MfcItemPage) {
  return {
    title: page.title,
    mfcTitle: page.mfcTitle,
    numbering: page.numbering,
    category: page.category,
    version: [...page.version],
    scale: page.scale,
    height: page.height,
    width: page.width,
    depth: page.depth,
    mfcMetadataVersion: MFC_ITEM_METADATA_VERSION,
    contentLabel: page.contentLabel,
    mfcRatingId: page.mfcRatingId,
  };
}

export function linksInLockOrder(page: MfcItemPage) {
  return page.entries.toSorted((a, b) => a.externalId - b.externalId);
}

type ReleaseContent = {
  readonly date: string;
  readonly type: string | null;
  readonly price: number | null;
  readonly priceCurrency: string | null;
  readonly barcode: string | null;
};

export function releaseKey(release: ReleaseContent): string {
  return JSON.stringify([
    release.date,
    release.type,
    release.price,
    release.priceCurrency,
    release.barcode,
  ]);
}

export function storedPercentage(percentage: number | null): number | null {
  if (percentage === null) return null;
  const [coefficient = "0", exponent = "0"] = Math.abs(percentage).toString().split("e");
  const [whole = "0", fraction = ""] = coefficient.split(".");
  const digits = whole + fraction;
  const centEnd = whole.length + Number(exponent) + 2;
  if (centEnd < 0) return 0;
  const cents = BigInt(digits.slice(0, centEnd).padEnd(centEnd, "0") || "0");
  const rounded = cents + (Number(digits[centEnd] ?? "0") >= 5 ? 1n : 0n);
  return rounded === 0n ? 0 : Math.sign(percentage) * Number(`${rounded}e-2`);
}
