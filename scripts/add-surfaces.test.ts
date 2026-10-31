import { describe, expect, test } from "bun:test";
import path from "node:path";
import { Glob } from "bun";

// The Add page once wrote its own table, cards and popups, and each drifted from the app's until
// someone noticed. It builds from the shared components now, and these are what writing its own
// surface again would have to use. It proves the page uses the shared parts, not its pixels.
const RAW_TABLE = /<(?:table|thead|tbody|tr|th|td)[\s>]/u;
const OWN_SURFACE =
  /(?<![\w-])(?:bg-card|bg-popover|ring-foreground|rounded-xl|rounded-2xl|shadow-md|shadow-lg|backdrop-blur(?:-\w+)?|bg-background\/\S*)(?![\w-])/u;

function ownSurfaces(file: string, text: string): string[] {
  return text.split("\n").flatMap((line, index) => {
    const table = RAW_TABLE.exec(line)?.[0];
    const surface = OWN_SURFACE.exec(line)?.[0];
    return [
      ...(table ? [`${file}:${index + 1} writes a raw ${table.trim()}`] : []),
      ...(surface ? [`${file}:${index + 1} uses ${surface}`] : []),
    ];
  });
}

describe("an Add surface of its own", () => {
  const flagged = (line: string) => ownSurfaces("fixture.tsx", line);

  test.each(["<table>", "<thead>", "<tbody>", "<tr className='x'>", "<th scope='col'>", "<td>"])(
    "is flagged for a raw %s",
    (tag) => {
      expect(flagged(tag)).toHaveLength(1);
    },
  );

  test.each([
    "bg-card",
    "bg-popover",
    "ring-foreground/10",
    "rounded-xl",
    "rounded-2xl",
    "shadow-md",
    "shadow-lg",
    "backdrop-blur",
    "backdrop-blur-xs",
    "bg-background/70",
  ])("is flagged for %s", (name) => {
    expect(flagged(`<div className="flex ${name} gap-2" />`)).toHaveLength(1);
  });

  test("is not flagged for the shared components or a near name", () => {
    expect(flagged("<DataGridTable />")).toEqual([]);
    expect(flagged("<track /> <thing /> <template />")).toEqual([]);
    expect(
      flagged('<div className="bg-muted rounded-lg shadow-none rounded-xs bg-background" />'),
    ).toEqual([]);
  });

  test("names the file and line", () => {
    expect(ownSurfaces("a.tsx", "first\n<table>\n")).toEqual(["a.tsx:2 writes a raw <table>"]);
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
