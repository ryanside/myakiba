import { afterEach, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import type { DataTransferImport } from "@myakiba/contracts/data-transfer/schema";
import { delegatingBridge, fakeExtension } from "../../../test/fake-extension";
import { answer } from "../../../test/request-answers";

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
  useRouter: () => ({ invalidate: async () => {} }),
  getRouteApi: () => ({ useRouteContext: () => ({ session }) }),
  // Settings rows read the URL hash for search results; these screens render without a router.
  useLocation: () => {},
}));

const retriedSessions: string[] = [];
const realSync = await import("@/queries/sync");
await mock.module("@/queries/sync", () => ({
  ...realSync,
  retrySyncSession: async (sessionId: string) => {
    retriedSessions.push(sessionId);
    return answer({ jobId: "job-2", missingMfcItemIds: [] });
  },
}));

const { ExtensionRequiredDialog } = await import("./extension-required-dialog");
const { dismissMissingExtension, useExtensionGate } = await import("@/lib/extension-gate");
const { default: SyncWidget } = await import("@/components/sync/sync-widget");
const { LAUNCHABLE_SYNC_OPTIONS } = await import("@/components/sync/sync-launcher-options");
const { AppCommand } = await import("@/components/command/app-command");
const { SyncSheetButton } = await import("@/components/sync/sync-sheet-button");
const { OrderItemSyncSheet } = await import("@/components/orders/order-item-sync-sheet");
const { ItemSyncActions } = await import("@/components/item/item-sync-actions");
const { ItemResyncButton } = await import("@/components/item/item-resync-button");
const { RetrySyncSessionButton } = await import("@/components/sync/retry-sync-session-button");
const { DataTransferView } = await import("@/components/settings/data-transfer");
const { OnboardingDialog } = await import("@/components/onboarding/onboarding-dialog");
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

const ONBOARDING_KEY = "myakiba:onboarding-v2";
const SYNC_STEP_TITLE = "Bring in your items.";
const collectionChoice = new RegExp(`^${SYNC_OPTION_META.collection.title}`, "u");

function onboardingAtSyncStep() {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ hasSeen: true }));
  return <OnboardingDialog renderTrigger={<button type="button">Getting Started</button>} />;
}

