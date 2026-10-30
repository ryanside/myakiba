import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createRequestLogger, initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import { item } from "@myakiba/db/schema/figure";
import { createTestDatabase } from "../../../test/database";

initLogger({ enabled: false });

const db = await createTestDatabase();
const { serve } = await import("@/domain/kernel");
const { Viewer } = await import("@/domain/viewer");
const { lockWishlist } = await import("@/lib/wishlist-append");
const { Wishlist } = await import("./module");

const userId = "user-1";

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

test("wishlisting an item deleted while the wishlist lock is held answers 404", async () => {
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
  await db.insert(item).values({ id: "item-1", externalId: 186, title: "Nendoroid Hatsune Miku" });

  const added = await db.transaction(async (tx) => {
    await lockWishlist(tx, userId);
    const pending = serve(
      { viewer: Viewer.fromSession({ user: { id: userId } }), log: createRequestLogger() },
      Wishlist.add,
      { itemId: "item-1" },
    );
    await waitForLockWaiters(1);
    await tx.delete(item).where(eq(item.id, "item-1"));
    return { pending };
  });

  expect(await added.pending).toMatchObject({ code: 404, response: "Item not found" });
});
