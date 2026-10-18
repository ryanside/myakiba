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
const EXPORT = "Do not export @myakiba/db/client. Export an operation or a helper that uses it.";

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

let tree = "";
const flagged = new Map<string, string[]>();

beforeAll(async () => {
  tree = await mkdtemp(path.join(tmpdir(), "client-lock-"));
  await $`cp ${path.join(root, "oxlint.config.ts")} ${tree}`;
  await mkdir(path.join(tree, "tools/oxlint"), { recursive: true });
  await $`cp ${path.join(root, "tools/oxlint/myakiba.mjs")} ${path.join(tree, "tools/oxlint")}`;
  await symlink(path.join(root, "node_modules"), path.join(tree, "node_modules"));
  for (const [file, { source }] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(tree, file)), { recursive: true });
    await Bun.write(path.join(tree, file), source);
  }
  const lint = await $`${path.join(root, "node_modules/.bin/oxlint")} -f json ${Object.keys(files)}`
    .cwd(tree)
    .nothrow()
    .quiet();
  const {
    diagnostics,
  }: { diagnostics: { code: string; help?: string; message: string; filename: string }[] } =
    lint.json();
  for (const file of Object.keys(files)) flagged.set(file, []);
  for (const { code, help, message, filename } of diagnostics) {
    if (code === "eslint(no-restricted-imports)") flagged.get(filename)?.push(help ?? message);
    if (code === "myakiba(no-db-client-export)") flagged.get(filename)?.push(message);
  }
}, 30_000);

afterAll(async () => {
  if (tree) await rm(tree, { recursive: true, force: true });
});

describe("only the kernel and the auth adapter reach the db client", () => {
  test.each(Object.entries(files))("%s", (file, { flagged: expected }) => {
    expect(flagged.get(file)?.toSorted()).toEqual(expected.toSorted());
  });
});
