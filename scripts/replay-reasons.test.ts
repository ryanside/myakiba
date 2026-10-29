import { expect, test } from "bun:test";
import path from "node:path";

test("pinned replay harnesses and head coverage explain their historical revisions", async () => {
  const {
    test: replays,
  }: {
    test: {
      fix: string;
      test: string;
      testAt?: string;
      reason?: string;
      head?: { test: string; reason?: string }[];
    }[];
  } = await Bun.file(path.join(import.meta.dir, "replays.json")).json();
  const missing = replays.flatMap((entry) => [
    ...(entry.testAt && !entry.reason?.trim()
      ? [`${entry.fix} ${entry.test}: harness reason`]
      : []),
    ...(entry.reason && entry.head?.some((group) => group.reason === entry.reason)
      ? [`${entry.fix} ${entry.test}: duplicate reason`]
      : []),
    ...(entry.head ?? [])
      .filter((group) => !group.reason?.trim())
      .map((group) => `${entry.fix} ${group.test}: head reason`),
  ]);
  expect(missing).toEqual([]);
});
