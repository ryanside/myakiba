import { Result } from "better-result";
import type { Cheerio, CheerioAPI } from "cheerio";
import { select } from "cheerio-select";
import { isTag, isText } from "domhandler";
import type { AnyNode, Element } from "domhandler";
import type { EntryCategory } from "@myakiba/contracts/shared/types";
import { parseMoneyInputToMinorUnits } from "@myakiba/utils/currency";
import type { MfcRelease } from "../parse";
import { MFC_PAGE_READS as READS } from "../reads";
import type { FieldLabel } from "../reads";
import { clippedQuote, firstPast } from "./limits";
import type { TooLarge } from "./limits";

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
const BULLET = "\u2022";

// A lookbehind lets a repeated run match only from where the run starts, so a long run is scanned once.
const PATTERNS = {
  height: /H=([\d,]+)mm/,
  width: /W=([\d,]+)mm/,
  depth: /[DL]=([\d,]+)mm/,
  price: /(?<![\d,.])(\d[\d,]*(?:\.\d+)?)\s+([A-Z]{3})/,
  barcode: /^[A-Z0-9-]+$/,
  entryId: READS.entryHref,
  materialPercentage: /(?<!\d)(\d+(?:\.\d+)?)\s*%/,
  ratingId: READS.ratingHref,
} as const;

const plainEntries =
  (category: EntryCategory): FieldReader =>
  (field, $, fields) => {
    for (const link of find($, field, ".item-entry")) {
      const entry = readEntryLink($(link), $, fields);
      if (entry) fields.mentions.push({ ...entry, category, role: "", materialPercentage: null });
    }
  };

