import { Result } from "better-result";
import type { Cheerio, CheerioAPI } from "cheerio";
import { isTag } from "domhandler";
import type { AnyNode, Element } from "domhandler";
import type { EntryCategory } from "@myakiba/contracts/shared/types";
import { parseMoneyInputToMinorUnits } from "@myakiba/utils/currency";
import type { MfcRelease } from "../parse";
import { MFC_PAGE_READS as READS } from "../reads";
import { PAGE_LIMITS, clippedQuote } from "./limits";
import type { PageLimit } from "./limits";

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

const INT4_MAX = 2_147_483_647;

// A lookbehind lets a repeated run match only from where the run starts, so a long run is scanned once.
const PATTERNS = {
  height: /H=([\d,]+)mm/,
  width: /W=([\d,]+)mm/,
  depth: /[DL]=([\d,]+)mm/,
  price: /(?<![\d,])(\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?:<small>)?([A-Z]{3})(?:<\/small>)?/,
  barcode: /(?<![A-Z0-9-])([A-Z0-9-]+)$/,
  entryId: READS.entryHref,
  materialPercentage: /(?<!\d)(\d+(?:\.\d+)?)\s*%/,
  ratingId: READS.ratingHref,
} as const;

const plainEntries =
  (category: EntryCategory): FieldReader =>
  (field, $, fields) => {
    for (const link of field.find(".item-entry")) {
      const entry = readEntryLink($(link), fields);
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
          const entry = readEntryLink($node, fields);
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
    const materialPercentage = match?.[1] ? storedPercentage(match[1], fields) : null;
    for (const link of $group.find(".item-entry")) {
      const entry = readEntryLink($(link), fields);
      if (entry) {
        fields.mentions.push({ ...entry, category: "Materials", role: "", materialPercentage });
      }
    }
  }
};

const readCategory: FieldReader = (field, _$, fields) => {
  fields.rawCategory = field.find(".data-value").first().find("span").first().text().trim();
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
  fields.height = millimetres("height", PATTERNS.height.exec(text), fields);
  fields.width = millimetres("width", PATTERNS.width.exec(text), fields);
  fields.depth = millimetres("depth", PATTERNS.depth.exec(text), fields);
};

const readVarious: FieldReader = (field, _$, fields) => {
  const href = field.find('a[href*="ratingId="]').first().attr("href") ?? "";
  const match = PATTERNS.ratingId.exec(href);
  fields.mfcRatingId = match?.[1] ? storedInteger("rating id", match[1], fields) : null;
};

function readRelease($release: Cheerio<Element>, $: CheerioAPI, fields: ItemFields): void {
  const dateLink = $release.find("a.time");
  if (dateLink.length === 0) return;
  const text = $release.find(".data-value").first().text();
  const types: string[] = [];
  for (const em of $release.find("small.light").find("em")) {
    const part = $(em).text().trim();
    if (part) types.push(part);
  }
  const price = PATTERNS.price.exec(text);
  fields.releases.push({
    rawDate: dateLink.text().trim(),
    type: types.join(" "),
    price: price?.[1] ? money(price[1], fields) : 0,
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

type DataFields = { readonly fields: Element[]; readonly fieldDepth: number };

type ReleaseGroup = { parent: AnyNode | null; fields: Cheerio<Element>[] };

function dataFields(root: AnyNode | undefined): DataFields {
  const fields: Element[] = [];
  let fieldDepth = 0;
  const stack: { node: AnyNode; depth: number | null }[] = root
    ? [{ node: root, depth: null }]
    : [];
  for (let next = stack.pop(); next; next = stack.pop()) {
    const { node } = next;
    if (!isTag(node)) continue;
    let inside = next.depth === null ? null : next.depth + 1;
    if (inside === null && node !== root && hasClass(node, "data-field")) {
      fields.push(node);
      inside = 0;
    }
    if (inside !== null && inside > fieldDepth) fieldDepth = inside;
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child) stack.push({ node: child, depth: inside });
    }
  }
  return { fields, fieldDepth };
}

export function readItemFields($: CheerioAPI): Result<ItemFields, PageLimit> {
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
  const found = dataFields($(READS.itemObject).first()[0]);
  if (found.fields.length > PAGE_LIMITS.dataFields) return Result.err("dataFields");
  if (found.fieldDepth > PAGE_LIMITS.fieldDepth) return Result.err("fieldDepth");

  // MFC lists a second release as a sibling field with no label, or with the item-extra-release class.
  const releases: ReleaseGroup = { parent: null, fields: [] };
  for (const element of found.fields) {
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
    } else fields.warnings.push(`unread field ${clippedQuote(label)}`);
  }
  for (const release of releases.fields) readRelease(release, $, fields);

  if (fields.mentions.length > PAGE_LIMITS.entries) return Result.err("entries");
  if (fields.mentions.some(({ sourceLabel }) => sourceLabel.length > PAGE_LIMITS.entryNameLength)) {
    return Result.err("entryNameLength");
  }
  if (fields.releases.length > PAGE_LIMITS.releases) return Result.err("releases");
  if (fields.warnings.length > PAGE_LIMITS.warnings) return Result.err("warnings");
  return Result.ok(fields);
}

function hasClass(element: Element, name: string): boolean {
  return element.attribs.class?.split(/[\t\n\f\r ]+/).includes(name) ?? false;
}

function readEntryLink(
  $entry: Cheerio<AnyNode>,
  fields: ItemFields,
): { externalId: number; sourceLabel: string } | null {
  const sourceLabel = $entry.find("span[switch]").text().trim();
  const id = PATTERNS.entryId.exec($entry.attr("href") ?? "")?.[1];
  if (!sourceLabel || !id) return null;
  const externalId = storedInteger("entry id", id, fields);
  return externalId === null ? null : { externalId, sourceLabel };
}

function valueText(field: Cheerio<Element>): string {
  return field.find(".data-value").first().text().replaceAll(/\s+/g, " ").trim();
}

function storedInteger(name: string, text: string, fields: ItemFields): number | null {
  const value = Number.parseInt(text.replaceAll(",", ""), 10);
  if (Number.isInteger(value) && value <= INT4_MAX) return value;
  fields.warnings.push(`unreadable ${name} ${clippedQuote(text)}`);
  return null;
}

function millimetres(
  name: string,
  match: RegExpExecArray | null,
  fields: ItemFields,
): number | null {
  return match?.[1] ? storedInteger(name, match[1], fields) : null;
}

function storedPercentage(text: string, fields: ItemFields): number | null {
  const value = Number.parseFloat(text);
  if (value <= 100) return value;
  fields.warnings.push(`unreadable material percentage ${clippedQuote(text)}`);
  return null;
}

function money(text: string, fields: ItemFields): number {
  const minorUnits = parseMoneyInputToMinorUnits(text);
  if (minorUnits.isOk()) return minorUnits.value;
  fields.warnings.push(`unreadable release price ${clippedQuote(text)}`);
  return 0;
}
