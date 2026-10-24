import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const refresh = async (): Promise<never> => {
  throw new Error("Item details were recently refreshed");
};
const realRun = await import("@/data/extension-run");
await mock.module("@/data/extension-run", () => ({
  ...realRun,
  refreshItemWithExtension: () => refresh(),
}));

const { toast } = await import("@/components/ui/toast");
const { useResourceMutation } = await import("./client");
const { refreshItemCommand } = await import("./resources/item");
const { retrySyncSessionCommand } = await import("./resources/sync");
const { useMoveListsMutation } = await import("@/hooks/use-lists");

const realFetch = globalThis.fetch;
const requests: string[] = [];

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  requests.length = 0;
});

function answerWith(respond: () => Response) {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(`${init?.method ?? "GET"} ${String(input)}`);
      return respond();
    },
    { preconnect: realFetch.preconnect },
  );
}

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

async function lastToastAfter<Outcome>(write: () => Promise<Outcome>) {
  const added = spyOn(toast, "add");
  await act(async () => {
    try {
      await write();
    } catch {
      // Only the toast is under test here.
    }
  });
  const [options] = added.mock.calls.at(-1) ?? [];
  added.mockRestore();
  return options;
}

test("a refused Item Refresh shows why under its title", async () => {
  answerWith(() => Response.json({ status: "idle", cooldownExpiresAt: null }));
  const queryClient = new QueryClient();
  const { result } = renderHook(() => useResourceMutation(refreshItemCommand), {
    wrapper: wrapperFor(queryClient),
  });

  expect(await lastToastAfter(() => result.current.run(98_777))).toEqual({
    type: "error",
    title: "Failed to request item refresh",
    description: "Item details were recently refreshed",
  });
});

test("a refused import retry shows the server's text under its title", async () => {
  answerWith(() => new Response("Retry is not available", { status: 409 }));
  const queryClient = new QueryClient();
  const { result } = renderHook(() => useResourceMutation(retrySyncSessionCommand), {
    wrapper: wrapperFor(queryClient),
  });

  expect(await lastToastAfter(() => result.current.run("session-1"))).toEqual({
    type: "error",
    title: "Failed to retry failed item results",
    description: "Retry is not available",
  });
});

test("a move against a list the page no longer holds says the order was not saved and sends nothing", async () => {
  answerWith(() => Response.json(null));
  const queryClient = new QueryClient();
  const { result } = renderHook(() => useMoveListsMutation(), {
    wrapper: wrapperFor(queryClient),
  });

  const options = await lastToastAfter(() =>
    result.current.move({ movedIds: ["l1"], anchorId: null, placement: "before" }),
  );

  expect(options).toEqual({ type: "error", title: "Failed to save List order" });
  expect(requests.filter((request) => request.startsWith("PATCH"))).toEqual([]);
});
