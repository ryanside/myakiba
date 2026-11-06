import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "@/components/ui/toast";
import { useResourceMutation } from "../client";
import { updateKanbanOrderDateCommand } from "./dashboard";

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

async function changeDateAndReadToast(respond: () => Promise<Response>) {
  globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
  const added = spyOn(toast, "add");
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const { result } = renderHook(() => useResourceMutation(updateKanbanOrderDateCommand), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  await act(() =>
    result.current.run({ orderId: "od-alpha", field: "orderDate", date: "2026-11-05" }),
  );
  const toasts = added.mock.calls.map(([options]) => options);
  added.mockRestore();
  return toasts;
}

describe("a failed kanban date write", () => {
  test("describes the failure when the server cannot be reached", async () => {
    const toasts = await changeDateAndReadToast(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(toasts).toEqual([
      { type: "error", title: "Failed to update date", description: "Failed to update order date" },
    ]);
  });

  test("describes the failure when the server answers 503", async () => {
    const toasts = await changeDateAndReadToast(
      async () => new Response("Internal failure", { status: 503 }),
    );

    expect(toasts).toEqual([
      { type: "error", title: "Failed to update date", description: "Failed to update order date" },
    ]);
  });

  test("shows the server's message when the order no longer exists", async () => {
    const toasts = await changeDateAndReadToast(
      async () => new Response("Order not found", { status: 404 }),
    );

    expect(toasts).toEqual([
      { type: "error", title: "Failed to update date", description: "Order not found" },
    ]);
  });
});
