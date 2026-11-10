import type { Cheerio, CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { EntryCategory } from "@myakiba/contracts/shared/types";
import { parseMoneyInputToMinorUnits } from "@myakiba/utils/currency";
import type { MfcRelease } from "../parse";

export type EntryMention = {
  readonly externalId: number;
  readonly category: EntryCategory;
  readonly sourceLabel: string;
  readonly role: string;
  readonly materialPercentage: number | null;
};

export type ItemFields = {
  rawCategory: string;
  mfcTitle: string | null;
  numbering: string | null;
  mfcRatingId: number | null;
  version: string[];
  scale: string;
  height: number | null;
  width: number | null;
  depth: number | null;
  mentions: EntryMention[];
  releases: (Omit<MfcRelease, "date"> & { readonly rawDate: string })[];
  warnings: string[];
};

type FieldReader = (field: Cheerio<Element>, $: CheerioAPI, fields: ItemFields) => void;

// A lookbehind lets a repeated run match only from where the run starts, so a long run is scanned once.
const PATTERNS = {
  height: /H=([\d,]+)mm/,
  width: /W=([\d,]+)mm/,
  depth: /[DL]=([\d,]+)mm/,
  price: /(?<![\d,])(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?:<small>)?([A-Z]{3})(?:<\/small>)?/,
  barcode: /(?<![A-Z0-9-])([A-Z0-9-]+)$/,
  entryId: /\/entry\/(\d+)/,
  materialPercentage: /(?<!\d)(\d+(?:\.\d+)?)\s*%/,
  ratingId: /[?&]ratingId=(\d+)/,
} as const;

const plainEntries =
  (category: EntryCategory): FieldReader =>
  (field, $, fields) => {
    for (const link of field.find(".item-entry")) {
      const entry = readEntryLink($(link));
      if (entry) fields.mentions.push({ ...entry, category, role: "", materialPercentage: null });
    }
  };

const entriesWithRoles =
  (category: EntryCategory): FieldReader =>
  (field, $, fields) => {
    for (const group of field.find(".item-entries")) {
      let pending: { externalId: number; sourceLabel: string }[] = [];
      let role = "";
      for (const node of $(group).contents()) {
        const $node = $(node);
        if ($node.hasClass("item-entry")) {
          const entry = readEntryLink($node);
          if (entry) pending.push(entry);
        } else if ($node.is("small.light") && $node.find("em").length > 0) {
          role = $node.find("em").text().trim();
          for (const entry of pending) {
            fields.mentions.push({ ...entry, category, role, materialPercentage: null });
          }
          pending = [];
        }
      }
      for (const entry of pending) {
        fields.mentions.push({ ...entry, category, role, materialPercentage: null });
      }
    }
  };

const readMaterials: FieldReader = (field, $, fields) => {
  for (const group of field.find(".item-entries")) {
    const $group = $(group);
    const match = PATTERNS.materialPercentage.exec($group.find("small.light").text());
    const materialPercentage = match?.[1] ? Number.parseFloat(match[1]) : null;
    for (const link of $group.find(".item-entry")) {
      const entry = readEntryLink($(link));
      if (entry) {
        fields.mentions.push({ ...entry, category: "Materials", role: "", materialPercentage });
      }
    }
  }
};

const readCategory: FieldReader = (field, _$, fields) => {
  fields.rawCategory = field.find(".data-value").find("span").first().text().trim();
};

const readMfcTitle: FieldReader = (field, _$, fields) => {
  fields.mfcTitle = valueText(field) || null;
};

const readNumbering: FieldReader = (field, _$, fields) => {
  fields.numbering = valueText(field) || null;
};

const readVersion: FieldReader = (field, $, fields) => {
  for (const link of field.find("a")) {
    const text = $(link).text().trim();
    if (text) fields.version.push(text);
  }
};

const readDimensions: FieldReader = (field, _$, fields) => {
  const text = valueText(field);
  fields.scale = field.find("a.item-scale").text().trim();
  fields.height = millimetres(PATTERNS.height.exec(text));
  fields.width = millimetres(PATTERNS.width.exec(text));
  fields.depth = millimetres(PATTERNS.depth.exec(text));
};

const readVarious: FieldReader = (field, _$, fields) => {
  const href = field.find('a[href*="ratingId="]').first().attr("href") ?? "";
  const match = PATTERNS.ratingId.exec(href);
  fields.mfcRatingId = match?.[1] ? Number(match[1]) : null;
};

function readRelease($release: Cheerio<Element>, $: CheerioAPI, fields: ItemFields): void {
  const dateLink = $release.find("a.time");
  if (dateLink.length === 0) return;
  const text = $release.find(".data-value").text();
  const types: string[] = [];
  for (const em of $release.find("small.light").find("em")) {
    const part = $(em).text().trim();
    if (part) types.push(part);
  }
  const price = PATTERNS.price.exec(text);
  fields.releases.push({
    rawDate: dateLink.text().trim(),
    type: types.join(" "),
    price: price?.[1]
      ? parseMoneyInputToMinorUnits(price[1]).unwrap(
          `MFC release price matched the price pattern but is not valid safe money while parsing release fields: ${JSON.stringify(price[1])}`,
        )
      : 0,
    priceCurrency: price?.[2] ?? "JPY",
    barcode: PATTERNS.barcode.exec(text)?.[1] ?? "",
  });
}

const FIELD_READERS: ReadonlyMap<string, FieldReader> = new Map([
  ["Category", readCategory],
  ["Title", readMfcTitle],
  ["Numbering", readNumbering],
  ["Classification", entriesWithRoles("Classifications")],
  ["Classifications", entriesWithRoles("Classifications")],
  ["Origin", plainEntries("Origins")],
  ["Origins", plainEntries("Origins")],
  ["Character", plainEntries("Characters")],
  ["Characters", plainEntries("Characters")],
  ["Company", entriesWithRoles("Companies")],
  ["Companies", entriesWithRoles("Companies")],
  ["Artist", entriesWithRoles("Artists")],
  ["Artists", entriesWithRoles("Artists")],
  ["Event", entriesWithRoles("Events")],
  ["Events", entriesWithRoles("Events")],
  ["Material", readMaterials],
  ["Materials", readMaterials],
  ["Version", readVersion],
  ["Dimensions", readDimensions],
  ["Various", readVarious],
]);

/** A Releases field and the sibling fields MFC lists its later releases in. */
type ReleaseGroup = { parent: AnyNode | null; fields: Cheerio<Element>[] };

export function readItemFields($: CheerioAPI): ItemFields {
  const fields: ItemFields = {
    rawCategory: "",
    mfcTitle: null,
    numbering: null,
    mfcRatingId: null,
    version: [],
    scale: "",
    height: null,
    width: null,
    depth: null,
    mentions: [],
    releases: [],
    warnings: [],
  };
  // MFC lists a second release as a sibling field with no label, or with the item-extra-release class.
  const releases: ReleaseGroup = { parent: null, fields: [] };
  for (const element of $(".item-object").first().find(".data-field")) {
    const field = $(element);
    const labels = field.find(".data-label");
    if (
      releases.fields.length > 0 &&
      releases.parent === element.parent &&
      (labels.length === 0 || field.hasClass("item-extra-release"))
    ) {
      releases.fields.push(field);
    }
    const label = labels.text().trim();
    if (!label) continue;
    const reader = FIELD_READERS.get(label);
    if (reader) reader(field, $, fields);
    else if (label.startsWith("Releases")) {
      releases.parent = element.parent;
      releases.fields = [field];
    } else fields.warnings.push(`unread field "${label}"`);
  }
  for (const release of releases.fields) readRelease(release, $, fields);
  return fields;
}

function readEntryLink(
  $entry: Cheerio<AnyNode>,
): { externalId: number; sourceLabel: string } | null {
  const sourceLabel = $entry.find("span[switch]").text().trim();
  const id = PATTERNS.entryId.exec($entry.attr("href") ?? "")?.[1];
  return sourceLabel && id ? { externalId: Number.parseInt(id, 10), sourceLabel } : null;
}

function valueText(field: Cheerio<Element>): string {
  return field.find(".data-value").text().replaceAll(/\s+/g, " ").trim();
}

function millimetres(match: RegExpExecArray | null): number | null {
  return match?.[1] ? Number.parseInt(match[1].replaceAll(",", ""), 10) : null;
}
