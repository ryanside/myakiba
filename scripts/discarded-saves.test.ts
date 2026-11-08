import { describe, expect, test } from "bun:test";
import path from "node:path";
import { Glob } from "bun";
import { parseSync, Visitor } from "oxc-parser";
import type { CallExpression, Directive, Statement } from "oxc-parser";

// A web write handler resolves a Result and never rejects. A caller that awaits one, drops the
// Result and then does more (closes a dialog, clears a selection, navigates) does that even after
// the write failed. This finds those statements by the handlers' names, since nothing here has
// the types.
const WRITE =
  /^(?:on[A-Z]\w*|callbackFn|run|move|send|handle(?!Submit$)[A-Z]\w*|(?:create|update|delete|remove|add)[A-Z]\w*)$/u;

const SKIPPED =
  /\.test\.tsx?$|^apps\/web\/src\/components\/(?:ui|reui|evilcharts|kibo-ui|extension)\/|^apps\/web\/src\/data\/item-refresh\.ts$|^apps\/web\/src\/lib\/extension-(?:bridge|gate)\.ts$/u;

/** Callers that carry on whichever way the write settled, and why that is right. */
const SETTLED_EITHER_WAY = new Set([
  // A cell drops its draft once its edit settles. A failed edit already rolled back.
  "apps/web/src/hooks/use-pending-value.ts onSubmit",
]);

function calleeName({ callee }: CallExpression): string | undefined {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
    return callee.property.name;
  }
  return undefined;
}

/** Each `await write(…);` in `text` whose Result is dropped before another statement runs. */
function discardedSaves(file: string, text: string): string[] {
  const hits: string[] = [];
  const check = (statements: readonly (Directive | Statement)[]) => {
    for (const [index, statement] of statements.entries()) {
      if (index === statements.length - 1 || statement.type !== "ExpressionStatement") continue;
      const { expression } = statement;
      if (expression.type !== "AwaitExpression") continue;
      if (expression.argument.type !== "CallExpression") continue;
      const name = calleeName(expression.argument);
      if (name === undefined || !WRITE.test(name)) continue;
      if (SETTLED_EITHER_WAY.has(`${file} ${name}`)) continue;
      const line = text.slice(0, statement.start).split("\n").length;
      hits.push(`${file}:${line} awaits ${name}(…) and carries on without reading its Result`);
    }
  };
  new Visitor({
    Program: (program) => check(program.body),
    BlockStatement: (block) => check(block.body),
  }).visit(parseSync(file, text).program);
  return hits;
}

describe("a discarded write Result", () => {
  const flagged = (body: string) => discardedSaves("fixture.tsx", body);

  test("is flagged when the caller carries on after the await", () => {
    expect(flagged("async () => { await onDelete(id); close(); }")).toEqual([
      "fixture.tsx:1 awaits onDelete(…) and carries on without reading its Result",
    ]);
    expect(flagged("async () => { await mutation.run(input); navigate(); }")).toHaveLength(1);
    expect(flagged("async () => { await createList(input); reset(); }")).toHaveLength(1);
  });

  test("is not flagged when the caller reads it, returns it or stops there", () => {
    expect(
      flagged(`async () => {
        const saved = await onDelete(id);
        if (saved.isErr()) return;
        close();
      }`),
    ).toEqual([]);
    expect(flagged("async () => { reset(); return onDelete(id); }")).toEqual([]);
    expect(flagged("async () => { reset(); await onDelete(id); }")).toEqual([]);
  });

  test("is not flagged for a call that is not a write", () => {
    expect(flagged("async () => { await navigate({ to: '/' }); close(); }")).toEqual([]);
    expect(flagged("async () => { await form.handleSubmit(); close(); }")).toEqual([]);
  });
});

test("no web caller carries on after a write without reading its Result", async () => {
  const root = path.resolve(import.meta.dir, "..");
  const hits: string[] = [];
  for await (const file of new Glob("apps/web/src/**/*.{ts,tsx}").scan(root)) {
    if (SKIPPED.test(file)) continue;
    hits.push(...discardedSaves(file, await Bun.file(path.join(root, file)).text()));
  }
  expect(hits).toEqual([]);
});
