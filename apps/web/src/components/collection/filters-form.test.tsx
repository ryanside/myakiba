import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CollectionFilters } from "@myakiba/contracts/collection/schema";
import type { SuggestedEntriesResponse } from "@myakiba/contracts/search/schema";
import { Button } from "@/components/ui/button";
import FiltersForm from "./filters-form";

afterEach(cleanup);

function renderFilters(suggested: SuggestedEntriesResponse, { refetchFailed = false } = {}) {
  const applied: CollectionFilters[] = [];
  const client = new QueryClient();
  client.setQueryData(["vocabulary"], { shops: [], tags: [], scales: [] });
  client.setQueryData(["entry-uses"], suggested);
  if (refetchFailed) {
    // A refetch that failed keeps the last counts beside its error.
    client
      .getQueryCache()
      .find({ queryKey: ["entry-uses"] })
      ?.setState({ status: "error", error: new Error("Failed to load your most used entries") });
  }
  render(
    <QueryClientProvider client={client}>
      <FiltersForm
        renderTrigger={<Button>Filters</Button>}
        onApplyFilters={(filters) => applied.push(filters)}
        currency="USD"
      />
    </QueryClientProvider>,
  );
  return applied;
}

async function openEntries() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Filters" }));
  await user.click(await screen.findByText("Select entries..."));
  return user;
}

test("an empty entry search offers the most used entries, and picking one filters by it", async () => {
  const applied = renderFilters({
    entries: [
      { id: "entry-miku", name: "Hatsune Miku", category: "Characters", uses: 12 },
      { id: "entry-gsc", name: "Good Smile Company", category: "Companies", uses: 4 },
    ],
  });
  const user = await openEntries();

  const mostUsed = await screen.findByRole("group", { name: "Most used" });
  expect(
    within(mostUsed)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["Hatsune MikuCharacters12", "Good Smile CompanyCompanies4"]);
  expect(screen.queryByText("Type to search for entries")).toBeNull();

  await user.click(within(mostUsed).getByRole("option", { name: /Hatsune Miku/ }));
  expect(within(mostUsed).getByRole("option", { name: /Hatsune Miku/ }).dataset.checked).toBe(
    "true",
  );
  await user.click(within(mostUsed).getByRole("option", { name: /Good Smile Company/ }));
  await user.click(within(mostUsed).getByRole("option", { name: /Good Smile Company/ }));
  await user.keyboard("{Escape}");
  expect(await screen.findByText("Hatsune Miku")).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Apply Filters" }));
  expect(applied.map((filters) => filters.entries)).toEqual([["entry-miku"]]);
});

test("a user whose Collection uses no entries is asked to type", async () => {
  renderFilters({ entries: [] });
  await openEntries();

  expect(await screen.findByText("Type to search for entries")).toBeTruthy();
  expect(screen.queryByRole("group", { name: "Most used" })).toBeNull();
});

test("counts from before a failed refetch are not offered, since they may no longer match", async () => {
  renderFilters(
    { entries: [{ id: "entry-miku", name: "Hatsune Miku", category: "Characters", uses: 2 }] },
    { refetchFailed: true },
  );
  await openEntries();

  expect(await screen.findByText("Type to search for entries")).toBeTruthy();
  expect(screen.queryByRole("group", { name: "Most used" })).toBeNull();
});
