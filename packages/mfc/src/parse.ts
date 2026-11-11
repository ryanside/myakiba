import { Result } from "better-result";
import * as cheerio from "cheerio";
import { CATEGORIES, CONTENT_LABELS } from "@myakiba/contracts/shared/constants";
import { normalizeScale } from "@myakiba/contracts/shared/scale";
import type { Category, ContentLabel, EntryCategory } from "@myakiba/contracts/shared/types";
import { normalizeMfcDate } from "@myakiba/utils/date-only";
import { readMfcEnvelope } from "./page";
import { MFC_PAGE_READS as READS } from "./reads";
import type { MfcEnvelope, MfcItemId, MfcPicture } from "./page";
import { readItemFields } from "./parse/fields";
import type { EntryMention } from "./parse/fields";
import { PAGE_LIMITS, parseBoundedDocument, clippedQuote } from "./parse/limits";
import type { TooLarge } from "./parse/limits";
import { MfcPageUnreadable } from "./errors/mfc-page-unreadable";

export { MfcPageUnreadable } from "./errors/mfc-page-unreadable";

export type MfcEntryLink = {
  readonly externalId: number;
  readonly category: EntryCategory;
  readonly name: string;
  readonly sourceLabel: string;
  readonly roles: readonly string[];
  readonly materialPercentage: number | null;
};

export type MfcRelease = {
  readonly date: string;
  readonly type: string;
  readonly price: number;
  readonly priceCurrency: string;
  readonly barcode: string;
};

export type MfcItemPage = {
  readonly mfcItemId: MfcItemId;
  readonly title: string;
  readonly contentLabel: ContentLabel | null;
  readonly mfcRatingId: number | null;
  readonly mfcTitle: string | null;
  readonly numbering: string | null;
  readonly category: Category;
  readonly version: readonly string[];
  readonly scale: string;
  readonly height: number | null;
  readonly width: number | null;
  readonly depth: number | null;
  readonly entries: readonly MfcEntryLink[];
  readonly releases: readonly MfcRelease[];
  readonly picture: MfcPicture | null;
  readonly warnings: readonly string[];
};

export type MfcPageProblem =
  | { readonly kind: "challenge" }
  | { readonly kind: "not_found" }
  | { readonly kind: "not_an_item_page" }
  | { readonly kind: "wrong_item"; readonly found: MfcItemId }
  | { readonly kind: "sfw_hidden" }
  | { readonly kind: "missing_title" }
  | { readonly kind: "missing_category" }
  | { readonly kind: "unsupported_category"; readonly raw: string }
  | ({ readonly kind: "too_large" } & TooLarge);

const ENVELOPE_PROBLEMS = {
  challenge: { kind: "challenge" },
  not_found: { kind: "not_found" },
  unexpected: { kind: "not_an_item_page" },
} as const satisfies Record<Exclude<MfcEnvelope["kind"], "item">, MfcPageProblem>;

