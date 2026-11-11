import path from "node:path";

export const PUSH_TIMEOUT = 60_000;
const OWNED_SCHEMA = Bun.fileURLToPath(import.meta.resolve("./owned-schema.ts"));
export const APP_SCHEMA = path.join(import.meta.dir, "../src/schema");

// drizzle-kit 0.31.10 rewrites this default on every push of today's schema.
export const REPEATED_ON_EVERY_PUSH = [
  `ALTER TABLE "entry_to_item" ALTER COLUMN "roles" SET DEFAULT '{}'::text[]`,
];

/** Pushes a schema as push-schema.ts pushes the app's: no TTY, so any prompt fails. */
export async function pushSchema(url: string, schema = OWNED_SCHEMA) {
  const child = Bun.spawn(
    [
      "bunx",
      "drizzle-kit",
      "push",
      "--verbose",
      "--dialect=postgresql",
      `--schema=${schema}`,
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
  return {
    applied: ["Changes applied", "No changes detected"].some((done) => output.includes(done)),
    statements,
    output,
  };
}
