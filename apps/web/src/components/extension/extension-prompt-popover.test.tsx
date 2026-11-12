import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setExtensionPrompt } from "@/lib/extension-prompt";
import { ExtensionPromptPopover } from "./extension-prompt-popover";

const SECURITY_CHECK = "Complete the security check in the MyFigureCollection tab";
const REFRESH = "refresh-1";
const securityCheck = () => setExtensionPrompt(REFRESH, { kind: "needs_user", untilMs: null });

afterEach(() => {
  cleanup();
  setExtensionPrompt(REFRESH, null);
});

test("it renders nothing while the extension asks nothing", () => {
  const { container } = render(<ExtensionPromptPopover />);

  expect(container.textContent).toBe("");
  expect(screen.queryByRole("button")).toBeNull();
});

test("it opens on the security check during an Item Refresh", async () => {
  render(<ExtensionPromptPopover />);

  act(securityCheck);

  expect(await screen.findByText(SECURITY_CHECK)).toBeDefined();
});

test("closing it keeps it closed until the next security check", async () => {
  const user = userEvent.setup();
  securityCheck();
  render(<ExtensionPromptPopover />);
  await screen.findByText(SECURITY_CHECK);

  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByText(SECURITY_CHECK)).toBeNull());

  act(securityCheck);
  expect(await screen.findByText(SECURITY_CHECK)).toBeDefined();
});

test("a wait stays closed until it is clicked, and clearing the prompt removes it", async () => {
  const user = userEvent.setup();
  render(<ExtensionPromptPopover />);

  act(() => setExtensionPrompt(REFRESH, { kind: "backing_off", untilMs: null }));
  expect(screen.queryByRole("status")).toBeNull();

  await user.click(await screen.findByRole("button", { name: "Item refresh" }));
  const notice = await screen.findByRole("status");
  expect(notice.textContent).toContain("MyFigureCollection asked to slow down");

  act(() => setExtensionPrompt(REFRESH, null));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Item refresh" })).toBeNull());
  expect(screen.queryByRole("status")).toBeNull();
});
