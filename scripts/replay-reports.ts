import path from "node:path";
import type { TestRun } from "./test-run";
import { consumeTestRun } from "./test-run";

type Coverage = { test: string; fixed: string[] };

function elements(node: Bun.XML.Node): Bun.XML.Node[] {
  return node.children.filter(
    (child): child is Bun.XML.Node => child instanceof Object && "name" in child,
  );
}

/** Bun's file suites wrap the describe hierarchy; classname lists that hierarchy in reverse. */
export function passedCases(xml: string, directory: string): Map<string, Set<string>> {
  const root = Bun.XML.parse(xml, { compact: false });
  const cases = new Map<string, Map<string, boolean>>();
  function visit(suite: Bun.XML.Node, titles: string[]) {
    for (const child of elements(suite)) {
      if (child.name === "testsuite") {
        const title = child.attributes.name;
        if (title === undefined) throw new Error("Bun JUnit suite has no name");
        visit(child, [...titles, title]);
      } else if (child.name === "testcase") {
        const { name, file } = child.attributes;
        if (name === undefined || file === undefined)
          throw new Error("Bun JUnit case has no name or file");
        const fullName = [...titles, name].join(" > ");
        const passed = !elements(child).some((status) =>
          ["failure", "error", "skipped"].includes(status.name),
        );
        const filename = path.resolve(directory, file);
        const names = cases.get(filename) ?? new Map<string, boolean>();
        names.set(fullName, (names.get(fullName) ?? true) && passed);
        cases.set(filename, names);
      }
    }
  }
  if (root.name !== "testsuites") throw new Error("Expected a Bun JUnit testsuites report");
  for (const suite of elements(root)) visit(suite, []);
  return new Map(
    [...cases].map(([file, names]) => [
      file,
      new Set([...names].filter(([, passed]) => passed).map(([name]) => name)),
    ]),
  );
}

async function packageDirectory(root: string, file: string) {
  let directory = path.dirname(path.resolve(root, file));
  while (!(await Bun.file(path.join(directory, "package.json")).exists())) {
    if (directory === root) throw new Error(`${file} has no package manifest`);
    directory = path.dirname(directory);
  }
  return directory;
}

/** Validate pins against actual passing cases, loading each package's report once. */
export async function missingPassedTests(root: string, coverage: Coverage[], run?: TestRun) {
  const files = await consumeTestRun(root, run);
  const reports = new Map<string, Map<string, Set<string>>>();
  for (const [directory, report] of files)
    reports.set(directory, passedCases(await Bun.file(report).text(), directory));
  const missing: string[] = [];
  for (const entry of coverage) {
    const directory = await packageDirectory(root, entry.test);
    const cases = reports.get(directory);
    if (!cases) throw new Error(`No test task report for ${entry.test}. Run bun run test.`);
    const names = cases.get(path.resolve(root, entry.test));
    for (const name of entry.fixed) if (!names?.has(name)) missing.push(`${entry.test}: ${name}`);
  }
  return { missing, reports: reports.size };
}

export async function checkReplayCoverage(root: string, run: TestRun) {
  const {
    test: replays,
  }: {
    test: {
      test: string;
      testAt?: string;
      fixed: string[];
      head?: { test: string; fixed: string[]; reason: string }[];
    }[];
  } = await Bun.file(path.join(root, "scripts/replays.json")).json();
  const current = replays
    .filter((entry) => entry.testAt)
    .flatMap((entry) => entry.head ?? [{ test: entry.test, fixed: entry.fixed }]);
  const { missing, reports } = await missingPassedTests(root, current, run);
  if (missing.length > 0)
    throw new Error(`Missing passed replay coverage in Bun JUnit reports:\n${missing.join("\n")}`);
  console.log(
    `Verified ${current.reduce((count, entry) => count + entry.fixed.length, 0)} pinned replay names in ${reports} real Bun JUnit reports.`,
  );
}
