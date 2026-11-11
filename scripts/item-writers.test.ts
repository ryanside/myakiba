import { describe, expect, test } from "bun:test";
import path from "node:path";
import { parseSync, Visitor } from "oxc-parser";
import type { Node } from "oxc-parser";

const TABLES = ["item", "item_release", "entry", "entry_to_item"] as const;
const WRITER = "apps/server/src/lib/item-database.ts";

const OWNERSHIP_MIGRATION_FILES = new Set([
  "packages/db/src/item-ownership/migrate.ts",
  "packages/db/src/item-ownership/cleanup.ts",
  "packages/db/src/item-ownership/seed.ts",
]);

const SCHEMA = /(?:^|\/)schema\/figure(?:\.[cm]?[jt]s)?$/u;
const DRIZZLE_WRITES = new Set(["insert", "update", "delete"]);
const TABLE = `"?(?:public"?\\."?)?(${TABLES.join("|")})"?`;
const RAW_WRITES = [
  new RegExp(
    `\\b(insert)\\s+into\\s+${TABLE}(?:\\s+as\\s+\\w+)?\\s*(?:\\(|\\b(?:values|select|default)\\b)`,
    "giu",
  ),
  new RegExp(`\\b(update)\\s+(?:only\\s+)?${TABLE}\\s+(?:(?:as\\s+)?\\w+\\s+)?set\\b`, "giu"),
  new RegExp(
    `\\b(delete)\\s+from\\s+(?:only\\s+)?${TABLE}(?:\\s*(?:;|$)|(?:\\s+(?:as\\s+)?\\w+)?\\s+(?:where|using|returning)\\b)`,
    "giu",
  ),
  new RegExp(`\\b(merge)\\s+into\\s+(?:only\\s+)?${TABLE}(?=[\\s(;]|$)`, "giu"),
  new RegExp(`\\b(copy)\\s+${TABLE}(?:\\s*\\([^)]*\\))?\\s+from\\b`, "giu"),
];
const NAME = `(?:only\\s+)?(?:"[^"]+"|[a-z_][\\w$]*)(?:\\.(?:"[^"]+"|[a-z_][\\w$]*))?\\*?`;
// A cascade empties every table that references the ones named, so it can reach the Item tables.
const TRUNCATE = new RegExp(
  `\\btruncate\\s+(?:table\\s+)?(${NAME}(?:\\s*,\\s*${NAME})*)(\\s+(?:(?:restart|continue)\\s+identity\\s+)?cascade\\b)?`,
  "giu",
);
const SQL_VERB_BEFORE =
  /\b(insert\s+into|update|delete\s+from|merge\s+into|truncate(?:\s+table)?)\s+(?:only\s+)?$/iu;
const SQL_COMMENT = /\/\*[\s\S]*?\*\/|--[^\n]*/gu;
const PRODUCTION = /^(?:apps|packages)\/.+\.[cm]?[jt]sx?$/u;
const NOT_PRODUCTION = /\.(?:type-)?test\.[cm]?[jt]sx?$|\.d\.[cm]?ts$|(?:^|\/)(?:test|e2e)\//u;

const isProduction = (file: string) => PRODUCTION.test(file) && !NOT_PRODUCTION.test(file);
const isTable = (name: string) => (TABLES as readonly string[]).includes(name);

type ItemWrite = { readonly line: number; readonly verb: string; readonly table: string };

function truncated(names: string): string[] {
  return names
    .split(",")
    .map((name) =>
      name
        .trim()
        .replace(/^only\s+/iu, "")
        .replace(/\*$/u, "")
        .replaceAll('"', "")
        .replace(/^public\./iu, "")
        .toLowerCase(),
    )
    .filter(isTable);
}

function unwrapped(node: Node): Node {
  switch (node.type) {
    case "AwaitExpression":
      return unwrapped(node.argument);
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
    case "TSTypeAssertion":
    case "ParenthesizedExpression":
      return unwrapped(node.expression);
    default:
      return node;
  }
}

