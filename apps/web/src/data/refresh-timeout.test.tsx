import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ExtensionStatus } from "@/lib/extension-bridge";
import { fakeExtension } from "../../test/fake-extension";
import { SUPPORTED_BROWSERS, listIn, browseWith } from "../../test/extension-browser";

const [CHROME] = SUPPORTED_BROWSERS;
browseWith(CHROME.userAgent);
listIn(CHROME.store);

const realFetch = globalThis.fetch;
const deadlines = new Set<() => void>();
const delays: number[] = [];
const clock = {
  after: (ms: number, fire: () => void) => {
    delays.push(ms);
    deadlines.add(fire);
    return () => {
      deadlines.delete(fire);
    };
  },
};
let status: ExtensionStatus = { kind: "absent" };
let extension = fakeExtension({ onFetch: () => {} });
const { createExtensionBridge } = await import("@/lib/extension-bridge");
let bridge = createExtensionBridge(extension.window);
await mock.module("@/lib/extension-bridge", () => ({
  createExtensionBridge,
  extensionBridge: {
    status: () => status,
    subscribe: () => () => {},
    probe: async () => status,
    fetchItems: (...args: Parameters<typeof bridge.fetchItems>) => bridge.fetchItems(...args),
  },
}));
const realRefresh = await import("./item-refresh");
const refreshReal = realRefresh.refreshItemWithExtension;
await mock.module("@/data/item-refresh", () => ({
  ...realRefresh,
  refreshItemWithExtension: (id: number) => refreshReal(id, { clock }),
}));
const { refreshItemCommand } = await import("./resources/item");
const { useResourceMutation } = await import("./client");
const { ExtensionRequiredDialog } =
  await import("@/components/extension/extension-required-dialog");
const { dismissMissingExtension } = await import("@/lib/extension-gate");
const { Toaster, toast } = await import("@/components/ui/toast");

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  dismissMissingExtension();
  deadlines.clear();
  delays.length = 0;
  extension = fakeExtension({ onFetch: () => {} });
  bridge = createExtensionBridge(extension.window);
});

function renderRefresh() {
  const client = new QueryClient();
  return renderHook(() => useResourceMutation(refreshItemCommand), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <Toaster>
          {children}
          <ExtensionRequiredDialog />
        </Toaster>
      </QueryClientProvider>
    ),
  });
}

function finishRuns() {
  for (const run of extension.runs) run.done("interrupted");
}

function fireDeadline() {
  for (const fire of deadlines) {
    deadlines.delete(fire);
    fire();
  }
}

test.each([
  [{ kind: "absent" }, "Install the myakiba extension first"],
  [{ kind: "outdated", extensionVersion: "0.0.1" }, "Update the myakiba extension"],
  [{ kind: "ready", extensionVersion: "0.1.0" }, null],
] satisfies readonly (readonly [ExtensionStatus, string | null])[])(
  "a silent refresh with extension status %j settles and shows its recovery",
  async (next, dialogTitle) => {
    status = next;
    const added = spyOn(toast, "add");
    const { result } = renderRefresh();
    const saving = result.current.run(98_777);
    try {
      await waitFor(() => expect(extension.runs).toHaveLength(1));
      expect(delays).toEqual([5000]);
      expect(deadlines.size).toBe(1);
      await act(async () => {
        fireDeadline();
        const saved = await saving;
        expect(saved.isErr()).toBe(true);
      });
      expect(added).toHaveBeenCalledTimes(1);
      expect(added.mock.calls[0]?.[0]).toMatchObject({
        type: "error",
        title: "Failed to request item refresh",
        description: "The extension stopped. Reload the page and try again",
      });
      expect(
        await screen.findByText("The extension stopped. Reload the page and try again"),
      ).toBeTruthy();
      if (dialogTitle)
        expect(await screen.findByRole("dialog", { name: dialogTitle })).toBeTruthy();
      else
        expect(
          screen.queryByRole("dialog", {
            name: /Install the myakiba extension first|Update the myakiba extension/,
          }),
        ).toBeNull();
      expect(extension.cancelled).toHaveLength(1);
      expect(deadlines.size).toBe(0);
    } finally {
      await act(async () => {
        finishRuns();
        await saving;
      });
      added.mockRestore();
    }
  },
);

test("an answering refresh keeps waiting for the MFC security check without a response deadline", async () => {
  status = { kind: "ready", extensionVersion: "0.1.0" };
  const { result } = renderRefresh();
  const saving = result.current.run(98_777);
  try {
    await waitFor(() => expect(extension.runs).toHaveLength(1));
    await act(async () => {
      extension.runs[0]?.status("needs_user");
    });
    await waitFor(() => expect(deadlines.size).toBe(0));
    fireDeadline();
    expect(result.current.isPending).toBe(true);
    expect(extension.cancelled).toHaveLength(0);
  } finally {
    await act(async () => {
      finishRuns();
      await saving;
    });
  }
});

test("an answered refresh clears its deadline and uploads the page once", async () => {
  status = { kind: "ready", extensionVersion: "0.1.0" };
  let uploads = 0;
  globalThis.fetch = Object.assign(
    async () => {
      uploads += 1;
      return Response.json({ saved: "refreshed" });
    },
    { preconnect: realFetch.preconnect },
  );
  const { result } = renderRefresh();
  const saving = result.current.run(98_777);
  try {
    await waitFor(() => expect(extension.runs).toHaveLength(1));
    await act(async () => {
      extension.runs[0]?.item(98_777);
      extension.runs[0]?.done("complete");
      const saved = await saving;
      expect(saved.isOk()).toBe(true);
    });
    expect(deadlines.size).toBe(0);
    expect(uploads).toBe(1);
    expect(extension.cancelled).toHaveLength(0);
  } finally {
    await act(async () => {
      finishRuns();
      await saving;
    });
  }
});
