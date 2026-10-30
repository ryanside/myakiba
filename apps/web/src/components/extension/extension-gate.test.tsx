import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
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
import { fakeExtension } from "../../../test/fake-extension";
import {
  LISTING_URLS,
  SAFARI,
  SUPPORTED_BROWSERS,
  listIn,
  browseWith,
} from "../../../test/extension-browser";

configure({ asyncUtilTimeout: 3000 });
setDefaultTimeout(30_000);

const {
  ENTRY_POINTS,
  click,
  csvChoice,
  currentExtension,
  loadExtension,
  noop,
  renderEntryPoint,
  resetEntryPoints,
  useBridge,
} = await import("../../../test/extension-entry-points");
const { createExtensionBridge } = await import("@/lib/extension-bridge");
const { ExtensionRequiredDialog } = await import("./extension-required-dialog");
const { dismissMissingExtension, useExtensionGate } = await import("@/lib/extension-gate");
const { AppCommand } = await import("@/components/command/app-command");
const { ItemResyncButton } = await import("@/components/item/item-resync-button");

const [CHROME] = SUPPORTED_BROWSERS;
const UNDER_REVIEW = "The myakiba browser extension is under review";

beforeEach(() => {
  browseWith(CHROME.userAgent);
  listIn(CHROME.store);
});
afterEach(resetEntryPoints);

describe.each(ENTRY_POINTS.map((entryPoint) => [entryPoint.name, entryPoint] as const))(
  "%s",
  (_name, entryPoint) => {
    test("goes ahead when the extension is ready, even while no store lists it", async () => {
      listIn();
      loadExtension({ installed: true });
      const user = userEvent.setup();
      const { proceeded } = renderEntryPoint(entryPoint);

      await entryPoint.start(user);

      await waitFor(() => expect(proceeded()).toBe(true));
      expect(screen.queryByRole("dialog", { name: /myakiba (browser )?extension/u })).toBeNull();
    });

    test("links to the store listing instead when the extension is not installed", async () => {
      loadExtension({ installed: false });
      const user = userEvent.setup();
      const { proceeded } = renderEntryPoint(entryPoint);

      await entryPoint.start(user);

      await screen.findByRole("dialog", { name: "Install the myakiba extension first" });
      expect(
        screen
          .getByRole("link", { name: "Install from the Chrome Web Store (opens in a new tab)" })
          .getAttribute("href"),
      ).toBe(LISTING_URLS.chromeWebStore);
      expect(proceeded()).toBe(false);
    });

    test("asks for an update when the extension is too old", async () => {
      loadExtension({ protocols: { min: 0, max: 0 } });
      const user = userEvent.setup();
      const { proceeded } = renderEntryPoint(entryPoint);

      await entryPoint.start(user);

      await screen.findByRole("dialog", { name: "Update the myakiba extension" });
      expect(
        screen
          .getByRole("link", { name: "How to update it (opens in a new tab)" })
          .getAttribute("href"),
      ).toBe("/#faq-extension-update");
      expect(proceeded()).toBe(false);
    });
  },
);

function renderResyncButton() {
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
  return { calls: () => calls };
}

describe.each(SUPPORTED_BROWSERS.map((browser) => [browser.name, browser] as const))(
  "in %s",
  (_name, browser) => {
    beforeEach(() => browseWith(browser.userAgent));

    test("an import starts when the extension is ready, whichever stores list it", async () => {
      for (const stores of [[], [browser.store]] as const) {
        listIn(...stores);
        loadExtension({ installed: true });
        const user = userEvent.setup();
        const { calls } = renderResyncButton();

        await click("Refresh item details")(user);

        await waitFor(() => expect(calls()).toBe(1));
        expect(screen.queryByRole("dialog")).toBeNull();
        cleanup();
      }
    });

    test("a missing extension links to this browser's store listing", async () => {
      listIn(browser.store);
      loadExtension({ installed: false });
      const user = userEvent.setup();
      const { calls } = renderResyncButton();

      await click("Refresh item details")(user);

      const dialog = await screen.findByRole("dialog", {
        name: "Install the myakiba extension first",
      });
      expect(dialog.textContent).toContain(`Install it from ${browser.storeName}`);
      expect(
        screen
          .getByRole("link", { name: `Install from ${browser.storeName} (opens in a new tab)` })
          .getAttribute("href"),
      ).toBe(LISTING_URLS[browser.store]);
      expect(calls()).toBe(0);
    });

    test("a missing extension is under review while this browser's store has no listing", async () => {
      listIn(
        ...SUPPORTED_BROWSERS.filter(({ store }) => store !== browser.store).map(
          ({ store }) => store,
        ),
      );
      loadExtension({ installed: false });
      const user = userEvent.setup();
      const { calls } = renderResyncButton();

      await click("Refresh item details")(user);

      const dialog = await screen.findByRole("dialog", { name: UNDER_REVIEW });
      expect(dialog.textContent).toContain(`It is in review at ${browser.storeName} now`);
      expect(dialog.textContent).toContain("it will be released shortly");
      expect(dialog.textContent).toContain("the new way to import items from MyFigureCollection");
      expect(dialog.textContent).toContain("importing is unavailable until it passes review");
      expect(screen.queryByRole("link")).toBeNull();
      expect(calls()).toBe(0);
    });

    test("an outdated extension asks for an update", async () => {
      listIn();
      loadExtension({ protocols: { min: 0, max: 0 } });
      const user = userEvent.setup();
      const { calls } = renderResyncButton();

      await click("Refresh item details")(user);

      await screen.findByRole("dialog", { name: "Update the myakiba extension" });
      expect(calls()).toBe(0);
    });
  },
);

test("another browser is told the extension needs desktop Chrome or Firefox", async () => {
  browseWith(SAFARI);
  listIn(...SUPPORTED_BROWSERS.map(({ store }) => store));
  loadExtension({ installed: false });
  const user = userEvent.setup();
  const { calls } = renderResyncButton();

  await click("Refresh item details")(user);

  const dialog = await screen.findByRole("dialog", {
    name: "Importing needs desktop Chrome or Firefox",
  });
  expect(dialog.textContent).toContain("Open myakiba in one of them to import.");
  expect(screen.queryByRole("link")).toBeNull();
  expect(calls()).toBe(0);
});

test("an extension that answers ready in another browser still starts the import", async () => {
  browseWith(SAFARI);
  listIn();
  loadExtension({ installed: true });
  const user = userEvent.setup();
  const { calls } = renderResyncButton();

  await click("Refresh item details")(user);

  await waitFor(() => expect(calls()).toBe(1));
});

test("the command palette shows it is checking on the chosen option", async () => {
  loadExtension({ installed: false });
  const user = userEvent.setup();
  renderEntryPoint({
    name: "the command palette",
    render: () => <AppCommand />,
    start: async () => {},
    proceeded: () => false,
  });
  await click("Search")(user);
  const option = await screen.findByRole("option", { name: csvChoice });

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
