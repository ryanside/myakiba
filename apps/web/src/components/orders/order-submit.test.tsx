import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react/pure";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { CollectionItemFormValues } from "@myakiba/contracts/collection/types";
import type { MergedOrder } from "@myakiba/contracts/orders/schema";
import type { Order } from "@myakiba/contracts/orders/types";
import { Result } from "better-result";
import type { Saving } from "@/data/client";
import { ApiNotFound } from "@/lib/errors/api-not-found";
import { WriteFailed } from "@/lib/errors/write-failed";

type Answered = Awaited<Saving>;

const realSearch = await import("@/queries/search");
const targets = { orderIdsAndTitles: [{ id: "od-target", title: "Target Order", images: [] }] };
await mock.module("@/queries/search", () => ({
  ...realSearch,
  searchOrders: async () => Result.ok(targets),
}));

const mergeDraft: MergedOrder = {
  shop: "AmiAmi",
  status: "Shipped",
  paid: true,
  orderDate: "2026-01-05",
  releaseDate: "2026-04-01",
  paymentDate: "2026-01-20",
  shippingDate: null,
  collectionDate: null,
  shippingMethod: "EMS",
  shippingFee: 2000,
  taxes: 300,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "Box 1",
};
type DraftAnswer = Awaited<ReturnType<(typeof realOrders)["getMergeDraft"]>>;
let answerDraft = async (_orderIds: readonly string[]): Promise<DraftAnswer> =>
  Result.ok(mergeDraft);
const realOrders = await import("@/queries/orders");
await mock.module("@/queries/orders", () => ({
  ...realOrders,
  getMergeDraft: (orderIds: readonly string[]) => answerDraft(orderIds),
}));

const { OrderForm } = await import("./order-form");
const { default: UnifiedItemMoveForm } = await import("./unified-item-move-form");
const { default: CollectionItemForm } = await import("../collection/collection-item-form");

const settle = () =>
  act(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, 50);
      }),
  );

type HeldWrite = {
  readonly send: (...args: unknown[]) => Saving;
  readonly calls: () => number;
  readonly finish: () => Promise<void>;
  readonly fail: () => Promise<void>;
};

function heldWrite(): HeldWrite {
  const pending: { resolve: (saved: Answered) => void }[] = [];
  const answer = async (respond: (write: (typeof pending)[number]) => void) => {
    const [write] = pending;
    if (!write) throw new Error("no write reached the server");
    respond(write);
    await settle();
  };
  return {
    send: () =>
      new Promise<Answered>((resolve) => {
        pending.push({ resolve });
      }),
    calls: () => pending.length,
    finish: () => answer((write) => write.resolve(Result.ok())),
    fail: () =>
      answer((write) => {
        const cause = new Error("write rejected by server");
        write.resolve(Result.err(new WriteFailed({ cause, message: cause.message })));
      }),
  };
}

// A submit path that drops its await turns a failed write into an unhandled rejection. bun
// fails the test on it and starts teardown while the test body is still running. Cleanup waits
// for the body to signal that it finished, so the body never asserts against an unmounted form.
let bodyDone: Promise<void> = Promise.resolve();
const BODY_FALLBACK_MS = 4000;

function untilBodyDone(body: () => Promise<void>) {
  return async () => {
    let signalDone = () => {};
    bodyDone = new Promise((resolve) => {
      signalDone = resolve;
    });
    try {
      await body();
    } finally {
      signalDone();
    }
  };
}

afterEach(async () => {
  await Promise.race([
    bodyDone,
    new Promise((resolve) => {
      setTimeout(resolve, BODY_FALLBACK_MS);
    }),
  ]);
  cleanup();
});

const order: Order = {
  orderId: "od-alpha",
  title: "Alpha Order",
  shop: "AmiAmi",
  releaseDate: null,
  shippingMethod: "n/a",
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  status: "Ordered",
  paid: false,
  payment: "unpaid",
  total: 0,
  shippingFee: 0,
  taxes: 0,
  duties: 0,
  tariffs: 0,
  miscFees: 0,
  notes: "",
  itemCount: 2,
  images: [],
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};
const ids = new Set(["a", "b"]);

type SubmitPath = {
  readonly name: string;
  readonly render: (write: HeldWrite, clearSelections: () => void) => ReactElement;
  readonly submit: (user: ReturnType<typeof userEvent.setup>) => Promise<void>;
  readonly clearsSelection: boolean;
  readonly checksWidths: boolean;
};

