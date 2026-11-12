import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Panic, Result } from "better-result";
import type { ReactNode } from "react";
import { EMAIL_VERIFICATION_REQUIRED } from "@myakiba/contracts/shared/messages";
import { ApiRejected } from "@/lib/errors/api-rejected";

const refresh = async () =>
  Result.err(
    new ApiRejected({
      status: 403,
      body: EMAIL_VERIFICATION_REQUIRED,
      message: EMAIL_VERIFICATION_REQUIRED,
    }),
  );
const realRefresh = await import("@/data/item-refresh");
await mock.module("@/data/item-refresh", () => ({
  ...realRefresh,
  refreshItemWithExtension: () => refresh(),
}));
const realOrders = await import("@/queries/orders");
await mock.module("@/queries/orders", () => ({
  ...realOrders,
  updateOrderStatus: async () => {
    throw new TypeError("cannot read properties of undefined (reading 'status')");
  },
}));

const { toast } = await import("@/components/ui/toast");
const { defineCommand, useResourceMutation } = await import("./client");
const { call } = await import("./api");
const { refreshItemCommand } = await import("./resources/item");
const { updateKanbanOrderStatusCommand } = await import("./resources/dashboard");
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
  const queryClient = new QueryClient();
  const { result } = renderHook(() => useResourceMutation(refreshItemCommand), {
    wrapper: wrapperFor(queryClient),
  });

  expect(await lastToastAfter(() => result.current.run(98_777))).toEqual({
    type: "error",
    title: "Failed to request item refresh",
    description: EMAIL_VERIFICATION_REQUIRED,
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

test.each([
  [
    "words its failures",
    {
      failureToast: (_input: null, failure: Error | null) => ({
        title: "Failed to save",
        ...(failure && { description: failure.message }),
      }),
    },
  ],
  ["words none", { failureToast: () => ({ title: "Failed to save" }) }],
] as const)(
  "a defect in a write whose command %s shows the safe text under its title, never its message",
  async (_name, wording) => {
    const command = defineCommand({
      invalidates: ["wishlist"],
      persist: async (_input: null): Promise<Result<null, Error>> => {
        throw new TypeError("cannot read properties of undefined (reading 'items')");
      },
      ...wording,
    });
    const error = spyOn(console, "error").mockImplementation(() => {});
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useResourceMutation(command), {
      wrapper: wrapperFor(queryClient),
    });

    expect(await lastToastAfter(() => result.current.run(null))).toEqual({
      type: "error",
      title: "Failed to save",
      description: "Something went wrong. Reload the page and try again",
    });
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  },
);

test("a defect while a write's answer is read shows the safe text under its title, never its message", async () => {
  const command = defineCommand({
    invalidates: ["wishlist"],
    persist: (_input: null) =>
      call(Promise.reject(new Panic({ message: "the answer reader lost its schema" })), {
        fallback: "Failed to save",
      }),
    failureToast: (_input, failure) => ({
      title: "Failed to save",
      ...(failure && { description: failure.message }),
    }),
  });
  const error = spyOn(console, "error").mockImplementation(() => {});
  const queryClient = new QueryClient();
  const { result } = renderHook(() => useResourceMutation(command), {
    wrapper: wrapperFor(queryClient),
  });

  expect(await lastToastAfter(() => result.current.run(null))).toEqual({
    type: "error",
    title: "Failed to save",
    description: "Something went wrong. Reload the page and try again",
  });
  expect(error).toHaveBeenCalledTimes(1);
  error.mockRestore();
});

test("a defect in a Kanban status write shows retry advice and the safe text, never its message", async () => {
  const error = spyOn(console, "error").mockImplementation(() => {});
  const queryClient = new QueryClient();
  const { result } = renderHook(() => useResourceMutation(updateKanbanOrderStatusCommand), {
    wrapper: wrapperFor(queryClient),
  });

  expect(
    await lastToastAfter(() => result.current.run({ orderId: "od-alpha", status: "Paid" })),
  ).toEqual({
    type: "error",
    title: "Failed to update order status. Please try again.",
    description: "Something went wrong. Reload the page and try again",
  });
  expect(error).toHaveBeenCalledTimes(1);
  error.mockRestore();
});
