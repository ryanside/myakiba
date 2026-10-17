import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { $ } from "bun";

const oxlint = path.resolve(import.meta.dir, "../../node_modules/.bin/oxlint");

async function flaggedLines(rule: string, source: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "myakiba-lint-"));
  try {
    await Bun.write(path.join(dir, "probe.ts"), source);
    await Bun.write(
      path.join(dir, "oxlintrc.json"),
      JSON.stringify({
        plugins: [],
        categories: { correctness: "off" },
        jsPlugins: [{ name: "myakiba", specifier: path.join(import.meta.dir, "myakiba.mjs") }],
        rules: { [rule]: "warn" },
      }),
    );
    const lint = await $`${oxlint} -c oxlintrc.json --disable-nested-config -f json probe.ts`
      .cwd(dir)
      .nothrow()
      .quiet();
    const { diagnostics }: { diagnostics: { labels: { span: { line: number } }[] }[] } =
      lint.json();
    return diagnostics.map(({ labels }) => labels[0]?.span.line ?? 0).toSorted((a, b) => a - b);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("myakiba/no-iso-slice", () => {
  const cases: [call: string, takesDate: boolean][] = [
    ["slice(0, 10)", true],
    ["slice(0, 7)", true],
    ["slice(0, 4)", true],
    ["slice(0, -14)", true],
    ["slice(0, -17)", true],
    ["slice(0, -20)", true],
    ["substring(0, 10)", true],
    ["substr(0, 10)", true],
    ['split("T")', true],
    ["slice(0, 1)", false],
    ["slice(0, -1)", false],
    ["slice(0, -21)", false],
    ["slice(0, 19)", false],
    ["slice(11, 19)", false],
    ["substring(0, -14)", false],
    ["slice(0)", false],
  ];

  test("flags each toISOString() trim that keeps only a date part", async () => {
    const source = cases
      .map(([call], index) => `export const value${index} = new Date().toISOString().${call};`)
      .join("\n");
    const expected = cases.flatMap(([, takesDate], index) => (takesDate ? [index + 1] : []));
    expect(await flaggedLines("myakiba/no-iso-slice", source)).toEqual(expected);
  });
});
