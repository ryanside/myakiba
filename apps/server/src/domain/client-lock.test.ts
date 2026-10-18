import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { $ } from "bun";

const root = path.resolve(import.meta.dir, "../../../..");

const CLIENT = "Read and write through scope.tx in module.ts. The kernel opens the transaction.";
const BY_PATH =
  "Import @myakiba/db through its package exports, not by path. The kernel owns the client.";
const TEST_FILE = "Only tests import test files.";
const IN_PACKAGE =
  "Only the kernel reads the client. Inside @myakiba/db, import it as a type only.";
const EXPORT =
  "Do not export @myakiba/db/client. Export an operation or a helper that uses it. Owners call the client directly; don't wrap it in a local factory.";

const files = {
  "apps/server/src/lib/canonical.ts": {
    source: `import { db } from "@myakiba/db/client";\n\nexport const probe = () => db.execute("select 1");\n`,
    flagged: [CLIENT],
  },
  "apps/server/src/lib/relative.ts": {
    source: `import { db } from "../../../../packages/db/src/client";\n\nexport const probe = () => db.execute("select 1");\n`,
    flagged: [BY_PATH],
  },
  "packages/redis/src/relative.ts": {
    source: `import { db } from "../../db/./src/client.ts";\n\nexport const probe = () => db.execute("select 1");\n`,
    flagged: [BY_PATH],
  },
  "packages/db/src/schema/proxy.ts": {
    source: `export { db } from "../client";\n`,
    flagged: [IN_PACKAGE],
  },
  "packages/db/src/order-proxy.ts": {
    source: `import { db } from "./client.ts";\n\nexport const probe = () => db.execute("select 1");\n`,
    flagged: [IN_PACKAGE],
  },
  "packages/db/src/typed.ts": {
    source: `import type { db } from "./client";\n\nexport type Client = typeof db;\n`,
    flagged: [],
  },
  "apps/server/src/lib/through-test-file.ts": {
    source: `import { db } from "./proxy.test";\n\nexport const probe = () => db.execute("select 1");\n`,
    flagged: [TEST_FILE],
  },
  "apps/server/src/lib/through-test-dir.ts": {
    source: `import { db } from "../../test/proxy";\n\nexport const probe = () => db.execute("select 1");\n`,
    flagged: [TEST_FILE],
  },
  "apps/server/src/routers/orders/through-test-dir.ts": {
    source: `import { db } from "@/../test/proxy";\n\nexport const probe = () => db.execute("select 1");\n`,
    flagged: [TEST_FILE],
  },
  "apps/server/src/lib/proxy.test.ts": {
    source: `export { db } from "@myakiba/db/client";\n`,
    flagged: [],
  },
  "apps/server/test/proxy.ts": {
    source: `export { db } from "@myakiba/db/client";\n`,
    flagged: [],
  },
  "apps/web/src/client.test.ts": {
    source: `import { db } from "@myakiba/db/client";\n\nexport const probe = () => db.execute("select 1");\n`,
    flagged: [CLIENT],
  },
  "apps/server/src/domain/kernel.ts": {
    source: `import { db } from "@myakiba/db/client";\n\nexport const probe = () => db.execute("select 1");\nexport { db as client } from "@myakiba/db/client";\n`,
    flagged: [EXPORT],
  },
  "packages/auth/src/server.ts": {
    source: `import { db } from "@myakiba/db/client";\n\nconst pool = db;\nexport const probe = () => pool.execute("select 1");\nexport { pool as client };\n`,
    flagged: [EXPORT],
  },
  "apps/server/src/routers/sync/scraper.ts": {
    source: `import { db } from "@myakiba/db/client";\nimport { helper } from "./helper.test";\n\nexport const probe = () => [db, helper];\n`,
    flagged: [TEST_FILE],
  },
} satisfies Record<string, { source: string; flagged: string[] }>;

const trees: string[] = [];

