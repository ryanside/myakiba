import { afterEach, expect, mock, setDefaultTimeout, spyOn, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Result } from "better-result";
import type { ReactNode } from "react";
import type { ApiRejected } from "@/lib/errors/api-rejected";

setDefaultTimeout(20_000);

type Refreshed = Result<
  { readonly saved: "refreshed" | "unchanged"; readonly picture: "absent" | "over_quota" },
  ApiRejected
>;
const refreshed = async (): Promise<Refreshed> =>
  Result.ok({ saved: "refreshed", picture: "absent" });
let refresh = refreshed;
const realRefresh = await import("@/data/item-refresh");
await mock.module("@/data/item-refresh", () => ({
  ...realRefresh,
  refreshItemWithExtension: () => refresh(),
}));

const { toast } = await import("@/components/ui/toast");
const toastAdd = spyOn(toast, "add");
const { useResourceMutation } = await import("../client");
const itemResource = await import("./item");

afterEach(() => {
  cleanup();
  toastAdd.mockClear();
  refresh = refreshed;
});

function renderRefresh(queryClient: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useResourceMutation(itemResource.refreshItemCommand), { wrapper });
}

test("an Item Refresh refetches the item, its releases, and the collection, orders and calendar that show it", async () => {
  const queryClient = new QueryClient();
  const shown = [
    ["item", 98_777],
    ["itemReleases", "item-1"],
    ["collection", { search: "" }],
    ["order", "od-1"],
    ["orders", { offset: 0 }],
    ["calendar", "2026-10"],
    ["releaseCalendar", "2026-10"],
  ];
  for (const key of shown) queryClient.setQueryData(key, {});
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useResourceMutation(itemResource.refreshItemCommand), {
    wrapper,
  });

  await act(async () => {
    await result.current.run(98_777);
  });

  expect(shown.filter((key) => !queryClient.getQueryState(key)?.isInvalidated)).toEqual([]);
  expect(toastAdd).toHaveBeenCalledWith({ type: "success", title: "Item details refreshed" });
});

test("an Item Refresh refetches the dashboard, analytics, searches, Wishlist, lists and expenses that show it", async () => {
  const queryClient = new QueryClient();
  const shown = [
    ["dashboard"],
    ["dashboard", "monthly", 10, 2026],
    ["analytics"],
    ["app-command", "search", "miku"],
    ["item-database-items", { search: "miku" }],
    ["entries", "miku"],
    ["resource", "wishlist", "items", { releaseStatus: "all" }],
    ["lists", "overview"],
    ["expenses", "filter-options"],
  ];
  for (const key of shown) queryClient.setQueryData(key, {});
  const { result } = renderRefresh(queryClient);

  await act(async () => {
    await result.current.run(98_777);
  });

  expect(shown.filter((key) => !queryClient.getQueryState(key)?.isInvalidated)).toEqual([]);
});

test.each([
  ["refreshed", "Item details refreshed without the new picture"],
  ["unchanged", "Item details are up to date, without the new picture"],
] as const)(
  "an Item Refresh %s over the picture quota says the picture was left out",
  async (saved, title) => {
    refresh = async () => Result.ok({ saved, picture: "over_quota" });
    const { result } = renderRefresh(new QueryClient());

    await act(async () => {
      await result.current.run(98_777);
    });

    expect(toastAdd.mock.calls).toEqual([
      [
        {
          type: "warning",
          title,
          description: "Your pictures already take the 2 GB one account can store.",
        },
      ],
    ]);
  },
);
