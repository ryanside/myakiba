import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { initLogger } from "evlog";
import { item, item_release } from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";

initLogger({ enabled: false });

const db = await createTestDatabase();
const { default: SyncService } = await import("./service");

async function waitForLockWaiters(count: number) {
  const deadline = Date.now() + 5000;
  while (true) {
    const [waiting] = await db.execute<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
    );
    if ((waiting?.count ?? 0) >= count) return;
    if (Date.now() > deadline) throw new Error(`${waiting?.count} queries wait on locks`);
    await Bun.sleep(10);
  }
}

test("an Item Refresh committed during the read is seen whole, title and latest release", async () => {
  await db.insert(item).values({ id: "item-1", externalId: 186, title: "Old title" });
  await db.insert(item_release).values({ itemId: "item-1", date: "2026-01-01" });

  const read = await db.transaction(async (tx) => {
    await tx.execute("LOCK TABLE item_release IN ACCESS EXCLUSIVE MODE");
    await tx.update(item).set({ title: "New title" }).where(eq(item.id, "item-1"));
    await tx.insert(item_release).values({ itemId: "item-1", date: "2026-06-01" });
    const pending = SyncService.getExistingItemsWithLatestReleaseByExternalIds([186], db);
    await waitForLockWaiters(1);
    return { pending };
  });

  expect(await read.pending).toMatchObject([{ title: "New title", releaseDate: "2026-06-01" }]);
});
