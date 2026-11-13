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
  readonly before?: string;
  readonly head?: string;
  readonly title?: string;
  readonly category?: string;
  readonly fields: string;
  readonly after?: string;
};

function shell({
  before = "",
  head = "",
  title = "T",
  category = "<span>Prepainted</span>",
  fields,
  after = "",
}: Page): string {
  return `${before}<html><head>${head}<link rel="canonical" href="https://myfigurecollection.net/item/1"></head><body><h1 class="title">${title}</h1><div class="item-object">${field("Category", category)}${fields}</div>${after}</body></html>`;
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

/** A value just inside PAGE_LIMITS.valueLength, nested `depth` deep, on a page padded to the limit. */
function around(
  open: string,
  close: string,
  depth: number,
  build: (filler: string) => Page,
): string {
  return padded(build(open.repeat(depth) + "x ".repeat(900) + close.repeat(depth)));
}

/**
 * PAGE_LIMITS.fieldDepth, .depth, .children and .nodes, written out so this file also loads at
 * revisions before the limits existed. A field's own .data-value is one level of its depth; html,
 * body, .item-object and the field are four more of the page's.
 */
const FIELD_DEPTH = 32 - 1;
const PAGE_DEPTH = 64 - 5;
const CHILDREN = 1024;
const NODES = 10_000;

/** `levels` elements around `inner`, so a field inside sits that much deeper. */
const deep = (levels: number, inner: string) =>
  "<b>".repeat(levels) + inner + "</b>".repeat(levels);

/** Pads a page to the upload limit with text no reader reads. */
const padded = (page: Page) => fill("x ", (run) => ({ ...page, after: run }));

/** As many copies of `unit`, each `nodes` nodes, as the nodes limit leaves room for. */
const asManyAsFit = (unit: string, nodes: number) => unit.repeat(Math.floor((NODES - 200) / nodes));

const release = (value: string) => field("Releases", `<a class="time">01/01/2020</a> ${value}`);
const entry = (id: string, label: string) =>
  `<a href="/entry/${id}" class="item-entry"><span switch="">${label}</span></a>`;

/**
 * Material groups nested `groups` deep around `count` entries in rows of 500, the first `named` of
 * them named, so a reader that reads an entry once per group around it passes the entries limit.
 */
function nestedMaterialGroups(groups: number, count: number, named: number): string {
  const rows: string[] = [];
  for (let start = 0; start < count; start += 500) {
    let row = "";
    for (let index = start; index < Math.min(count, start + 500); index += 1) {
      row +=
        index < named
          ? entry(String(index + 1), "x")
          : `<a class="item-entry" href="/entry/${index + 1}"></a>`;
    }
    rows.push(`<b>${row}</b>`);
  }
  return '<div class="item-entries">'.repeat(groups) + rows.join("") + "</div>".repeat(groups);
}

type Row = readonly [name: string, outcome: string, build: () => string];

const ADVERSARIAL_PAGES: readonly Row[] = [
  [
    "price: comma groups with no currency",
    "parsed",
    () => fill(",111", (run) => ({ fields: release(`1${run}`) })),
  ],
  [
    "price: decimal points with no currency",
    "parsed",
    () => fill(".1", (run) => ({ fields: release(`1${run}`) })),
  ],
  [
    "price: a long fraction before a currency",
    "parsed",
    () => fill("1", (run) => ({ fields: release(`1.${run} JPY`) })),
  ],
  [
    "price: a digit then whitespace with no currency",
    "parsed",
    () => fill(" ", (run) => ({ fields: release(`1${run}x`) })),
  ],
  [
    "barcode: barcode characters with a failing tail",
    "parsed",
    () => fill("A", (run) => ({ fields: release(`1 JPY &bull; ${run}!`) })),
  ],
  [
    "barcode: dashes with a failing tail",
    "parsed",
    () => fill("-", (run) => ({ fields: release(`1 JPY &bull; ${run}!`) })),
  ],
  [
    "barcode: bullets after the first",
    "parsed",
    () => fill("&bull;", (run) => ({ fields: release(`1 JPY ${run}`) })),
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
    "too_large:children",
    () => fill("<a>v</a>", (run) => ({ fields: field("Version", run) })),
  ],
  [
    "sibling Releases fields",
    "too_large:children",
    () =>
      fill('<div class="data-field"><div class="data-label">Releases</div></div>', (run) => ({
        fields: run,
      })),
  ],
  [
    "Releases followed by sibling unlabelled releases",
    "too_large:children",
    () =>
      fill('<div class="data-field"><a class="time">01/01/2020</a></div>', (run) => ({
        fields: release("1 JPY") + run,
      })),
  ],
  [
    "sibling fields with unknown labels",
    "too_large:children",
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
    "too_large:children",
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
    "too_large:children",
    () =>
      fillWith(
        (role) =>
          `<div class="item-entries">${entry("1", "x")}<small class="light"><em>${role}</em></small></div>`,
        (run) => ({ fields: field("Company", run) }),
      ),
  ],
  [
    "many distinct entries",
    "too_large:children",
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
  [
    "a role inside nested em elements",
    "too_large:valueLength",
    () =>
      fill("x", (run) => ({
        fields: field(
          "Company",
          `<div class="item-entries">${entry("1", "x")}<small class="light">${"<em>".repeat(28)}${run}${"</em>".repeat(28)}</small></div>`,
        ),
      })),
  ],
  [
    "a release type inside nested em elements",
    "too_large:valueLength",
    () =>
      fill("x", (run) => ({
        fields: release(
          `<small class="light">${"<em>".repeat(28)}${run}${"</em>".repeat(28)}</small>`,
        ),
      })),
  ],
  [
    "a version inside nested links",
    "too_large:valueLength",
    () =>
      fill("x", (run) => ({
        fields: field("Version", "<a>".repeat(29) + run + "</a>".repeat(29)),
      })),
  ],
  [
    "a scale inside nested scale links",
    "too_large:valueLength",
    () =>
      fill("1", (run) => ({
        fields: field(
          "Dimensions",
          `${'<a class="item-scale">'.repeat(29)}1/${run}${"</a>".repeat(29)}`,
        ),
      })),
  ],
  [
    "material percentages inside nested small.light elements",
    "parsed",
    () =>
      fill("1", (run) => ({
        fields: field(
          "Materials",
          `<div class="item-entries">${'<small class="light">'.repeat(28)}${run}${"</small>".repeat(28)}</div>`,
        ),
      })),
  ],
  [
    "a barcode",
    "too_large:valueLength",
    () => fill("A", (run) => ({ fields: release(`1 JPY &bull; <a>${run}</a>\n  `) })),
  ],
  [
    "a barcode of dashes in text",
    "too_large:valueLength",
    () => fill("-", (run) => ({ fields: release(`1 JPY &bull; ${run} `) })),
  ],
  [
    "a Title field",
    "too_large:valueLength",
    () => fill("x", (run) => ({ fields: field("Title", run) })),
  ],
  [
    "an element with one element child past the children limit",
    "too_large:children",
    () => padded({ fields: `<div>${"<i></i>".repeat(CHILDREN + 1)}</div>` }),
  ],
  [
    "elements before the page's html element",
    "too_large:children",
    () => fill("<br>", (run) => ({ before: run, fields: "" })),
  ],
  [
    "headings before the page's html element",
    "too_large:children",
    () => fill('<h1 class="title"></h1>', (run) => ({ before: run, fields: "" })),
  ],
  [
    "elements in the body",
    "too_large:children",
    () => fill("<br>", (run) => ({ fields: "", after: run })),
  ],
  [
    "elements in a data field",
    "too_large:children",
    () =>
      fill("<br>", (run) => ({
        fields: `<div class="data-field"><div class="data-label">Title</div><div class="data-value">x</div>${run}</div>`,
      })),
  ],
  [
    "data values in a data field",
    "too_large:children",
    () =>
      fill('<p class="data-value"></p>', (run) => ({
        fields: `<div class="data-field"><div class="data-label">Title</div>${run}</div>`,
      })),
  ],
  [
    "data labels in a data field",
    "too_large:children",
    () =>
      fill('<p class="data-label"></p>', (run) => ({
        fields: `<div class="data-field">${run}</div>`,
      })),
  ],
  [
    "elements in the Category value",
    "too_large:children",
    () => fill("<br>", (run) => ({ category: `<span>Prepainted</span>${run}`, fields: "" })),
  ],
  [
    "elements in an entry group",
    "too_large:children",
    () =>
      fill("<br>", (run) => ({
        fields: field(
          "Materials",
          `<div class="item-entries">${entry("1", "x")}<small class="light">1%</small>${run}</div>`,
        ),
      })),
  ],
  [
    "elements in an entry link",
    "too_large:children",
    () =>
      fill("<br>", (run) => ({
        fields: field(
          "Origin",
          `<div class="item-entries"><a href="/entry/1" class="item-entry"><span switch="">x</span>${run}</a></div>`,
        ),
      })),
  ],
  [
    "elements in a release type",
    "too_large:children",
    () =>
      fill("<br>", (run) => ({
        fields: release(`<small class="light"><em>Standard</em>${run}</small> 1,000 JPY`),
      })),
  ],
  [
    "entry links nested in an entry link around many names",
    "too_large:children",
    () =>
      fill('<span switch="">x</span>', (run) => ({
        fields: field(
          "Origin",
          '<a class="item-entry" href="/entry/1">'.repeat(30) + run + "</a>".repeat(30),
        ),
      })),
  ],
  [
    "entry groups nested in an entry group around many percentages",
    "too_large:children",
    () =>
      fill('<small class="light">1%</small>', (run) => ({
        fields: field(
          "Materials",
          '<div class="item-entries">'.repeat(15) + run + "</div>".repeat(15),
        ),
      })),
  ],
  [
    "release types nested in a release type around many parts",
    "too_large:children",
    () =>
      fill("<em>t</em>", (run) => ({
        fields: release('<small class="light">'.repeat(29) + run + "</small>".repeat(29)),
      })),
  ],
  [
    "comments in the body",
    "too_large:nodes",
    () => fill("<!---->", (run) => ({ fields: "", after: run })),
  ],
  [
    "unmatched paragraph ends at the depth limit",
    "too_large:children",
    () => fill("</p>", (run) => ({ fields: "", after: "<b>".repeat(PAGE_DEPTH) + run })),
  ],
  [
    "unmatched end tags at the depth limit",
    "parsed",
    () => fill("</x>", (run) => ({ fields: "", after: "<b>".repeat(PAGE_DEPTH) + run })),
  ],
  [
    "release fields as wide and deep as the tree limits allow",
    "parsed",
    () =>
      padded({
        fields: deep(
          PAGE_DEPTH - 3,
          release("1 JPY") +
            asManyAsFit(
              `<div class="data-field"><a class="time">01/01/2020</a><div class="data-value">1 JPY</div>${"<br>".repeat(CHILDREN - 2)}</div>`,
              CHILDREN + 3,
            ),
        ),
      }),
  ],
  [
    "Title fields as wide and deep as the tree limits allow",
    "parsed",
    () =>
      padded({
        fields: deep(
          PAGE_DEPTH - 3,
          asManyAsFit(
            `<div class="data-field"><div class="data-label">Title</div><div class="data-value">x</div>${"<br>".repeat(CHILDREN - 2)}</div>`,
            CHILDREN + 3,
          ),
        ),
      }),
  ],
  [
    "entry links as wide and deep as the tree limits allow",
    "parsed",
    () =>
      padded({
        fields: deep(
          PAGE_DEPTH - 6,
          field(
            "Origin",
            `<div class="item-entries">${asManyAsFit(`<a href="/entry/1" class="item-entry">${'<span switch=""></span>'.repeat(CHILDREN)}</a>`, CHILDREN + 1)}</div>`,
          ),
        ),
      }),
  ],
  [
    "entry groups as wide and deep as the tree limits allow",
    "parsed",
    () =>
      padded({
        fields: deep(
          PAGE_DEPTH - 6,
          field(
            "Materials",
            asManyAsFit(
              `<div class="item-entries">${entry("1", "x")}${'<small class="light">1%</small>'.repeat(CHILDREN - 1)}</div>`,
              2 * CHILDREN + 1,
            ),
          ),
        ),
      }),
  ],
  [
    "material groups nested to the field depth limit around the most entries that fit",
    "parsed",
    () =>
      padded({
        fields: deep(
          PAGE_DEPTH - FIELD_DEPTH - 3,
          field("Materials", nestedMaterialGroups(FIELD_DEPTH - 3, NODES - 250, 40)),
        ),
      }),
  ],
  [
    "release types in as many small.light elements as the tree limits allow",
    "parsed",
    () =>
      padded({
        fields: deep(
          PAGE_DEPTH - 6,
          release(
            `<small class="light">${"<em></em>".repeat(18)}</small>`.repeat(
              Math.min(CHILDREN - 2, Math.floor((NODES - 200) / 19)),
            ),
          ),
        ),
      }),
  ],
];

const AT_LIMIT_PAGES: readonly (readonly [string, () => string])[] = [
  [
    "an element with as many element children as the children limit",
    () => padded({ fields: `<div>${"<i></i>".repeat(CHILDREN)}</div>` }),
  ],
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
    () => padded({ fields: deep(PAGE_DEPTH, field("Title", "x ".repeat(900))) }),
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
