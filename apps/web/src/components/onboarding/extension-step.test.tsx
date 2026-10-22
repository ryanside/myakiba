import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delegatingBridge, fakeExtension } from "../../../test/fake-extension";

let extension = fakeExtension();
const { createExtensionBridge } = await import("@/lib/extension-bridge");
let bridge = createExtensionBridge(extension.window);
await mock.module("@/lib/extension-bridge", () => ({
  createExtensionBridge,
  extensionBridge: delegatingBridge(() => bridge),
}));

const { ExtensionStep } = await import("./extension-step");

function useExtension(options: Parameters<typeof fakeExtension>[0]) {
  extension = fakeExtension(options);
  bridge = createExtensionBridge(extension.window);
}

afterEach(cleanup);

test("an installed extension reads as connected", async () => {
  useExtension({ installed: true });
  render(<ExtensionStep />);

  expect(await screen.findByText("Extension connected")).toBeDefined();
  expect(screen.queryByRole("link")).toBeNull();
});

test("with no extension it shows how to install it", async () => {
  useExtension({ installed: false });
  render(<ExtensionStep />);

  expect(screen.getByRole("status").textContent).toBe("Looking for the extension…");
  expect(await screen.findByText("Not installed")).toBeDefined();
  expect(screen.getByRole("link", { name: "How to install it" }).getAttribute("href")).toBe(
    "/#faq-extension",
  );
});

test("an extension that is too old asks for an update", async () => {
  useExtension({ protocols: { min: 0, max: 0 } });
  render(<ExtensionStep />);

  expect(await screen.findByText("Update needed")).toBeDefined();
  expect(screen.getByRole("link", { name: "How to update it" })).toBeDefined();
});

test("check again picks up an extension installed since", async () => {
  useExtension({ installed: false });
  const user = userEvent.setup();
  render(<ExtensionStep />);
  await screen.findByText("Not installed");

  extension.setInstalled(true);
  await user.click(screen.getByRole("button", { name: "Check again" }));

  expect(await screen.findByText("Extension connected")).toBeDefined();
});