const trigger = <button type="button">Open</button>;
const clickSubmit = (name: string) => async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name }));
};

const SUBMIT_PATHS: SubmitPath[] = [
  {
    name: "edit-order sheet",
    checksWidths: true,
    render: (write) => (
      <OrderForm
        type="edit-order"
        renderTrigger={trigger}
        orderData={order}
        callbackFn={write.send}
        currency="USD"
      />
    ),
    submit: clickSubmit("Update"),
    clearsSelection: false,
  },
  {
    name: "merge dialog",
    checksWidths: false,
    render: (write, clearSelections) => (
      <OrderForm
        type="merge"
        renderTrigger={trigger}
        orderIds={ids}
        callbackFn={write.send}
        clearSelections={clearSelections}
        currency="USD"
      />
    ),
    submit: async (user) => {
      await user.click(await screen.findByRole("button", { name: "Merge" }));
    },
    clearsSelection: true,
  },
  {
    name: "move to an existing order",
    checksWidths: false,
    render: (write, clearSelections) => (
      <UnifiedItemMoveForm
        renderTrigger={trigger}
        selectedItems={{ collectionIds: ids, orderIds: new Set(["od-alpha"]) }}
        onMoveToExisting={(...args) => write.send(...args)}
        onMoveToNew={async () => Result.ok()}
        clearSelections={clearSelections}
        currency="USD"
      />
    ),
    submit: async (user) => {
      await user.click(screen.getByRole("combobox"));
      await user.type(screen.getByPlaceholderText("Search orders by title..."), "Target");
      await user.click(await screen.findByText("Target Order"));
      await user.click(screen.getByRole("button", { name: "Move Items" }));
    },
    clearsSelection: true,
  },
  {
    name: "move to a new order",
    checksWidths: false,
    render: (write, clearSelections) => (
      <UnifiedItemMoveForm
        renderTrigger={trigger}
        selectedItems={{ collectionIds: ids, orderIds: new Set(["od-alpha"]) }}
        onMoveToExisting={async () => Result.ok()}
        onMoveToNew={(...args) => write.send(...args)}
        clearSelections={clearSelections}
        currency="USD"
      />
    ),
    submit: async (user) => {
      await user.click(screen.getByRole("radio", { name: "New Order" }));
      await user.click(screen.getByRole("button", { name: "Move to New Order" }));
    },
    clearsSelection: true,
  },
];

const collectionItem: CollectionItemFormValues = {
  id: "ci-alpha",
  orderId: "od-alpha",
  itemId: "it-alpha",
  itemExternalId: null,
  itemTitle: "Alpha Figure",
  itemImage: null,
  status: "Ordered",
  paid: false,
  count: 1,
  score: "0",
  price: 0,
  shop: "AmiAmi",
  condition: "New",
  orderDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  shippingMethod: "n/a",
  tags: [],
  notes: "",
  releaseId: null,
  releaseDate: null,
  releasePrice: null,
  releaseType: null,
  releaseCurrency: null,
  releaseBarcode: null,
};

const FOOTER_PATHS: Pick<SubmitPath, "name" | "render" | "checksWidths">[] = [
  ...SUBMIT_PATHS,
  {
    name: "collection item sheet",
    checksWidths: true,
    render: (write) => (
      <CollectionItemForm
        renderTrigger={trigger}
        itemData={collectionItem}
        callbackFn={write.send}
        currency="USD"
      />
    ),
  },
];

async function openAndSubmit(path: SubmitPath) {
  const write = heldWrite();
  const clearSelections = mock(() => {});
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      {path.render(write, clearSelections)}
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  await path.submit(user);
  await waitFor(() => expect(write.calls()).toBe(1));
  return { write, clearSelections };
}

const formIsOpen = () => screen.queryByRole("dialog") !== null;

describe.each(SUBMIT_PATHS)("$name submit", (path) => {
  test(
    "stays open while the write is pending and closes after it succeeds",
    untilBodyDone(async () => {
      const { write, clearSelections } = await openAndSubmit(path);
      await settle();

      expect({ open: formIsOpen(), cleared: clearSelections.mock.calls.length }).toEqual({
        open: true,
        cleared: 0,
      });

      await write.finish();
      await waitFor(() => expect(formIsOpen()).toBe(false));
      expect(clearSelections.mock.calls.length).toBe(path.clearsSelection ? 1 : 0);
    }),
  );

  test(
    "stays open with the selection kept and no unhandled rejection after the write fails",
    untilBodyDone(async () => {
      const { write, clearSelections } = await openAndSubmit(path);

      await write.fail();

      expect({ open: formIsOpen(), cleared: clearSelections.mock.calls.length }).toEqual({
        open: true,
        cleared: 0,
      });
    }),
  );
});

