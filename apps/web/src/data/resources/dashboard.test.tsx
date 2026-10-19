import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "@/components/ui/toast";
import { useResourceMutation } from "../client";
import { updateKanbanOrderStatusCommand } from "./dashboard";

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

function answerWith(respond: () => Promise<Response>) {
  globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
}

async function moveCardAndReadToast() {
  const added = spyOn(toast, "add");
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const { result } = renderHook(() => useResourceMutation(updateKanbanOrderStatusCommand), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  await act(() => result.current.run({ orderId: "od-alpha", status: "Paid" }));
  const toasts = added.mock.calls.map(([options]) => options);
  added.mockRestore();
  return toasts;
}

const RETRY_ADVICE = { type: "error", title: "Failed to update order status. Please try again." };

describe("a failed kanban status write", () => {
  test("shows retry advice when the server answers 500 with a JSON body", async () => {
    answerWith(async () => Response.json({ message: "lane forced failure" }, { status: 500 }));

    expect(await moveCardAndReadToast()).toEqual([RETRY_ADVICE]);
  });

  test("shows retry advice when the server cannot be reached", async () => {
    answerWith(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(await moveCardAndReadToast()).toEqual([RETRY_ADVICE]);
  });

  test("shows the server's message when the order no longer exists", async () => {
    answerWith(
      async () =>
        new Response("Order not found", {
          status: 404,
          headers: { "content-type": "text/plain" },
        }),
    );

    expect(await moveCardAndReadToast()).toEqual([{ type: "error", title: "Order not found" }]);
  });

  test("shows retry advice when the server answers 400 with a blank body", async () => {
    answerWith(async () => new Response(" \n\t ", { status: 400 }));

    expect(await moveCardAndReadToast()).toEqual([RETRY_ADVICE]);
  });

  test("shows retry advice when the server answers 400 with only zero-width spaces", async () => {
    answerWith(async () => new Response("\u200B\u200B", { status: 400 }));

    expect(await moveCardAndReadToast()).toEqual([RETRY_ADVICE]);
  });
});
