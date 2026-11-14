import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { Result } from "better-result";
import { defineCommand, preload, preloadPage, rootedRead } from "./client";
import { orders } from "./resources/orders";
import { wishlist } from "./resources/wishlist";

const persist = async (itemId: string) => Result.ok(itemId);
const failureToast = () => ({ title: "Failed" });
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
  defineCommand({ invalidates: ["wishlist"], persist, failureToast });

  // @ts-expect-error -- a write declares the families it refreshes.
  defineCommand({ persist, failureToast });

  // @ts-expect-error -- a write refreshes at least one family.
  defineCommand({ invalidates: [], persist, failureToast });

  // @ts-expect-error -- only cataloged families exist.
  defineCommand({ invalidates: ["wishlists"], persist, failureToast });

  defineCommand({ invalidates: ["usernameAvailability"], persist, failureToast });

  defineCommand({ invalidates: "nothing", persist });

  // @ts-expect-error -- a write answers a Result, so its failure cannot be a bare rejection.
  defineCommand({ invalidates: ["wishlist"], persist: async (itemId: string) => itemId });

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

  const load = async () => Result.ok(null);
  rootedRead("orders", { key: (orderId: string) => ["order", orderId] as const, load });

  const bareLoad = async () => null;
  // @ts-expect-error -- a read answers a Result, so its failure cannot be a bare rejection.
  rootedRead("orders", { key: (orderId: string) => ["order", orderId] as const, load: bareLoad });

  // @ts-expect-error -- a read's key root is one of its family's cataloged roots, so an Item Refresh refreshes it.
  rootedRead("collection", { key: (orderId: string) => ["order", orderId] as const, load });

  // @ts-expect-error -- an uncataloged root would never refresh.
  rootedRead("orders", { key: (orderId: string) => ["orderz", orderId] as const, load });
});

test("a write refetches only keys of the families it names, at one time", () => {
  defineCommand({
    invalidates: ["lists"],
    refetchKeys: () => [{ queryKey: ["lists", "overview"], exact: true }],
    persist,
  });

  defineCommand({
    invalidates: ["lists"],
    // @ts-expect-error -- a narrowed refetch stays inside the families the write names.
    refetchKeys: () => [{ queryKey: ["orders"] }],
    persist,
  });

  defineCommand({
    invalidates: ["orders"],
    refetchBy: "settled",
    // @ts-expect-error -- a write that refetches once it settles refetches every family it names.
    refetchKeys: () => [{ queryKey: ["orders"] }],
    persist,
  });
});

test("a preload fills the cache entry its screen reads and resolves even when the read fails", async () => {
  const queryClient = new QueryClient();
  const read = rootedRead("dashboard", {
    key: (month: string) => ["dashboard", month] as const,
    load: async (month: string) =>
      month === "2026-11"
        ? Result.ok({ month })
        : Result.err(new Error("The server didn't answer.")),
  });

  await preload(queryClient, read, "2026-11");
  expect(queryClient.getQueryData(read.key("2026-11"))).toEqual({ month: "2026-11" });

  expect(await preload(queryClient, read, "2026-12")).toBeUndefined();
  expect(queryClient.getQueryState(read.key("2026-12"))?.status).toBe("error");
});

test("a route waits for its preloads on a hover, starts them on a navigation and leaves a navigation within the page to the page", async () => {
  let finishLoad = () => {};
  const load = new Promise<void>((resolve) => {
    finishLoad = resolve;
  });
  const started: string[] = [];
  const preloads = (cause: string) => () => {
    started.push(cause);
    return [load];
  };

  let hoverSettled = false;
  const hover = preloadPage("preload", preloads("preload")).then(() => {
    hoverSettled = true;
  });
  await preloadPage("enter", preloads("enter"));
  await preloadPage("stay", preloads("stay"));
  expect(started).toEqual(["preload", "enter"]);
  expect(hoverSettled, "a hover waits for its reads").toBe(false);
  finishLoad();
  await hover;
  expect(hoverSettled).toBe(true);
});
