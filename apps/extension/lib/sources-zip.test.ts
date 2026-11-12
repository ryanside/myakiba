import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { glob } from "tinyglobby";
import config from "../wxt.config";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repoLike(files: readonly string[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "sources-zip-"));
  roots.push(root);
  for (const file of files) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), "");
  }
  return root;
}

// WXT builds the sources zip with tinyglobby from these options (wxt/dist/core/zip.mjs).
test("the sources zip leaves out legacy test reports at package roots", async () => {
  const zip = config.zip;
  if (!zip?.includeSources || !zip.excludeSources) throw new Error("wxt.config sets no sources");
  const root = await repoLike([
    "package.json",
    "test-results.xml",
    "apps/extension/package.json",
    "apps/extension/lib/fetcher.ts",
    "apps/extension/test-results.xml",
    "packages/env/package.json",
    "packages/env/src/extension.ts",
    "packages/env/test-results.xml",
  ]);

  const zipped = await glob(zip.includeSources, {
    cwd: root,
    ignore: zip.excludeSources,
    onlyFiles: true,
    dot: zip.dotSources,
  });

  expect(zipped.toSorted()).toEqual([
    "apps/extension/lib/fetcher.ts",
    "apps/extension/package.json",
    "package.json",
    "packages/env/package.json",
    "packages/env/src/extension.ts",
  ]);
});
