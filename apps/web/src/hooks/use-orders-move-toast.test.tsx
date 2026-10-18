import { afterEach, expect, spyOn, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "@/components/ui/toast";
import { useOrdersMutations } from "./use-orders";

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

function answerMoveWith(status: number, body: string) {
  globalThis.fetch = Object.assign(
    async () => new Response(body, { status, headers: { "content-type": "text/plain" } }),
    { preconnect: realFetch.preconnect },
  );
}

async function moveAndReadToast() {
  const added = spyOn(toast, "add");
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const { result } = renderHook(() => useOrdersMutations(), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  await act(() =>
    result.current
      .handleMoveItem("order-2", new Set(["c-1"]), new Set(["order-1"]))
      .catch(() => {}),
  );
  await waitFor(() => expect(added).toHaveBeenCalled());
  const [options] = added.mock.calls.at(-1) ?? [];
  added.mockRestore();
  return options;
}

test("a rejected move shows the server's message", async () => {
  answerMoveWith(404, "Order items not found");

  expect(await moveAndReadToast()).toMatchObject({ type: "error", title: "Order items not found" });
});

test("a failed move keeps the retry advice", async () => {
  answerMoveWith(500, "Failed to move items");

  expect(await moveAndReadToast()).toMatchObject({
    type: "error",
    title: "Failed to move items. Please try again.",
  });
});

test("a move that never reaches the server keeps the retry advice", async () => {
  globalThis.fetch = Object.assign(
    async () => {
      throw new TypeError("Failed to fetch");
    },
    { preconnect: realFetch.preconnect },
  );

  expect(await moveAndReadToast()).toMatchObject({
    type: "error",
    title: "Failed to move items. Please try again.",
  });
});

test("a move the server rejects without a message keeps the retry advice", async () => {
  answerMoveWith(401, "");

  expect(await moveAndReadToast()).toMatchObject({
    type: "error",
    title: "Failed to move items. Please try again.",
  });
});

test("a failed move whose body cannot be read keeps the retry advice", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.error(new TypeError("stream broke"));
    },
  });
  globalThis.fetch = Object.assign(
    async () => new Response(body, { status: 500, headers: { "content-type": "text/plain" } }),
    { preconnect: realFetch.preconnect },
  );

  expect(await moveAndReadToast()).toMatchObject({
    type: "error",
    title: "Failed to move items. Please try again.",
  });
});

test("a failed move with a malformed JSON body keeps the retry advice", async () => {
  globalThis.fetch = Object.assign(
    async () =>
      new Response("<html>", { status: 500, headers: { "content-type": "application/json" } }),
    { preconnect: realFetch.preconnect },
  );

  expect(await moveAndReadToast()).toMatchObject({
    type: "error",
    title: "Failed to move items. Please try again.",
  });
});
