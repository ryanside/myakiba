import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "@/components/ui/toast";
import { useResourceMutation } from "../client";
import { updateKanbanOrderPaidCommand, updateKanbanOrderStatusCommand } from "./dashboard";

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

function answerWith(respond: (...request: Parameters<typeof fetch>) => Promise<Response>) {
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

  await act(() => result.current.run({ orderId: "od-alpha", status: "Shipped" }));
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

describe("a kanban Paid write", () => {
  async function markPaid(paid: boolean) {
    const added = spyOn(toast, "add");
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useResourceMutation(updateKanbanOrderPaidCommand), {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    await act(() => result.current.run({ orderId: "od-alpha", paid }));
    const toasts = added.mock.calls.map(([options]) => options);
    added.mockRestore();
    return toasts;
  }

  test("sets Paid on the Order and every Order Item through an Order fill", async () => {
    const sent: { url: string; method: string; body: unknown }[] = [];
    answerWith(async (...args: Parameters<typeof fetch>) => {
      const request = new Request(...args);
      sent.push({ url: request.url, method: request.method, body: await request.json() });
      return Response.json("Order updated successfully");
    });

    expect(await markPaid(true)).toEqual([]);
    expect(sent).toEqual([
      {
        url: expect.stringMatching(/\/api\/orders\/fill$/),
        method: "PUT",
        body: { orderIds: ["od-alpha"], fill: { field: "paid", value: true } },
      },
    ]);
  });

  test("shows retry advice when the server answers 500", async () => {
    answerWith(async () => Response.json({ message: "lane forced failure" }, { status: 500 }));

    expect(await markPaid(false)).toEqual([
      { type: "error", title: "Failed to update Paid. Please try again." },
    ]);
  });
});
