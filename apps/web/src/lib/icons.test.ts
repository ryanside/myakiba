import { expect, test } from "bun:test";
import path from "node:path";
import * as hugeicons from "@hugeicons/core-free-icons";
import * as icons from "./icons";

const src = path.resolve(import.meta.dir, "..");
const scraperCode = ["components/sync/", "components/settings/data-transfer/"];
const mapped = new Set<unknown>(Object.values(icons));
const glyphs = new Map<string, unknown>(Object.entries(hugeicons));
const hugeiconsImport = /import\s*\{([^}]*)\}\s*from\s*"@hugeicons\/core-free-icons"/g;
const directionGlyph =
  /^(Circle|Square)?(Arrows?|Chevrons?|Direction|Move)(Big|Move|Out)?(Up|Down|Left|Right)/;

function bypassesOf(source: string): string[] {
  return [...source.matchAll(hugeiconsImport)]
    .flatMap(([, names = ""]) => names.split(","))
    .map((name) => name.trim().split(/\s+as\s+/)[0] ?? "")
    .filter((name) => directionGlyph.test(name) || mapped.has(glyphs.get(name)));
}

test("picks every direction icon by meaning from lib/icons", async () => {
  const bypasses: string[] = [];
  for await (const file of new Bun.Glob("**/*.{ts,tsx}").scan(src)) {
    if (file.startsWith("lib/icons.") || scraperCode.some((dir) => file.startsWith(dir))) continue;
    const names = bypassesOf(await Bun.file(path.join(src, file)).text());
    bypasses.push(...names.map((name) => `${file} imports ${name}`));
  }
  expect(bypasses).toEqual([]);
});

test("finds a direction icon imported straight from hugeicons", () => {
  expect(
    bypassesOf(
      'import { PackageIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons";\n' +
        'import { ArrowRightIcon as Next } from "@hugeicons/core-free-icons";\n' +
        'import { ArrowUpRight01Icon, MoveLeftIcon, ArrowTurnBackwardIcon } from "@hugeicons/core-free-icons";',
    ),
  ).toEqual(["ArrowRight01Icon", "ArrowRightIcon", "ArrowUpRight01Icon", "MoveLeftIcon"]);
});
