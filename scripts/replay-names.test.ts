import { expect, test } from "bun:test";
import path from "node:path";
import { readFileSync } from "node:fs";
import { parseSync, Visitor } from "oxc-parser";
import type { CallExpression, Expression, ForOfStatement, BindingPattern } from "oxc-parser";

type Value =
  | { kind: "text"; value: string }
  | { kind: "number"; value: number }
  | { kind: "flag"; value: boolean }
  | { kind: "none" }
  | { kind: "list"; values: Value[] }
  | { kind: "record"; fields: Map<string, Value> };
type Bindings = Map<string, Value>;
type Registration = { call: CallExpression; kind: "test" | "describe"; each?: Expression };
const absent: Value = { kind: "none" };
const text = (value: string): Value => ({ kind: "text", value });
const number = (value: number): Value => ({ kind: "number", value });
const list = (values: Value[]): Value => ({ kind: "list", values });
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
function plain(value: Value): Json {
  switch (value.kind) {
    case "text":
    case "number":
    case "flag":
      return value.value;
    case "none":
      return null;
    case "list":
      return value.values.map(plain);
    case "record":
      return Object.fromEntries([...value.fields].map(([key, item]) => [key, plain(item)]));
  }
}
function display(value: Value): string {
  if (value.kind === "none") return "undefined";
  if (value.kind === "list") return value.values.map(display).join(",");
  if (value.kind === "record") return "[object Object]";
  return String(value.value);
}

