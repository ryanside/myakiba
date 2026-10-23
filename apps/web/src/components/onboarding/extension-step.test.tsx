import { afterEach, expect, mock, setDefaultTimeout, spyOn, test } from "bun:test";
import { cleanup, configure, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  useRouter: () => ({ invalidate: async () => {} }),
  getRouteApi: () => ({ useRouteContext: () => ({ session }) }),
}));

const { ExtensionStep } = await import("./extension-step");
const { OnboardingDialog } = await import("./onboarding-dialog");

const ONBOARDING_KEY = "myakiba:onboarding-v2";
const EXTENSION_STEP_TITLE = "Install the myakiba extension.";

function loadExtension(options: Parameters<typeof fakeExtension>[0]) {
  extension = fakeExtension(options);
  bridge = createExtensionBridge(extension.window);
}

function renderOnboarding() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OnboardingDialog renderTrigger={<button type="button">Getting Started</button>} />
    </QueryClientProvider>,
  );
}

/** Chrome injects a new install's content script only into pages loaded after it. */
function reloadWith(options: Parameters<typeof fakeExtension>[0]) {
  cleanup();
  loadExtension(options);
  renderOnboarding();
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

test("an installed extension reads as connected", async () => {
  loadExtension({ installed: true });
  render(<ExtensionStep />);

  expect(await screen.findByText("Extension connected")).toBeDefined();
  expect(screen.queryByRole("link")).toBeNull();
});

test("with no extension it shows how to install it", async () => {
  loadExtension({ installed: false });
  render(<ExtensionStep />);

  expect(screen.getByRole("status").textContent).toBe("Looking for the extension…");
  expect(await screen.findByText("Not installed")).toBeDefined();
  expect(
    screen
      .getByRole("link", { name: "How to install it (opens in a new tab)" })
      .getAttribute("href"),
  ).toBe("/#faq-extension");
  expect(screen.getByText("Reload this page after you install it.")).toBeDefined();
});

test("an extension that is too old asks for an update", async () => {
  loadExtension({ protocols: { min: 0, max: 0 } });
  render(<ExtensionStep />);

  expect(await screen.findByText("Update needed")).toBeDefined();
  expect(screen.getByRole("link", { name: "How to update it (opens in a new tab)" })).toBeDefined();
  expect(screen.getByText("Reload this page after you update it.")).toBeDefined();
});

test("an update keeps reading as update needed until the page reloads", async () => {
  loadExtension({ protocols: { min: 0, max: 0 } });
  render(<ExtensionStep />);
  await screen.findByText("Update needed");

  extension.setInstalled(false);
  cleanup();
  render(<ExtensionStep />);

  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Update needed"));
  await new Promise((resolve) => {
    setTimeout(resolve, 600);
  });
  expect(screen.getByRole("status").textContent).toBe("Update needed");
});

test("a new install shows after the reload, and onboarding reopens at the extension step", async () => {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ step: 2, hasSeen: true }));
  const reload = spyOn(window.location, "reload").mockImplementation(() => {});
  loadExtension({ installed: false });
  const user = userEvent.setup();
  renderOnboarding();
  await user.click(screen.getByRole("button", { name: "Getting Started" }));
  await screen.findByRole("dialog", { name: EXTENSION_STEP_TITLE });
  expect(await screen.findByText("Not installed")).toBeDefined();

  await user.click(screen.getByRole("button", { name: "Reload page" }));
  expect(reload).toHaveBeenCalledTimes(1);
  reloadWith({ installed: true });

  await screen.findByRole("dialog", { name: EXTENSION_STEP_TITLE });
  expect(await screen.findByText("Extension connected")).toBeDefined();
  reload.mockRestore();
});

test("onboarding closed at the extension step stays closed after a reload", async () => {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ step: 2, hasSeen: true }));
  loadExtension({ installed: false });
  const user = userEvent.setup();
  renderOnboarding();
  await user.click(screen.getByRole("button", { name: "Getting Started" }));
  await screen.findByRole("dialog", { name: EXTENSION_STEP_TITLE });

  await user.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  reloadWith({ installed: false });

  await new Promise((resolve) => {
    setTimeout(resolve, 600);
  });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("onboarding moved past the extension step does not reopen there after a reload", async () => {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ step: 2, hasSeen: true }));
  loadExtension({ installed: false });
  const user = userEvent.setup();
  renderOnboarding();
  await user.click(screen.getByRole("button", { name: "Getting Started" }));
  await screen.findByRole("dialog", { name: EXTENSION_STEP_TITLE });

  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("dialog", { name: "Bring in your items." });
  reloadWith({ installed: false });

  await new Promise((resolve) => {
    setTimeout(resolve, 600);
  });
  expect(screen.queryByRole("dialog")).toBeNull();
});
