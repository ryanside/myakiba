import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { FormApi } from "@tanstack/react-form";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "@/components/ui/toast";
import { SYNC_OPTION_META } from "@/lib/sync";

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useNavigate: () => async () => {},
}));
const realGate = await import("@/lib/extension-gate");
await mock.module("@/lib/extension-gate", () => ({
  ...realGate,
  requireExtension: async () => true,
}));
const { useSyncMutations } = await import("./use-sync-mutations");

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

function answerWith(respond: () => Promise<Response>) {
  globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
}

async function submitCollectionAndReadToast() {
  const added = spyOn(toast, "add");
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const { result } = renderHook(() => useSyncMutations(), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  let rejection: Error | null = null;
  let submitted: Awaited<ReturnType<typeof result.current.handleSyncCollectionSubmit>> | undefined;
  await act(async () => {
    try {
      const form = new FormApi({
        defaultValues: {},
        onSubmit: async () => {
          submitted = await result.current.handleSyncCollectionSubmit([]);
        },
      });
      form.mount();
      await form.handleSubmit();
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      rejection = error;
    }
  });
  const [options] = added.mock.calls.at(-1) ?? [];
  added.mockRestore();
  return { options, rejection, submitted };
}

const failureToast = (description: string) => ({
  type: "error",
  title: SYNC_OPTION_META.collection.failureTitle,
  description,
  actionProps: { children: "View import history" },
});

test("a sync the server refuses shows safe text and settles the form submit", async () => {
  answerWith(async () => new Response("Failed to queue order creation", { status: 500 }));

  const { options, rejection, submitted } = await submitCollectionAndReadToast();

  expect(options).toMatchObject(failureToast("Failed to submit collection items"));
  expect(rejection).toBeNull();
  expect(submitted).toBe("not_sent");
});

test("a sync that never reaches the server shows safe text", async () => {
  answerWith(async () => {
    throw new TypeError("Failed to fetch");
  });

  const { options } = await submitCollectionAndReadToast();

  expect(options).toMatchObject(failureToast("Failed to submit collection items"));
});

test("a sync refused with only whitespace shows the form's own text", async () => {
  answerWith(async () => new Response("   ", { status: 429 }));

  const { options } = await submitCollectionAndReadToast();

  expect(options).toMatchObject(failureToast("Failed to submit collection items"));
});

test("a sync whose answer breaks its success handling shows the safe text, never the defect's message", async () => {
  answerWith(async () => Response.json({ jobId: "job-1", syncSessionId: "session-1" }));
  const error = spyOn(console, "error").mockImplementation(() => {});

  const { options, rejection, submitted } = await submitCollectionAndReadToast();

  expect(options).toMatchObject(
    failureToast("Something went wrong. Reload the page and try again"),
  );
  expect(rejection).toBeNull();
  expect(submitted).toBe("not_sent");
  expect(error).toHaveBeenCalledTimes(1);
  error.mockRestore();
});

test("TanStack Form rethrows a rejection from onSubmit", async () => {
  const failure = new Error("submit failed");
  const form = new FormApi({ defaultValues: {}, onSubmit: () => Promise.reject(failure) });
  form.mount();
  await expect(form.handleSubmit()).rejects.toBe(failure);
  expect(form.state.isSubmitting).toBe(false);
});
