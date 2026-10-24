import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ExtensionPrompt } from "@/lib/extension-prompt";
import { answer } from "../../../test/request-answers";

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({ children }: { children: ReactNode }) => <a href="/sync">{children}</a>,
}));
const realSync = await import("@/queries/sync");
await mock.module("@/queries/sync", () => ({
  ...realSync,
  fetchSyncSessions: async () => answer({ sessions: [], totalCount: 0 }),
}));

const { default: SyncStatusWidget } = await import("@/components/sync/sync-status-widget");
const { ExtensionPromptNotice } = await import("./extension-prompt-notice");
const { setExtensionPrompt } = await import("@/lib/extension-prompt");

const SECURITY_CHECK = "Complete the security check in the MyFigureCollection tab";
const runs = new Set<string>();

function prompt(runId: string, sessionId: string | null, next: ExtensionPrompt) {
  runs.add(runId);
  setExtensionPrompt(runId, { sessionId, prompt: next });
}

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
  for (const runId of runs) setExtensionPrompt(runId, null);
  runs.clear();
});

test("the widget opens on the security check prompt for this tab's import", async () => {
  prompt("run-1", "ss-1", { kind: "needs_user", untilMs: null });
  renderWidget();

  expect(await screen.findByText(SECURITY_CHECK)).toBeDefined();
});

test("closing the widget keeps it closed until the next security check", async () => {
  const user = userEvent.setup();
  prompt("run-1", "ss-1", { kind: "needs_user", untilMs: null });
  renderWidget();
  await screen.findByText(SECURITY_CHECK);

  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByText(SECURITY_CHECK)).toBeNull());

  act(() => prompt("run-1", "ss-1", { kind: "needs_user", untilMs: null }));
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

  act(() => prompt("run-1", "ss-1", { kind: "queued" }));
  expect(screen.getByRole("status").textContent).toContain("Waiting for the extension");
  expect(screen.getByRole("status").textContent).toContain("It is finishing another import first.");

  act(() => prompt("run-1", "ss-1", { kind: "backing_off", untilMs: null }));
  expect(screen.getByRole("status").textContent).toContain("MyFigureCollection asked to slow down");

  act(() => setExtensionPrompt("run-1", null));
  expect(screen.queryByRole("status")).toBeNull();
});

test("the session page shows only its own import's prompt", () => {
  prompt("run-1", "ss-1", { kind: "needs_user", untilMs: null });

  render(<ExtensionPromptNotice sessionId="ss-2" />);
  expect(screen.queryByText(SECURITY_CHECK)).toBeNull();

  cleanup();
  render(<ExtensionPromptNotice sessionId="ss-1" />);
  expect(screen.getByText(SECURITY_CHECK)).toBeDefined();
});

test("the most urgent prompt of all this tab's runs shows", () => {
  prompt("run-1", "ss-1", { kind: "queued" });
  prompt("run-2", null, { kind: "needs_user", untilMs: null });
  prompt("run-3", "ss-3", { kind: "backing_off", untilMs: null });
  render(<ExtensionPromptNotice />);
  expect(screen.getByRole("status").textContent).toContain(SECURITY_CHECK);

  act(() => setExtensionPrompt("run-2", null));
  expect(screen.getByRole("status").textContent).toContain("MyFigureCollection asked to slow down");

  act(() => setExtensionPrompt("run-3", null));
  expect(screen.getByRole("status").textContent).toContain("Waiting for the extension");
});

test("a run with no sync session shows in the widget but on no session page", () => {
  prompt("resync-1", null, { kind: "backing_off", untilMs: null });

  render(<ExtensionPromptNotice sessionId="ss-1" />);
  expect(screen.queryByRole("status")).toBeNull();

  cleanup();
  render(<ExtensionPromptNotice />);
  expect(screen.getByRole("status").textContent).toContain("MyFigureCollection asked to slow down");
});

test("the security check names its deadline", () => {
  const deadline = new Date(2026, 9, 22, 15, 4).getTime();
  prompt("run-1", "ss-1", { kind: "needs_user", untilMs: deadline });

  render(<ExtensionPromptNotice sessionId="ss-1" />);

  expect(screen.getByRole("status").textContent).toContain("Finish it by 3:04 PM.");
});
