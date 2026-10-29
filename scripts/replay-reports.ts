import path from "node:path";

const REPORT_FILE = "test-results.xml";
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
export async function missingPassedTests(root: string, coverage: Coverage[]) {
  const reports = new Map<string, Map<string, Set<string>>>();
  const missing: string[] = [];
  for (const entry of coverage) {
    const directory = await packageDirectory(root, entry.test);
    let cases = reports.get(directory);
    if (!cases) {
      const report = Bun.file(path.join(directory, REPORT_FILE));
      if (!(await report.exists()))
        throw new Error(
          `Missing Bun JUnit report: ${report.name}. Run bun run test first to generate reports.`,
        );
      cases = passedCases(await report.text(), directory);
      reports.set(directory, cases);
    }
    const names = cases.get(path.resolve(root, entry.test));
    for (const name of entry.fixed) if (!names?.has(name)) missing.push(`${entry.test}: ${name}`);
  }
  return { missing, reports: reports.size };
}
