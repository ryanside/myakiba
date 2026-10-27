import { answerAuth, resetAuthAnswers } from "../../test/better-auth";
import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Result, UnhandledException } from "better-result";
import type { ReactNode } from "react";

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useRouter: () => ({
    invalidate: async () => {
      throw new TypeError("cannot read properties of undefined (reading 'routeTree')");
    },
  }),
}));
const realLists = await import("@/queries/lists");
await mock.module("@/queries/lists", () => ({
  ...realLists,
  moveLists: async () => {
    throw new TypeError("cannot read properties of undefined (reading 'order')");
  },
}));

const { toast } = await import("@/components/ui/toast");
const { usePreferencesSave } = await import("./resources/settings");
const { useMoveListsMutation } = await import("@/hooks/use-lists");
const { defineCommand, messageAs, useResourceMutation } = await import("./client");

const DEFECT_TEXT = "Something went wrong. Reload the page and try again";

afterEach(() => {
  cleanup();
  resetAuthAnswers();
});

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

async function lastToastAfter<Outcome>(write: () => Promise<Outcome>) {
  const added = spyOn(toast, "add");
  const error = spyOn(console, "error").mockImplementation(() => {});
  await act(async () => {
    await write();
  });
  const [options] = added.mock.calls.at(-1) ?? [];
  const logged = error.mock.calls;
  added.mockRestore();
  error.mockRestore();
  return { options, reported: logged.length, logged };
}

test("a defect in a List reorder shows the safe text under the reorder's title", async () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["lists", "overview"], {
    pages: [{ items: [{ id: "l1" }, { id: "l2" }], totalCount: 2, limit: 50, offset: 0 }],
    pageParams: [0],
  });
  const { result } = renderHook(() => useMoveListsMutation(), {
    wrapper: wrapperFor(queryClient),
  });

  const { options, reported } = await lastToastAfter(() =>
    result.current.move({ movedIds: ["l1"], anchorId: null, placement: "after" }),
  );

  expect(options).toEqual({
    type: "error",
    title: "Failed to save List order",
    description: DEFECT_TEXT,
  });
  expect(reported).toBe(1);
});

test("a defect in a Preferences save shows the safe text under the save's title", async () => {
  answerAuth(() => Response.json({ status: true }));
  const { result } = renderHook(() => usePreferencesSave(), {
    wrapper: wrapperFor(new QueryClient()),
  });

  const { options, reported } = await lastToastAfter(() =>
    result.current.save({ currency: "EUR" }),
  );

  expect(options).toEqual({
    type: "error",
    title: "Failed to update preferences",
    description: DEFECT_TEXT,
  });
  expect(reported).toBe(1);
});

test.each([
  ["an untagged error", new Error("duplicate key value violates unique constraint")],
  [
    "an UnhandledException",
    new UnhandledException({ cause: new Error("duplicate key value violates unique constraint") }),
  ],
])(
  "a write whose persist fails with %s shows only the safe text and logs it",
  async (_name, failure) => {
    const command = defineCommand({
      invalidates: "nothing",
      persist: async (_note: string) => Result.err(failure),
      failureToast: messageAs("description", () => "Failed to save note"),
    });
    const { result } = renderHook(() => useResourceMutation(command), {
      wrapper: wrapperFor(new QueryClient()),
    });

    let saved: Awaited<ReturnType<typeof result.current.run>> | undefined;
    const { options, logged } = await lastToastAfter(async () => {
      saved = await result.current.run("a note");
    });

    expect(options).toEqual({
      type: "error",
      title: "Failed to save note",
      description: DEFECT_TEXT,
    });
    expect(saved?.isErr() && saved.error.message).toBe(DEFECT_TEXT);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain(failure);
  },
);
