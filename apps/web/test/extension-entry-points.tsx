// Every place that starts an extension import, for the tests that gate them.
import { expect, mock } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import type { DataTransferImport } from "@myakiba/contracts/data-transfer/schema";
import type { ExtensionBridge } from "@/lib/extension-bridge";
import { delegatingBridge, fakeExtension } from "./fake-extension";
import { Result } from "better-result";

let extension = fakeExtension();
const { createExtensionBridge } = await import("@/lib/extension-bridge");
let bridge: ExtensionBridge = createExtensionBridge(extension.window);
await mock.module("@/lib/extension-bridge", () => ({
  createExtensionBridge,
  extensionBridge: delegatingBridge(() => bridge),
}));

const session = { user: { currency: "USD", dateFormat: "MM/DD/YYYY", username: "fixture" } };
const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useNavigate: () => async () => {},
  useRouter: () => ({ invalidate: async () => {} }),
  getRouteApi: () => ({ useRouteContext: () => ({ session }) }),
  // Settings rows read the URL hash for search results; these screens render without a router.
  useLocation: () => {},
}));

/** The syncs the server was sent, by type. */
export const sent: string[] = [];
const retriedSessions: string[] = [];
const accepted = {
  syncSessionId: "ss-1",
  status: "Import queued",
  isFinished: false,
  existingItemsToInsert: 0,
  newItems: 1,
  jobId: "job-1",
  missingMfcItemIds: [],
};
const sends = (type: string) => async () => {
  sent.push(type);
  return Result.ok(accepted);
};
const realSync = await import("@/queries/sync");
await mock.module("@/queries/sync", () => ({
  ...realSync,
  sendItemSync: sends("item"),
  sendItems: sends("csv"),
  sendOrder: sends("order"),
  sendOrderItems: sends("order-item"),
  sendCollection: sends("collection"),
  retrySyncSession: async (sessionId: string) => {
    retriedSessions.push(sessionId);
    return Result.ok({ jobId: "job-2", missingMfcItemIds: [] });
  },
}));

const { ExtensionRequiredDialog } =
  await import("@/components/extension/extension-required-dialog");
const { dismissMissingExtension } = await import("@/lib/extension-gate");
const { AppCommand } = await import("@/components/command/app-command");
const { SyncActionSheet } = await import("@/components/sync/sync-launcher");
const { default: SyncOrderItemForm } = await import("@/components/sync/sync-order-item-form");
const { useSyncMutations } = await import("@/hooks/use-sync-mutations");
const { ItemResyncButton } = await import("@/components/item/item-resync-button");
const { RetrySyncSessionButton } = await import("@/components/sync/retry-sync-session-button");
const { DataTransferView } = await import("@/components/settings/data-transfer");
const { OnboardingDialog } = await import("@/components/onboarding/onboarding-dialog");
const { SYNC_OPTION_META } = await import("@/lib/sync");

export type User = ReturnType<typeof userEvent.setup>;

export function currentExtension() {
  return extension;
}

export function loadExtension(options: Parameters<typeof fakeExtension>[0]) {
  extension = fakeExtension(options);
  bridge = createExtensionBridge(extension.window);
}

export function useBridge(next: ExtensionBridge) {
  bridge = next;
}

export function resetEntryPoints() {
  cleanup();
  dismissMissingExtension();
  sent.length = 0;
  retriedSessions.length = 0;
  localStorage.clear();
}

export const click = (name: string) => async (user: User) => {
  await user.click(await screen.findByRole("button", { name }));
};

export const noop = () => {};

export type EntryPoint = {
  readonly name: string;
  readonly render: (proceed: () => void) => ReactElement;
  readonly start: (user: User) => Promise<void>;
  readonly proceeded: (calls: number) => boolean;
};

const sheetOpened = (title: string) => () => screen.queryByRole("dialog", { name: title }) !== null;
const called = (calls: number) => calls > 0;

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

export const importActions = (proceed: () => void) => ({
  handleExport: noop,
  handleReconnectImportStatus: noop,
  handleRetryCurrentImportLoad: noop,
  onFile: noop,
  handleFileError: noop,
  handleConfirmImport: async () => {},
  handleRetryCurrentImport: proceed,
  handleDeleteCurrentImport: async () => {},
});

export const ADD_STEP_TITLE = "Pick your first items.";
export const csvChoice = new RegExp(`^${SYNC_OPTION_META.csv.title}`, "u");

