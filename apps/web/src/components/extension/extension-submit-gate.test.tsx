import { afterEach, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { delegatingBridge, fakeExtension } from "../../../test/fake-extension";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

let extension = fakeExtension();
const { createExtensionBridge } = await import("@/lib/extension-bridge");
let bridge = createExtensionBridge(extension.window);
await mock.module("@/lib/extension-bridge", () => ({
  createExtensionBridge,
  extensionBridge: delegatingBridge(() => bridge),
}));

const session = { user: { currency: "USD", dateFormat: "MM/DD/YYYY", username: "fixture" } };
const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useNavigate: () => async () => {},
  getRouteApi: () => ({ useRouteContext: () => ({ session }) }),
}));

const sent: string[] = [];
const accepted = {
  syncSessionId: "ss-1",
  status: "Queued",
  isFinished: false,
  existingItemsToInsert: 0,
  newItems: 1,
};
const realSync = await import("@/queries/sync");
await mock.module("@/queries/sync", () => ({
  ...realSync,
  sendItemSync: async () => {
    sent.push("item");
    return accepted;
  },
  sendItems: async () => {
    sent.push("csv");
    return accepted;
  },
  sendOrder: async () => {
    sent.push("order");
    return accepted;
  },
  sendOrderItems: async () => {
    sent.push("order-item");
    return accepted;
  },
  sendCollection: async () => {
    sent.push("collection");
    return accepted;
  },
}));

const { ExtensionRequiredDialog } = await import("./extension-required-dialog");
const { dismissMissingExtension } = await import("@/lib/extension-gate");
const { SyncActionSheet } = await import("@/components/sync/sync-launcher");
const { OrderItemSyncSheet } = await import("@/components/orders/order-item-sync-sheet");
const { DataTransferView } = await import("@/components/settings/data-transfer");
const { SYNC_OPTION_META } = await import("@/lib/sync");

type User = ReturnType<typeof userEvent.setup>;

const CSV = [
  "ID,Title,Root,Category,Release Date,Price,Scale,Barcode,Status,Count,Score,Payment Date,Shipping Date,Collecting Date,Price,Shop,Shipping Method,Tracking Number,Wishibility,Note",
  `98777,"Hello, Good-bye",Figures,Prepainted,2024-01-01,"¥10,000",1/7,,Owned,1,8/10,2024-02-01,,,"$80.00",AmiAmi,EMS,,,`,
].join("\n");

const noop = () => {};

type Form = {
  readonly name: string;
  readonly sends: string;
  readonly render: () => ReactElement;
  readonly open: (user: User) => Promise<void>;
  readonly fill: (user: User) => Promise<void>;
  readonly kept: () => void;
  readonly submit: string;
};

const typeItemId = async (user: User) => {
  await user.type(screen.getByPlaceholderText("MyFigureCollection item link or ID"), "98777");
};
const itemIdKept = () => {
  expect(
    screen.getByPlaceholderText<HTMLInputElement>("MyFigureCollection item link or ID").value,
  ).toBe("98777");
};

const FORMS: readonly Form[] = [
  ...(["item", "collection", "order"] as const).map((syncType): Form => ({
    name: `the ${SYNC_OPTION_META[syncType].title} form`,
    sends: syncType,
    render: () => <SyncActionSheet syncType={syncType} onSyncTypeChange={noop} />,
    open: async () => {},
    fill: typeItemId,
    kept: itemIdKept,
    submit: { item: "Add", collection: "Add to collection", order: "Create order" }[syncType],
  })),
  {
    name: "the order page's add items form",
    sends: "order-item",
    render: () => <OrderItemSyncSheet orderId="od-1" />,
    open: async (user) => {
      await user.click(screen.getByRole("button", { name: "Add" }));
      await screen.findByRole("dialog", { name: SYNC_OPTION_META["order-item"].title });
    },
    fill: typeItemId,
    kept: itemIdKept,
    submit: "Add to order",
  },
  {
    name: "the CSV form",
    sends: "csv",
    render: () => <SyncActionSheet syncType="csv" onSyncTypeChange={noop} />,
    open: async () => {},
    fill: async (user) => {
      const input = document.querySelector<HTMLInputElement>('input[type="file"]');
      if (input === null) throw new Error("the CSV form has no file input");
      await user.upload(input, new File([CSV], "mfc.csv", { type: "text/csv" }));
      await screen.findByText("mfc.csv");
    },
    kept: () => {
      expect(screen.getByText("mfc.csv")).toBeDefined();
    },
    submit: "Import CSV",
  },
];

function renderWithDialog(ui: ReactElement) {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <>
      {ui}
      <ExtensionRequiredDialog />
    </>,
    { wrapper },
  );
}

function loadExtension(options: Parameters<typeof fakeExtension>[0]) {
  extension = fakeExtension(options);
  bridge = createExtensionBridge(extension.window);
}

afterEach(() => {
  cleanup();
  dismissMissingExtension();
  sent.length = 0;
});

describe.each(FORMS.map((form) => [form.name, form] as const))("%s", (_name, form) => {
  test("sends nothing when the extension went away while it was open, and keeps its values", async () => {
    loadExtension({ installed: true });
    const user = userEvent.setup();
    renderWithDialog(form.render());
    await form.open(user);
    await form.fill(user);

    extension.setInstalled(false);
    await user.click(screen.getByRole("button", { name: form.submit }));

    await screen.findByRole("dialog", { name: "Install the myakiba extension first" });
    expect(sent).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /myakiba extension/u })).toBeNull(),
    );
    form.kept();
  });

  test("sends when the extension is still there", async () => {
    loadExtension({ installed: true });
    const user = userEvent.setup();
    renderWithDialog(form.render());
    await form.open(user);
    await form.fill(user);

    await user.click(screen.getByRole("button", { name: form.submit }));

    await waitFor(() => expect(sent).toEqual([form.sends]));
  });
});

test("the import confirmation sends nothing when the extension went away while it was open", async () => {
  loadExtension({ installed: true });
  const user = userEvent.setup();
  let confirmed = 0;
  renderWithDialog(
    <DataTransferView
      actions={{
        handleExport: noop,
        handleReconnectImportStatus: noop,
        handleRetryCurrentImportLoad: noop,
        onFile: noop,
        handleFileError: noop,
        handleConfirmImport: async () => {
          confirmed += 1;
        },
        handleRetryCurrentImport: noop,
        handleDeleteCurrentImport: async () => {},
      }}
      state={{
        export: { kind: "idle" },
        import: {
          current: { kind: "ready", current: { kind: "none" } },
          delete: { kind: "idle" },
          prepared: {
            kind: "ready",
            file: new File(["{}"], "myakiba-export.json"),
            preview: { orders: 1, collectionItems: 2 },
          },
          start: { kind: "idle" },
        },
      }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Import data" }));
  const confirmation = await screen.findByRole("dialog", { name: "Import this export?" });

  extension.setInstalled(false);
  await user.click(within(confirmation).getByRole("button", { name: "Import data" }));

  await screen.findByRole("dialog", { name: "Install the myakiba extension first" });
  expect(confirmed).toBe(0);
  expect(screen.getByText("myakiba-export.json")).toBeDefined();
});
