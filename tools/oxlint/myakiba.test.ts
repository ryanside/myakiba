import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { $ } from "bun";
import config from "../../oxlint.config.ts";

const oxlint = path.resolve(import.meta.dir, "../../node_modules/.bin/oxlint");

type Finding = { index: number; message: string; help?: string };
type RuleSetting = (typeof config.rules)[keyof typeof config.rules];

async function lintCases(rule: string, cases: string[], setting: RuleSetting = "warn") {
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
        rules: { [rule]: setting },
      }),
    );
    const lint = await $`${oxlint} -c oxlintrc.json --disable-nested-config -f json .`
      .cwd(dir)
      .env({ ...process.env, TZ: Intl.DateTimeFormat().resolvedOptions().timeZone })
      .nothrow()
      .quiet();
    const { diagnostics }: { diagnostics: { filename: string; message: string; help?: string }[] } =
      lint.json();
    return diagnostics
      .map(({ filename, message, help }): Finding => ({
        index: Number(/\d+/u.exec(filename)?.[0]),
        message,
        help,
      }))
      .toSorted((a, b) => a.index - b.index);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const flags = async (rule: string, cases: [code: string, flagged: boolean][]) => {
  const findings = await lintCases(
    rule,
    cases.map(([code]) => code),
  );
  expect([...new Set(findings.map(({ index }) => index))]).toEqual(
    cases.flatMap(([, flagged], index) => (flagged ? [index] : [])),
  );
  return findings;
};

