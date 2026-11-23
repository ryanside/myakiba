import { expect, test } from "bun:test";
import path from "node:path";
import { suites } from "./test-run";

type Job = { name?: string; needs?: string | string[]; if?: string; steps?: { run?: string }[] };
const { jobs }: { jobs: Record<string, Job> } = Bun.YAML.parse(
  await Bun.file(path.join(import.meta.dir, "../.github/workflows/ci.yml")).text(),
);

function suitesRun(job: Job) {
  return (job.steps ?? [])
    .flatMap(({ run }) => run?.split("\n") ?? [])
    .flatMap((line) => {
      const match = /^bun run test(?: (\S+))?$/.exec(line.trim());
      if (!match) return [];
      return match[1] === undefined ? [...suites] : [match[1]];
    });
}
const suiteJobs = Object.keys(jobs).filter((id) => suitesRun(jobs[id] ?? {}).length > 0);

test("CI runs every test suite exactly once, each in a job of its own", () => {
  const run = Object.values(jobs).flatMap(suitesRun);
  expect(run.toSorted()).toEqual([...suites].toSorted());
  expect(suiteJobs).toHaveLength(suites.length);
});

test("the Validate check waits for the static checks and every suite, even one that was skipped", () => {
  const gates = Object.values(jobs).filter((job) => job.name === "Validate");
  expect(gates).toHaveLength(1);
  const [gate] = gates;
  expect([gate?.needs ?? []].flat()).toEqual(expect.arrayContaining(["validate", ...suiteJobs]));
  expect(gate?.if).toBe("always()");
});
