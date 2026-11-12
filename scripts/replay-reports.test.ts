import { expect, test } from "bun:test";
import path from "node:path";
import { passedCases } from "./replay-reports";

test("Bun reports count only passed cases with their real file and suite names", () => {
  const report = `<testsuites><testsuite name="src/cases.test.ts" file="src/cases.test.ts">
    <testcase name="passed" file="src/cases.test.ts" />
    <testcase name="skipped" file="src/cases.test.ts"><skipped /></testcase>
    <testcase name="todo" file="src/cases.test.ts"><skipped message="TODO" /></testcase>
    <testcase name="failed" file="src/cases.test.ts"><failure>bad assertion</failure></testcase>
    <testcase name="error" file="src/cases.test.ts"><error>threw</error></testcase>
    <testcase name="duplicate" file="src/cases.test.ts" />
    <testcase name="duplicate" file="src/cases.test.ts"><failure /></testcase>
    <testsuite name="outer &amp; &quot;quoted&quot;"><testsuite name="inner">
      <testcase name="case 1" classname="inner &gt; outer" file="src/cases.test.ts" />
    </testsuite></testsuite>
    <testcase name="other file" file="src/other.test.ts" />
  </testsuite></testsuites>`;
  const cases = passedCases(report, import.meta.dir);
  expect(cases.get(path.join(import.meta.dir, "src/cases.test.ts"))).toEqual(
    new Set(["passed", 'outer & "quoted" > inner > case 1']),
  );
  expect(cases.get(path.join(import.meta.dir, "src/other.test.ts"))).toEqual(
    new Set(["other file"]),
  );
});
