import { expect, test } from "bun:test";
import { $ } from "bun";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

async function probe(program: string) {
  const root = await mkdtemp(path.join(import.meta.dir, "../node_modules/run-boundary-"));
  try {
    await mkdir(path.join(root, "scripts"));
    await mkdir(path.join(root, "apps/a"), { recursive: true });
    await Bun.write(
      path.join(root, "package.json"),
      JSON.stringify({ workspaces: { packages: ["apps/*"] } }),
    );
    await Bun.write(
      path.join(root, "apps/a/package.json"),
      JSON.stringify({ scripts: { test: "bun test" } }),
    );
    await Bun.write(path.join(root, ".gitignore"), "node_modules\n.test-results/\n");
    for (const file of ["test-run.ts", "replay-reports.ts"])
      await Bun.write(path.join(root, "scripts", file), Bun.file(path.join(import.meta.dir, file)));
    await Bun.write(
      path.join(root, "driver.ts"),
      `
      import {expect,mock} from "bun:test";
      import {mkdir,readdir,rename,rm,symlink,lstat,utimes} from "node:fs/promises";
      import path from "node:path";
      import {beginTestRun,consumeTestRun,cleanupTestRun} from "./scripts/test-run";
      const root=process.cwd();
      const reports=async(run)=>{
        for(const directory of [root,path.join(root,"apps/a")])
          await Bun.write(path.join(directory,run.reportFile),"<testsuites />");
      };
      ${program}
    `,
    );
    // The a47b2ec2 parent fingerprints committed files; its replay still needs this Git fixture.
    await $`git init --quiet`.cwd(root).quiet();
    await $`git add .`.cwd(root).quiet();
    await $`git -c user.name=Test -c user.email=test@example.invalid -c core.hooksPath=/dev/null commit --quiet -m fixture`
      .cwd(root)
      .quiet();
    const child = Bun.spawn([process.execPath, "driver.ts"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { code, output: stdout + stderr };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("a run accepts its own reports regardless of wall-clock file times", async () => {
  expect(
    await probe(`
    const run=await beginTestRun(root); await reports(run);
    for(const directory of [root,path.join(root,"apps/a")])
      await utimes(path.join(directory,run.reportFile),new Date(0),new Date(0));
    await consumeTestRun(root,run); await cleanupTestRun(run);
  `),
  ).toMatchObject({ code: 0 });
});

test("starting another run preserves every existing namespace", async () => {
  expect(
    await probe(`
    const first=await beginTestRun(root); await reports(first);
    for(const directory of [root,path.join(root,"apps/a")])
      await utimes(path.dirname(path.join(directory,first.reportFile)),new Date(0),new Date(0));
    const second=await beginTestRun(root);
    expect(await Bun.file(path.join(root,first.reportFile)).exists()).toBe(true);
    await consumeTestRun(root,first);
    await cleanupTestRun(first); await cleanupTestRun(second);
  `),
  ).toMatchObject({ code: 0 });
});

for (const kind of ["symlink", "file"] as const) {
  test(`namespace creation refuses a ${kind} parent`, async () => {
    expect(
      await probe(`
      const parent=path.join(root,".test-results");
      const outside=path.join(root,"node_modules/outside");
      await mkdir(outside,{recursive:true});
      ${kind === "symlink" ? "await symlink(outside,parent);" : 'await Bun.write(parent,"not a directory");'}
      await expect(beginTestRun(root)).rejects.toThrow("must be a real directory");
      expect(await readdir(outside)).toEqual([]);
    `),
    ).toMatchObject({ code: 0 });
  });
}

test("partial namespace creation rolls back directories already created", async () => {
  expect(
    await probe(`
    await Bun.write(path.join(root,"apps/a/.test-results"),"not a directory");
    await expect(beginTestRun(root)).rejects.toThrow();
    expect(await readdir(path.join(root,".test-results"))).toEqual([]);
  `),
  ).toMatchObject({ code: 0 });
});

test("cleanup refuses a replaced symlink parent and preserves outside contents", async () => {
  expect(
    await probe(`
    const run=await beginTestRun(root);
    const parent=path.join(root,".test-results");
    const outside=path.join(root,"node_modules/outside");
    await mkdir(outside,{recursive:true});
    await rename(parent,path.join(root,"node_modules/held"));
    await Bun.write(path.join(outside,path.basename(path.dirname(run.reportFile)),"sentinel"),"keep");
    await symlink(outside,parent);
    await expect(cleanupTestRun(run)).rejects.toThrow();
    expect(await Bun.file(path.join(parent,path.basename(path.dirname(run.reportFile)),"sentinel")).text()).toBe("keep");
  `),
  ).toMatchObject({ code: 0 });
});

for (const kind of ["symlink", "directory"] as const) {
  test(`cleanup preserves a replacement ${kind} at its namespace path`, async () => {
    expect(
      await probe(`
      const run=await beginTestRun(root);
      const directory=path.dirname(path.join(root,run.reportFile));
      await mkdir(path.join(root,"node_modules"),{recursive:true});
      await rename(directory,path.join(root,"node_modules/held"));
      ${kind === "symlink" ? 'await symlink(path.join(root,"node_modules/held"),directory);' : "await mkdir(directory);"}
      await expect(cleanupTestRun(run)).rejects.toThrow();
      expect((await lstat(directory)).${kind === "symlink" ? "isSymbolicLink" : "isDirectory"}()).toBe(true);
    `),
    ).toMatchObject({ code: 0 });
  });
}

test("a report symlink cannot borrow another run's passed cases", async () => {
  expect(
    await probe(`
    const first=await beginTestRun(root); await reports(first);
    await Bun.write(path.join(root,first.reportFile),'<testsuites><testsuite name="cases.test.ts"><testcase name="borrowed" file="cases.test.ts" /></testsuite></testsuites>');
    const second=await beginTestRun(root); await reports(second);
    await rm(path.join(root,second.reportFile));
    await symlink(path.join(root,first.reportFile),path.join(root,second.reportFile));
    const {missingPassedTests}=await import("./scripts/replay-reports");
    await expect(missingPassedTests(root,[{test:"cases.test.ts",fixed:["borrowed"]}],second)).rejects.toThrow("must be a regular file");
    await cleanupTestRun(first); await cleanupTestRun(second);
  `),
  ).toMatchObject({ code: 0 });
});

test("a report directory is rejected as a non-regular file", async () => {
  expect(
    await probe(`
    const run=await beginTestRun(root); await reports(run);
    await rm(path.join(root,run.reportFile)); await mkdir(path.join(root,run.reportFile));
    await expect(consumeTestRun(root,run)).rejects.toThrow("must be a regular file");
    await cleanupTestRun(run);
  `),
  ).toMatchObject({ code: 0 });
});

test("a FIFO at a report path is rejected without blocking the run", async () => {
  expect(
    await probe(`
    const run=await beginTestRun(root); await reports(run);
    const report=path.join(root,run.reportFile);
    await rm(report); Bun.spawnSync(["mkfifo",report]);
    const blocked=setTimeout(()=>{console.error("consumeTestRun blocked on a FIFO");process.exit(2);},3000);
    await expect(consumeTestRun(root,run)).rejects.toThrow("must be a regular file");
    clearTimeout(blocked);
    await cleanupTestRun(run);
  `),
  ).toMatchObject({ code: 0 });
});

test("replacing a consumed report path cannot change the cases read", async () => {
  expect(
    await probe(`
    const first=await beginTestRun(root); await reports(first);
    await Bun.write(path.join(root,first.reportFile),'<testsuites><testsuite name="cases.test.ts"><testcase name="borrowed" file="cases.test.ts" /></testsuite></testsuites>');
    const second=await beginTestRun(root); await reports(second);
    const actual=await import("./scripts/test-run");
    const consume=actual.consumeTestRun;
    const replacement={...actual,consumeTestRun:async(...args)=>{
      const result=await consume(...args);
      await rm(path.join(root,second.reportFile));
      await symlink(path.join(root,first.reportFile),path.join(root,second.reportFile));
      return result;
    }};
    mock.module("./scripts/test-run",()=>replacement);
    const {missingPassedTests}=await import("./scripts/replay-reports");
    expect(await missingPassedTests(root,[{test:"cases.test.ts",fixed:["borrowed"]}],second))
      .toEqual({missing:["cases.test.ts: borrowed"],reports:2});
    await cleanupTestRun(first); await cleanupTestRun(second);
  `),
  ).toMatchObject({ code: 0 });
});
