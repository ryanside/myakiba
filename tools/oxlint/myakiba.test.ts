import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { $ } from "bun";

const oxlint = path.resolve(import.meta.dir, "../../node_modules/.bin/oxlint");

async function flaggedCases(rule: string, cases: string[]) {
  const dir = await mkdtemp(path.join(tmpdir(), "myakiba-lint-"));
  try {
    await Promise.all(
      cases.map((code, index) => Bun.write(path.join(dir, `case${index}.ts`), code)),
    );
    await Bun.write(
      path.join(dir, "oxlintrc.json"),
      JSON.stringify({
        plugins: [],
        categories: { correctness: "off" },
        jsPlugins: [{ name: "myakiba", specifier: path.join(import.meta.dir, "myakiba.mjs") }],
        rules: { [rule]: "warn" },
      }),
    );
    const lint = await $`${oxlint} -c oxlintrc.json --disable-nested-config -f json .`
      .cwd(dir)
      .nothrow()
      .quiet();
    const { diagnostics }: { diagnostics: { filename: string }[] } = lint.json();
    return [
      ...new Set(diagnostics.map(({ filename }) => Number(/\d+/u.exec(filename)?.[0]))),
    ].toSorted((a, b) => a - b);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const flags = async (rule: string, cases: [code: string, flagged: boolean][]) => {
  const expected = cases.flatMap(([, flagged], index) => (flagged ? [index] : []));
  expect(
    await flaggedCases(
      rule,
      cases.map(([code]) => code),
    ),
  ).toEqual(expected);
};

describe("myakiba/no-iso-slice", () => {
  test("flags every slice, substring, substr or split('T') of a toISOString() result", () =>
    flags("myakiba/no-iso-slice", [
      ["export const a = new Date().toISOString().slice(0, 10);", true],
      ["export const b = new Date().toISOString().slice(0, -14);", true],
      ["export const c = new Date().toISOString().slice(11, 19);", true],
      ["const end = 10; export const d = new Date().toISOString().slice(0, end);", true],
      ["export const e = new Date().toISOString().slice(0, 5 + 5);", true],
      ['export const f = new Date().toISOString()["slice"](0, 10);', true],
      ["export const g = new Date().toISOString()[`substring`](0, 10);", true],
      ["export const h = new Date().toISOString().substr(0, 10);", true],
      ['export const i = new Date().toISOString().split("T");', true],
      ['export const j = new Date()["toISOString"]().slice(0, 7);', true],
      ['const slice = "padEnd"; export const k = new Date().toISOString()[slice](0, 10);', false],
      ['export const l = new Date().toISOString().split(":");', false],
      ["export const m = new Date().toISOString().padEnd(30);", false],
      ["export const n = new Date().toISOString();", false],
    ]));
});

describe("myakiba/no-env-outside-env-package", () => {
  test("flags env reads on the real process, Bun and import.meta, not on a shadowing binding", () =>
    flags("myakiba/no-env-outside-env-package", [
      ["export const a = process.env.A;", true],
      ['export const b = process["env"].B;', true],
      ["export const c = Bun.env.C;", true],
      ["export const d = import.meta.env.D;", true],
      ["export const e = globalThis.process.env.E;", true],
      ["const { env } = process; export const f = env.F;", true],
      ['import { env } from "node:process"; export const g = env.G;', true],
      ['import type { env as Env } from "bun"; export type H = typeof Env;', false],
      ['import process from "node:process"; export const h2 = process.env.H;', true],
      ['import runtime from "node:process"; export const h3 = runtime.env.H;', true],
      ['import * as proc from "node:process"; export const h4 = proc.env.H;', true],
      ["export function i(process: { env: string }) { return process.env; }", false],
      ["export function j() { const process = { env: 1 }; return process.env; }", false],
      ["export function k(Bun: { env: string }) { const { env } = Bun; return env; }", false],
    ]));
});