const entriesWithRoles =
  (category: EntryCategory): FieldReader =>
  (field, $, fields) => {
    for (const group of find($, field, ".item-entries")) {
      let pending: { externalId: number; sourceLabel: string }[] = [];
      let role = "";
      for (const node of $(group).contents()) {
        const $node = $(node);
        if ($node.hasClass("item-entry")) {
          const entry = readEntryLink($node, $, fields);
          if (entry) pending.push(entry);
        } else if ($node.is("small.light") && find($, $node, "em").length > 0) {
          role = outermost(find($, $node, "em"))
            .text()
            .trim();
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
  for (const group of outermost(find($, field, ".item-entries"))) {
    const $group = $(group);
    const match = PATTERNS.materialPercentage.exec(
      outermost(find($, $group, "small.light")).text(),
    );
    const materialPercentage = match?.[1] ? storedPercentage(match[1], fields) : null;
    for (const link of find($, $group, ".item-entry")) {
      const entry = readEntryLink($(link), $, fields);
      if (entry) {
        fields.mentions.push({ ...entry, category: "Materials", role: "", materialPercentage });
      }
    }
  }
};

const readCategory: FieldReader = (field, $, fields) => {
  fields.rawCategory = find($, find($, field, ".data-value").first(), "span")
    .first()
    .text()
    .trim();
};

const readMfcTitle: FieldReader = (field, $, fields) => {
  fields.mfcTitle = valueText(field, $) || null;
};

const readNumbering: FieldReader = (field, $, fields) => {
  fields.numbering = valueText(field, $) || null;
};

const readVersion: FieldReader = (field, $, fields) => {
  for (const link of outermost(find($, field, "a"))) {
    const text = $(link).text().trim();
    if (text) fields.version.push(text);
  }
};

const readDimensions: FieldReader = (field, $, fields) => {
  const text = valueText(field, $);
  fields.scale = outermost(find($, field, "a.item-scale"))
    .text()
    .trim();
  fields.height = millimetres("height", PATTERNS.height.exec(text), fields);
  fields.width = millimetres("width", PATTERNS.width.exec(text), fields);
  fields.depth = millimetres("depth", PATTERNS.depth.exec(text), fields);
};

const readVarious: FieldReader = (field, $, fields) => {
  const href = find($, field, 'a[href*="ratingId="]').first().attr("href") ?? "";
  const match = PATTERNS.ratingId.exec(href);
  fields.mfcRatingId = match?.[1] ? storedInteger("rating id", match[1], fields) : null;
};

function readRelease($release: Cheerio<Element>, $: CheerioAPI, fields: ItemFields): void {
  const dateLink = outermost(find($, $release, "a.time"));
  if (dateLink.length === 0) return;
  const value = find($, $release, ".data-value").first();
  // A space between child nodes keeps a type ending in "." or a digit apart from the price after it.
  const text = value
    .contents()
    .toArray()
    .map((node) => $(node).text())
    .join(" ");
  const types: string[] = [];
  for (const em of outermost(find($, $release, "small.light em"))) {
    const part = $(em).text().trim();
    if (part) types.push(part);
  }
  const price = PATTERNS.price.exec(text);
  fields.releases.push({
    rawDate: dateLink.text().trim(),
    type: types.join(" "),
    price: price?.[1] ? money(price[1], fields) : 0,
    priceCurrency: price?.[2] ?? "JPY",
    barcode: readBarcode(value, $, fields),
  });
}

/**
 * MFC writes a release's barcode after a bullet that follows its price, usually as a link. With no
 * price there may be no bullet, so then the barcode is the value's last link other than its date,
 * when that link reads like one.
 */
function readBarcode(value: Cheerio<Element>, $: CheerioAPI, fields: ItemFields): string | null {
  const after: string[] = [];
  for (const node of value.contents()) {
    if (after.length > 0) after.push($(node).text());
    else if (isText(node) && node.data.includes(BULLET)) {
      after.push(node.data.slice(node.data.indexOf(BULLET) + 1));
    }
  }
  if (after.length === 0) {
    // With no bullet, only a link that reads like a JAN, EAN, UPC or ISBN is the barcode, so a shop,
    // region or second date link is not stored as one.
    const link = value.children("a").not(".time").last().text().trim();
    return looksLikeBarcode(link) ? link : null;
  }
  const barcode = after.join("").trim();
  if (barcode === "") return null;
  if (PATTERNS.barcode.test(barcode)) return barcode;
  fields.warnings.push(`unreadable barcode ${clippedQuote(barcode)}`);
  return null;
}

const looksLikeBarcode = (text: string): boolean =>
  text.length >= 8 &&
  PATTERNS.barcode.test(text) &&
  [...text].some((character) => character >= "0" && character <= "9");

const READERS_BY_LABEL = {
  Category: readCategory,
  Title: readMfcTitle,
  Numbering: readNumbering,
  Classification: entriesWithRoles("Classifications"),
  Classifications: entriesWithRoles("Classifications"),
  Origin: plainEntries("Origins"),
  Origins: plainEntries("Origins"),
  Character: plainEntries("Characters"),
  Characters: plainEntries("Characters"),
  Company: entriesWithRoles("Companies"),
  Companies: entriesWithRoles("Companies"),
  Artist: entriesWithRoles("Artists"),
  Artists: entriesWithRoles("Artists"),
  Event: entriesWithRoles("Events"),
  Events: entriesWithRoles("Events"),
  Material: readMaterials,
  Materials: readMaterials,
  Version: readVersion,
  Dimensions: readDimensions,
  Various: readVarious,
} satisfies Record<FieldLabel, FieldReader>;

const FIELD_READERS: ReadonlyMap<string, FieldReader> = new Map(Object.entries(READERS_BY_LABEL));

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

export function readItemFields($: CheerioAPI): Result<ItemFields, TooLarge> {
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
  const tooMany = firstPast([
    ["dataFields", found.fields.length],
    ["fieldDepth", found.fieldDepth],
  ]);
  if (tooMany) return Result.err(tooMany);

  // MFC lists a second release as a sibling field with no label, or with the item-extra-release class.
  const releases: ReleaseGroup = { parent: null, fields: [] };
  for (const element of found.fields) {
    const field = $(element);
    const labels = outermost(find($, field, READS.fieldLabel));
    if (
      releases.fields.length > 0 &&
      releases.parent === element.parent &&
      (labels.length === 0 || field.hasClass(READS.extraReleaseClass))
    ) {
      releases.fields.push(field);
    }
    const label = labels.text().trim();
    if (!label) continue;
    const reader = FIELD_READERS.get(label);
    if (reader) reader(field, $, fields);
    else if (label.startsWith(READS.releasesLabel)) {
      releases.parent = element.parent;
      releases.fields = [field];
    } else fields.warnings.push(`unread field ${clippedQuote(label)}`);
  }
  for (const release of releases.fields) readRelease(release, $, fields);

  const stored = [
    fields.mfcTitle ?? "",
    fields.numbering ?? "",
    fields.scale,
    ...fields.version,
    ...fields.mentions.map(({ role }) => role),
    ...fields.releases.flatMap(({ type, barcode }) => [type, barcode ?? ""]),
  ];
  const tooLarge = firstPast([
    ["entries", fields.mentions.length],
    ["entryNameLength", longest(fields.mentions.map(({ sourceLabel }) => sourceLabel))],
    ["releases", fields.releases.length],
    ["valueLength", longest(stored)],
  ]);
  return tooLarge ? Result.err(tooLarge) : Result.ok(fields);
}

function longest(values: readonly string[]): number {
  let length = 0;
  for (const value of values) length = Math.max(length, value.length);
  return length;
}

/** The elements of `selection` that no other element of it contains, so nested matches never repeat text. */
function outermost<T extends AnyNode>(selection: Cheerio<T>): Cheerio<T> {
  const matched = new Set<AnyNode>(selection.toArray());
  return selection.filter((_index, element) => {
    for (let parent = element.parent; parent; parent = parent.parent) {
      if (matched.has(parent)) return false;
    }
    return true;
  });
}

function hasClass(element: Element, name: string): boolean {
  return element.attribs.class?.split(/[\t\n\f\r ]+/).includes(name) ?? false;
}

function readEntryLink(
  $entry: Cheerio<AnyNode>,
  $: CheerioAPI,
  fields: ItemFields,
): { externalId: number; sourceLabel: string } | null {
  const sourceLabel = outermost(find($, $entry, "span[switch]"))
    .text()
    .trim();
  const id = PATTERNS.entryId.exec($entry.attr("href") ?? "")?.[1];
  if (!sourceLabel || !id) return null;
  const externalId = storedInteger("entry id", id, fields);
  return externalId === null ? null : { externalId, sourceLabel };
}

function valueText(field: Cheerio<Element>, $: CheerioAPI): string {
  return find($, field, ".data-value").first().text().replaceAll(/\s+/g, " ").trim();
}

/**
 * `selection.find(selector)` for a selection of one element. cheerio's find hands css-select the
 * element's children as an array, and css-select runs domutils' removeSubsets over that array,
 * which costs children² × depth. One element's children hold no duplicates and none contains
 * another, so searching from the element itself finds the same nodes without that pass.
 */
function find($: CheerioAPI, selection: Cheerio<AnyNode>, selector: string): Cheerio<Element> {
  const [element, ...rest] = selection.toArray();
  if (!element || rest.length > 0) return selection.find(selector);
  return $(select(selector, element, { context: [element] }));
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
