import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const source = `
import { describe, test } from "bun:test";
const row = () => ["runtime case"];
test.each([[...row()]])("%s", () => {});
describe["if"](false)("skipped suite", () => { test("skipped descendant", () => {}); });
function uncalled() { test("uncalled helper", () => {}); }
function conditionalRegistration() { test("conditional helper", () => {}); }
if (false) conditionalRegistration();
function early() { return; test("after return", () => {}); }
early();
const run = true ? describe.skip : describe;
run("skipped binding", () => { test("skipped through binding", () => {}); });
try {} finally { test("finally registered", () => {}); }
test("always passed", () => {});
`;

async function fixture(name: string, report: boolean) {
  const root = await mkdtemp(path.join(import.meta.dir, "../node_modules/replay-coverage-"));
  try {
    await mkdir(path.join(root, "scripts"));
    await mkdir(path.join(root, "apps/example"), { recursive: true });
    await Bun.write(
      path.join(root, "package.json"),
      JSON.stringify({ name: "coverage-fixture", workspaces: ["apps/*"] }),
    );
    await Bun.write(
      path.join(root, "apps/example/package.json"),
      JSON.stringify({ name: "example", scripts: { test: "bun test" } }),
    );
    await Bun.write(path.join(root, "apps/example/cases.test.ts"), source);
    await Bun.write(
      path.join(root, "scripts/replays.json"),
      JSON.stringify({
        test: [
          {
            fix: "a".repeat(40),
            testAt: "b".repeat(40),
            reason: "Fixture pin",
            test: "apps/example/cases.test.ts",
            fixed: [name],
          },
        ],
      }),
    );
    for (const file of ["check-replay-coverage.ts", "replay-names.ts", "replay-reports.ts"]) {
      const original = Bun.file(path.join(import.meta.dir, file));
      if (await original.exists()) await Bun.write(path.join(root, "scripts", file), original);
    }
    if (report) {
      const run = Bun.spawn(
        [
          process.execPath,
          "test",
          "./cases.test.ts",
          "--reporter=junit",
          "--reporter-outfile=test-results.xml",
        ],
        { cwd: path.join(root, "apps/example"), stdout: "pipe", stderr: "pipe" },
      );
      const [code, stdout, stderr] = await Promise.all([
        run.exited,
        new Response(run.stdout).text(),
        new Response(run.stderr).text(),
      ]);
      expect({ code, output: stdout + stderr }).toMatchObject({ code: 0 });
    }
    const run = Bun.spawn([process.execPath, "./scripts/check-replay-coverage.ts"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      run.exited,
      new Response(run.stdout).text(),
      new Response(run.stderr).text(),
    ]);
    return { code, output: stdout + stderr };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("replay coverage rejects names Bun did not actually run", async () => {
  const run = await fixture("uncalled helper", true);
  expect(run.code).not.toBe(0);
  expect(run.output).toContain("uncalled helper");
});

test("replay coverage without reports requires the full test run", async () => {
  const run = await fixture("always passed", false);
  expect(run.code).not.toBe(0);
  expect(run.output).toContain("bun run test");
});

test("replay coverage accepts runtime and finally registrations", async () => {
  for (const name of ["runtime case", "finally registered", "always passed"]) {
    const run = await fixture(name, true);
    expect(run).toMatchObject({ code: 0 });
    expect(run.output).toContain("real Bun JUnit reports");
  }
});