const importsSchema = (node: Node) =>
  node.type === "ImportExpression" &&
  node.source.type === "Literal" &&
  SCHEMA.test(String(node.source.value));

const nameOf = (node: Node): string | undefined => {
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal") return String(node.value);
  if (node.type === "TemplateLiteral" && node.expressions.length === 0)
    return node.quasis[0]?.value.cooked ?? undefined;
  return undefined;
};

/** The property a member expression reads: `a.b`, `a["b"]` or ``a[`b`]``. */
const keyOf = (node: Node): string | undefined => {
  if (node.type !== "MemberExpression") return undefined;
  if (!node.computed) return node.property.type === "Identifier" ? node.property.name : undefined;
  return nameOf(node.property);
};

const importsSchemaThen = (callee: Node) =>
  callee.type === "MemberExpression" &&
  keyOf(callee) === "then" &&
  importsSchema(unwrapped(callee.object));

function itemWrites(file: string, text: string): ItemWrite[] {
  const writes: ItemWrite[] = [];
  const write = (offset: number, verb: string, table: string) =>
    writes.push({ line: text.slice(0, offset).split("\n").length, verb, table });
  const tables = new Map<string, string>();
  const namespaces = new Set<string>();
  const sqlText = (value: string, start: number) => {
    const code = value.replaceAll(SQL_COMMENT, " ");
    for (const pattern of RAW_WRITES) {
      for (const [, verb = "", table = ""] of code.matchAll(pattern)) {
        write(start, verb.toLowerCase(), table.toLowerCase());
      }
    }
    for (const [, names = "", cascade] of code.matchAll(TRUNCATE)) {
      for (const table of truncated(names)) write(start, "truncate", table);
      if (cascade) write(start, "truncate", "cascade");
    }
  };
  const tableOf = (value: Node): string | undefined => {
    const node = unwrapped(value);
    if (node.type === "Identifier") return tables.get(node.name);
    if (node.type !== "MemberExpression") return undefined;
    const namespace = unwrapped(node.object);
    const key = keyOf(node);
    if (namespace.type === "Identifier" && namespaces.has(namespace.name) && key && isTable(key))
      return key;
    return undefined;
  };
  // The schema module, a binding of it, or an object spread from either.
  const isNamespace = (value: Node): boolean => {
    const node = unwrapped(value);
    if (importsSchema(node)) return true;
    if (node.type === "Identifier") return namespaces.has(node.name);
    return (
      node.type === "ObjectExpression" &&
      node.properties.some(
        (property) => property.type === "SpreadElement" && isNamespace(property.argument),
      )
    );
  };
  const held = (value: Node): string[] => {
    const node = unwrapped(value);
    if (node.type === "ObjectExpression")
      return node.properties.flatMap((property) => {
        if (property.type === "Property") return held(property.value);
        return isNamespace(property.argument) ? ["*"] : [];
      });
    if (node.type === "ArrayExpression")
      return node.elements.flatMap((element) =>
        element && element.type !== "SpreadElement" ? held(element) : [],
      );
    const table = tableOf(node);
    return table ? [table] : [];
  };
  const copied = (offset: number, value: Node | null | undefined) => {
    for (const table of value ? held(value) : []) write(offset, "copy", table);
  };
  const destructured = (pattern: Node) => {
    if (pattern.type !== "ObjectPattern") return;
    for (const property of pattern.properties) {
      if (property.type === "RestElement") write(property.start, "destructure", "*");
      const name = property.type === "Property" ? nameOf(property.key) : undefined;
      if (name && isTable(name)) write(property.start, "destructure", name);
    }
  };
  const reExported = (offset: number, local: string | undefined) => {
    if (local === undefined) return;
    const table = tables.get(local);
    if (table) write(offset, "re-export", table);
    if (namespaces.has(local)) write(offset, "re-export", "*");
  };
  new Visitor({
    ImportDeclaration(node) {
      if (!SCHEMA.test(node.source.value)) return;
      for (const specifier of node.specifiers) {
        if (specifier.type === "ImportNamespaceSpecifier") namespaces.add(specifier.local.name);
        if (specifier.type !== "ImportSpecifier") continue;
        const imported = nameOf(specifier.imported);
        if (imported && isTable(imported)) tables.set(specifier.local.name, imported);
      }
    },
    ExportNamedDeclaration(node) {
      if (node.declaration?.type === "VariableDeclaration")
        for (const declarator of node.declaration.declarations)
          if (declarator.init && isNamespace(declarator.init)) write(node.start, "re-export", "*");
      for (const specifier of node.specifiers) {
        const local = nameOf(specifier.local);
        if (node.source === null) reExported(specifier.start, local);
        else if (SCHEMA.test(node.source.value) && local && isTable(local))
          write(specifier.start, "re-export", local);
      }
    },
    ExportAllDeclaration(node) {
      if (SCHEMA.test(node.source.value)) write(node.start, "re-export", "*");
    },
    ExportDefaultDeclaration(node) {
      const exported = unwrapped(node.declaration);
      const table = tableOf(exported);
      if (table) write(node.start, "re-export", table);
      else if (exported.type === "Identifier") reExported(node.start, exported.name);
    },
    VariableDeclarator(node) {
      if (node.init && isNamespace(node.init)) {
        if (node.id.type === "Identifier") namespaces.add(node.id.name);
        destructured(node.id);
      } else copied(node.start, node.init);
    },
    AssignmentExpression(node) {
      copied(node.start, node.right);
    },
    AssignmentPattern(node) {
      copied(node.start, node.right);
    },
    ForOfStatement(node) {
      copied(node.start, node.right);
    },
    PropertyDefinition(node) {
      copied(node.start, node.value);
    },
    ReturnStatement(node) {
      copied(node.start, node.argument);
    },
    ArrowFunctionExpression(node) {
      if (node.expression) copied(node.start, node.body);
    },
    CallExpression(node) {
      const callee = unwrapped(node.callee);
      const [first] = node.arguments;
      if (importsSchemaThen(callee) && first) {
        const callback = unwrapped(first);
        const [module] =
          callback.type === "ArrowFunctionExpression" || callback.type === "FunctionExpression"
            ? callback.params
            : [];
        if (module?.type === "Identifier") namespaces.add(module.name);
        else if (module) destructured(module);
        return;
      }
      const verb = keyOf(callee);
      if (!verb || !DRIZZLE_WRITES.has(verb) || !first) return;
      const table = tableOf(first);
      if (table) write(node.start, verb, table);
    },
    Literal(node) {
      sqlText(String(node.value), node.start);
    },
    TemplateLiteral(node) {
      sqlText(
        node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join(" ? "),
        node.start,
      );
      for (const [index, expression] of node.expressions.entries()) {
        const table = tableOf(expression);
        const before = node.quasis[index]?.value.raw.replaceAll(SQL_COMMENT, " ");
        const verb = before?.match(SQL_VERB_BEFORE)?.[1]?.split(/\s/u)[0];
        if (table && verb) write(expression.start, verb.toLowerCase(), table);
      }
    },
  }).visit(parseSync(file, text).program);
  return writes;
}

