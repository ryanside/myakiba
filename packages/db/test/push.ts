import path from "node:path";

export const PUSH_TIMEOUT = 60_000;
const SCHEMA = path.join(import.meta.dir, "../src/schema");

// drizzle-kit 0.31.10 rewrites this default on every push of today's schema.
export const REPEATED_ON_EVERY_PUSH = [
  `ALTER TABLE "entry_to_item" ALTER COLUMN "roles" SET DEFAULT '{}'::text[]`,
];

/** What a push adds to a database in the owned shape from before pictures were stored by content. */
export const PICTURE_LEDGER = [
  `CREATE TABLE "picture" (\n\t"owner_id" text NOT NULL,\n\t"key" text NOT NULL,\n\t"bytes" integer NOT NULL,\n\t"created_at" timestamp DEFAULT now() NOT NULL\n)`,
  `ALTER TABLE "item" ADD COLUMN "image_key" text`,
  `ALTER TABLE "picture" ADD CONSTRAINT "picture_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action`,
  `CREATE UNIQUE INDEX "picture_owner_id_key_idx" ON "picture" USING btree ("owner_id","key")`,
];

/** Pushes the app schema as push-schema.ts does: no TTY, so any prompt fails. */
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
  return {
    applied: ["Changes applied", "No changes detected"].some((done) => output.includes(done)),
    statements,
    output,
  };
}