/** Getting Started opens at the welcome step, so this walks to the sync step. */
async function openSyncStep(user: User) {
  await click("Getting Started")(user);
  for (const title of [
    "Welcome to myakiba.",
    "Set your username, currency, and date format.",
    "Install the myakiba extension.",
  ]) {
    await screen.findByRole("dialog", { name: title });
    await click("Continue")(user);
  }
  await screen.findByRole("dialog", { name: SYNC_STEP_TITLE });
}

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
  ...(["collection", "order", "csv"] as const).map((syncType): EntryPoint => ({
    name: `onboarding's ${SYNC_OPTION_META[syncType].title} choice`,
    render: onboardingAtSyncStep,
    start: async (user) => {
      await openSyncStep(user);
      await user.click(
        screen.getByRole("button", {
          name: new RegExp(`^${SYNC_OPTION_META[syncType].title}`, "u"),
        }),
      );
    },
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

function loadExtension(options: Parameters<typeof fakeExtension>[0]) {
  extension = fakeExtension(options);
  bridge = createExtensionBridge(extension.window);
}

afterEach(() => {
  cleanup();
  dismissMissingExtension();
  retriedSessions.length = 0;
  localStorage.clear();
});

describe.each(ENTRY_POINTS.map((entryPoint) => [entryPoint.name, entryPoint] as const))(
  "%s",
  (_name, entryPoint) => {
    test("asks for the extension instead when it is not installed", async () => {
      loadExtension({ installed: false });
      const user = userEvent.setup();
      const { proceeded } = renderEntryPoint(entryPoint);

      await entryPoint.start(user);

      await screen.findByRole("dialog", { name: "Install the myakiba extension first" });
      expect(
        screen
          .getByRole("link", { name: "How to install it (opens in a new tab)" })
          .getAttribute("href"),
      ).toBe("/#faq-extension");
      expect(proceeded()).toBe(false);
    });

    test("asks for an update when the extension is too old", async () => {
      loadExtension({ protocols: { min: 0, max: 0 } });
      const user = userEvent.setup();
      const { proceeded } = renderEntryPoint(entryPoint);

      await entryPoint.start(user);

      await screen.findByRole("dialog", { name: "Update the myakiba extension" });
      expect(proceeded()).toBe(false);
    });

    test("goes ahead when the extension is ready", async () => {
      loadExtension({ installed: true });
      const user = userEvent.setup();
      const { proceeded } = renderEntryPoint(entryPoint);

      await entryPoint.start(user);

      await waitFor(() => expect(proceeded()).toBe(true));
      expect(screen.queryByRole("dialog", { name: /myakiba extension/u })).toBeNull();
    });
  },
);

test.each([
  {
    name: "the sync launcher",
    view: () => <SyncWidget TriggerWrapper={<button type="button">Launch</button>} />,
    open: async (user: User) => {
      await click("Launch")(user);
      return screen.findByRole("button", { name: "Collection" });
    },
  },
  {
    name: "the command palette",
    view: () => <AppCommand />,
    open: async (user: User) => {
      await click("Search")(user);
      return screen.findByRole("option", { name: collectionChoice });
    },
  },
])("$name shows it is checking on the chosen option", async ({ name, view, open }) => {
  loadExtension({ installed: false });
  const user = userEvent.setup();
  renderEntryPoint({ name, render: view, start: async () => {}, proceeded: () => false });
  const option = await open(user);

  fireEvent.click(option);

  await waitFor(() => expect(option.getAttribute("aria-busy")).toBe("true"));
  await screen.findByRole("dialog", { name: "Install the myakiba extension first" });
});

test("the dialog closes, and the next try probes again", async () => {
  loadExtension({ installed: false });
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

test("a blocked onboarding choice keeps onboarding open and unfinished, so the user can go back", async () => {
  loadExtension({ installed: false });
  const user = userEvent.setup();
  renderEntryPoint({
    name: "onboarding",
    render: onboardingAtSyncStep,
    start: async () => {},
    proceeded: () => false,
  });
  await openSyncStep(user);

  await user.click(screen.getByRole("button", { name: collectionChoice }));
  await screen.findByRole("dialog", { name: "Install the myakiba extension first" });
  await click("Close")(user);
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: /myakiba extension first/u })).toBeNull(),
  );

  expect(screen.getByRole("dialog", { name: SYNC_STEP_TITLE })).toBeDefined();
  await click("Back")(user);
  expect(
    await screen.findByRole("dialog", { name: "Install the myakiba extension." }),
  ).toBeDefined();
});

test("onboarding completes once the extension answers ready", async () => {
  loadExtension({ installed: true });
  const user = userEvent.setup();
  renderEntryPoint({
    name: "onboarding",
    render: onboardingAtSyncStep,
    start: async () => {},
    proceeded: () => false,
  });
  await openSyncStep(user);

  await user.click(screen.getByRole("button", { name: collectionChoice }));

  await screen.findByRole("dialog", { name: SYNC_OPTION_META.collection.title });
  expect(screen.queryByRole("dialog", { name: SYNC_STEP_TITLE })).toBeNull();
});

test("closing the dialog keeps its copy while it closes and returns focus to the button", async () => {
  loadExtension({ installed: false });
  const user = userEvent.setup();
  render(
    <>
      <ItemResyncButton status="idle" isPending={false} cooldownExpiresAt={null} onRequest={noop} />
      <ExtensionRequiredDialog />
    </>,
  );
  const trigger = screen.getByRole("button", { name: "Refresh item details" });
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: "Install the myakiba extension first" });

  act(() => dismissMissingExtension());
  expect(dialog.isConnected).toBe(true);
  expect(dialog.textContent).toContain("Install the myakiba extension first");

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(trigger);
});

test("a gated button shows it is checking and ignores a second click until the check ends", async () => {
  loadExtension({ installed: false });
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
  const button = screen.getByRole("button", { name: "Refresh item details" });

  fireEvent.click(button);
  await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("true"));
  fireEvent.click(button);
  await screen.findByRole("dialog", { name: "Install the myakiba extension first" });
  expect(button.getAttribute("aria-busy")).toBeNull();
  expect(
    extension.posted.filter((post) => post.message.request.type === "hello").length,
  ).toBeLessThanOrEqual(6);

  act(() => dismissMissingExtension());
  extension.setInstalled(true);
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(calls).toBe(1));
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
  expect(calls).toBe(1);
});

test("a gate whose check throws stops checking and can check again", async () => {
  const ready = createExtensionBridge(fakeExtension().window);
  bridge = { ...ready, probe: () => Promise.reject(new Error("probe failed")) };
  const { result } = renderHook(() => useExtensionGate());
  let proceeded = 0;
  const proceed = () => {
    proceeded += 1;
  };

  await act(async () => {
    await expect(result.current.gate(proceed)).rejects.toThrow("probe failed");
  });
  expect(result.current.checking).toBe(false);
  bridge = ready;
  await act(async () => {
    await result.current.gate(proceed);
  });

  expect(proceeded).toBe(1);
});
