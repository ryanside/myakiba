import { expect, test } from "bun:test";
import path from "node:path";
import * as hugeicons from "@hugeicons/core-free-icons";
import * as icons from "./icons";

const src = path.resolve(import.meta.dir, "..");
const scraperCode = ["components/sync/", "components/settings/data-transfer/"];
const mapped = new Set<unknown>(Object.values(icons));
const glyphs = new Map<string, unknown>(Object.entries(hugeicons));
const hugeiconsImport = /import\s*\{([^}]*)\}\s*from\s*"@hugeicons\/core-free-icons"/g;
const directionName =
  /^(Circle|Square)?(Fading)?(Arrows?|Chevrons?|Move)(Big|Move|Out)?(Up|Down|Left|Right|Top|Bottom)|^(Circle|Square)?(Arrows?|Chevrons?)(Diagonal|Horizontal|Vertical|First|Last|AllDirection)|^Curvy(Left|Right|Up|Down)/;
// Hugeicons exports one glyph under several names, so an alias such as NewTab is caught by its glyph.
const directionGlyphs = new Set(
  [...glyphs].filter(([name]) => directionName.test(name)).map(([, glyph]) => glyph),
);

function bypassesOf(source: string): string[] {
  return [...source.matchAll(hugeiconsImport)]
    .flatMap(([, names = ""]) => names.split(","))
    .map((name) => name.trim().split(/\s+as\s+/)[0] ?? "")
    .filter((name) => directionGlyphs.has(glyphs.get(name)) || mapped.has(glyphs.get(name)));
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
        'import { ArrowUpRight01Icon, MoveLeftIcon, ArrowTurnBackwardIcon } from "@hugeicons/core-free-icons";\n' +
        'import { ArrowDiagonalIcon, ChevronFirstIcon, ChevronLastIcon, SquareArrowVerticalIcon } from "@hugeicons/core-free-icons";\n' +
        'import { MoveTopIcon, NewTab, CircleFadingArrowUpIcon } from "@hugeicons/core-free-icons";\n' +
        'import { ArrowAllDirectionIcon, CurvyLeftRightDirectionIcon } from "@hugeicons/core-free-icons";\n' +
        'import { BowArrowIcon, PinOffIcon, DragDropVerticalIcon, ArrowExpandIcon } from "@hugeicons/core-free-icons";\n' +
        'import { MoveDiagonal, MoveDiagonal2, ArrowTurnBackwardIcon as Reset } from "@hugeicons/core-free-icons";\n' +
        'import { DirectionLeft01Icon, DirectionRightIcon } from "@hugeicons/core-free-icons";',
    ),
  ).toEqual([
    "ArrowRight01Icon",
    "ArrowRightIcon",
    "ArrowUpRight01Icon",
    "MoveLeftIcon",
    "ArrowDiagonalIcon",
    "ChevronFirstIcon",
    "ChevronLastIcon",
    "SquareArrowVerticalIcon",
    "MoveTopIcon",
    "NewTab",
    "CircleFadingArrowUpIcon",
    "ArrowAllDirectionIcon",
    "CurvyLeftRightDirectionIcon",
  ]);
});
