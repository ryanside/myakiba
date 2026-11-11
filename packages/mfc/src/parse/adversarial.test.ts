import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { parseJson } from "@myakiba/utils/parse-json";

const PAGE_BYTES = 2 * 1024 * 1024;
// Proves a page answers in seconds, not minutes, even on a busy CI runner. Each row also names its
// outcome, so a page the tree limits reject is proven rejected before any reader runs.
const BOUND_MS = 5000;
const DEADLINE_MS = 10_000;
const TIME_PARSE = new URL("../../test/time-parse.ts", import.meta.url).pathname;

type Page = {
  readonly head?: string;
  readonly title?: string;
  readonly fields: string;
};

function shell({ head = "", title = "T", fields }: Page): string {
  return `<html><head>${head}<link rel="canonical" href="https://myfigurecollection.net/item/1"></head><body><h1 class="title">${title}</h1><div class="item-object">${field("Category", "<span>Prepainted</span>")}${fields}</div></body></html>`;
}

function field(label: string, value: string): string {
  return `<div class="data-field"><div class="data-label">${label}</div><div class="data-value">${value}</div></div>`;
}

function fillWith(unit: (index: number) => string, build: (filler: string) => Page): string {
  let room = PAGE_BYTES - shell(build("")).length;
  const parts: string[] = [];
  for (let part = unit(0); part.length <= room; part = unit(parts.length)) {
    parts.push(part);
    room -= part.length;
  }
  return shell(build(parts.join("")));
}

function fill(unit: string, build: (filler: string) => Page): string {
  return fillWith(() => unit, build);
}

function nested(open: string, close: string, build: (filler: string) => Page): string {
  const room = PAGE_BYTES - shell(build("")).length;
  const depth = Math.floor(room / (open.length + close.length));
  return shell(build(open.repeat(depth) + close.repeat(depth)));
}

function around(
  open: string,
  close: string,
  depth: number,
  build: (filler: string) => Page,
): string {
  return fill("x ", (run) => build(open.repeat(depth) + run + close.repeat(depth)));
}

/**
 * PAGE_LIMITS.fieldDepth and .depth, written out so this file also loads at revisions before the
 * limits existed. A field's own .data-value is one level of its depth; html, body, .item-object and
 * the field are four more of the page's.
 */
const FIELD_DEPTH = 32 - 1;
const PAGE_DEPTH = 256 - 5;

const release = (value: string) => field("Releases", `<a class="time">01/01/2020</a> ${value}`);
const entry = (id: string, label: string) =>
  `<a href="/entry/${id}" class="item-entry"><span switch="">${label}</span></a>`;

type Row = readonly [name: string, outcome: string, build: () => string];