const localDate = (offsetDays: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

describe("myakiba/no-iso-slice", () => {
  test("flags every slice, substring, substr or split('T') of a toISOString() result", async () => {
    const findings = await flags("myakiba/no-iso-slice", [
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
      ["export const j2 = new Date().toISOString().slice(0, 11);", true],
      ["export const j3 = new Date().toISOString().slice(0, 18);", true],
      ["export const j4 = new Date().toISOString().slice(0, -13);", true],
      ["export const j5 = (new Date().toISOString() as string).slice(0, 10);", true],
      ["export const j6 = new Date().toISOString()!.slice(0, 10);", true],
      ["export const j7 = new Date()?.toISOString()?.slice(0, 10);", true],
      ["export const j8 = new Date().toISOString().split(`T`)[0];", true],
      ["export const j9 = new Date().toISOString().split(/T/)[0];", true],
      ['const slice = "padEnd"; export const k = new Date().toISOString()[slice](0, 10);', false],
      ['export const l = new Date().toISOString().split(":");', false],
      ["export const m = new Date().toISOString().padEnd(30);", false],
      ["export const n = new Date().toISOString();", false],
    ]);
    for (const { message } of findings)
      expect(message).toContain('format(date, "yyyy-MM-dd") from date-fns');
  });
});

describe("myakiba/no-env-outside-env-package", () => {
  test("flags env reads on the real process, Bun and import.meta, not on a shadowing binding", async () => {
    const findings = await flags("myakiba/no-env-outside-env-package", [
      ["export const a = process.env.A;", true],
      ['export const b = process["env"].B;', true],
      ["export const c = Bun.env.C;", true],
      ["export const d = import.meta.env.D;", true],
      ["export const e = globalThis.process.env.E;", true],
      ["export const e2 = globalThis.Bun.env.E;", true],
      ["const { env } = process; export const f = env.F;", true],
      ["const { env } = Bun; export const f2 = env.F;", true],
      ['import { env } from "node:process"; export const g = env.G;', true],
      ['import { env } from "process"; export const g2 = env.G;', true],
      ['import { env } from "bun"; export const g3 = env.G;', true],
      ['import type { env as Env } from "bun"; export type H = typeof Env;', false],
      ['import { type env as Env } from "node:process"; export type H1 = typeof Env;', false],
      ['import process from "node:process"; export const h2 = process.env.H;', true],
      ['import runtime from "node:process"; export const h3 = runtime.env.H;', true],
      ['import * as proc from "node:process"; export const h4 = proc.env.H;', true],
      ["type process = { v: 1 }; export type P = process; export const t1 = process.env.T;", true],
      ["interface Bun { v: 1 } export type B = Bun; export const t2 = Bun.env.T;", true],
      ["declare const process: { env: string }; export const t3 = process.env;", true],
      ['import type process from "./types"; export const t4 = process.env.T;', true],
      ["export const w1 = (process as NodeJS.Process).env.W;", true],
      ["export const g1 = (globalThis as typeof globalThis).process.env.G;", true],
      ["export const { env: g2 } = (globalThis satisfies object).process;", true],
      ["export const g3 = (globalThis!).process.env.G;", true],
      ['export const g4 = globalThis["process"].env.G;', true],
      ["export const g5 = (globalThis as typeof globalThis).Bun.env.G;", true],
      ["export const w2 = (process satisfies object).env.W;", true],
      ["export const w3 = (process).env.W;", true],
      ["const { env } = process as NodeJS.Process; export const w4 = env.W;", true],
      ["export const w5 = (Bun as typeof Bun).env.W;", true],
      ['const process = require("node:process"); export const r1 = process.env.R;', true],
      ["const process = globalThis.process; export const r2 = process.env.R;", true],
      ["const runtime = process; export const r3 = runtime.env.R;", true],
      ['import { default as proc } from "node:process"; export const r4 = proc.env.R;', true],
      ["export function i(process: { env: string }) { return process.env; }", false],
      ["export function j() { const process = { env: 1 }; return process.env; }", false],
      ["export function k(Bun: { env: string }) { const { env } = Bun; return env; }", false],
      ["export enum process { env } export const t5 = process.env;", false],
    ]);
    for (const { message } of findings) expect(message).toContain('"@myakiba/env/server"');
  });
});

describe("myakiba/require-suppression-reason", () => {
  const exception = (until: string, approver = "Some Person") =>
    `-- the input is always a string (until ${until}, approved by ${approver})`;

  test("accepts only a named rule with a reason, a real unexpired date and an approver", async () => {
    const findings = await flags("myakiba/require-suppression-reason", [
      [
        `// oxlint-disable-next-line no-console ${exception("2099-12-31")}\nexport const a = 1;`,
        false,
      ],
      [
        `// eslint-disable-next-line no-console ${exception("2099-12-31")}\nexport const b = 1;`,
        false,
      ],
      [`export const c = 1; // oxlint-disable-line no-console ${exception("2099-12-31")}`, false],
      [`/* oxlint-disable no-console ${exception("2099-12-31")} */\nexport const d = 1;`, false],
      [
        `// oxlint-disable-next-line no-console ${exception(localDate(0))}\nexport const e = 1;`,
        false,
      ],
      ["// oxlint-disable-next-line no-console\nexport const f = 1;", true],
      ["export const g = 1; // oxlint-disable-line no-console", true],
      ["/* eslint-disable no-console */\nexport const h = 1;", true],
      [
        "// oxlint-disable-next-line no-console (until 2099-12-31, approved by Some Person)\nexport const j = 1;",
        true,
      ],
      [
        "// oxlint-disable-next-line no-console --  (until 2099-12-31, approved by Some Person)\nexport const k = 1;",
        true,
      ],
      [
        "// oxlint-disable-next-line no-console -- the input is a string (until 2099-12-31)\nexport const l = 1;",
        true,
      ],
      [
        `// oxlint-disable-next-line no-console ${exception("2099-12-31", "<name>")}\nexport const m = 1;`,
        true,
      ],
      [
        `// oxlint-disable-next-line no-console ${exception("2027-02-31")}\nexport const n = 1;`,
        true,
      ],
      [
        `// oxlint-disable-next-line no-console ${exception(localDate(-1))}\nexport const o = 1;`,
        true,
      ],
    ]);
    const form =
      "`// oxlint-disable-next-line <rule> -- <why this line is safe> (until YYYY-MM-DD, approved by <name>)`";
    for (const { index, message } of findings)
      expect(message).toContain(index === 13 ? `Exception expired on ${localDate(-1)}` : form);
  });
});

describe("oxlint.config.ts", () => {
  test("restricts JSON.parse with help that names parseJson", async () => {
    const [finding] = await lintCases(
      "no-restricted-properties",
      ['export const a = JSON.parse("{}");'],
      config.rules?.["no-restricted-properties"],
    );
    expect(finding?.help).toContain('parseJson(schema, text) from "@myakiba/utils/parse-json"');
  });

  test("exempts only the planned files from the JSON.parse and env rules", () => {
    const exempt = (rule: "no-restricted-properties" | "myakiba/no-env-outside-env-package") =>
      (config.overrides ?? [])
        .filter((override) => override.rules?.[rule] === "off")
        .flatMap((override) => override.files);
    expect(exempt("no-restricted-properties")).toEqual(["packages/utils/src/parse-json.ts"]);
    expect(exempt("myakiba/no-env-outside-env-package")).toEqual([
      "packages/env/**",
      "scripts/**",
      "**/test/**",
      "**/*.test.ts",
      "**/*.test.tsx",
    ]);
  });
});
