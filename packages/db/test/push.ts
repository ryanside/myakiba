import path from "node:path";

export const PUSH_TIMEOUT = 60_000;
const SCHEMA = path.join(import.meta.dir, "../src/schema");

// drizzle-kit 0.31.10 reads a composite primary key's columns through an unordered join. On
// Postgres 18 a migrated database's catalog statistics often make it read add_commit's in
// reverse, so push rebuilds that key. Nothing else depends on it, so a push may or may not run it.
const ADD_COMMIT_KEY_REBUILD = [
  'ALTER TABLE "add_commit" ADD CONSTRAINT "add_commit_user_id_commit_id_pk" PRIMARY KEY("user_id","commit_id")',
  'ALTER TABLE "add_commit" DROP CONSTRAINT "add_commit_user_id_commit_id_pk"',
];

// drizzle-kit fails any prompt when it has no TTY, so a push that would prompt fails here.
export async function pushSchema(url: string) {
  const child = Bun.spawn(
    [
      "bunx",
      "drizzle-kit",
      "push",
      "--verbose",
      "--dialect=postgresql",
      `--schema=${SCHEMA}`,
      `--url=${url}`,
      "--schemaFilters=public",
    ],
    { cwd: path.join(import.meta.dir, ".."), stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const output = `${stdout}\n${stderr}`;
  const [, executed = ""] = /current statements:\n([\s\S]*?)\n\n\S*\[/.exec(output) ?? [];
  // Push orders a migrated database's tables differently from a fresh one's.
  const statements = executed
    .replaceAll("--> statement-breakpoint", "")
    .split(/;\n/)
    .map((statement) => statement.trim().replace(/;$/, ""))
    .filter(Boolean)
    .toSorted();
  const rebuiltAddCommitKey = ADD_COMMIT_KEY_REBUILD.every((rebuild) =>
    statements.includes(rebuild),
  );
  return {
    applied: ["Changes applied", "No changes detected"].some((done) => output.includes(done)),
    statements: rebuiltAddCommitKey
      ? statements.filter((statement) => !ADD_COMMIT_KEY_REBUILD.includes(statement))
      : statements,
    rebuiltAddCommitKey,
    output,
  };
}