const ADVERSARIAL_PAGES: readonly Row[] = [
  [
    "price: comma groups with no currency",
    "parsed",
    () => fill(",111", (run) => ({ fields: release(`1${run}`) })),
  ],
  [
    "price: a digit then whitespace with no currency",
    "parsed",
    () => fill(" ", (run) => ({ fields: release(`1${run}x`) })),
  ],
  [
    "barcode: barcode characters with a failing tail",
    "parsed",
    () => fill("A", (run) => ({ fields: release(`${run}!`) })),
  ],
  [
    "barcode: dashes with a failing tail",
    "parsed",
    () => fill("-", (run) => ({ fields: release(`${run} `) })),
  ],
  [
    "material percentage: digits with no percent sign",
    "parsed",
    () =>
      fill("1", (run) => ({
        fields: field(
          "Materials",
          `<div class="item-entries"><small class="light">${run}</small></div>`,
        ),
      })),
  ],
  [
    "material percentage: decimals with no percent sign",
    "parsed",
    () =>
      fill("1.1", (run) => ({
        fields: field(
          "Materials",
          `<div class="item-entries"><small class="light">${run}</small></div>`,
        ),
      })),
  ],
  [
    "height: digits and commas with no unit",
    "parsed",
    () => fill("1,", (run) => ({ fields: field("Dimensions", `H=${run}`) })),
  ],
  [
    "width: repeated openers",
    "parsed",
    () => fill("W=1", (run) => ({ fields: field("Dimensions", run) })),
  ],
  [
    "depth: repeated openers",
    "parsed",
    () => fill("L=1", (run) => ({ fields: field("Dimensions", run) })),
  ],
  [
    "dimensions: whitespace",
    "parsed",
    () => fill(" \n", (run) => ({ fields: field("Dimensions", `H=${run}1mm`) })),
  ],
  [
    "entry id: a long id",
    "parsed",
    () =>
      fill("1", (run) => ({
        fields: field("Origin", `<div class="item-entries">${entry(run, "x")}</div>`),
      })),
  ],
  [
    "rating id: a long id",
    "parsed",
    () =>
      fill("1", (run) => ({
        fields: field("Various", `<a href="/?ratingId=${run}x">r</a>`),
      })),
  ],
  [
    "title field: whitespace",
    "parsed",
    () => fill(" \t", (run) => ({ fields: field("Title", `a${run}b`) })),
  ],
  [
    "version: many links",
    "parsed",
    () => fill("<a>v</a>", (run) => ({ fields: field("Version", run) })),
  ],
  [
    "sibling Releases fields",
    "too_large:dataFields",
    () =>
      fill('<div class="data-field"><div class="data-label">Releases</div></div>', (run) => ({
        fields: run,
      })),
  ],
  [
    "Releases followed by sibling unlabelled releases",
    "too_large:dataFields",
    () =>
      fill('<div class="data-field"><a class="time">01/01/2020</a></div>', (run) => ({
        fields: release("1 JPY") + run,
      })),
  ],
  [
    "sibling fields with unknown labels",
    "too_large:dataFields",
    () => fill(field("Sculpting", "x"), (run) => ({ fields: run })),
  ],
  [
    "nested data fields",
    "too_large:depth",
    () =>
      nested('<div class="data-field"><div class="data-label">Origin</div>', "</div>", (run) => ({
        fields: run,
      })),
  ],
  [
    "nested data values",
    "too_large:depth",
    () =>
      nested('<div class="data-value">x', "</div>", (run) => ({
        fields: field("Releases", `<a class="time">01/01/2020</a>${run}`),
      })),
  ],
  [
    "nested entry groups",
    "too_large:depth",
    () =>
      nested(
        `<div class="item-entries">${entry("1", "x")}<small class="light">1%`,
        "</small></div>",
        (run) => ({
          fields: field("Materials", run),
        }),
      ),
  ],
  [
    "nested elements",
    "too_large:depth",
    () => nested("<b>", "</b>", (run) => ({ fields: field("Title", run) })),
  ],
  [
    "entry groups with roles",
    "too_large:entries",
    () =>
      fill(
        `<div class="item-entries">${entry("1", "x")}<small class="light"><em>r</em></small></div>`,
        (run) => ({
          fields: field("Company", run),
        }),
      ),
  ],
  [
    "one entry with many distinct roles",
    "too_large:entries",
    () =>
      fillWith(
        (role) =>
          `<div class="item-entries">${entry("1", "x")}<small class="light"><em>${role}</em></small></div>`,
        (run) => ({ fields: field("Company", run) }),
      ),
  ],
  [
    "many distinct entries",
    "too_large:entries",
    () =>
      fillWith(
        (id) => entry(String(id + 1), String(id)),
        (run) => ({ fields: field("Character", run) }),
      ),
  ],
  [
    "Nendoroid label: whitespace with a failing tail",
    "too_large:entryNameLength",
    () =>
      fill(" ", (run) => ({
        fields: field(
          "Classification",
          `<div class="item-entries">${entry("23355", `x${run}y`)}</div>`,
        ),
      })),
  ],
  [
    "Nendoroid label: repeated number openers",
    "too_large:entryNameLength",
    () =>
      fill(" (#", (run) => ({
        fields: field(
          "Classification",
          `<div class="item-entries">${entry("23355", `x${run}`)}</div>`,
        ),
      })),
  ],
  [
    "price: comma groups before a currency",
    "parsed",
    () => fill(",111", (run) => ({ fields: release(`1${run} JPY`) })),
  ],
  [
    "title: an unclosed content label",
    "too_large:titleLength",
    () => fill("a", (run) => ({ title: `[${run}`, fields: "" })),
  ],
  [
    "title: a content label with a failing tail",
    "too_large:titleLength",
    () => fill("]", (run) => ({ title: `[Explicit${run}`, fields: "" })),
  ],
  [
    "page title: whitespace",
    "parsed",
    () => fill(" ", (run) => ({ head: `<title>${run}x</title>`, fields: "" })),
  ],
];

