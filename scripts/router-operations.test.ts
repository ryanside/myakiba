import { expect, test } from "bun:test";
import { Glob } from "bun";
import path from "node:path";
import { parseSync, Visitor } from "oxc-parser";
import type { CallExpression, Expression } from "oxc-parser";

const METHODS = new Set(["get", "post", "put", "patch", "delete", "all", "head", "options"]);

function violations(file: string, source: string, sync = false) {
  const hits: string[] = [];
  const ast = parseSync(file, source).program;
  const names = new Set<string>();
  const namespaces = new Set<string>();
  const calls: CallExpression[] = [];
  const returned = new Set<Expression>();
  const markReturned = (expression: Expression): void => {
    if (expression.type === "AwaitExpression") markReturned(expression.argument);
    else if (expression.type === "ConditionalExpression") {
      markReturned(expression.consequent);
      markReturned(expression.alternate);
    } else returned.add(expression);
  };
  new Visitor({
    ImportDeclaration(node) {
      for (const specifier of node.specifiers) {
        if (node.source.value === "@/domain/kernel") {
          if (specifier.type === "ImportNamespaceSpecifier") namespaces.add(specifier.local.name);
          if (
            specifier.type === "ImportSpecifier" &&
            specifier.imported.type === "Identifier" &&
            specifier.imported.name === "serve"
          )
            names.add(specifier.local.name);
        }
        if (
          node.source.value === "elysia" &&
          specifier.type === "ImportSpecifier" &&
          specifier.imported.type === "Identifier" &&
          specifier.imported.name === "ElysiaCustomStatusResponse"
        )
          hits.push(`${file} imports ElysiaCustomStatusResponse`);
      }
    },
    ReturnStatement(node) {
      if (node.argument) markReturned(node.argument);
    },
    ArrowFunctionExpression(node) {
      if (node.body.type !== "BlockStatement") markReturned(node.body);
    },
    YieldExpression(node) {
      if (node.delegate && node.argument) markReturned(node.argument);
    },
    CallExpression(node) {
      calls.push(node);
    },
  }).visit(ast);
  const isServe = ({ callee }: CallExpression) =>
    (callee.type === "Identifier" && names.has(callee.name)) ||
    (callee.type === "MemberExpression" &&
      callee.object.type === "Identifier" &&
      namespaces.has(callee.object.name) &&
      callee.property.type === "Identifier" &&
      callee.property.name === "serve");
  for (const call of calls.filter(isServe)) {
    if (!returned.has(call))
      hits.push(
        `${file}:${source.slice(0, call.start).split("\n").length} must return serve directly`,
      );
  }
  if (sync) {
    for (const call of calls) {
      const { callee } = call;
      if (
        callee.type !== "MemberExpression" ||
        callee.property.type !== "Identifier" ||
        !METHODS.has(callee.property.name)
      )
        continue;
      const handler = call.arguments[1];
      if (
        !handler ||
        (handler.type !== "ArrowFunctionExpression" && handler.type !== "FunctionExpression")
      ) {
        hits.push(`${file} ${callee.property.name} handler must define its serve call`);
        continue;
      }
      const count = calls.filter(
        (child) => child.start >= handler.start && child.end <= handler.end && isServe(child),
      ).length;
      if (count !== 1)
        hits.push(`${file} ${callee.property.name} handler calls serve ${count} times`);
    }
  }
  return hits;
}

test("router operation check rejects status and null branching, including aliases", () => {
  for (const source of [
    `import { serve } from "@/domain/kernel"; async function route(ctx) { const saved = await serve(ctx, op, {}); if (saved !== null) return saved; }`,
    `import { serve as answer } from "@/domain/kernel"; async function route(ctx) { const saved = await answer(ctx, op, {}); return saved; }`,
    `import { ElysiaCustomStatusResponse as Status } from "elysia";`,
    `import * as kernel from "@/domain/kernel"; async function route(ctx) { const saved = await kernel.serve(ctx, op, {}); return saved; }`,
  ])
    expect(violations("fixture.ts", source).length).toBeGreaterThan(0);
});

test("router operation check accepts direct answers and rejects missing or repeated sync operations", () => {
  const imported = `import { serve } from "@/domain/kernel";`;
  expect(
    violations(
      "fixture.ts",
      `${imported} router.get("/status", async function* (ctx) { yield* serve(ctx, stream, {}); });`,
      true,
    ),
  ).toEqual([]);
  expect(
    violations("fixture.ts", `${imported} router.post("/item", namedHandler);`, true),
  ).toHaveLength(1);
  expect(
    violations("fixture.ts", `${imported} router.post("/item", ctx => serve(ctx, op, {}));`, true),
  ).toEqual([]);
  expect(
    violations(
      "fixture.ts",
      `${imported} router.post("/item", ctx => { ctx.log.set({}); return serve(ctx, op, {}); });`,
      true,
    ),
  ).toEqual([]);
  expect(
    violations("fixture.ts", `${imported} router.post("/item", ctx => { return null; });`, true),
  ).toHaveLength(1);
  expect(
    violations(
      "fixture.ts",
      `${imported} router.post("/item", async ctx => { await serve(ctx, op, {}); return serve(ctx, next, {}); });`,
      true,
    ).length,
  ).toBeGreaterThan(0);
});

const SERVE_ONCE = new Set([
  "apps/server/src/routers/sync/index.ts",
  "apps/server/src/routers/add/index.ts",
]);

test("routers return their domain operation and every sync and Add entry point serves exactly once", async () => {
  const root = path.resolve(import.meta.dir, "..");
  const hits: string[] = [];
  const checked: string[] = [];
  for await (const file of new Glob("apps/server/src/routers/**/*.ts").scan(root)) {
    if (/\.(?:type-)?test\.ts$/u.test(file)) continue;
    if (SERVE_ONCE.has(file)) checked.push(file);
    hits.push(
      ...violations(file, await Bun.file(path.join(root, file)).text(), SERVE_ONCE.has(file)),
    );
  }
  expect(hits).toEqual([]);
  expect(checked.toSorted()).toEqual([...SERVE_ONCE].toSorted());
});