describe("an Item table write", () => {
  const writes = (body: string) => itemWrites("fixture.tsx", body);

  test.each([
    [`import { item } from "@myakiba/db/schema/figure"; tx.insert(item).values({});`],
    [`import { entry as e } from "@myakiba/db/schema/figure"; tx.update(e).set({});`],
    [`import * as figure from "@myakiba/db/schema/figure"; tx.delete(figure.item_release);`],
    [`import { entry_to_item } from "../schema/figure"; db.delete(entry_to_item);`],
    ["await tx.execute(sql`INSERT INTO item (id) VALUES (1)`);"],
    ['await tx.unsafe("insert into public.entry_to_item(item_id) values ($1)");'],
    ["await sql`UPDATE item i SET title = 'x' WHERE i.id = 1`;"],
    ['await sql.unsafe(`update "entry" set name = $1`);'],
    ["await sql`DELETE FROM item_release WHERE item_id = 1`;"],
    [
      `import { item } from "@myakiba/db/schema/figure"; await tx.execute(sql\`delete from \${item} where id = 1\`);`,
    ],
    [`export { item } from "@myakiba/db/schema/figure";`],
    [`export { entry as people } from "../schema/figure";`],
    [`export * from "@myakiba/db/schema/figure";`],
    [`export * as figure from "@myakiba/db/schema/figure";`],
    [`import { item_release } from "@myakiba/db/schema/figure"; export { item_release };`],
    [`import * as figure from "@myakiba/db/schema/figure"; export { figure };`],
    [`import { item } from "@myakiba/db/schema/figure"; export default item;`],
    [`import { item } from "@myakiba/db/schema/figure"; const t = item;`],
    [`import { item } from "@myakiba/db/schema/figure"; let t; t = item;`],
    [`import { entry } from "@myakiba/db/schema/figure"; const t = entry as typeof entry;`],
    [`import * as figure from "@myakiba/db/schema/figure"; const t = figure.entry_to_item;`],
    [`import { item } from "@myakiba/db/schema/figure"; const tables = { target: item };`],
    [`import { item } from "@myakiba/db/schema/figure"; const tables = { item };`],
    [`import { entry } from "@myakiba/db/schema/figure"; const tables = [{ people: [entry] }];`],
    [`import * as figure from "@myakiba/db/schema/figure"; const { item } = figure;`],
    [`import * as figure from "@myakiba/db/schema/figure"; const { entry: e } = figure;`],
    [`const { item } = await import("@myakiba/db/schema/figure");`],
    [`const figure = await import("@myakiba/db/schema/figure"); tx.delete(figure.item_release);`],
    ["await sql`TRUNCATE item`;"],
    ['await sql.unsafe("truncate table only collection, public.entry restart identity");'],
    ['await sql.unsafe(`TRUNCATE "user" CASCADE`);'],
    ["await sql`MERGE INTO item i USING src s ON i.id = s.id WHEN MATCHED THEN DELETE`;"],
    ["await sql`INSERT /* copy */ INTO item (id) VALUES (1)`;"],
    ["await sql`DELETE FROM -- every row\n item WHERE true`;"],
    ["await sql`UPDATE /* x */ entry SET name = 'y'`;"],
    [
      `import { item } from "@myakiba/db/schema/figure"; await tx.execute(sql\`insert /* x */ into \${item} (id) values (1)\`);`,
    ],
    [
      `import { item } from "@myakiba/db/schema/figure"; tx.insert(item as typeof item).values({});`,
    ],
    [`import { item } from "@myakiba/db/schema/figure"; tx.insert(item!).values({});`],
    [`import { item } from "@myakiba/db/schema/figure"; tx.insert((item)).values({});`],
    [
      `import { entry } from "@myakiba/db/schema/figure"; tx.update(entry satisfies object).set({});`,
    ],
    [`import * as schema from "@myakiba/db/schema/figure"; tx.insert(schema["item"]).values({});`],
    [`import * as schema from "@myakiba/db/schema/figure"; tx.delete((schema).entry);`],
    [`import { item } from "@myakiba/db/schema/figure"; tx["insert"](item).values({});`],
    [`import { item } from "@myakiba/db/schema/figure"; tx[\`delete\`](item);`],
    ["await sql`COPY item FROM STDIN`;"],
    [
      'await sql.unsafe("copy public.entry_to_item (entry_id, item_id) from stdin with (format csv)");',
    ],
    [
      `import { item } from "@myakiba/db/schema/figure"; function write(t = item) { tx.insert(t); }`,
    ],
    [`import { item } from "@myakiba/db/schema/figure"; for (const t of [item]) tx.insert(t);`],
    [`import { entry } from "@myakiba/db/schema/figure"; class Writer { table = entry; }`],
    [
      `import * as figure from "@myakiba/db/schema/figure"; const tables = { ...figure }; tx.insert(tables.item);`,
    ],
    [`import * as figure from "@myakiba/db/schema/figure"; export const tables = { ...figure };`],
    [`import * as figure from "@myakiba/db/schema/figure"; export const tables = figure;`],
    [
      `import * as figure from "@myakiba/db/schema/figure"; function tables() { return { ...figure }; }`,
    ],
    [`import("@myakiba/db/schema/figure").then((m) => m.item_release);`],
    [`import("@myakiba/db/schema/figure").then(({ entry }) => tx.select().from(entry));`],
    [`import { item } from "@myakiba/db/schema/figure"; const table = () => item;`],
  ])("is found in %s", (body) => {
    expect(writes(body)).toHaveLength(1);
  });

  test.each([
    [`import { item } from "@myakiba/db/schema/figure"; tx.select().from(item);`],
    [`import { collection } from "@myakiba/db/schema/figure"; tx.update(collection).set({});`],
    [`const item = 1; seen.delete(item);`],
    ["await sql`UPDATE collection c SET item_id = 1`;"],
    ["await sql`INSERT INTO item_releases_archive (id) VALUES (1)`;"],
    [`toast("Failed to update item. Please try again.");`],
    [`const text = "Delete from item list";`],
    [`import { item } from "@myakiba/db/schema/figure"; const id = item.id;`],
    [
      `import { item } from "@myakiba/db/schema/figure"; tx.select().from(item).for("update", { of: item });`,
    ],
    [`import * as figure from "@myakiba/db/schema/figure"; const { collection } = figure;`],
    [`export { collection } from "@myakiba/db/schema/figure";`],
    [`<span className="truncate text-xs">{item.title}</span>`],
    ["await sql`TRUNCATE collection`;"],
    ["await sql`COPY item TO STDOUT`;"],
    ["await sql`COPY collection FROM STDIN`;"],
    [`import { item } from "@myakiba/db/schema/figure"; const id = () => item.id;`],
    [`import("@myakiba/db/schema/figure").then((m) => m.collection);`],
    [
      `import * as figure from "@myakiba/db/schema/figure"; const schema = { ...figure }; drizzle({ client, schema });`,
    ],
  ])("is not found in %s", (body) => {
    expect(writes(body)).toEqual([]);
  });
});

