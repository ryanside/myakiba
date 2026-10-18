import { expect, test } from "bun:test";
import { defineCommand } from "./client";
import { wishlist } from "./resources/wishlist";

const persist = async (itemId: string) => itemId;
const failureTitle = () => "Failed";

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
