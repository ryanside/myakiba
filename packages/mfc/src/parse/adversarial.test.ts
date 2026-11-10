import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { parseJson } from "@myakiba/utils/parse-json";

const PAGE_BYTES = 2 * 1024 * 1024;
const BOUND_MS = 1000;
/** Long enough for a child process to start on a slow runner, short enough to cut off a quadratic parse. */
const DEADLINE_MS = 5000;
const TIME_PARSE = new URL("../../test/time-parse.ts", import.meta.url).pathname;

type Page = { readonly head?: string; readonly title?: string; readonly fields: string };

function shell({ head = "", title = "T", fields }: Page): string {
  return `<html><head>${head}<link rel="canonical" href="https://myfigurecollection.net/item/1"></head><body><h1 class="title">${title}</h1><div class="item-object">${field("Category", "<span>Prepainted</span>")}${fields}</div></body></html>`;
}

function field(label: string, value: string): string {
  return `<div class="data-field"><div class="data-label">${label}</div><div class="data-value">${value}</div></div>`;
}

/** Appends `unit(0)`, `unit(1)`, … while the page built around them stays within the upload limit. */
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

const release = (value: string) => field("Releases", `<a class="time">01/01/2020</a> ${value}`);
const entry = (id: string, label: string) =>
  `<a href="/entry/${id}" class="item-entry"><span switch="">${label}</span></a>`;

/** One row per field reader and pattern: the worst 2 MB page for it. A new reader adds its row. */
const ADVERSARIAL_PAGES: readonly (readonly [string, () => string])[] = [
  [
    "price: comma groups with no currency",
    () => fill(",111", (run) => ({ fields: release(`1${run}`) })),
  ],
  [
    "price: a digit then whitespace with no currency",
    () => fill(" ", (run) => ({ fields: release(`1${run}x`) })),
  ],
  [
    "barcode: barcode characters with a failing tail",
    () => fill("A", (run) => ({ fields: release(`${run}!`) })),
  ],
  [
    "barcode: dashes with a failing tail",
    () => fill("-", (run) => ({ fields: release(`${run} `) })),
  ],
  [
    "material percentage: digits with no percent sign",
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
    () => fill("1,", (run) => ({ fields: field("Dimensions", `H=${run}`) })),
  ],
  ["width: repeated openers", () => fill("W=1", (run) => ({ fields: field("Dimensions", run) }))],
  ["depth: repeated openers", () => fill("L=1", (run) => ({ fields: field("Dimensions", run) }))],
  [
    "dimensions: whitespace",
    () => fill(" \n", (run) => ({ fields: field("Dimensions", `H=${run}1mm`) })),
  ],
  [
    "entry id: a long id",
    () =>
      fill("1", (run) => ({
        fields: field("Origin", `<div class="item-entries">${entry(run, "x")}</div>`),
      })),
  ],
  [
    "rating id: a long id",
    () => fill("1", (run) => ({ fields: field("Various", `<a href="/?ratingId=${run}x">r</a>`) })),
  ],
  ["title field: whitespace", () => fill(" \t", (run) => ({ fields: field("Title", `a${run}b`) }))],
  ["version: many links", () => fill("<a>v</a>", (run) => ({ fields: field("Version", run) }))],
  [
    "sibling Releases fields",
    () =>
      fill('<div class="data-field"><div class="data-label">Releases</div></div>', (run) => ({
        fields: run,
      })),
  ],
  [
    "sibling fields with unknown labels",
    () => fill(field("Sculpting", "x"), (run) => ({ fields: run })),
  ],
  [
    "entry groups with roles",
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
    () =>
      fillWith(
        (role) =>
          `<div class="item-entries">${entry("1", "x")}<small class="light"><em>${role}</em></small></div>`,
        (run) => ({ fields: field("Company", run) }),
      ),
  ],
  [
    "many distinct entries",
    () =>
      fillWith(
        (id) => entry(String(id + 1), String(id)),
        (run) => ({ fields: field("Character", run) }),
      ),
  ],
  [
    "title: an unclosed content label",
    () => fill("a", (run) => ({ title: `[${run}`, fields: "" })),
  ],
  [
    "title: a content label with a failing tail",
    () => fill("]", (run) => ({ title: `[Explicit${run}`, fields: "" })),
  ],
  [
    "page title: whitespace",
    () => fill(" ", (run) => ({ head: `<title>${run}x</title>`, fields: "" })),
  ],
];

const timedParse = z.object({ ms: z.number(), outcome: z.string() });

/** Parses in a child process, so a parse that would run for an hour is killed at the deadline. */
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
    `%s answers a Result within ${BOUND_MS} ms`,
    async (_name, build) => {
      const html = build();
      expect(html.length).toBeLessThanOrEqual(PAGE_BYTES);
      expect(html.length).toBeGreaterThan(PAGE_BYTES - 1000);
      const timed = await timeParse(html);
      expect(timed).not.toBe("too slow");
      if (timed === "too slow") return;
      expect(timed.outcome).not.toStartWith("threw");
      expect(timed.ms).toBeLessThan(BOUND_MS);
    },
    DEADLINE_MS * 2,
  );
});
