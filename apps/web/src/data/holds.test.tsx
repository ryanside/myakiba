import { afterEach, expect, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { Result } from "better-result";
import type { ReactNode } from "react";
import { ApiServerError } from "@/lib/errors/api-server-error";
import { defineCommand, Holds, useHeld, useResourceMutation } from "./client";

afterEach(cleanup);

const holds = new Holds();
let finishWrite: (saved: boolean) => void = () => {};
let finishRefetch: () => void = () => {};

const command = defineCommand({
  invalidates: ["orders"],
  holds: { in: holds, keys: (_queryClient, orderId: string) => [orderId] },
  refetchBy: "settled",
  persist: (_orderId: string) =>
    new Promise<Result<null, ApiServerError>>((resolve) => {
      finishWrite = (saved) =>
        resolve(
          saved
            ? Result.ok(null)
            : Result.err(new ApiServerError({ status: 500, body: "no", message: "no" })),
        );
    }),
});

const throwing = defineCommand({
  invalidates: ["orders"],
  holds: { in: holds, keys: (_queryClient, orderId: string) => [orderId] },
  persist: async (_orderId: string) =>
    Result.err(new ApiServerError({ status: 500, body: "no", message: "no" })),
  failureToast: () => {
    throw new Error("a defect while failing");
  },
});

function render(queryClient: QueryClient) {
  return renderHook(
    () => ({
      write: useResourceMutation(command),
      broken: useResourceMutation(throwing),
      held: useHeld(holds),
    }),
    {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    },
  );
}

/** An Orders query on screen whose refetch lands only when the test says. */
function shownOrders(queryClient: QueryClient) {
  queryClient.setQueryData(["orders", {}], "first");
  new QueryObserver(queryClient, {
    queryKey: ["orders", {}],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () =>
      new Promise<string>((resolve) => {
        finishRefetch = () => resolve("refetched");
      }),
  }).subscribe(() => {});
}

test.each([
  ["saves", true],
  ["fails", false],
])("a write that %s holds its key until its refetch lands", async (_outcome, saved) => {
  const queryClient = new QueryClient();
  shownOrders(queryClient);
  const { result } = render(queryClient);

  let done: Promise<unknown> = Promise.resolve();
  await act(async () => {
    done = result.current.write.run("o1");
  });
  const whileWriting = [result.current.held("o1"), result.current.held("o2")];
  await act(async () => finishWrite(saved));
  await waitFor(() => expect(queryClient.isFetching({ queryKey: ["orders"] })).toBe(1));
  const whileRefetching = result.current.held("o1");
  await act(async () => {
    finishRefetch();
    await done;
  });

  expect({ whileWriting, whileRefetching, after: result.current.held("o1") }).toEqual({
    whileWriting: [true, false],
    whileRefetching: true,
    after: false,
  });
});

test("a write that throws while it fails lets go of its key", async () => {
  const { result } = render(new QueryClient());

  await act(async () => {
    await result.current.broken.run("o1");
  });

  expect(result.current.held("o1")).toBe(false);
});

test("two writes on one key hold it until the second settles", async () => {
  const queryClient = new QueryClient();
  const { result } = render(queryClient);
  const finishes: ((saved: boolean) => void)[] = [];

  let first: Promise<unknown> = Promise.resolve();
  let second: Promise<unknown> = Promise.resolve();
  await act(async () => {
    first = result.current.write.run("o1");
  });
  finishes.push(finishWrite);
  await act(async () => {
    second = result.current.write.run("o1");
  });
  finishes.push(finishWrite);
  await act(async () => {
    finishes[0]?.(true);
    await first;
  });
  const afterFirst = result.current.held("o1");
  await act(async () => {
    finishes[1]?.(true);
    await second;
  });

  expect({ afterFirst, afterSecond: result.current.held("o1") }).toEqual({
    afterFirst: true,
    afterSecond: false,
  });
});