describe.each(FOOTER_PATHS)("$name footer", (path) => {
  test("has no nested button and Cancel closes the form", async () => {
    const queryClient = new QueryClient();
    try {
      render(
        <QueryClientProvider client={queryClient}>
          {path.render(heldWrite(), () => {})}
        </QueryClientProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Open" }));
      if (path.name === "move to a new order") {
        fireEvent.click(screen.getByRole("radio", { name: "New Order" }));
      }
      const cancel = await screen.findByRole("button", { name: "Cancel" });
      const dialog = screen.getByRole("dialog");
      expect(dialog.querySelectorAll('[data-slot$="footer"] button button').length).toBe(0);
      fireEvent.click(cancel);
      await waitFor(() => expect(formIsOpen()).toBe(false));
    } finally {
      cleanup();
      queryClient.clear();
    }
  });
});

describe.each(FOOTER_PATHS.filter((path) => path.checksWidths))("$name footer widths", (path) => {
  test("keeps Cancel content-sized and lets Update fill the remaining width", () => {
    const queryClient = new QueryClient();
    try {
      render(
        <QueryClientProvider client={queryClient}>
          {path.render(heldWrite(), () => {})}
        </QueryClientProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Open" }));
      const cancel = screen.getByRole("button", { name: "Cancel" });
      const update = screen.getByRole("button", { name: "Update" });
      expect(cancel.classList.contains("w-full")).toBe(false);
      expect(cancel.classList.contains("flex-1")).toBe(false);
      expect(update.classList.contains("w-full")).toBe(true);
      expect(update.classList.contains("flex-1")).toBe(true);
      expect(
        screen.getByRole("dialog").querySelectorAll('[data-slot="sheet-footer"] button').length,
      ).toBe(2);
    } finally {
      cleanup();
      queryClient.clear();
    }
  });
});

describe("the edit-order sheet", () => {
  async function editAndSave(edit: (user: ReturnType<typeof userEvent.setup>) => Promise<void>) {
    const send = mock(async (..._args: unknown[]): Saving => Result.ok());
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <OrderForm
          type="edit-order"
          renderTrigger={trigger}
          orderData={order}
          callbackFn={send}
          currency="USD"
        />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await edit(user);
    await user.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(send.mock.calls.length).toBe(1));
    queryClient.clear();
    return send.mock.calls[0];
  }

  test(
    "a title change copies nothing to the items, and no Cascade to Items choice is offered",
    untilBodyDone(async () => {
      const call = await editAndSave(async (user) => {
        expect(screen.queryByText("Options")).toBeNull();
        await user.type(screen.getByLabelText("Title"), " renamed");
      });
      expect(call?.[1]).toEqual([]);
    }),
  );

  test(
    "a Paid change copies only Paid to the items",
    untilBodyDone(async () => {
      const call = await editAndSave(async (user) => {
        await user.click(screen.getByRole("checkbox", { name: "Paid" }));
      });
      expect(call?.[1]).toEqual(["paid"]);
    }),
  );
});

describe("the merge dialog", () => {
  function openMerge(send: (...args: unknown[]) => Saving) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OrderForm
          type="merge"
          renderTrigger={trigger}
          orderIds={ids}
          callbackFn={send}
          clearSelections={() => {}}
          currency="USD"
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    return queryClient;
  }

  test(
    "opens on the values derived from the source Orders and sends them unchanged",
    untilBodyDone(async () => {
      const send = mock(async (..._args: unknown[]): Saving => Result.ok());
      const queryClient = openMerge(send);
      const merge = await screen.findByRole("button", { name: "Merge" });

      expect({
        shop: (screen.getByLabelText("Shop") as HTMLInputElement).value,
        shipping: (screen.getByLabelText("Shipping") as HTMLInputElement).value,
        options: screen.queryByText("Options") === null,
      }).toEqual({ shop: "AmiAmi", shipping: "$20.00", options: true });

      await userEvent.setup().click(merge);
      await waitFor(() => expect(send.mock.calls.length).toBe(1));
      expect(send.mock.calls[0]).toEqual([{ ...mergeDraft, title: "New Merged Order" }, ids]);
      queryClient.clear();
    }),
  );

  test(
    "holds the merge on Notes while the merged Orders' notes pass the limit, until they are shortened",
    untilBodyDone(async () => {
      const previous = answerDraft;
      const longNotes = `${"a".repeat(6000)}\n\n${"b".repeat(6000)}`;
      answerDraft = async () => Result.ok({ ...mergeDraft, notes: longNotes });
      try {
        const send = mock(async (..._args: unknown[]): Saving => Result.ok());
        const queryClient = openMerge(send);
        const merge = await screen.findByRole("button", { name: "Merge" });
        const notes = screen.getByPlaceholderText("Add any notes...") as HTMLTextAreaElement;

        expect({
          notes: notes.value.length,
          alert:
            screen.queryByText(
              "The merged Orders' notes together pass the 10,000-character limit. Shorten them to merge.",
            ) !== null,
          disabled: merge.hasAttribute("disabled"),
        }).toEqual({ notes: longNotes.length, alert: true, disabled: true });

        fireEvent.change(notes, { target: { value: "Box 1 and Box 2" } });
        await waitFor(() => expect(merge.hasAttribute("disabled")).toBe(false));
        expect(screen.queryByRole("alert") === null).toBe(true);
        await userEvent.setup().click(merge);
        await waitFor(() => expect(send.mock.calls.length).toBe(1));
        expect(send.mock.calls[0]).toEqual([
          { ...mergeDraft, notes: "Box 1 and Box 2", title: "New Merged Order" },
          ids,
        ]);
        queryClient.clear();
      } finally {
        answerDraft = previous;
      }
    }),
  );

  test(
    "says why it cannot open when the source Orders do not load",
    untilBodyDone(async () => {
      const previous = answerDraft;
      answerDraft = async () =>
        Result.err(
          new ApiNotFound({
            body: "One or more orders not found",
            message: "One or more orders not found",
          }),
        );
      try {
        const queryClient = openMerge(mock(async (): Saving => Result.ok()));
        await waitFor(() =>
          expect(screen.queryByText("One or more orders not found") !== null).toBe(true),
        );
        expect(screen.queryByRole("button", { name: "Merge" }) === null).toBe(true);
        queryClient.clear();
      } finally {
        answerDraft = previous;
      }
    }),
  );
});

