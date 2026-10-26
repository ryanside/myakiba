import { afterEach, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import {
  act,
  configure,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeExtension } from "../../../test/fake-extension";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

// These tests ask for the extension as a released one is asked for. A revision from before the
// release state ignores this mock.
await mock.module("@/lib/extension-release", () => ({ EXTENSION_RELEASE: "released" }));
const {
  ENTRY_POINTS,
  SYNC_STEP_TITLE,
  click,
  collectionChoice,
  currentExtension,
  loadExtension,
  noop,
  onboardingAtSyncStep,
  openSyncStep,
  renderEntryPoint,
  resetEntryPoints,
  useBridge,
} = await import("../../../test/extension-entry-points");
const { createExtensionBridge } = await import("@/lib/extension-bridge");
const { ExtensionRequiredDialog } = await import("./extension-required-dialog");
const { dismissMissingExtension, useExtensionGate } = await import("@/lib/extension-gate");
const { default: SyncWidget } = await import("@/components/sync/sync-widget");
const { AppCommand } = await import("@/components/command/app-command");
const { ItemResyncButton } = await import("@/components/item/item-resync-button");
const { SYNC_OPTION_META } = await import("@/lib/sync");

type User = ReturnType<typeof userEvent.setup>;

afterEach(resetEntryPoints);

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
  currentExtension().setInstalled(true);
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
    currentExtension().posted.filter((post) => post.message.request.type === "hello").length,
  ).toBeLessThanOrEqual(6);

  act(() => dismissMissingExtension());
  currentExtension().setInstalled(true);
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
  useBridge({ ...ready, probe: () => Promise.reject(new Error("probe failed")) });
  const { result } = renderHook(() => useExtensionGate());
  let proceeded = 0;
  const proceed = () => {
    proceeded += 1;
  };

  await act(async () => {
    await expect(result.current.gate(proceed)).rejects.toThrow("probe failed");
  });
  expect(result.current.checking).toBe(false);
  useBridge(ready);
  await act(async () => {
    await result.current.gate(proceed);
  });

  expect(proceeded).toBe(1);
});