describe("a production file", () => {
  test.each([
    ["apps/server/src/lib/item-database.ts"],
    ["apps/web/src/main.tsx"],
    ["packages/db/src/scripts/seed.js"],
    ["packages/db/src/scripts/push.mjs"],
    ["apps/server/src/lib/legacy.cjs"],
    ["packages/db/src/schema/figure.mts"],
    ["packages/db/src/schema/figure.cts"],
    ["apps/web/src/legacy.jsx"],
  ])("is read: %s", (file) => {
    expect(isProduction(file)).toBe(true);
  });

  test.each([
    ["apps/server/src/lib/item-database.test.ts"],
    ["apps/server/src/domain/kernel.type-test.ts"],
    ["packages/db/src/scripts/seed.test.mts"],
    ["apps/server/test/database.ts"],
    ["apps/web/e2e/add.e2e.js"],
    ["packages/db/src/env.d.mts"],
    ["scripts/item-writers.test.ts"],
  ])("is skipped: %s", (file) => {
    expect(isProduction(file)).toBe(false);
  });
});

test(`only ${WRITER} writes ${TABLES.join(", ")}`, async () => {
  const root = path.resolve(import.meta.dir, "..");
  const listed = Bun.spawnSync(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "apps", "packages"],
    { cwd: root },
  );
  expect(listed.exitCode).toBe(0);
  const files = listed.stdout
    .toString()
    .split("\n")
    .filter((file) => isProduction(file) && !OWNERSHIP_MIGRATION_FILES.has(file));
  expect(files).toContain(WRITER);

  const strays: string[] = [];
  const written = new Set<string>();
  for (const file of files) {
    const source = Bun.file(path.join(root, file));
    if (!(await source.exists())) continue;
    for (const { line, verb, table } of itemWrites(file, await source.text())) {
      if (file === WRITER && verb !== "re-export") written.add(table);
      else strays.push(`${file}:${line} ${verb} ${table}`);
    }
  }
  expect(strays).toEqual([]);
  expect([...written].toSorted()).toEqual([...TABLES].toSorted());
});
