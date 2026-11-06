import { expect, test } from "bun:test";
import { parseReplays } from "./replay-config";

const entry = { fix: "abc123", bug: "fixture bug", test: "src/value.test.ts", fixed: ["fixed"] };

test("a pinned replay guards its fixed tests at HEAD unless it names aliases", () => {
  const { test: replays } = parseReplays({
    test: [
      { ...entry, testAt: "abc123" },
      { ...entry, testAt: "abc123", atHead: ["renamed"] },
    ],
  });
  expect(replays.map((replay) => replay.atHead)).toEqual([["fixed"], ["renamed"]]);
});

test("a pinned replay rejects an empty HEAD alias list", () => {
  expect(() => parseReplays({ test: [entry, { ...entry, testAt: "abc123", atHead: [] }] })).toThrow(
    "scripts/replays.json test[1]: atHead must not be empty",
  );
});

test("an unpinned replay rejects HEAD aliases", () => {
  expect(() => parseReplays({ test: [{ ...entry, atHead: ["fixed"] }] })).toThrow(
    "scripts/replays.json test[0]: atHead requires testAt",
  );
});

test("a WORKTREE replay without a base revision is rejected", () => {
  expect(() => parseReplays({ test: [entry, { ...entry, fix: "WORKTREE" }] })).toThrow(
    "scripts/replays.json test[1]: a WORKTREE replay needs a base revision",
  );
});
