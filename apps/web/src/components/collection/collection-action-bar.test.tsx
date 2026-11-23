import { afterEach, expect, mock, setDefaultTimeout, test } from "bun:test";
import { act, cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ItemFill } from "@myakiba/contracts/collection/fill";
import { Result } from "better-result";
import { useState } from "react";
import type { Saving } from "@/data/client";
import { WriteFailed } from "@/lib/errors/write-failed";

configure({ asyncUtilTimeout: 4000 });
setDefaultTimeout(20_000);

await mock.module("@/hooks/use-user-preferences", () => ({
  useUserPreferences: () => ({ currency: "USD", locale: "en-US", dateFormat: "MM/DD/YYYY" }),
}));
const { CollectionActionBar } = await import("./collection-action-bar");

afterEach(cleanup);

type User = ReturnType<typeof userEvent.setup>;
type Fill = {
  readonly ids: readonly string[];
  readonly fill: ItemFill;
  readonly answer: (saved: "ok" | "error") => Promise<void>;
};

const SELECTED = ["co-miku", "co-on-page-2"];

function renderBar() {
  const fills: Fill[] = [];
  function CollectionPage() {
    const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set(SELECTED));
    const [filling, setFilling] = useState(false);
    const onFill = (ids: ReadonlySet<string>, fill: ItemFill): Saving => {
      setFilling(true);
      return new Promise((resolve) => {
        fills.push({
          ids: [...ids],
          fill,
          answer: (saved) =>
            act(async () => {
              setFilling(false);
              const cause = new Error("Some collection items were not found");
              resolve(
                saved === "ok"
                  ? Result.ok()
                  : Result.err(new WriteFailed({ cause, message: cause.message })),
              );
            }),
        });
      });
    };
    const write = async (): Saving => Result.ok();
    return (
      <>
        <p aria-label="selection">{[...selection].join(",")}</p>
        <CollectionActionBar
          selectedItems={{ collectionIds: selection, orderIds: new Set() }}
          onClearSelection={() => setSelection(new Set())}
          onDeleteCollectionItems={write}
          onAddCollectionItemsToOrder={write}
          onAddCollectionItemsToNewOrder={write}
          onFillCollectionItems={onFill}
          isDeletingCollectionItems={false}
          isAddingCollectionItemsToOrder={false}
          isCreatingCollectionOrder={false}
          isFillingCollectionItems={filling}
        />
      </>
    );
  }
  const queryClient = new QueryClient();
  queryClient.setQueryData(["vocabulary"], { shops: [], tags: [], scales: [] });
  render(
    <QueryClientProvider client={queryClient}>
      <CollectionPage />
    </QueryClientProvider>,
  );
  return fills;
}

const selection = () => screen.getByLabelText("selection").textContent;
const popup = () => screen.queryByRole("dialog", { name: "Fill all" });

async function openFill(user: User, field: string) {
  await user.click(await screen.findByRole("button", { name: "Fill" }));
  const fillAll = await screen.findByRole("dialog", { name: "Fill all" });
  expect(within(fillAll).getByText("Write one value to 2 selected items.")).toBeDefined();
  await user.click(within(fillAll).getByRole("button", { name: field }));
  await waitFor(() => expect(document.activeElement?.id).toBe(`fill-${field.toLowerCase()}`));
}

async function typeShop(user: User) {
  await openFill(user, "Shop");
  await user.type(screen.getByRole("combobox", { name: "Shop" }), "AmiAmi");
  await user.click(screen.getByRole("button", { name: "Fill 2 selected" }));
}

test("the Collection fill offers no Paid, which only an Order holds", async () => {
  renderBar();
  await userEvent.setup().click(await screen.findByRole("button", { name: "Fill" }));
  const fillAll = await screen.findByRole("dialog", { name: "Fill all" });

  expect(within(fillAll).queryByRole("button", { name: "Paid" }) === null).toBe(true);
});

test("a fill that saves closes the popover and keeps the selection", async () => {
  const fills = renderBar();
  const user = userEvent.setup();
  await openFill(user, "Shop");
  await user.type(screen.getByRole("combobox", { name: "Shop" }), "AmiAmi");
  const submit = screen.getByRole("button", { name: "Fill 2 selected" });
  await user.click(submit);

  await waitFor(() => expect(submit.getAttribute("aria-busy")).toBe("true"));
  await user.click(submit);
  const barEntry = screen.getByRole<HTMLButtonElement>("button", { name: "Fill" });
  expect(barEntry.disabled).toBe(true);
  expect(fills.map(({ ids, fill }) => ({ ids, fill }))).toEqual([
    { ids: SELECTED, fill: { field: "shop", value: "AmiAmi" } },
  ]);

  await fills[0]?.answer("ok");
  await waitFor(() => expect(popup()).toBeNull());
  expect(selection()).toBe(SELECTED.join(","));
  expect(screen.getByRole("toolbar")).toBeDefined();
});

test("a running fill cannot be left to start a second one", async () => {
  const fills = renderBar();
  const user = userEvent.setup();
  await typeShop(user);

  const back = screen.getByRole<HTMLButtonElement>("button", { name: "All fields" });
  await waitFor(() => expect(back.disabled).toBe(true));
  await fills[0]?.answer("error");
  await waitFor(() => expect(back.disabled).toBe(false));
});

test("a fill that fails keeps the popover, its value and the selection", async () => {
  const fills = renderBar();
  const user = userEvent.setup();
  await typeShop(user);
  await fills[0]?.answer("error");

  const retry = await screen.findByRole<HTMLButtonElement>("button", { name: "Fill 2 selected" });
  expect(retry.disabled).toBe(false);
  expect(screen.getByRole<HTMLInputElement>("combobox", { name: "Shop" }).value).toBe("AmiAmi");
  expect(popup()).not.toBeNull();
  expect(selection()).toBe(SELECTED.join(","));
});

test("Escape closes an open select, then the popover, and only then the selection", async () => {
  renderBar();
  const user = userEvent.setup();
  await openFill(user, "Condition");

  await user.click(screen.getByRole("combobox", { name: "Condition" }));
  await screen.findByRole("option", { name: "Pre-Owned" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("option", { name: "Pre-Owned" })).toBeNull());
  expect(popup()).not.toBeNull();
  expect(selection()).toBe(SELECTED.join(","));

  await user.keyboard("{Escape}");
  await waitFor(() => expect(popup()).toBeNull());
  expect(selection()).toBe(SELECTED.join(","));

  await user.keyboard("{Escape}");
  await waitFor(() => expect(selection()).toBe(""));
});

test("Escape closes the popover first even when focus has left it", async () => {
  renderBar();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Fill" }));
  await screen.findByRole("dialog", { name: "Fill all" });
  act(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  await user.keyboard("{Escape}");
  await waitFor(() => expect(popup()).toBeNull());
  expect(selection()).toBe(SELECTED.join(","));
});
