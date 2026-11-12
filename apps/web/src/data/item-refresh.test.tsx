import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Panic } from "better-result";
import type { ReactNode } from "react";
import { fakeExtension } from "../../test/fake-extension";
import type { FakeRun } from "../../test/fake-extension";

const realFetch = globalThis.fetch;
let onFetch = (run: FakeRun) => {
  for (const id of run.mfcItemIds) run.item(id);
  run.done("complete");
};
let bridgeBreaks = false;
const extension = fakeExtension({ onFetch: (run) => onFetch(run) });
const { createExtensionBridge } = await import("@/lib/extension-bridge");
const bridge = createExtensionBridge(extension.window);
await mock.module("@/lib/extension-bridge", () => ({
  createExtensionBridge,
  extensionBridge: {
    status: () => ({ kind: "ready", extensionVersion: "0.1.0" }),
    subscribe: () => () => {},
    probe: async () => ({ kind: "ready", extensionVersion: "0.1.0" }),
    fetchItems: (...args: Parameters<typeof bridge.fetchItems>) => {
      if (bridgeBreaks) throw new TypeError("bridge.fetchItems is not a function");
      return bridge.fetchItems(...args);
    },
  },
}));
const { refreshItemCommand } = await import("./resources/item");
const { useResourceMutation } = await import("./client");
const { toast } = await import("@/components/ui/toast");

const toastAdd = spyOn(toast, "add");
const consoleError = spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  onFetch = (run) => {
    for (const id of run.mfcItemIds) run.item(id);
    run.done("complete");
  };
  bridgeBreaks = false;
  toastAdd.mockClear();
  consoleError.mockClear();
});

function serverAnswers(respond: () => Response | Promise<Response>) {
  globalThis.fetch = Object.assign(async () => respond(), { preconnect: realFetch.preconnect });
}

async function refresh(externalId = 98_777) {
  const client = new QueryClient();
  const { result } = renderHook(() => useResourceMutation(refreshItemCommand), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  let saved: Awaited<ReturnType<typeof result.current.run>> | undefined;
  await act(async () => {
    saved = await result.current.run(externalId);
  });
  return saved;
}

const failed = (description: string) => ({
  type: "error",
  title: "Failed to request item refresh",
  description,
});

test.each([
  ["mfc_signed_out", "Sign in to MyFigureCollection to refresh this item"],
  [
    "hidden_or_missing",
    "MyFigureCollection did not find this item. It may be gone, or your Content level in MyFigureCollection's Settings > Account may hide it",
  ],
  ["challenge_unsolved", "The MyFigureCollection security check was not completed"],
  ["rate_limited", "MyFigureCollection asked us to slow down. Try again later"],
  ["timeout", "MyFigureCollection took too long to answer"],
  ["unexpected_page", "MyFigureCollection showed an unexpected page"],
  ["solar_flare", "The extension could not fetch this item"],
])("an extension that answers %s shows why under the title", async (code, text) => {
  onFetch = (run) => {
    run.fail(98_777, code);
    run.done("complete");
  };
  const saved = await refresh();

  expect(saved?.isErr()).toBe(true);
  expect(toastAdd.mock.calls).toEqual([[failed(text)]]);
  expect(consoleError).not.toHaveBeenCalled();
});

test("an extension that stops without the page says so under the title", async () => {
  onFetch = (run) => run.done("interrupted");
  await refresh();

  expect(toastAdd.mock.calls).toEqual([
    [failed("The extension stopped. Reload the page and try again")],
  ]);
  expect(consoleError).not.toHaveBeenCalled();
});

test("an id that is no MFC item says it is not found under the title", async () => {
  await refresh(0);

  expect(toastAdd.mock.calls).toEqual([[failed("Item not found")]]);
  expect(consoleError).not.toHaveBeenCalled();
});

test.each([
  [
    "a refusal with text",
    () => new Response("Rate limit exceeded, try again in 60 seconds", { status: 429 }),
    "Rate limit exceeded, try again in 60 seconds",
  ],
  [
    "a server error",
    () => new Response("relation does not exist", { status: 500 }),
    "Failed to request item refresh",
  ],
  [
    "no answer",
    () => Promise.reject(new TypeError("Failed to fetch")),
    "Failed to request item refresh",
  ],
] as const)(
  "%s from the server shows its safe text under the title",
  async (_name, respond, text) => {
    serverAnswers(respond);
    await refresh();

    expect(toastAdd.mock.calls).toEqual([[failed(text)]]);
    expect(consoleError).not.toHaveBeenCalled();
  },
);

test("a defect in the refresh is reported as a Panic and shows the safe text, not its message", async () => {
  bridgeBreaks = true;
  const saved = await refresh();

  expect(saved?.isErr() && Panic.is(saved.error.cause)).toBe(true);
  expect(consoleError).toHaveBeenCalledTimes(1);
  expect(Panic.is(consoleError.mock.calls[0]?.[0])).toBe(true);
  expect(toastAdd.mock.calls).toEqual([
    [failed("Something went wrong. Reload the page and try again")],
  ]);
});