/** Lints `sources` in a throwaway tree with this repo's oxlint config and returns each file's restriction messages. */
async function lintTree(sources: Record<string, string>) {
  const tree = await mkdtemp(path.join(tmpdir(), "client-lock-"));
  trees.push(tree);
  await $`cp ${path.join(root, "oxlint.config.ts")} ${tree}`;
  await mkdir(path.join(tree, "tools/oxlint"), { recursive: true });
  await $`cp ${path.join(root, "tools/oxlint/myakiba.mjs")} ${path.join(tree, "tools/oxlint")}`;
  await symlink(path.join(root, "node_modules"), path.join(tree, "node_modules"));
  for (const [file, source] of Object.entries(sources)) {
    await mkdir(path.dirname(path.join(tree, file)), { recursive: true });
    await Bun.write(path.join(tree, file), source);
  }
  const lint =
    await $`${path.join(root, "node_modules/.bin/oxlint")} -f json ${Object.keys(sources)}`
      .cwd(tree)
      .nothrow()
      .quiet();
  const {
    diagnostics,
  }: { diagnostics: { code: string; help?: string; message: string; filename: string }[] } =
    lint.json();
  const flagged = new Map(Object.keys(sources).map((file): [string, string[]] => [file, []]));
  for (const { code, help, message, filename } of diagnostics) {
    if (code === "eslint(no-restricted-imports)") flagged.get(filename)?.push(help ?? message);
    if (code === "myakiba(no-db-client-export)") flagged.get(filename)?.push(message);
  }
  return flagged;
}

const KERNEL = "apps/server/src/domain/kernel.ts";
const AUTH = "packages/auth/src/server.ts";
const owners = { [KERNEL]: "pool", [AUTH]: "db" };
const handOuts = {
  "an object property": (client: string) => `export const s7Database = { client: ${client} };\n`,
  "a getter": (client: string) =>
    `export const s7Database = {\n  get client() {\n    return ${client};\n  },\n};\n`,
  "an arrow body": (client: string) => `export const getS7Client = () => ${client};\n`,
  "an awaited return": (client: string) =>
    `export async function getS7Client() {\n  return await ${client};\n}\n`,
  "a conditional return": (client: string) =>
    `export function getS7Client(enabled: boolean) {\n  return enabled ? ${client} : undefined;\n}\n`,
  "a nullish fallback": (client: string) =>
    `export const getS7Client = (override?: unknown) => override ?? ${client};\n`,
  "a reassigned alias": (client: string) =>
    `let s7Client: unknown = null;\ns7Client = ${client};\nexport const s7Database = s7Client;\n`,
};
const ownerSources = async (): Promise<Record<string, string>> => ({
  [KERNEL]: await Bun.file(path.join(root, KERNEL)).text(),
  [AUTH]: await Bun.file(path.join(root, AUTH)).text(),
});

let flagged = new Map<string, string[]>();

beforeAll(async () => {
  flagged = await lintTree(
    Object.fromEntries(Object.entries(files).map(([file, { source }]) => [file, source])),
  );
}, 30_000);

afterAll(async () => {
  for (const tree of trees) await rm(tree, { recursive: true, force: true });
});

describe("only the kernel and the auth adapter reach the db client", () => {
  test.each(Object.entries(files))("%s", (file, { flagged: expected }) => {
    expect(flagged.get(file)?.toSorted()).toEqual(expected.toSorted());
  });

  test("the kernel and the auth adapter as they are export no client", async () => {
    const real = await lintTree(await ownerSources());
    expect(Object.fromEntries(real)).toEqual({ [KERNEL]: [], [AUTH]: [] });
  });

  for (const [owner, client] of Object.entries(owners))
    test.each(Object.entries(handOuts))(
      `${owner} cannot hand the client out through %s`,
      async (_, handOut) => {
        const sources = await ownerSources();
        const result = await lintTree({ [owner]: `${sources[owner]}\n${handOut(client)}` });
        expect(result.get(owner)).toEqual([EXPORT]);
      },
    );

  test("a local factory inside an exported operation is flagged, so owners call the client directly", async () => {
    const sources = await ownerSources();
    const factory = `export const s7Count = async () => {\n  const client = () => pool;\n  return client().execute("select 1");\n};\n`;
    const result = await lintTree({ [KERNEL]: `${sources[KERNEL]}\n${factory}` });
    expect(result.get(KERNEL)).toEqual([EXPORT]);
  });
});
