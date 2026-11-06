import { $ } from "bun";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Commits the working tree of `repo` on top of HEAD, leaving its index untouched, and returns the commit.
 * Index flags carry over, so changes to assume-unchanged or skip-worktree files are not captured.
 */
export async function snapshotWorkingTree(repo: string) {
  const scratch = await mkdtemp(path.join(tmpdir(), "myakiba-snapshot-"));
  try {
    const index = path.join(scratch, "index");
    const realIndex = await $`git rev-parse --git-path index`.cwd(repo).text();
    const realIndexPath = path.resolve(repo, realIndex.trim());
    const indexEnv = { ...process.env, GIT_INDEX_FILE: index };
    // Start from the real index so force-staged ignored files stay in the snapshot.
    if (await Bun.file(realIndexPath).exists()) await copyFile(realIndexPath, index);
    else await $`git read-tree HEAD`.cwd(repo).env(indexEnv).quiet();
    const tree = await $`git add -A && git write-tree`.cwd(repo).env(indexEnv).quiet().text();
    const commit = await $`git commit-tree ${tree.trim()} -p HEAD -m ${"Replay WORKTREE"}`
      .cwd(repo)
      .quiet()
      .text();
    return commit.trim();
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
