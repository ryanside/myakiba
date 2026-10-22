import { afterEach, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { cleanup, configure, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import type { DataTransferImport } from "@myakiba/contracts/data-transfer/schema";
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

const retriedSessions: string[] = [];
const realSync = await import("@/queries/sync");
await mock.module("@/queries/sync", () => ({
  ...realSync,
  retrySyncSession: async (sessionId: string) => {
    retriedSessions.push(sessionId);
    return { retried: 1 };
  },
}));

const { ExtensionRequiredDialog } = await import("./extension-required-dialog");
const { dismissMissingExtension } = await import("@/lib/extension-gate");
const { default: SyncWidget } = await import("@/components/sync/sync-widget");
const { LAUNCHABLE_SYNC_OPTIONS } = await import("@/components/sync/sync-launcher-options");
const { AppCommand } = await import("@/components/command/app-command");
const { SyncSheetButton } = await import("@/components/sync/sync-sheet-button");
const { OrderItemSyncSheet } = await import("@/components/orders/order-item-sync-sheet");
const { ItemSyncActions } = await import("@/components/item/item-sync-actions");
const { ItemResyncButton } = await import("@/components/item/item-resync-button");
const { RetrySyncSessionButton } = await import("@/components/sync/retry-sync-session-button");
const { DataTransferView } = await import("@/components/settings/data-transfer");
const { SYNC_OPTION_META } = await import("@/lib/sync");

type User = ReturnType<typeof userEvent.setup>;

type EntryPoint = {
  readonly name: string;
  readonly render: (proceed: () => void) => ReactElement;
  readonly start: (user: User) => Promise<void>;
  readonly proceeded: (calls: number) => boolean;
};

const sheetOpened = (title: string) => () => screen.queryByRole("dialog", { name: title }) !== null;
const called = (calls: number) => calls > 0;
const click = (name: string) => async (user: User) => {
  await user.click(await screen.findByRole("button", { name }));
};

const failedImport: DataTransferImport = {
  id: "import-1",
  fileName: "myakiba-export.json",
  status: "partial",
  importedOrders: 1,
  importedCollectionItems: 1,
  failedCollectionItems: 1,
  report: null,
  error: null,
};

const noop = () => {};
const importActions = (proceed: () => void) => ({
  handleExport: noop,
  handleReconnectImportStatus: noop,
  handleRetryCurrentImportLoad: noop,
  onFile: noop,
  handleFileError: noop,
  handleConfirmImport: async () => {},
  handleRetryCurrentImport: proceed,
  handleDeleteCurrentImport: async () => {},
});

const ENTRY_POINTS: readonly EntryPoint[] = [
  ...LAUNCHABLE_SYNC_OPTIONS.map((option): EntryPoint => ({
    name: `the sync launcher's ${option.label} option`,
    render: () => <SyncWidget TriggerWrapper={<button type="button">Launch</button>} />,
    start: async (user) => {
      await click("Launch")(user);
      await click(option.label)(user);
    },
    proceeded: sheetOpened(SYNC_OPTION_META[option.type].title),
  })),
  ...LAUNCHABLE_SYNC_OPTIONS.map((option): EntryPoint => ({
    name: `the command palette's ${option.label} action`,
    render: () => <AppCommand />,
    start: async (user) => {
      await click("Search")(user);
      await user.click(
        await screen.findByRole("option", {
          name: new RegExp(SYNC_OPTION_META[option.type].title, "u"),
        }),
      );
    },
    proceeded: sheetOpened(SYNC_OPTION_META[option.type].title),
  })),
  ...(["item", "collection"] as const).map((syncType): EntryPoint => ({
    name: `the ${syncType} sheet button`,
    render: () => <SyncSheetButton syncType={syncType} label="Add" />,
    start: click("Add"),
    proceeded: sheetOpened(SYNC_OPTION_META[syncType].title),
  })),
  {
    name: "the order page's add items",
    render: () => <OrderItemSyncSheet orderId="od-1" />,
    start: click("Add"),
    proceeded: sheetOpened(SYNC_OPTION_META["order-item"].title),
  },
  ...(["Add to collection", "Create order", "Add to item database"] as const).map(
    (label): EntryPoint => ({
      name: `the item page's ${label}`,
      render: (proceed) => (
        <ItemSyncActions onSyncCollection={proceed} onSyncOrder={proceed} onSyncItems={proceed} />
      ),
      start: click(label),
      proceeded: called,
    }),
  ),
  {
    name: "the item page's resync button",
    render: (proceed) => (
      <ItemResyncButton
        status="idle"
        isPending={false}
        cooldownExpiresAt={null}
        onRequest={proceed}
      />
    ),
    start: click("Refresh item details"),
    proceeded: called,
  },
  {
    name: "the import's retry",
    render: () => (
      <RetrySyncSessionButton
        sessionId="ss-1"
        retrySupported
        canRetry
        isRetrying={false}
        failCount={1}
      />
    ),
    start: click("Retry failed item results"),
    proceeded: () => retriedSessions.length > 0,
  },
  {
    name: "the settings import",
    render: (proceed) => (
      <DataTransferView
        actions={importActions(proceed)}
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
      />
    ),
    start: click("Import data"),
    proceeded: sheetOpened("Import this export?"),
  },
  {
    name: "the settings import's retry",
    render: (proceed) => (
      <DataTransferView
        actions={importActions(proceed)}
        state={{
          export: { kind: "idle" },
          import: {
            current: {
              kind: "ready",
              current: { kind: "retryable", currentImport: failedImport, retry: { kind: "idle" } },
            },
            delete: { kind: "idle" },
            prepared: { kind: "idle" },
            start: { kind: "idle" },
          },
        }}
      />
    ),
    start: click("Retry failed items"),
    proceeded: called,
  },
];

function renderEntryPoint(entryPoint: EntryPoint) {
  let calls = 0;
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <>
      {entryPoint.render(() => {
        calls += 1;
      })}
      <ExtensionRequiredDialog />
    </>,
    { wrapper },
  );
  return { proceeded: () => entryPoint.proceeded(calls) };
}

function useExtension(options: Parameters<typeof fakeExtension>[0]) {
  extension = fakeExtension(options);
  bridge = createExtensionBridge(extension.window);
}

afterEach(() => {
  cleanup();
  dismissMissingExtension();
  retriedSessions.length = 0;
});

describe.each(ENTRY_POINTS.map((entryPoint) => [entryPoint.name, entryPoint] as const))(
  "%s",
  (_name, entryPoint) => {
    test("asks for the extension instead when it is not installed", async () => {
      useExtension({ installed: false });
      const user = userEvent.setup();
      const { proceeded } = renderEntryPoint(entryPoint);

      await entryPoint.start(user);

      await screen.findByRole("dialog", { name: "Install the myakiba extension first" });
      expect(screen.getByRole("link", { name: "How to install it" }).getAttribute("href")).toBe(
        "/#faq-extension",
      );
      expect(proceeded()).toBe(false);
    });

    test("asks for an update when the extension is too old", async () => {
      useExtension({ protocols: { min: 0, max: 0 } });
      const user = userEvent.setup();
      const { proceeded } = renderEntryPoint(entryPoint);

      await entryPoint.start(user);

      await screen.findByRole("dialog", { name: "Update the myakiba extension" });
      expect(proceeded()).toBe(false);
    });

    test("goes ahead when the extension is ready", async () => {
      useExtension({ installed: true });
      const user = userEvent.setup();
      const { proceeded } = renderEntryPoint(entryPoint);

      await entryPoint.start(user);

      await waitFor(() => expect(proceeded()).toBe(true));
      expect(screen.queryByRole("dialog", { name: /myakiba extension/u })).toBeNull();
    });
  },
);

test("the dialog closes, and the next try probes again", async () => {
  useExtension({ installed: false });
  const user = userEvent.setup();
  let calls = 0;
  render(
    <>
      <ItemResyncButton
        status="idle"
        isPending={false}
        cooldownExpiresAt={null}
        onRequest={() => {
          calls += 1;
        }}
      />
      <ExtensionRequiredDialog />
    </>,
  );

  await click("Refresh item details")(user);
  await click("Close")(user);
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: /myakiba extension/u })).toBeNull(),
  );
  extension.setInstalled(true);
  await click("Refresh item details")(user);

  await waitFor(() => expect(calls).toBe(1));
});
