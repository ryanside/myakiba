import { sql } from "drizzle-orm";
import type { createTestDatabase } from "./database";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

export function replaySafePictureLedger(db: TestDatabase) {
  return {
    async record(owner: string, key: string, bytes: number) {
      await db.execute(
        sql`INSERT INTO picture (owner_id, key, bytes) VALUES (${owner}, ${key}, ${bytes})`,
      );
    },
    async rowsOf(owner: string) {
      const rows = await db.execute<{ key: string; bytes: number }>(
        sql`SELECT key, bytes FROM picture WHERE owner_id = ${owner} ORDER BY key`,
      );
      return [...rows];
    },
  };
}
