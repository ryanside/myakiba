import { beforeAll, expect, mock, test } from "bun:test";
import { initLogger } from "evlog";
import * as authSchema from "@myakiba/db/schema/auth";
import { item, item_release, wishlistItem } from "@myakiba/db/schema/figure";
import type { ReleaseDate } from "@myakiba/contracts/shared/release-date";
import { createTestDatabase } from "../../../test/database";

initLogger({ enabled: false });

const OWNER = "user-released";

await mock.module("@myakiba/auth/server", () => ({
  auth: {
    handler: () => new Response(null, { status: 404 }),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user");
        if (!id) return null;
        return { user: { id, emailVerified: true, currency: "JPY" }, session: { id: `s-${id}` } };
      },
    },
  },
}));
await mock.module("@myakiba/redis/client", () => ({ redis: { eval: async () => [1, 1800] } }));

const db = await createTestDatabase();
const { Elysia } = await import("elysia");
const { default: wishlistRouter } = await import("./index");
const app = new Elysia({ prefix: "/api" }).use(wishlistRouter);

const ITEMS: readonly {
  readonly title: string;
  readonly release: { readonly date: string; readonly precision: ReleaseDate["precision"] } | null;
}[] = [
  { title: "June", release: { date: "2026-06-01", precision: "month" } },
  { title: "2026", release: { date: "2026-01-01", precision: "year" } },
  { title: "June 18", release: { date: "2026-06-18", precision: "day" } },
  { title: "Undated", release: null },
];

beforeAll(async () => {
  await db
    .insert(authSchema.user)
    .values({ id: OWNER, name: "Released", email: "released@example.com", username: "released" });
  for (const [position, { title, release }] of ITEMS.entries()) {
    const itemId = `item-${position}`;
    await db
      .insert(item)
      .values({ id: itemId, ownerId: OWNER, externalId: 70_000 + position, title });
    if (release) {
      await db.insert(item_release).values({
        itemId,
        date: release.date,
        datePrecision: release.precision,
        price: 10_000,
        priceCurrency: "JPY",
      });
    }
    await db.insert(wishlistItem).values({ userId: OWNER, itemId, position });
  }
});

async function titles(releaseStatus: "all" | "upcoming" | "released", today: string) {
  const response = await app.handle(
    new Request(`http://localhost/api/wishlist?releaseStatus=${releaseStatus}&today=${today}`, {
      headers: { "x-test-user": OWNER },
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { items: { title: string }[] };
  return body.items.map((row) => row.title);
}

async function view(title: string, today: string) {
  const [upcoming, released] = await Promise.all([
    titles("upcoming", today),
    titles("released", today),
  ]);
  return { upcoming: upcoming.includes(title), released: released.includes(title) };
}

test("a June month-only release is Upcoming through June 30 and Released from July 1", async () => {
  expect(await view("June", "2026-06-02")).toEqual({ upcoming: true, released: false });
  expect(await view("June", "2026-06-30")).toEqual({ upcoming: true, released: false });
  expect(await view("June", "2026-07-01")).toEqual({ upcoming: false, released: true });
});

test("a year-only release is Upcoming on December 31 and Released from January 1", async () => {
  expect(await view("2026", "2026-12-31")).toEqual({ upcoming: true, released: false });
  expect(await view("2026", "2027-01-01")).toEqual({ upcoming: false, released: true });
});

test("a day-precise release is Upcoming before its day and Released on it", async () => {
  expect(await view("June 18", "2026-06-17")).toEqual({ upcoming: true, released: false });
  expect(await view("June 18", "2026-06-18")).toEqual({ upcoming: false, released: true });
  expect(await view("June 18", "2026-06-19")).toEqual({ upcoming: false, released: true });
});

test("an Item with no release date is only under All", async () => {
  expect(await view("Undated", "2027-06-01")).toEqual({ upcoming: false, released: false });
  expect(await titles("all", "2027-06-01")).toContain("Undated");
});