export function parseMfcItemPage(
  page: string,
  expected: MfcItemId,
): Result<MfcItemPage, MfcPageUnreadable> {
  const unreadable = (problem: MfcPageProblem) =>
    Result.err(new MfcPageUnreadable({ mfcItemId: expected, problem }));
  // htmlparser2 keeps U+0000, which a browser drops from page text and Postgres refuses in text.
  const html = page.replaceAll("\u0000", "");
  const tree = parseBoundedDocument(html);
  if ("exceeded" in tree) return unreadable({ kind: "too_large", ...tree.exceeded });
  const envelope = readMfcEnvelope({ status: 200, cfMitigated: null, html });
  if (envelope.kind !== "item") return unreadable(ENVELOPE_PROBLEMS[envelope.kind]);
  if (envelope.mfcItemId !== expected) {
    return unreadable({ kind: "wrong_item", found: envelope.mfcItemId });
  }
  if (envelope.ogImage.kind === "sfw_hidden") return unreadable({ kind: "sfw_hidden" });

  const $ = cheerio.load(tree.root);
  const rawTitle = $(READS.heading).first().text().trim();
  if (!rawTitle) return unreadable({ kind: "missing_title" });
  if (rawTitle.length > PAGE_LIMITS.titleLength) {
    return unreadable({ kind: "too_large", limit: "titleLength", measured: rawTitle.length });
  }

  const read = readItemFields($);
  if (read.isErr()) return unreadable({ kind: "too_large", ...read.error });
  const fields = read.value;
  const category = CATEGORIES.find((known) => known === fields.rawCategory);
  if (!category) {
    return unreadable(
      fields.rawCategory
        ? { kind: "unsupported_category", raw: fields.rawCategory }
        : { kind: "missing_category" },
    );
  }

  const { title, contentLabel } = splitContentLabel(rawTitle);
  const warnings = [...fields.warnings];
  const bracket = CONTENT_LABEL_PREFIX.exec(title);
  if (!contentLabel && bracket)
    warnings.push(`unknown title bracket ${clippedQuote(`[${bracket[1]}]`)}`);
  if (envelope.ogImage.kind === "rejected") {
    warnings.push(`picture rejected: ${clippedQuote(envelope.ogImage.raw)}`);
  }

  const releases: MfcRelease[] = [];
  for (const { rawDate, ...release } of fields.releases) {
    const date = normalizeMfcDate(rawDate);
    if (date) releases.push({ date, ...release });
    else warnings.push(`release skipped: unsupported date ${clippedQuote(rawDate)}`);
  }
  if (warnings.length > PAGE_LIMITS.warnings) {
    return unreadable({ kind: "too_large", limit: "warnings", measured: warnings.length });
  }

  return Result.ok({
    mfcItemId: envelope.mfcItemId,
    title,
    contentLabel,
    mfcRatingId: fields.mfcRatingId,
    mfcTitle: fields.mfcTitle,
    numbering: fields.numbering,
    category,
    version: fields.version,
    scale: normalizeScale(fields.scale),
    height: fields.height,
    width: fields.width,
    depth: fields.depth,
    entries: mergeEntryLinks(fields.mentions),
    releases,
    picture: envelope.ogImage.kind === "picture" ? envelope.ogImage.picture : null,
    warnings,
  });
}

const CONTENT_LABEL_PREFIX = /^\[([^\]]+)\] - /;

export function splitContentLabel(rawTitle: string): {
  readonly title: string;
  readonly contentLabel: ContentLabel | null;
} {
  const match = CONTENT_LABEL_PREFIX.exec(rawTitle);
  const label = match?.[1]?.toLowerCase();
  const contentLabel = CONTENT_LABELS.find((known) => known === label);
  return match && contentLabel
    ? { title: rawTitle.slice(match[0].length), contentLabel }
    : { title: rawTitle, contentLabel: null };
}

const NENDOROID_ENTRY_EXTERNAL_ID = 23_355;

const MERGE_ORDER: readonly EntryCategory[] = [
  "Classifications",
  "Origins",
  "Characters",
  "Companies",
  "Artists",
  "Events",
  "Materials",
];

type MergingLink = Omit<MfcEntryLink, "roles" | "materialPercentage"> & {
  roles: string[];
  materialPercentage: number | null;
};

function mergeEntryLinks(mentions: readonly EntryMention[]): MfcEntryLink[] {
  const links = new Map<number, MergingLink>();
  const ordered = mentions.toSorted(
    (a, b) => MERGE_ORDER.indexOf(a.category) - MERGE_ORDER.indexOf(b.category),
  );
  for (const mention of ordered) {
    const existing = links.get(mention.externalId);
    if (!existing) {
      links.set(mention.externalId, {
        externalId: mention.externalId,
        category: mention.category,
        // MFC links every numbered Nendoroid to one entry and decorates its label with the item's number.
        name:
          mention.externalId === NENDOROID_ENTRY_EXTERNAL_ID &&
          mention.category === "Classifications"
            ? mention.sourceLabel.replace(/\s+\(#[^)]+\)$/u, "")
            : mention.sourceLabel,
        sourceLabel: mention.sourceLabel,
        roles: mention.role ? [mention.role] : [],
        materialPercentage: mention.materialPercentage,
      });
      continue;
    }
    if (mention.role && !existing.roles.includes(mention.role)) existing.roles.push(mention.role);
    existing.materialPercentage ??= mention.materialPercentage;
  }
  return [...links.values()];
}
