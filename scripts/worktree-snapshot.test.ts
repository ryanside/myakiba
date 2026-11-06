import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { $ } from "bun";
import { snapshotWorkingTree } from "./worktree-snapshot";

const repos: string[] = [];

afterEach(async () => {
  await Promise.all(repos.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A repository with one commit holding `files`, ignored or not. */
async function repo(files: Record<string, string>) {
  const dir = await mkdtemp(path.join(tmpdir(), "worktree-snapshot-test-"));
  repos.push(dir);
  const git = async (...args: string[]) => {
    const result = await $`git ${args}`.cwd(dir).quiet();
    return result.text();
  };
  const write = (file: string, text: string) => Bun.write(path.join(dir, file), text);
  const remove = (file: string) => rm(path.join(dir, file), { recursive: true });
  await git("init", "-q", "-b", "main");
  await git("config", "user.name", "Fixture");
  await git("config", "user.email", "fixture@example.invalid");
  for (const [file, text] of Object.entries(files)) await write(file, text);
  await git("add", "--force", ".");
  await git("commit", "--no-verify", "-qm", "initial");
  const gitIndexPath = await git("rev-parse", "--git-path", "index");
  const indexPath = path.resolve(dir, gitIndexPath.trim());
  const index = Bun.file(indexPath);
  const readIndex = async () => ((await index.exists()) ? index.bytes() : undefined);

  /** Snapshots the working tree and checks that the real index, or its absence, is unchanged. */
  async function snapshot() {
    const before = await readIndex();
    const commit = await snapshotWorkingTree(dir);
    expect(await readIndex()).toEqual(before);
    const listing = await git("ls-tree", "-r", "--name-only", commit);
    return {
      commit,
      files: listing.split("\n").filter(Boolean),
      show: (file: string) => git("show", `${commit}:${file}`),
    };
  }
  return { git, write, remove, indexPath, snapshot };
}

test("a snapshot commits edits, deletions and untracked files on top of HEAD", async () => {
  const { git, write, remove, snapshot } = await repo({
    ".gitignore": "node_modules\n",
    "src/value.ts": "old\n",
    "src/gone.ts": "gone\n",
  });
  await write("node_modules/ignored.js", "ignored\n");
  await write("src/value.ts", "new\n");
  await remove("src/gone.ts");
  await write("src/added.ts", "added\n");
  const head = await git("rev-parse", "HEAD");
  const { commit, files, show } = await snapshot();
  expect(files).toEqual([".gitignore", "src/added.ts", "src/value.ts"]);
  expect(await show("src/value.ts")).toBe("new\n");
  expect(await git("rev-parse", `${commit}^`)).toBe(head);
});

test("a snapshot keeps tracked files that Git ignores", async () => {
  const { write, snapshot } = await repo({
    ".gitignore": "src/ignored.ts\n",
    "src/ignored.ts": "old\n",
  });
  await write("src/ignored.ts", "new\n");
  const { files, show } = await snapshot();
  expect(files).toContain("src/ignored.ts");
  expect(await show("src/ignored.ts")).toBe("new\n");
});

test("a snapshot keeps ignored files that were force-staged", async () => {
  const { git, write, snapshot } = await repo({ "src/value.ts": "value\n" });
  await write(".gitignore", "src/ignored.ts\n");
  await write("src/ignored.ts", "staged\n");
  await git("add", "--force", "src/ignored.ts");
  const { files } = await snapshot();
  expect(files).toContain("src/ignored.ts");
});

test("a snapshot of a checkout with no index file starts from HEAD", async () => {
  const { write, indexPath, snapshot } = await repo({
    ".gitignore": "src/ignored.ts\n",
    "src/ignored.ts": "ignored\n",
    "src/value.ts": "old\n",
  });
  await rm(indexPath);
  await write("src/value.ts", "new\n");
  const { files, show } = await snapshot();
  expect(files).toEqual([".gitignore", "src/ignored.ts", "src/value.ts"]);
  expect(await show("src/value.ts")).toBe("new\n");
});
