import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({ children }: { children: ReactNode }) => <a href="/sync">{children}</a>,
}));
const realSync = await import("@/queries/sync");
await mock.module("@/queries/sync", () => ({
  ...realSync,
  fetchSyncSessions: async () => ({ sessions: [], totalCount: 0 }),
}));

const { default: SyncStatusWidget } = await import("./sync-status-widget");
const { ExtensionPromptNotice } = await import("./extension-prompt-notice");
const { setExtensionPrompt } = await import("@/lib/extension-prompt");

const SECURITY_CHECK = "Complete the security check in the MyFigureCollection tab";

function renderWidget() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <SyncStatusWidget />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  setExtensionPrompt(null);
});

test("the widget opens on the security check prompt for this tab's import", async () => {
  setExtensionPrompt({ sessionId: "ss-1", prompt: { kind: "needs_user" } });
  renderWidget();

  expect(await screen.findByText(SECURITY_CHECK)).toBeDefined();
});

test("closing the widget keeps it closed until the next security check", async () => {
  const user = userEvent.setup();
  setExtensionPrompt({ sessionId: "ss-1", prompt: { kind: "needs_user" } });
  renderWidget();
  await screen.findByText(SECURITY_CHECK);

  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByText(SECURITY_CHECK)).toBeNull());

  act(() => setExtensionPrompt({ sessionId: "ss-1", prompt: { kind: "needs_user" } }));
  expect(await screen.findByText(SECURITY_CHECK)).toBeDefined();
});

test("the widget shows no prompt when the extension needs nothing", async () => {
  const user = userEvent.setup();
  renderWidget();

  await user.click(await screen.findByRole("button", { name: "Imports" }));

  expect(await screen.findByText("No recent imports")).toBeDefined();
  expect(screen.queryByRole("status")).toBeNull();
});

test("the prompt follows the store and clears with it", async () => {
  const user = userEvent.setup();
  renderWidget();
  await user.click(await screen.findByRole("button", { name: "Imports" }));

  act(() => setExtensionPrompt({ sessionId: "ss-1", prompt: { kind: "queued" } }));
  expect(screen.getByRole("status").textContent).toContain("Waiting for the extension");

  act(() =>
    setExtensionPrompt({ sessionId: "ss-1", prompt: { kind: "backing_off", untilMs: null } }),
  );
  expect(screen.getByRole("status").textContent).toContain("MyFigureCollection asked to slow down");

  act(() => setExtensionPrompt(null));
  expect(screen.queryByRole("status")).toBeNull();
});

test("the session page shows only its own import's prompt", () => {
  setExtensionPrompt({ sessionId: "ss-1", prompt: { kind: "needs_user" } });

  render(<ExtensionPromptNotice sessionId="ss-2" />);
  expect(screen.queryByText(SECURITY_CHECK)).toBeNull();

  cleanup();
  render(<ExtensionPromptNotice sessionId="ss-1" />);
  expect(screen.getByText(SECURITY_CHECK)).toBeDefined();
});
