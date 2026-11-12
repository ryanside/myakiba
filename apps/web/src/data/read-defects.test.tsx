import { afterEach, expect, spyOn, test } from "bun:test";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { Result } from "better-result";
import type { ReactNode } from "react";
import { call } from "./api";
import { createQueryClient, rootedRead, useRead } from "./client";

afterEach(cleanup);

function readingWith<Failure>(load: () => Promise<Result<unknown, Failure>>) {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retryDelay: 0 } });
  const read = rootedRead("collection", { key: () => ["collection", "defect"] as const, load });
  return renderHook(() => useRead(read), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

test("a read defect that is retried is logged once with what was thrown", async () => {
  const logged = spyOn(console, "error").mockImplementation(() => {});
  const thrown = new TypeError("cannot read properties of undefined (reading 'items')");
  let loads = 0;
  const { result } = readingWith<never>(async () => {
    loads += 1;
    throw thrown;
  });

  await waitFor(() => expect(result.current.isError).toBe(true));
  const reported = logged.mock.calls.filter((args) => args.includes(thrown));
  logged.mockRestore();
  expect(loads).toBeGreaterThan(1);
  expect(result.current.error?.message).toBe("Something went wrong. Reload the page and try again");
  expect(reported).toHaveLength(1);
});

test("an unreadable answer is not logged as a defect, and keeps the reader's error as its cause", async () => {
  const logged = spyOn(console, "error").mockImplementation(() => {});
  const unparsed = new SyntaxError("JSON Parse error: Unrecognized token '<'");
  const { result } = readingWith(async () =>
    call(Promise.reject(unparsed), { fallback: "Failed to get collection" }),
  );

  await waitFor(() => expect(result.current.isError).toBe(true));
  const calls = logged.mock.calls.length;
  logged.mockRestore();
  expect(result.current.error).toMatchObject({
    _tag: "ApiUnreadable",
    message: "Failed to get collection",
    cause: unparsed,
  });
  expect(calls).toBe(0);
});
