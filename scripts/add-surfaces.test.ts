import { describe, expect, test } from "bun:test";
import path from "node:path";
import { Glob } from "bun";

// The Add page once wrote its own table, cards and popups, and each drifted from the app's until
// someone noticed. It builds from the shared components now, and these are what writing its own
// surface again would have to use. It proves the page uses the shared parts, not its pixels.
const TABLE_TAG = "(?:table|thead|tbody|tr|th|td)";
const RAW_TABLE = new RegExp(String.raw`<${TABLE_TAG}(?=[\s/>])`, "gu");
const CREATED_TABLE = new RegExp(String.raw`createElement\(\s*["'\x60]${TABLE_TAG}["'\x60]`, "gu");
const OWN_SURFACE =
  /(?<![\w-])(?:bg-card|bg-popover|bg-\[[^\]\s]*\]|ring-foreground|rounded-\[[^\]\s]*\]|rounded-(?:xl|2xl|3xl)|shadow-(?:md|lg|xl|2xl)|backdrop-blur(?:-\[[^\]\s]*\]|-\w+)?|bg-background\/\S*)(?![\w-])/gu;
const CARD_IMPORT = /["'][^"'\n]*\/ui\/card["']/gu;

function ownSurfaces(file: string, text: string): string[] {
  const lineOf = (index: number) => text.slice(0, index).split("\n").length;
  const hits = (pattern: RegExp, say: (found: string) => string) =>
    [...text.matchAll(pattern)].map((match) => ({
      at: match.index,
      found: match[0],
      message: `${file}:${lineOf(match.index)} ${say(match[0])}`,
    }));
  return [
    ...hits(RAW_TABLE, (found) => `writes a raw ${found}`),
    ...hits(CREATED_TABLE, (found) => `creates a raw table with ${found}`),
    ...hits(OWN_SURFACE, (found) => `uses ${found}`),
    ...hits(CARD_IMPORT, (found) => `imports ${found}`),
  ]
    .toSorted((a, b) => a.at - b.at)
    .map(({ message }) => message);
}

describe("an Add surface of its own", () => {
  const flagged = (line: string) => ownSurfaces("fixture.tsx", line);

  test.each(["<table>", "<thead>", "<tbody>", "<tr className='x'>", "<th scope='col'>", "<td />"])(
    "is flagged for a raw %s",
    (tag) => {
      expect(flagged(tag)).toHaveLength(1);
    },
  );

  test.each(["table", "thead", "tbody", "tr", "th", "td"])(
    "is flagged for a raw <%s with its props on the next line",
    (tag) => {
      expect(ownSurfaces("a.tsx", `first\n<${tag}\n  className="w-full"\n/>`)).toEqual([
        `a.tsx:2 writes a raw <${tag}`,
      ]);
    },
  );

  test.each(["table", "thead", "tbody", "tr", "th", "td"])(
    "is flagged for createElement of %s",
    (tag) => {
      expect(flagged(`createElement("${tag}", null)`)).toHaveLength(1);
      expect(flagged(`createElement(\n  '${tag}',\n  null,\n)`)).toHaveLength(1);
    },
  );

  test.each([
    "bg-card",
    "bg-popover",
    "bg-[color-mix(in_srgb,var(--color-muted)_40%,var(--color-background))]",
    "ring-foreground/10",
    "rounded-xl",
    "rounded-2xl",
    "rounded-3xl",
    "rounded-[14px]",
    "shadow-md",
    "shadow-lg",
    "shadow-xl",
    "shadow-2xl",
    "backdrop-blur",
    "backdrop-blur-xs",
    "backdrop-blur-[2px]",
    "bg-background/70",
  ])("is flagged for %s", (name) => {
    expect(flagged(`<div className="flex ${name} gap-2" />`)).toHaveLength(1);
  });

  test.each([
    'import { Card } from "@/components/ui/card";',
    "import { Card } from '../ui/card';",
    'const Card = await import("@/components/ui/card");',
  ])("is flagged for %s", (line) => {
    expect(flagged(line)).toHaveLength(1);
  });

  test("finds every surface on a line", () => {
    expect(flagged('<div className="rounded-[14px] rounded-3xl shadow-xl" />')).toHaveLength(3);
  });

  test("is not flagged for the shared components or a near name", () => {
    expect(flagged("<DataGridTable />")).toEqual([]);
    expect(flagged("<track /> <thing /> <template /> <Table> <td-like />")).toEqual([]);
    expect(
      flagged('<div className="bg-muted rounded-lg shadow-none rounded-xs bg-background" />'),
    ).toEqual([]);
    expect(flagged('import { cardOf } from "./ui/cards";')).toEqual([]);
  });

  test("names the file and line", () => {
    expect(ownSurfaces("a.tsx", "first\n<table>\n")).toEqual(["a.tsx:2 writes a raw <table"]);
    expect(ownSurfaces("a.tsx", "\n\n\nshadow-2xl")).toEqual(["a.tsx:4 uses shadow-2xl"]);
  });
});

test("nothing in the Add page's components writes a surface of its own", async () => {
  const root = path.resolve(import.meta.dir, "..");
  const hits: string[] = [];
  for await (const file of new Glob("apps/web/src/components/add/**/*.{ts,tsx}").scan(root)) {
    if (/\.test\.tsx?$/u.test(file)) continue;
    hits.push(...ownSurfaces(file, await Bun.file(path.join(root, file)).text()));
  }
  expect(hits).toEqual([]);
});
