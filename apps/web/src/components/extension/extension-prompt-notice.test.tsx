import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ExtensionPrompt } from "@/lib/extension-prompt";
import { ExtensionPromptNotice } from "./extension-prompt-notice";
import { setExtensionPrompt } from "@/lib/extension-prompt";

const SECURITY_CHECK = "Complete the security check in the MyFigureCollection tab";
const refreshes = new Set<string>();

function prompt(refreshId: string, next: ExtensionPrompt) {
  refreshes.add(refreshId);
  setExtensionPrompt(refreshId, next);
}

afterEach(() => {
  cleanup();
  for (const refreshId of refreshes) setExtensionPrompt(refreshId, null);
  refreshes.clear();
});

test("the notice says an Item Refresh continues once the security check is done", () => {
  prompt("refresh-1", { kind: "needs_user", untilMs: null });

  render(<ExtensionPromptNotice />);

  expect(screen.getByRole("status").textContent).toContain(
    "Item details refresh once the check is done.",
  );
});

test("the notice says the extension is finishing another refresh", () => {
  prompt("refresh-1", { kind: "queued" });

  render(<ExtensionPromptNotice />);

  expect(screen.getByRole("status").textContent).toContain(
    "It is finishing another refresh first.",
  );
});

test("the most urgent prompt of all this tab's refreshes shows", () => {
  prompt("refresh-1", { kind: "queued" });
  prompt("refresh-2", { kind: "needs_user", untilMs: null });
  prompt("refresh-3", { kind: "backing_off", untilMs: null });
  render(<ExtensionPromptNotice />);
  expect(screen.getByRole("status").textContent).toContain(SECURITY_CHECK);

  act(() => setExtensionPrompt("refresh-2", null));
  expect(screen.getByRole("status").textContent).toContain("MyFigureCollection asked to slow down");

  act(() => setExtensionPrompt("refresh-3", null));
  expect(screen.getByRole("status").textContent).toContain("Waiting for the extension");
});

test("the security check names its deadline", () => {
  const deadline = new Date(2026, 9, 22, 15, 4).getTime();
  prompt("refresh-1", { kind: "needs_user", untilMs: deadline });

  render(<ExtensionPromptNotice />);

  expect(screen.getByRole("status").textContent).toContain("Finish it by 3:04 PM.");
});
