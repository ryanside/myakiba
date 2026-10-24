import { beforeEach, expect, test } from "bun:test";
import { createRequestLogger, initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import { createTestDatabase } from "../../test/database";

initLogger({ enabled: false });

const db = await createTestDatabase();
const { serve } = await import("@/domain/kernel");
const { Viewer } = await import("@/domain/viewer");
const { Analytics } = await import("./analytics/module");
const { Collection } = await import("./collection/module");
const { Lists } = await import("./lists/module");
const { Wishlist } = await import("./wishlist/module");

const userId = "user-1";
const caller = () => ({
  viewer: Viewer.fromSession({ user: { id: userId } }),
  log: createRequestLogger(),
});

beforeEach(async () => {
  await db.execute('TRUNCATE "user", item CASCADE');
  await db
    .insert(authSchema.user)
    .values({ id: userId, name: "Ryan", email: "r@example.com", username: "ryan" });
});

test("a missing collection item answers 404 from get and remove", async () => {
  const missing = { code: 404, response: "Collection item not found" };
  expect(await serve(caller(), Collection.get, { id: "missing" })).toMatchObject(missing);
  expect(await serve(caller(), Collection.remove, { id: "missing" })).toMatchObject(missing);
});

test("adding to a list the user does not own answers 404", async () => {
  expect(
    await serve(caller(), Lists.addTargets, {
      targets: [{ type: "item", id: "item-1" }],
      listIds: ["missing"],
    }),
  ).toMatchObject({ code: 404, response: "List or selection not found" });
});

test("moving a wishlist item the user does not have answers 404", async () => {
  expect(
    await serve(caller(), Wishlist.move, {
      movedIds: ["missing"],
      anchorId: null,
      placement: "before",
    }),
  ).toMatchObject({ code: 404, response: "Wishlist Item not found" });
});

test("wishlisting a missing item answers 404", async () => {
  expect(await serve(caller(), Wishlist.add, { itemId: "missing" })).toMatchObject({
    code: 404,
    response: "Item not found",
  });
});

test("relating a section to itself answers 400", async () => {
  expect(
    await serve(caller(), Analytics.sectionRelationships, {
      sectionName: "origins",
      relatedSection: "origins",
      match: "Vocaloid",
      limit: 10,
      offset: 0,
    }),
  ).toMatchObject({ code: 400, response: "Related section must differ from source section" });
});