/** Resolve registration data without importing tests or executing their bodies. */
function namesIn(file: string, source: string): Set<string> {
  type Source = {
    constants: Map<string, Expression>;
    imports: Map<string, { file: string; name: string }>;
  };
  const modules = new Map<string, Source>();
  function moduleAt(moduleFile: string, sourceText = readFileSync(moduleFile, "utf-8")): Source {
    const cached = modules.get(moduleFile);
    if (cached) return cached;
    const result: Source = { constants: new Map(), imports: new Map() };
    modules.set(moduleFile, result);
    const imported = (local: string, name: string, specifier: string) => {
      const workspace = /^(.*\/apps\/[^/]+)\//u.exec(moduleFile)?.[1];
      if (specifier.startsWith("."))
        result.imports.set(local, {
          file: Bun.resolveSync(specifier, path.dirname(moduleFile)),
          name,
        });
      else if (specifier.startsWith("@/") && workspace)
        result.imports.set(local, {
          file: Bun.resolveSync(
            path.join(workspace, "src", specifier.slice(2)),
            path.dirname(moduleFile),
          ),
          name,
        });
    };
    new Visitor({
      ImportDeclaration(node) {
        for (const specifier of node.specifiers)
          if (specifier.type === "ImportSpecifier")
            imported(
              specifier.local.name,
              specifier.imported.type === "Identifier"
                ? specifier.imported.name
                : specifier.imported.value,
              node.source.value,
            );
      },
      VariableDeclarator(node) {
        if (node.id.type === "Identifier" && node.init)
          result.constants.set(node.id.name, node.init);
        if (
          node.id.type === "ObjectPattern" &&
          node.init?.type === "AwaitExpression" &&
          node.init.argument.type === "ImportExpression" &&
          node.init.argument.source.type === "Literal"
        ) {
          for (const property of node.id.properties)
            if (
              property.type === "Property" &&
              property.key.type === "Identifier" &&
              property.value.type === "Identifier"
            )
              imported(
                property.value.name,
                property.key.name,
                String(node.init.argument.source.value),
              );
        }
      },
    }).visit(parseSync(moduleFile, sourceText).program);
    return result;
  }
  const current = moduleAt(path.resolve(file), source);
  const registrations: Registration[] = [];
  const loops: ForOfStatement[] = [];
  new Visitor({
    ForOfStatement(node) {
      loops.push(node);
    },
    CallExpression(call) {
      let callee = call.callee;
      let each: Expression | undefined;
      if (
        callee.type === "CallExpression" &&
        callee.callee.type === "MemberExpression" &&
        callee.callee.property.type === "Identifier" &&
        ["each", "skipIf", "todoIf"].includes(callee.callee.property.name)
      ) {
        const argument = callee.arguments[0];
        if (callee.callee.property.name === "each" && argument && argument.type !== "SpreadElement")
          each = argument;
        callee = callee.callee.object;
      }
      if (callee.type === "Identifier" && ["test", "it", "describe"].includes(callee.name))
        registrations.push({
          call,
          kind: callee.name === "describe" ? "describe" : "test",
          ...(each && { each }),
        });
    },
  }).visit(parseSync(file, source).program);

  function bind(pattern: BindingPattern, data: Value, bound: Bindings): void {
    if (pattern.type === "Identifier") bound.set(pattern.name, data);
    else if (pattern.type === "ArrayPattern")
      pattern.elements.forEach((element, i) => {
        if (element && element.type !== "RestElement")
          bind(element, data.kind === "list" ? (data.values[i] ?? absent) : absent, bound);
      });
    else if (pattern.type === "ObjectPattern")
      for (const property of pattern.properties) {
        if (property.type !== "Property" || property.key.type !== "Identifier") continue;
        bind(
          property.value,
          data.kind === "record" ? (data.fields.get(property.key.name) ?? absent) : absent,
          bound,
        );
      }
  }

  function value(
    node: Expression,
    bound: Bindings,
    resolving = new Set<string>(),
    module = current,
  ): Value {
    switch (node.type) {
      case "Literal": {
        if (node.raw === null) return absent;
        if (/^["']/u.test(node.raw)) return text(String(node.value));
        if (/^\d/u.test(node.raw)) return number(Number(node.value));
        if (node.raw === "true" || node.raw === "false")
          return { kind: "flag", value: node.raw === "true" };
        return absent;
      }
      case "Identifier": {
        if (bound.has(node.name)) return bound.get(node.name) ?? absent;
        if (resolving.has(node.name)) return absent;
        const initial = module.constants.get(node.name);
        if (initial) return value(initial, bound, new Set([...resolving, node.name]), module);
        const imported = module.imports.get(node.name);
        return imported
          ? value({ ...node, name: imported.name }, bound, resolving, moduleAt(imported.file))
          : absent;
      }
      case "TSAsExpression":
      case "TSSatisfiesExpression":
      case "TSNonNullExpression":
      case "ParenthesizedExpression":
        return value(node.expression, bound, resolving, module);
      case "ArrayExpression":
        return list(
          node.elements.flatMap((element) => {
            if (element?.type === "SpreadElement") {
              const spread = value(element.argument, bound, resolving, module);
              return spread.kind === "list" ? spread.values : [];
            }
            return [element ? value(element, bound, resolving, module) : absent];
          }),
        );
      case "ObjectExpression":
        return {
          kind: "record",
          fields: new Map(
            node.properties.flatMap((property): [string, Value][] => {
              if (property.type === "SpreadElement") {
                const spread = value(property.argument, bound, resolving, module);
                return spread.kind === "record" ? [...spread.fields] : [];
              }
              if (property.type !== "Property") return [];
              let key: string;
              if (property.key.type === "Identifier") key = property.key.name;
              else if (property.key.type === "Literal") key = String(property.key.value);
              else return [];
              return [[key, value(property.value, bound, resolving, module)]];
            }),
          ),
        };
      case "TemplateLiteral":
        return text(
          node.quasis
            .map((quasi, i) => {
              const expression = node.expressions[i];
              return (
                quasi.value.cooked +
                (expression ? display(value(expression, bound, resolving, module)) : "")
              );
            })
            .join(""),
        );
      case "MemberExpression": {
        const object = value(node.object, bound, resolving, module);
        let key: Value = absent;
        if (node.computed) key = value(node.property, bound, resolving, module);
        else if (node.property.type === "Identifier") key = text(node.property.name);
        if (object.kind === "list") return object.values[Number(display(key))] ?? absent;
        if (object.kind === "record") return object.fields.get(display(key)) ?? absent;
        return absent;
      }
      case "CallExpression": {
        if (node.callee.type !== "MemberExpression" || node.callee.property.type !== "Identifier")
          return absent;
        const method = node.callee.property.name;
        const arg = node.arguments[0];
        if (
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "Object" &&
          arg &&
          arg.type !== "SpreadElement"
        ) {
          const object = value(arg, bound, resolving, module);
          if (object.kind !== "record") return absent;
          if (method === "entries")
            return list([...object.fields].map(([key, item]) => list([text(key), item])));
          if (method === "keys") return list([...object.fields.keys()].map(text));
          if (method === "values") return list([...object.fields.values()]);
        }
        const object = value(node.callee.object, bound, resolving, module);
        if (method === "includes" && object.kind === "list" && arg && arg.type !== "SpreadElement")
          return {
            kind: "flag",
            value: object.values.some(
              (item) => display(item) === display(value(arg, bound, resolving, module)),
            ),
          };
        if (method === "repeat" && object.kind === "text" && arg && arg.type !== "SpreadElement")
          return text(object.value.repeat(Number(display(value(arg, bound, resolving, module)))));
        if (
          object.kind === "list" &&
          ["map", "flatMap", "filter"].includes(method) &&
          arg?.type === "ArrowFunctionExpression" &&
          arg.body.type !== "BlockStatement"
        ) {
          const body = arg.body;
          const mapped = object.values.map((row, i) => {
            const next = new Map(bound);
            arg.params.forEach((parameter, index) => {
              if (parameter.type !== "RestElement" && parameter.type !== "TSParameterProperty")
                bind(parameter, index === 0 ? row : number(i), next);
            });
            return value(body, next, resolving, module);
          });
          if (method === "flatMap")
            return list(mapped.flatMap((item) => (item.kind === "list" ? item.values : [item])));
          if (method === "filter")
            return list(
              object.values.filter((_row, i) => {
                const result = mapped[i];
                return result?.kind === "flag" && result.value;
              }),
            );
          return list(mapped);
        }
        return absent;
      }
      case "BinaryExpression": {
        if (node.left.type === "PrivateIdentifier") return absent;
        const left = value(node.left, bound, resolving, module);
        const right = value(node.right, bound, resolving, module);
        if (node.operator === "+" && (left.kind === "text" || right.kind === "text"))
          return text(display(left) + display(right));
        if (left.kind !== "number" || right.kind !== "number") return absent;
        if (node.operator === "*") return number(left.value * right.value);
        if (node.operator === "+") return number(left.value + right.value);
        if (node.operator === "-") return number(left.value - right.value);
        return absent;
      }
      default:
        return absent;
    }
  }

  const names = new Set<string>();
  for (const entry of registrations.filter(({ kind }) => kind === "test")) {
    const parents = registrations.filter(
      ({ call, kind }) =>
        kind === "describe" && call.start < entry.call.start && call.end > entry.call.end,
    );
    const containers = [
      ...parents.map((registration) => ({ start: registration.call.start, registration })),
      ...loops
        .filter((loop) => loop.start < entry.call.start && loop.end > entry.call.end)
        .map((loop) => ({ start: loop.start, loop })),
      { start: entry.call.start, registration: entry },
    ].toSorted((a, b) => a.start - b.start);
    let contexts = [{ bound: new Map<string, Value>(), titles: [] as string[] }];
    for (const container of containers)
      contexts = contexts.flatMap(({ bound, titles }) => {
        if ("loop" in container) {
          const data = value(container.loop.right, bound);
          const left = container.loop.left;
          const pattern =
            left.type === "VariableDeclaration" ? left.declarations[0]?.id : undefined;
          if (data.kind !== "list" || !pattern) return [];
          return data.values.map((row) => {
            const next = new Map(bound);
            bind(pattern, row, next);
            return { bound: next, titles };
          });
        }
        const { registration } = container;
        const title = registration.call.arguments[0];
        const callback = registration.call.arguments[1];
        if (!title || title.type === "SpreadElement") return [];
        const rows = registration.each ? value(registration.each, bound) : list([absent]);
        if (rows.kind !== "list") return [];
        return rows.values.map((row, index) => {
          const next = new Map(bound);
          const args = registration.each && row.kind === "list" ? row.values : [row];
          if (
            callback?.type === "ArrowFunctionExpression" ||
            callback?.type === "FunctionExpression"
          )
            callback.params.forEach((parameter, i) => {
              if (parameter.type !== "RestElement" && parameter.type !== "TSParameterProperty")
                bind(parameter, args[i] ?? absent, next);
            });
          let cursor = 0;
          const rendered = display(value(title, next))
            .replaceAll(/\$([a-zA-Z_]\w*)/gu, (_token, key: string) =>
              row.kind === "record" ? display(row.fields.get(key) ?? absent) : `$${key}`,
            )
            .replaceAll(/%([spjdif#%])/gu, (_token, format: string) => {
              if (format === "%") return "%";
              if (format === "#") return String(index);
              const argument = args[cursor++] ?? absent;
              return ["p", "j"].includes(format)
                ? JSON.stringify(plain(argument))
                : display(argument);
            });
          return { bound: next, titles: [...titles, rendered] };
        });
      });
    for (const { titles } of contexts) names.add(titles.join(" > "));
  }
  return names;
}

test("replay name matching uses full Bun names, including generated cases", () => {
  const source = `describe.each(["outer", "other"])("%s", group => {
    for (const kind of ["one", "two"]) test.each([["case", 1]])(\`\${kind} %s %d\`, () => {});
  });`;
  expect([...namesIn("fixture.ts", source)]).toEqual([
    "outer > one case 1",
    "outer > two case 1",
    "other > one case 1",
    "other > two case 1",
  ]);
  expect(namesIn("fixture.ts", source.replace("%s %d", "renamed"))).not.toContain(
    "outer > one case 1",
  );
  expect(namesIn("fixture.ts", source.replace('["one", "two"]', '["two"]'))).not.toContain(
    "outer > one case 1",
  );
  expect(namesIn("fixture.ts", '// test("removed", () => {})')).not.toContain("removed");
});

test("pinned replay tests still exist in the current test files", async () => {
  const {
    test: replays,
  }: {
    test: {
      test: string;
      testAt?: string;
      fixed: string[];
      head?: { test: string; fixed: string[]; reason: string }[];
    }[];
  } = await Bun.file(path.join(import.meta.dir, "replays.json")).json();
  const current = replays
    .filter((entry) => entry.testAt)
    .flatMap((entry) => entry.head ?? [{ test: entry.test, fixed: entry.fixed }]);
  const missing: string[] = [];
  for (const file of new Set(current.map((entry) => entry.test))) {
    const names = namesIn(file, await Bun.file(path.resolve(import.meta.dir, "..", file)).text());
    for (const coverage of current.filter((candidate) => candidate.test === file))
      for (const name of coverage.fixed) if (!names.has(name)) missing.push(`${file}: ${name}`);
  }
  expect(missing).toEqual([]);
});
