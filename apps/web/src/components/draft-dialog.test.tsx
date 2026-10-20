import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ComponentType, ReactElement } from "react";
import type { SearchEntriesResponse } from "@myakiba/contracts/search/schema";

await mock.module("@/queries/search", () => ({
  searchEntries: async (): Promise<SearchEntriesResponse> => ({
    entries: [{ id: "entry-miku", name: "Hatsune Miku", category: "Character" }],
  }),
}));

const { default: CollectionFiltersForm } = await import("./collection/filters-form");
const { default: OrdersFiltersForm } = await import("./orders/orders-filters-form");

afterEach(cleanup);

type Filters = { shop?: string[]; entries?: string[] };
type FiltersFormProps = {
  renderTrigger: ReactElement;
  currentFilters?: Filters;
  onApplyFilters: (filters: Filters) => void;
  currency: "USD";
};

const FORMS: readonly (readonly [string, ComponentType<FiltersFormProps>])[] = [
  ["collection", CollectionFiltersForm],
  ["orders", OrdersFiltersForm],
];

function renderToolbar(FiltersForm: ComponentType<FiltersFormProps>) {
  const url = { filters: {} as Filters, set: (_filters: Filters) => {} };

  function Toolbar() {
    const [filters, setFilters] = useState<Filters>({});
    useEffect(() => {
      url.filters = filters;
      url.set = setFilters;
    }, [filters]);
    return (
      <>
        <FiltersForm
          renderTrigger={<button type="button">Filters</button>}
          currentFilters={{ ...filters }}
          onApplyFilters={(next) => setFilters({ ...filters, ...next })}
          currency="USD"
        />
        <button type="button" onClick={() => setFilters({})}>
          Reset Filters
        </button>
      </>
    );
  }

  render(
    <QueryClientProvider client={new QueryClient()}>
      <Toolbar />
    </QueryClientProvider>,
  );
  const user = userEvent.setup({ delay: null });

  const openDialog = async () => {
    await user.click(screen.getByRole("button", { name: "Filters" }));
    return screen.findByRole("dialog");
  };
  // A failed expect on the open dialog hangs Bun while it prints the React-owned node.
  const waitForClose = () =>
    waitFor(() => {
      if (screen.queryByRole("dialog")) throw new Error("dialog still open");
    });
  const typeShop = (dialog: HTMLElement, shop: string) =>
    user.type(
      within(dialog).getByPlaceholderText("Press enter after each shop to add"),
      `${shop}{Enter}`,
    );
  const cancel = async (dialog: HTMLElement) => {
    await user.click(within(dialog).getByText("Cancel"));
    await waitForClose();
  };
  const apply = async (dialog: HTMLElement) => {
    await user.click(within(dialog).getByText("Apply Filters"));
    await waitForClose();
  };
  const applyShop = async (shop: string) => {
    const dialog = await openDialog();
    await typeShop(dialog, shop);
    await apply(dialog);
  };
  const shopsShownIn = (dialog: HTMLElement) =>
    ["AmiAmi", "Mandarake"].filter((shop) => within(dialog).queryByText(shop) !== null);

  return { user, url, openDialog, typeShop, cancel, apply, applyShop, shopsShownIn };
}

describe.each(FORMS)("%s filters dialog starts each open from the URL filters", (_name, Form) => {
  test("after Reset Filters, the reopened dialog is empty and Apply keeps the reset", async () => {
    const { user, url, openDialog, apply, applyShop, shopsShownIn } = renderToolbar(Form);
    await applyShop("AmiAmi");
    expect(url.filters.shop).toEqual(["AmiAmi"]);

    await user.click(screen.getByRole("button", { name: "Reset Filters" }));
    const dialog = await openDialog();
    const shown = shopsShownIn(dialog);
    await apply(dialog);

    expect({ shownAfterReset: shown, urlShopAfterApply: url.filters.shop }).toEqual({
      shownAfterReset: [],
      urlShopAfterApply: undefined,
    });
  });

  test("after browser Back to an earlier filter, the reopened dialog shows that filter", async () => {
    const { url, openDialog, applyShop, shopsShownIn } = renderToolbar(Form);
    await applyShop("AmiAmi");

    await act(() => url.set({ shop: ["Mandarake"] }));
    const dialog = await openDialog();

    expect(shopsShownIn(dialog)).toEqual(["Mandarake"]);
  });

  test("closing without Apply discards the draft", async () => {
    const { url, openDialog, typeShop, cancel, shopsShownIn } = renderToolbar(Form);
    const draft = await openDialog();
    await typeShop(draft, "AmiAmi");
    expect(shopsShownIn(draft)).toEqual(["AmiAmi"]);

    await cancel(draft);
    const reopened = await openDialog();

    expect({ shownAfterCancel: shopsShownIn(reopened), urlShop: url.filters.shop }).toEqual({
      shownAfterCancel: [],
      urlShop: undefined,
    });
  });

  test("reopening while the dialog is still closing discards the draft", async () => {
    const { openDialog, typeShop, shopsShownIn } = renderToolbar(Form);
    const draft = await openDialog();
    await typeShop(draft, "AmiAmi");

    act(() => {
      fireEvent.click(within(draft).getByText("Cancel"));
    });
    const stillClosing = draft.isConnected;
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Filters", hidden: true }));
    });
    const reopened = await screen.findByRole("dialog");

    expect({ stillClosing, shownAfterReopen: shopsShownIn(reopened) }).toEqual({
      stillClosing: true,
      shownAfterReopen: [],
    });
  });

  test("control: a filter set before the first open shows in the dialog", async () => {
    const { url, openDialog, shopsShownIn } = renderToolbar(Form);

    await act(() => url.set({ shop: ["Mandarake"] }));
    const dialog = await openDialog();

    expect(shopsShownIn(dialog)).toEqual(["Mandarake"]);
  });
});

test("collection filters dialog keeps a picked entry's name after Apply and reopen", async () => {
  const { user, url, openDialog, apply } = renderToolbar(CollectionFiltersForm);
  const dialog = await openDialog();
  await user.click(within(dialog).getByRole("combobox"));
  await user.type(await screen.findByPlaceholderText("Search entries..."), "miku");
  await user.click(await screen.findByRole("option", { name: /Hatsune Miku/ }));
  await apply(dialog);
  expect(url.filters.entries).toEqual(["entry-miku"]);

  const reopened = await openDialog();

  expect(within(reopened).queryByText("Hatsune Miku")).not.toBeNull();
});
