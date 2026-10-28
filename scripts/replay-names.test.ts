import { expect, test } from "bun:test";
import path from "node:path";
import { readFileSync } from "node:fs";
import { parseSync, Visitor } from "oxc-parser";
import type { CallExpression, Expression, ForOfStatement, BindingPattern } from "oxc-parser";

type Value = string | number | boolean | null | undefined | Value[] | { [key: string]: Value };
type Bindings = Map<string, Value>;
type Registration = { call: CallExpression; kind: "test" | "describe"; each?: Expression };

/** Resolve only the data used to register names; never import a test or run its body. */
function namesIn(file: string, source: string): Set<string> {
  type Source = {
    constants: Map<string, Expression>;
    imports: Map<string, { file: string; name: string }>;
  };
  const modules = new Map<string, Source>();
  function moduleAt(moduleFile: string, text = readFileSync(moduleFile, "utf8")): Source {
    const cached = modules.get(moduleFile);
    if (cached) return cached;
    const result: Source = { constants: new Map(), imports: new Map() };
    modules.set(moduleFile, result);
    const imported = (local: string, name: string, specifier: string) => {
      const workspace = /^(.*\/apps\/[^/]+)\//u.exec(moduleFile)?.[1];
      if (specifier.startsWith(".") || (specifier.startsWith("@/") && workspace))
        result.imports.set(local, {
          file: Bun.resolveSync(
            specifier.startsWith("@/")
              ? path.join(workspace ?? "", "src", specifier.slice(2))
              : specifier,
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
          node.init.argument.source.type === "Literal" &&
          typeof node.init.argument.source.value === "string"
        ) {
          for (const property of node.id.properties)
            if (
              property.type === "Property" &&
              property.key.type === "Identifier" &&
              property.value.type === "Identifier"
            )
              imported(property.value.name, property.key.name, node.init.argument.source.value);
        }
      },
    }).visit(parseSync(moduleFile, text).program);
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

  function value(
    node: Expression,
    bound: Bindings,
    resolving = new Set<string>(),
    module = current,
  ): Value {
    switch (node.type) {
      case "Literal":
        return typeof node.value === "bigint" || node.regex ? undefined : node.value;
      case "Identifier": {
        if (bound.has(node.name)) return bound.get(node.name);
        const initial = module.constants.get(node.name);
        if (resolving.has(node.name)) return undefined;
        if (initial) return value(initial, bound, new Set([...resolving, node.name]), module);
        const imported = module.imports.get(node.name);
        return imported
          ? value({ ...node, name: imported.name }, bound, resolving, moduleAt(imported.file))
          : undefined;
      }
      case "TSAsExpression":
      case "TSSatisfiesExpression":
      case "TSNonNullExpression":
      case "ParenthesizedExpression":
        return value(node.expression, bound, resolving, module);
      case "ArrayExpression":
        return node.elements.flatMap((element) => {
          if (element?.type === "SpreadElement") {
            const spread = value(element.argument, bound, resolving, module);
            return Array.isArray(spread) ? spread : [];
          }
          return [element ? value(element, bound, resolving, module) : undefined];
        });
      case "ObjectExpression":
        return Object.fromEntries(
          node.properties.flatMap((property) => {
            if (property.type === "SpreadElement") {
              const spread = value(property.argument, bound, resolving, module);
              return spread && typeof spread === "object" && !Array.isArray(spread)
                ? Object.entries(spread)
                : [];
            }
            if (property.type !== "Property") return [];
            const key =
              property.key.type === "Identifier"
                ? property.key.name
                : property.key.type === "Literal"
                  ? String(property.key.value)
                  : undefined;
            return key === undefined
              ? []
              : [[key, value(property.value, bound, resolving, module)]];
          }),
        );
      case "TemplateLiteral":
        return node.quasis
          .map(
            (quasi, i) =>
              quasi.value.cooked +
              (node.expressions[i]
                ? String(value(node.expressions[i], bound, resolving, module))
                : ""),
          )
          .join("");
      case "MemberExpression": {
        const object = value(node.object, bound, resolving, module);
        const key = node.computed
          ? value(node.property, bound, resolving, module)
          : node.property.type === "Identifier"
            ? node.property.name
            : undefined;
        if (typeof object !== "object" || object === null || key === undefined) return undefined;
        return Array.isArray(object) ? object[Number(key)] : object[String(key)];
      }
      case "CallExpression": {
        if (node.callee.type !== "MemberExpression" || node.callee.property.type !== "Identifier")
          return undefined;
        const method = node.callee.property.name;
        const arg = node.arguments[0];
        if (
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "Object" &&
          arg &&
          arg.type !== "SpreadElement"
        ) {
          const object = value(arg, bound, resolving, module);
          if (!object || typeof object !== "object" || Array.isArray(object)) return undefined;
          if (method === "entries") return Object.entries(object);
          if (method === "keys") return Object.keys(object);
          if (method === "values") return Object.values(object);
        }
        const object = value(node.callee.object, bound, resolving, module);
        if (method === "includes" && Array.isArray(object) && arg && arg.type !== "SpreadElement")
          return object.includes(value(arg, bound, resolving, module));
        if (
          method === "repeat" &&
          typeof object === "string" &&
          arg &&
          arg.type !== "SpreadElement"
        )
          return object.repeat(Number(value(arg, bound, resolving, module)));
        if (
          Array.isArray(object) &&
          ["map", "flatMap", "filter"].includes(method) &&
          arg?.type === "ArrowFunctionExpression" &&
          arg.body.type !== "BlockStatement"
        ) {
          const mapped = object.map((row, i) => {
            const next = new Map(bound);
            arg.params.forEach((parameter, index) => {
              if (parameter.type !== "RestElement") bind(parameter, index === 0 ? row : i, next);
            });
            return value(arg.body, next, resolving, module);
          });
          return method === "flatMap"
            ? mapped.flat()
            : method === "filter"
              ? object.filter((_row, i) => mapped[i])
              : mapped;
        }
        return undefined;
      }
      case "BinaryExpression": {
        const left = value(node.left, bound, resolving, module),
          right = value(node.right, bound, resolving, module);
        if (node.operator === "+" && (typeof left === "string" || typeof right === "string"))
          return String(left) + String(right);
        if (typeof left !== "number" || typeof right !== "number") return undefined;
        if (node.operator === "*") return left * right;
        if (node.operator === "+") return left + right;
        if (node.operator === "-") return left - right;
        return undefined;
      }
      default:
        return undefined;
    }
  }

  function bind(pattern: BindingPattern, data: Value, bound: Bindings): void {
    if (pattern.type === "Identifier") bound.set(pattern.name, data);
    else if (pattern.type === "ArrayPattern")
      pattern.elements.forEach((element, i) => {
        if (element && element.type !== "RestElement")
          bind(element, Array.isArray(data) ? data[i] : undefined, bound);
      });
    else if (pattern.type === "ObjectPattern")
      for (const property of pattern.properties) {
        if (property.type !== "Property" || property.key.type !== "Identifier") continue;
        bind(
          property.value,
          data && typeof data === "object" && !Array.isArray(data)
            ? data[property.key.name]
            : undefined,
          bound,
        );
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
    ].sort((a, b) => a.start - b.start);
    let contexts = [{ bound: new Map<string, Value>(), titles: [] as string[] }];
    for (const container of containers) {
      contexts = contexts.flatMap(({ bound, titles }) => {
        if ("loop" in container) {
          const data = value(container.loop.right, bound);
          const left = container.loop.left;
          const pattern =
            left.type === "VariableDeclaration" ? left.declarations[0]?.id : undefined;
          if (!Array.isArray(data) || !pattern) return [];
          return data.map((row) => {
            const next = new Map(bound);
            bind(pattern, row, next);
            return { bound: next, titles };
          });
        }
        const { registration } = container;
        const title = registration.call.arguments[0];
        const callback = registration.call.arguments[1];
        if (!title || title.type === "SpreadElement") return [];
        const rows = registration.each ? value(registration.each, bound) : [undefined];
        if (!Array.isArray(rows)) return [];
        return rows.map((row, index) => {
          const next = new Map(bound);
          const args = registration.each && Array.isArray(row) ? row : [row];
          if (
            callback?.type === "ArrowFunctionExpression" ||
            callback?.type === "FunctionExpression"
          )
            callback.params.forEach((parameter, i) => {
              if (parameter.type !== "RestElement") bind(parameter, args[i], next);
            });
          let cursor = 0;
          const rendered = String(value(title, next))
            .replace(/\$([a-zA-Z_]\w*)/gu, (_token, key: string) =>
              row && typeof row === "object" && !Array.isArray(row) ? String(row[key]) : `$${key}`,
            )
            .replace(/%([spjdif#%])/gu, (token, format: string) => {
              if (format === "%") return "%";
              if (format === "#") return String(index);
              const argument = args[cursor++];
              return ["p", "j"].includes(format) ? JSON.stringify(argument) : String(argument);
            });
          return { bound: next, titles: [...titles, rendered] };
        });
      });
    }
    for (const { titles } of contexts) names.add(titles.join(" > "));
  }
  return names;
}

test("replay name matching uses full Bun names, including generated cases", () => {
  const source = `describe.each(["outer", "other"])("%s", group => {
    for (const kind of ["one", "two"]) test.each([["case", 1]])(
      \`\${kind} %s %d\`, () => {});
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
      head?: { test: string; fixed: string[] }[];
    }[];
  } = await Bun.file(path.join(import.meta.dir, "replays.json")).json();
  const current = replays
    .filter((entry) => entry.testAt)
    .flatMap((entry) => entry.head ?? [{ test: entry.test, fixed: entry.fixed }]);
  const missing: string[] = [];
  for (const file of new Set(current.map((entry) => entry.test))) {
    const names = namesIn(file, await Bun.file(path.resolve(import.meta.dir, "..", file)).text());
    for (const entry of current.filter((entry) => entry.test === file))
      for (const name of entry.fixed) if (!names.has(name)) missing.push(`${file}: ${name}`);
  }
  expect(missing).toEqual([]);
});
