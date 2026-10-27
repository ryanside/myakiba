import { afterEach, expect, spyOn, test } from "bun:test";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Result } from "better-result";
import type { ReactNode } from "react";
import { ApiUnreachable } from "@/lib/errors/api-unreachable";
import { createQueryClient, rootedRead, useRead } from "./client";

afterEach(cleanup);

function readingWith<Failure>(load: () => Promise<Result<null, Failure>>) {
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
  const reported = logged.mock.calls.filter((call) => call.includes(thrown));
  logged.mockRestore();
  expect(loads).toBeGreaterThan(1);
  expect(result.current.error?.message).toBe("Something went wrong. Reload the page and try again");
  expect(reported).toHaveLength(1);
});

test("a declared read failure is not logged as a defect", async () => {
  const logged = spyOn(console, "error").mockImplementation(() => {});
  const { result } = readingWith(async () =>
    Result.err(new ApiUnreachable({ cause: null, message: "Failed to get collection" })),
  );

  await waitFor(() => expect(result.current.isError).toBe(true));
  const calls = logged.mock.calls.length;
  logged.mockRestore();
  expect(result.current.error?.message).toBe("Failed to get collection");
  expect(calls).toBe(0);
});
