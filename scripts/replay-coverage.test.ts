import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { missingPassedTests } from "./replay-reports";

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

async function fixture(name: string) {
  const root = await mkdtemp(path.join(import.meta.dir, "../node_modules/replay-coverage-"));
  try {
    await mkdir(path.join(root, "scripts"));
    await mkdir(path.join(root, "apps/example"), { recursive: true });
    await Bun.write(
      path.join(root, "package.json"),
      JSON.stringify({ name: "coverage-fixture", workspaces: { packages: ["apps/*"] } }),
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
    for (const file of ["replay-reports.ts", "test-run.ts"]) {
      const original = Bun.file(path.join(import.meta.dir, file));
      if (await original.exists()) await Bun.write(path.join(root, "scripts", file), original);
    }
    await Bun.write(
      path.join(root, ".gitignore"),
      "node_modules\ntest-results.xml\n.test-results/\n",
    );
    await Bun.write(
      path.join(root, "tooling.test.ts"),
      'import {test} from "bun:test"; test("tooling",()=>{});',
    );
    await Bun.write(
      path.join(root, "driver.ts"),
      `
      import path from "node:path";
      import {beginTestRun} from "./scripts/test-run";
      import {checkReplayCoverage} from "./scripts/replay-reports";
      const root=process.cwd(); const run=await beginTestRun(root);
      for (const [cwd, file] of [[path.join(root,"apps/example"),"./cases.test.ts"],[root,"./tooling.test.ts"]]) {
        const child=Bun.spawn([process.execPath,"test",file,"--reporter=junit","--reporter-outfile="+run.reportFile],{cwd,stdout:"inherit",stderr:"inherit"});
        if(await child.exited!==0) process.exit(1);
      }
      await checkReplayCoverage(root,run);
    `,
    );
    const run = Bun.spawn([process.execPath, "./driver.ts"], {
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
  const run = await fixture("uncalled helper");
  expect(run.code).not.toBe(0);
  expect(run.output).toContain("uncalled helper");
});

test("replay coverage requires an active run handle", async () => {
  await expect(missingPassedTests(import.meta.dir, [])).rejects.toThrow("No active full test run");
});

test("replay coverage accepts runtime and finally registrations", async () => {
  for (const name of ["runtime case", "finally registered", "always passed"]) {
    const run = await fixture(name);
    expect(run).toMatchObject({ code: 0 });
    expect(run.output).toContain("real Bun JUnit reports");
  }
});