test("moving items to a new order offers no Cascade to Items choice", () => {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <UnifiedItemMoveForm
        renderTrigger={trigger}
        selectedItems={{ collectionIds: ids, orderIds: new Set(["od-alpha"]) }}
        onMoveToExisting={async () => Result.ok()}
        onMoveToNew={async () => Result.ok()}
        currency="USD"
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  fireEvent.click(screen.getByRole("radio", { name: "New Order" }));
  expect(screen.queryByText("Options") === null).toBe(true);
  cleanup();
  queryClient.clear();
});

describe("the merge dialog's Notes", () => {
  const notesLimit =
    "The merged Orders' notes together pass the 10,000-character limit. Shorten them to merge.";

  function openWithNotes(notes: string) {
    answerDraft = async () => Result.ok({ ...mergeDraft, notes });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OrderForm
          type="merge"
          renderTrigger={trigger}
          orderIds={ids}
          callbackFn={mock(async (): Saving => Result.ok())}
          clearSelections={() => {}}
          currency="USD"
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    return queryClient;
  }
  const mergeDisabled = () =>
    screen.getByRole("button", { name: "Merge" }).hasAttribute("disabled");

  test(
    "keeps Merge held and says why after the Notes section is collapsed",
    untilBodyDone(async () => {
      const previous = answerDraft;
      try {
        const queryClient = openWithNotes(`${"a".repeat(6000)}\n\n${"b".repeat(6000)}`);
        await screen.findByRole("button", { name: "Merge" });
        fireEvent.click(screen.getByRole("button", { name: "Notes" }));
        await waitFor(() => expect(screen.queryByPlaceholderText("Add any notes...")).toBeNull());
        await settle();

        expect({
          disabled: mergeDisabled(),
          reason: screen.queryByText(notesLimit) !== null,
        }).toEqual({ disabled: true, reason: true });
        queryClient.clear();
      } finally {
        answerDraft = previous;
      }
    }),
  );

  test(
    "takes a paste past 1,000 characters, as the server does",
    untilBodyDone(async () => {
      const previous = answerDraft;
      try {
        const queryClient = openWithNotes("n".repeat(1500));
        await screen.findByRole("button", { name: "Merge" });
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Notes" }));
        const notes = screen.getByPlaceholderText("Add any notes...") as HTMLTextAreaElement;
        await user.click(notes);
        await user.paste("p".repeat(600));

        expect(notes.value.length).toBe(2100);
        queryClient.clear();
      } finally {
        answerDraft = previous;
      }
    }),
  );
});