const AT_LIMIT_PAGES: readonly (readonly [string, () => string])[] = [
  [
    "data values nested to the field depth limit",
    () =>
      around('<div class="data-value">', "</div>", FIELD_DEPTH, (run) => ({
        fields: field("Title", run),
      })),
  ],
  [
    "version links nested to the field depth limit",
    () =>
      around("<a>", "</a>", FIELD_DEPTH, (run) => ({
        fields: field("Version", run),
      })),
  ],
  [
    "entry groups nested to the field depth limit",
    () =>
      around(
        '<div class="item-entries"><small class="light">',
        "</small></div>",
        Math.floor(FIELD_DEPTH / 2),
        (run) => ({
          fields: field("Materials", run),
        }),
      ),
  ],
  [
    "release dates nested to the field depth limit",
    () =>
      around('<a class="time">', "</a>", FIELD_DEPTH, (run) => ({
        fields: field("Releases", run),
      })),
  ],
  [
    "fields nested to the page depth limit",
    () =>
      fill("x ", (run) => ({
        fields: "<b>".repeat(PAGE_DEPTH) + field("Title", run) + "</b>".repeat(PAGE_DEPTH),
      })),
  ],
];

const timedParse = z.object({ ms: z.number(), outcome: z.string() });

async function timeParse(html: string): Promise<z.infer<typeof timedParse> | "too slow"> {
  const child = Bun.spawn([process.execPath, TIME_PARSE], {
    stdin: new Blob([html]),
    stdout: "pipe",
  });
  const output = await Promise.race([
    new Response(child.stdout).text(),
    Bun.sleep(DEADLINE_MS).then(() => null),
  ]);
  child.kill();
  if (output === null) return "too slow";
  const timed = parseJson(timedParse, output);
  if (timed.isErr()) throw new Error(`time-parse printed ${output}`);
  return timed.value;
}

describe("parseMfcItemPage on adversarial pages at the upload limit", () => {
  test.each(ADVERSARIAL_PAGES)(
    `%s answers %s within ${BOUND_MS} ms`,
    async (_name, outcome, build) => {
      const html = build();
      expect(html.length).toBeLessThanOrEqual(PAGE_BYTES);
      expect(html.length).toBeGreaterThan(PAGE_BYTES - 1000);
      const timed = await timeParse(html);
      expect(timed === "too slow" ? timed : timed.outcome).toBe(outcome);
      if (timed === "too slow") return;
      expect(timed.ms).toBeLessThan(BOUND_MS);
    },
    DEADLINE_MS * 2,
  );
});

describe("parseMfcItemPage on pages at the nesting limits", () => {
  test.each(AT_LIMIT_PAGES)(
    `%s parses within ${BOUND_MS} ms`,
    async (_name, build) => {
      const timed = await timeParse(build());
      expect(timed).not.toBe("too slow");
      if (timed === "too slow") return;
      expect(timed.outcome).toBe("parsed");
      expect(timed.ms).toBeLessThan(BOUND_MS);
    },
    DEADLINE_MS * 2,
  );
});
