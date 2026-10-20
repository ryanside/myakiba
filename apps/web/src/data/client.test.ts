import { expect, test } from "bun:test";
import { defineCommand, rootedRead } from "./client";
import { orders } from "./resources/orders";
import { wishlist } from "./resources/wishlist";

const persist = async (itemId: string) => itemId;
const failureTitle = () => "Failed";
const ITEMS_QUERY = { limit: 10, offset: 0, sort: "createdAt", order: "desc" } as const;

test("a read's key is its family, its entry name and the part of the input that changes the result", () => {
  expect([
    [...wishlist.items.options({ releaseStatus: "all", today: "2026-10-17" }).queryKey],
    [...wishlist.items.options({ releaseStatus: "upcoming", today: "2026-10-17" }).queryKey],
  ]).toEqual([
    ["resource", "wishlist", "items", { releaseStatus: "all" }],
    ["resource", "wishlist", "items", { releaseStatus: "upcoming", today: "2026-10-17" }],
  ]);
});

test("a write must name the cataloged families it refreshes", () => {
  defineCommand({ invalidates: ["wishlist"], persist, failureTitle });

  // @ts-expect-error -- a write declares the families it refreshes.
  defineCommand({ persist, failureTitle });

  // @ts-expect-error -- a write refreshes at least one family.
  defineCommand({ invalidates: [], persist, failureTitle });

  // @ts-expect-error -- only cataloged families exist.
  defineCommand({ invalidates: ["wishlists"], persist, failureTitle });

  // @ts-expect-error -- a live stream is never refreshed by a write.
  defineCommand({ invalidates: ["syncJobStatus"], persist, failureTitle });

  // @ts-expect-error -- the dated views need the day they were read on.
  wishlist.items.key({ releaseStatus: "upcoming" });

  // @ts-expect-error -- every read takes the whole request input.
  wishlist.items.options({ releaseStatus: "all" });
});

test("a rooted read keeps its family's hand-built key", () => {
  expect([...orders.items.options({ orderId: "od-1", query: ITEMS_QUERY }).queryKey]).toEqual([
    "orderItems",
    "od-1",
    ITEMS_QUERY,
  ]);

  const load = async () => null;
  rootedRead("orders", { key: (orderId: string) => ["order", orderId] as const, load });

  // @ts-expect-error -- a read's key root is one of its family's cataloged roots, so sync refreshes it.
  rootedRead("collection", { key: (orderId: string) => ["order", orderId] as const, load });

  // @ts-expect-error -- an uncataloged root would never refresh.
  rootedRead("orders", { key: (orderId: string) => ["orderz", orderId] as const, load });
});
