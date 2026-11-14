import { expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { CollectionFilters } from "@myakiba/contracts/collection/schema";
import { collectionItem } from "../../../test/collection-item";
import {
  answerFetch,
  apiRequests,
  flushFrame,
  images,
  renderSidebar,
} from "../../../test/sidebar-app";

const page = {
  items: [collectionItem({ itemTitle: "Hatsune Miku", price: 12_000 })],
  totalCount: 1,
  totalValue: 12_000,
  totalItemsThisMonth: 0,
};

const never = () => new Promise<Response>(() => {});

function collectionRequests() {
  return apiRequests.filter((request) => request.startsWith("/api/collection"));
}

function answerCollection(answer: () => Response | Promise<Response>) {
  answerFetch((request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/collection") return answer();
    if (pathname === "/api/vocabulary") return Response.json({ shops: [] });
    return Response.json({});
  });
}

async function warmedSidebar() {
  const rendered = await renderSidebar();
  await act(() => rendered.ordersImported);
  await waitFor(() => expect(images.length).toBeGreaterThanOrEqual(10));
  return rendered;
}

async function hover(name: string) {
  await act(async () => {
    fireEvent.mouseEnter(screen.getByRole("link", { name }));
  });
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("link", { name }));
  });
  await act(async () => {
    flushFrame();
  });
}

test("opening the app warms page code without requesting any page's data", async () => {
  answerCollection(() => Response.json(page));
  await warmedSidebar();
  await act(() => Bun.sleep(100));
  expect(apiRequests).toEqual([]);
});

test("resting the pointer on a sidebar link starts that page's read", async () => {
  answerCollection(() => Response.json(page));
  await warmedSidebar();

  await hover("Collection");
  await waitFor(() => expect(collectionRequests()).toHaveLength(1));
  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
});

test("a click after a settled hover shows the page's data at once, with no second request", async () => {
  answerCollection(() => Response.json(page));
  const { queryClient } = await warmedSidebar();
  await hover("Collection");
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  await waitFor(() => expect(collectionRequests()).toHaveLength(1));

  answerCollection(never);
  await click("Collection");

  expect(await screen.findByRole("heading", { name: "Collection" })).toBeTruthy();
  expect(screen.getByText("Hatsune Miku")).toBeTruthy();
  expect(collectionRequests()).toHaveLength(1);
});

test("a click with no hover opens the page in its loading state without waiting for data", async () => {
  answerCollection(never);
  await warmedSidebar();

  await click("Collection");

  expect(await screen.findByRole("heading", { name: "Collection" }, { timeout: 500 })).toBeTruthy();
  expect(collectionRequests()).toHaveLength(1);
  expect(screen.queryByText("Hatsune Miku")).toBeNull();
});

test("a preload whose request fails leaves the page's own error state", async () => {
  answerCollection(() => new Response("Collection is down", { status: 400 }));
  const { queryClient } = await warmedSidebar();
  await hover("Collection");
  await waitFor(() => expect(collectionRequests()).toHaveLength(1));
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));

  await click("Collection");

  expect(await screen.findByText("Couldn't load your Collection")).toBeTruthy();
  expect(screen.getByText("Collection is down")).toBeTruthy();
  expect(screen.queryByText("Something went wrong")).toBeNull();
});

test("a preload with search params loads the same read the page shows", async () => {
  answerCollection(() => Response.json(page));
  const { router, queryClient } = await warmedSidebar();
  const search: CollectionFilters = {
    search: "miku",
    sort: "price",
    order: "asc",
    shop: ["AmiAmi"],
  };

  await act(() => router.preloadRoute({ to: "/collection", search }));
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  expect(collectionRequests()).toEqual([
    expect.stringMatching(/^\/api\/collection\?.*search=miku.*sort=price.*order=asc/),
  ]);

  answerCollection(never);
  let navigation: Promise<void> | undefined;
  await act(async () => {
    navigation = router.navigate({ to: "/collection", search });
  });
  await act(async () => {
    flushFrame();
  });
  await act(() => navigation);

  expect(await screen.findByText("Hatsune Miku")).toBeTruthy();
  expect(collectionRequests()).toHaveLength(1);
});