export function onboardingDialog() {
  return <OnboardingDialog renderTrigger={<button type="button">Getting Started</button>} />;
}

/** Getting Started opens at the welcome step, so this walks to the given step. */
export async function openOnboardingStep(user: User, steps: number) {
  await click("Getting Started")(user);
  for (const title of [
    "Welcome to myakiba.",
    "Set your username, currency, and date format.",
    /myakiba extension/u,
  ].slice(0, steps)) {
    await screen.findByRole("dialog", { name: title });
    await click("Continue")(user);
  }
}

export async function openAddStep(user: User) {
  await openOnboardingStep(user, 3);
  await screen.findByRole("dialog", { name: ADD_STEP_TITLE });
}

export const settingsImport = (
  current: Parameters<typeof DataTransferView>[0]["state"]["import"]["current"],
  prepared: Parameters<typeof DataTransferView>[0]["state"]["import"]["prepared"],
) =>
  function SettingsImport({ actions }: { readonly actions: ReturnType<typeof importActions> }) {
    return (
      <DataTransferView
        actions={actions}
        state={{
          export: { kind: "idle" },
          import: { current, delete: { kind: "idle" }, prepared, start: { kind: "idle" } },
        }}
      />
    );
  };

const PreparedImport = settingsImport(
  { kind: "ready", current: { kind: "none" } },
  {
    kind: "ready",
    file: new File(["{}"], "myakiba-export.json"),
    preview: { orders: 1, collectionItems: 2 },
  },
);
const FailedImport = settingsImport(
  {
    kind: "ready",
    current: { kind: "retryable", currentImport: failedImport, retry: { kind: "idle" } },
  },
  { kind: "idle" },
);

export const ENTRY_POINTS: readonly EntryPoint[] = [
  {
    name: "the command palette's MyFigureCollection CSV action",
    render: () => <AppCommand />,
    start: async (user) => {
      await click("Search")(user);
      await user.click(await screen.findByRole("option", { name: csvChoice }));
    },
    proceeded: sheetOpened(SYNC_OPTION_META.csv.title),
  },
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
    render: (proceed) => <PreparedImport actions={importActions(proceed)} />,
    start: click("Import data"),
    proceeded: sheetOpened("Import this export?"),
  },
  {
    name: "the settings import's retry",
    render: (proceed) => <FailedImport actions={importActions(proceed)} />,
    start: click("Retry failed items"),
    proceeded: called,
  },
];

function withQueryClient(ui: ReactElement) {
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

export function renderEntryPoint(entryPoint: EntryPoint) {
  let calls = 0;
  withQueryClient(
    entryPoint.render(() => {
      calls += 1;
    }),
  );
  return { proceeded: () => entryPoint.proceeded(calls) };
}

export const renderWithDialog = withQueryClient;

export type Form = {
  readonly name: string;
  readonly sends: string;
  readonly render: () => ReactElement;
  readonly open: (user: User) => Promise<void>;
  readonly fill: (user: User) => Promise<void>;
  readonly kept: () => void;
  readonly submit: string;
};

// No entry point opens this form now. It stays gated until R2 deletes it with the other forms.
function OrderItemForm() {
  const { handleSyncOrderItemSubmit } = useSyncMutations(noop);
  return (
    <SyncOrderItemForm
      orderId="od-1"
      handleSyncOrderItemSubmit={handleSyncOrderItemSubmit}
      currency="USD"
    />
  );
}

const CSV = [
  "ID,Title,Root,Category,Release Date,Price,Scale,Barcode,Status,Count,Score,Payment Date,Shipping Date,Collecting Date,Price,Shop,Shipping Method,Tracking Number,Wishibility,Note",
  `98777,"Hello, Good-bye",Figures,Prepainted,2024-01-01,"¥10,000",1/7,,Owned,1,8/10,2024-02-01,,,"$80.00",AmiAmi,EMS,,,`,
].join("\n");

const typeItemId = async (user: User) => {
  await user.type(screen.getByPlaceholderText("MyFigureCollection item link or ID"), "98777");
};
const itemIdKept = () => {
  expect(
    screen.getByPlaceholderText<HTMLInputElement>("MyFigureCollection item link or ID").value,
  ).toBe("98777");
};

/** Every form that sends a sync, rendered open as a deep link or a reopened sheet would leave it. */
export const FORMS: readonly Form[] = [
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
    render: () => <OrderItemForm />,
    open: async () => {},
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
