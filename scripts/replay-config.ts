type TestReplayEntry = {
  fix: string;
  base?: string;
  bug: string;
  test: string;
  fixed: string[];
  /** The revision to take the test file and its harness from, on both sides of the fix. */
  testAt?: string;
  atHead?: string[];
  /** Current coverage when the historical harness uses names or files that HEAD renamed. */
  head?: { test: string; fixed: string[]; reason: string }[];
  /** Why historical coverage was partially retired or its harness pinned. */
  reason?: string;
};

/** `base` is the revision the test fails at: the given one for WORKTREE, else the fix's parent. */
export type TestReplay = Omit<TestReplayEntry, "base" | "testAt" | "atHead"> & { base: string } & (
    | { testAt: string; atHead: string[] }
    | { testAt?: never; atHead?: never }
  );

export type LintReplay = {
  fix: string;
  bug: string;
  rule: string;
  atParent: string[];
  atFix: string[];
};

export type KnipReplay = {
  fix: string;
  bug: string;
  reports: string[];
};

export type TypesReplay = {
  name: string;
  fix: string;
  bug: string;
  package: string;
  config: string[];
  errors: string[];
  /** The revision to take `config` from, when HEAD's copy no longer compiles against the fix. */
  configAt?: string;
};

/** A type test whose `@ts-expect-error` lines must each fail with the listed error. */
export type TypesFixture = {
  name: string;
  bug: string;
  package: string;
  file: string;
  errors: string[];
};

type ReplaysFile = {
  test?: TestReplayEntry[];
  lint?: LintReplay[];
  knip?: KnipReplay[];
  types?: TypesReplay[];
  fixtures?: TypesFixture[];
};

function parseTestReplay(
  { base, testAt, atHead, ...entry }: TestReplayEntry,
  index: number,
): TestReplay {
  const invalid = (message: string) => new Error(`scripts/replays.json test[${index}]: ${message}`);
  if (atHead !== undefined && testAt === undefined) {
    throw invalid("atHead requires testAt");
  }
  if (atHead !== undefined && (!Array.isArray(atHead) || atHead.length === 0)) {
    throw invalid("atHead must not be empty and must be a list of test names");
  }
  const parent = entry.fix === "WORKTREE" ? base : `${entry.fix}^`;
  if (!parent) {
    throw invalid("a WORKTREE replay needs a base revision");
  }
  const replay = { ...entry, base: parent };
  return testAt === undefined ? replay : { ...replay, testAt, atHead: atHead ?? replay.fixed };
}

export function parseReplays({
  test = [],
  lint = [],
  knip = [],
  types = [],
  fixtures = [],
}: ReplaysFile) {
  return { test: test.map(parseTestReplay), lint, knip, types, fixtures };
}
