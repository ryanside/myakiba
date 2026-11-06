import { $ } from "bun";
import { lstatSync } from "node:fs";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

function flagged(entries: string[], tag: RegExp) {
  return entries.filter((entry) => tag.test(entry)).map((entry) => entry.slice(2));
}

function presentInWorkingTree(repo: string, file: string) {
  try {
    return lstatSync(path.join(repo, file), { throwIfNoEntry: false }) !== undefined;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOTDIR") return false;
    throw error;
  }
}

async function clearIndexFlag(
  repo: string,
  indexEnv: Record<string, string | undefined>,
  flag: "assume-unchanged" | "skip-worktree",
  paths: string[],
) {
  if (paths.length === 0) return;
  const input = Buffer.from(`${paths.join("\0")}\0`);
  await $`git update-index --no-${flag} -z --stdin < ${input}`.cwd(repo).env(indexEnv).quiet();
}

/** Commits the working tree of `repo` on top of HEAD, leaving its index untouched, and returns the commit. */
export async function snapshotWorkingTree(repo: string) {
  const scratch = await mkdtemp(path.join(tmpdir(), "myakiba-snapshot-"));
  try {
    const index = path.join(scratch, "index");
    const realIndex = await $`git rev-parse --git-path index`.cwd(repo).text();
    const realIndexPath = path.resolve(repo, realIndex.trim());
    // Keep force-staged ignored files and preserve absent sparse paths.
    const indexEnv = { ...process.env, GIT_INDEX_FILE: index };
    if (await Bun.file(realIndexPath).exists()) await copyFile(realIndexPath, index);
    else await $`git read-tree HEAD`.cwd(repo).env(indexEnv).quiet();
    const indexListing = await $`git ls-files -v -z`.cwd(repo).env(indexEnv).text();
    const entries = indexListing.split("\0");
    // assume-unchanged is a hint; skip-worktree means intended absence, so keep it on missing files.
    await clearIndexFlag(repo, indexEnv, "assume-unchanged", flagged(entries, /^[a-z] /));
    await clearIndexFlag(
      repo,
      indexEnv,
      "skip-worktree",
      flagged(entries, /^[Ss] /).filter((file) => presentInWorkingTree(repo, file)),
    );
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
