import { describe, expect, test } from "bun:test";
import path from "node:path";
import { parseSync, Visitor } from "oxc-parser";
import type { Node } from "oxc-parser";

const TABLES = ["item", "item_release", "entry", "entry_to_item"] as const;
const WRITER = "apps/server/src/lib/item-database.ts";

// https://github.com/ryanside/myakiba/pull/213 adds the one-time ownership migration, which copies Items in raw SQL.
const EXEMPT = ["packages/db/src/item-ownership/"];

const SCHEMA = /(?:^|\/)schema\/figure(?:\.ts)?$/u;
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
];
const SQL_VERB_BEFORE = /\b(insert\s+into|update|delete\s+from)\s+(?:only\s+)?$/iu;
const PRODUCTION = /^(?:apps|packages)\/.+\.tsx?$/u;
const NOT_PRODUCTION = /\.(?:type-)?test\.tsx?$|\.d\.ts$|(?:^|\/)(?:test|e2e)\//u;

type ItemWrite = { readonly line: number; readonly verb: string; readonly table: string };

function itemWrites(file: string, text: string): ItemWrite[] {
  const writes: ItemWrite[] = [];
  const write = (offset: number, verb: string, table: string) =>
    writes.push({ line: text.slice(0, offset).split("\n").length, verb, table });
  const tables = new Map<string, string>();
  const namespaces = new Set<string>();
  const sqlText = (value: string, start: number) => {
    for (const pattern of RAW_WRITES) {
      for (const [, verb = "", table = ""] of value.matchAll(pattern)) {
        write(start, verb.toLowerCase(), table.toLowerCase());
      }
    }
  };
  const tableOf = (node: Node): string | undefined => {
    if (node.type === "Identifier") return tables.get(node.name);
    if (
      node.type === "MemberExpression" &&
      node.object.type === "Identifier" &&
      namespaces.has(node.object.name) &&
      node.property.type === "Identifier" &&
      (TABLES as readonly string[]).includes(node.property.name)
    )
      return node.property.name;
    return undefined;
  };
  new Visitor({
    ImportDeclaration(node) {
      if (!SCHEMA.test(node.source.value)) return;
      for (const specifier of node.specifiers) {
        if (specifier.type === "ImportNamespaceSpecifier") namespaces.add(specifier.local.name);
        if (specifier.type !== "ImportSpecifier") continue;
        const imported =
          specifier.imported.type === "Identifier"
            ? specifier.imported.name
            : specifier.imported.value;
        if ((TABLES as readonly string[]).includes(imported)) {
          tables.set(specifier.local.name, imported);
        }
      }
    },
    CallExpression(node) {
      const { callee } = node;
      if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return;
      const verb = callee.property.name;
      const [target] = node.arguments;
      if (!DRIZZLE_WRITES.has(verb) || !target) return;
      const table = tableOf(target);
      if (table) write(node.start, verb, table);
    },
    Literal(node) {
      if (node.raw) sqlText(node.raw, node.start);
    },
    TemplateLiteral(node) {
      sqlText(node.quasis.map((quasi) => quasi.value.raw).join(" ? "), node.start);
      for (const [index, expression] of node.expressions.entries()) {
        const table = tableOf(expression);
        const verb = node.quasis[index]?.value.raw.match(SQL_VERB_BEFORE)?.[1];
        if (table && verb) write(expression.start, verb.toLowerCase(), table);
      }
    },
  }).visit(parseSync(file, text).program);
  return writes;
}

describe("an Item table write", () => {
  const writes = (body: string) => itemWrites("fixture.ts", body);

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
  ])("is not found in %s", (body) => {
    expect(writes(body)).toEqual([]);
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
    .filter((file) => PRODUCTION.test(file) && !NOT_PRODUCTION.test(file))
    .filter((file) => !EXEMPT.some((prefix) => file.startsWith(prefix)));
  expect(files).toContain(WRITER);

  const strays: string[] = [];
  const written = new Set<string>();
  for (const file of files) {
    const source = Bun.file(path.join(root, file));
    if (!(await source.exists())) continue;
    for (const { line, verb, table } of itemWrites(file, await source.text())) {
      if (file === WRITER) written.add(table);
      else strays.push(`${file}:${line} ${verb} ${table}`);
    }
  }
  expect(strays).toEqual([]);
  expect([...written].toSorted()).toEqual([...TABLES].toSorted());
});