describe("the merge dialog reads its Orders fresh on every open", () => {
  const otherIds = new Set(["c", "d"]);

  function renderMerge(send: (...args: unknown[]) => Saving) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (orderIds: ReadonlySet<string>) => (
      <QueryClientProvider client={queryClient}>
        <OrderForm
          type="merge"
          renderTrigger={trigger}
          orderIds={orderIds}
          callbackFn={send}
          clearSelections={() => {}}
          currency="USD"
        />
      </QueryClientProvider>
    );
    const rendered = render(view(ids));
    return {
      queryClient,
      open: () => fireEvent.click(screen.getByRole("button", { name: "Open" })),
      cancel: async () => {
        fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(formIsOpen()).toBe(false));
      },
      select: (orderIds: ReadonlySet<string>) => rendered.rerender(view(orderIds)),
    };
  }
  const shippingShown = () => (screen.getByLabelText("Shipping") as HTMLInputElement).value;
  const mergeShown = () => screen.queryByRole("button", { name: "Merge" }) !== null;

  test(
    "waits for the new draft after a source Order changed, then shows its fees",
    untilBodyDone(async () => {
      const previous = answerDraft;
      try {
        const merge = renderMerge(mock(async (): Saving => Result.ok()));
        merge.open();
        await screen.findByRole("button", { name: "Merge" });
        await merge.cancel();

        let release = () => {};
        const changed = new Promise<void>((resolve) => {
          release = resolve;
        });
        answerDraft = async () => {
          await changed;
          return Result.ok({ ...mergeDraft, shippingFee: 2500 });
        };
        merge.open();
        await settle();
        expect(mergeShown()).toBe(false);

        await act(async () => release());
        await screen.findByRole("button", { name: "Merge" });
        expect(shippingShown()).toBe("$25.00");
        merge.queryClient.clear();
      } finally {
        answerDraft = previous;
      }
    }),
  );

  test(
    "shows the error and no Merge when the reopened draft fails, though an earlier one loaded",
    untilBodyDone(async () => {
      const previous = answerDraft;
      try {
        const merge = renderMerge(mock(async (): Saving => Result.ok()));
        merge.open();
        await screen.findByRole("button", { name: "Merge" });
        await merge.cancel();

        answerDraft = async () =>
          Result.err(
            new ApiNotFound({
              body: "One or more orders not found",
              message: "One or more orders not found",
            }),
          );
        merge.open();
        await waitFor(() =>
          expect(screen.queryByText("One or more orders not found") !== null).toBe(true),
        );
        expect(mergeShown()).toBe(false);
        merge.queryClient.clear();
      } finally {
        answerDraft = previous;
      }
    }),
  );

  test(
    "sends the values and ids of the Orders selected now when the selection changes while open",
    untilBodyDone(async () => {
      const previous = answerDraft;
      answerDraft = async (orderIds) =>
        Result.ok(orderIds.includes("c") ? { ...mergeDraft, shop: "HLJ" } : mergeDraft);
      try {
        const send = mock(async (..._args: unknown[]): Saving => Result.ok());
        const merge = renderMerge(send);
        merge.select(otherIds);
        merge.open();
        await screen.findByRole("button", { name: "Merge" });
        await merge.cancel();

        merge.select(ids);
        merge.open();
        await screen.findByRole("button", { name: "Merge" });
        fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Combined" } });
        merge.select(otherIds);
        await waitFor(() =>
          expect((screen.getByLabelText("Shop") as HTMLInputElement).value).toBe("HLJ"),
        );

        await userEvent.setup().click(await screen.findByRole("button", { name: "Merge" }));
        await waitFor(() => expect(send.mock.calls.length).toBe(1));
        const [values, sentIds] = send.mock.calls[0] ?? [];
        expect({
          shop: (values as { shop: string }).shop,
          ids: [...(sentIds as Set<string>)],
        }).toEqual({
          shop: "HLJ",
          ids: ["c", "d"],
        });
        merge.queryClient.clear();
      } finally {
        answerDraft = previous;
      }
    }),
  );
});
