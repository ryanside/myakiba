import path from "node:path";
import { namesIn } from "./replay-names";

const root = path.resolve(import.meta.dir, "..");
const {
  test: replays,
}: {
  test: {
    test: string;
    testAt?: string;
    fixed: string[];
    head?: { test: string; fixed: string[]; reason: string }[];
  }[];
} = await Bun.file(path.join(import.meta.dir, "replays.json")).json();
const current = replays
  .filter((entry) => entry.testAt)
  .flatMap((entry) => entry.head ?? [{ test: entry.test, fixed: entry.fixed }]);
const missing: string[] = [];
for (const file of new Set(current.map((entry) => entry.test))) {
  const names = namesIn(file, await Bun.file(path.resolve(root, file)).text());
  for (const coverage of current.filter((candidate) => candidate.test === file))
    for (const name of coverage.fixed) if (!names.has(name)) missing.push(`${file}: ${name}`);
}
if (missing.length > 0) throw new Error(`Missing pinned replay coverage:\n${missing.join("\n")}`);
console.log(
  `Verified ${current.reduce((count, entry) => count + entry.fixed.length, 0)} pinned replay names.`,
);
