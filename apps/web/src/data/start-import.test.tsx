import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Result } from "better-result";
import type { ReactNode } from "react";
import type { WriteFailed } from "@/lib/errors/write-failed";
import type { ExtensionMissing } from "@/lib/extension-gate";
import { SUPPORTED_BROWSERS, listIn, browseWith } from "../../test/extension-browser";

const [CHROME] = SUPPORTED_BROWSERS;
browseWith(CHROME.userAgent);
listIn(CHROME.store);
const { ExtensionRequiredDialog } =
  await import("@/components/extension/extension-required-dialog");
const { dismissMissingExtension } = await import("@/lib/extension-gate");
const { syncSends, useRetrySyncSession, useSyncSubmit } = await import("./resources/sync");
const { useRefreshItem } = await import("./resources/item");

const realFetch = globalThis.fetch;
const requests: string[] = [];

afterEach(() => {
  cleanup();
  dismissMissingExtension();
  globalThis.fetch = realFetch;
  requests.length = 0;
});

const noFeedback = { onSaved: () => {}, onFailed: () => {} };

type Send = (typeof syncSends)[keyof typeof syncSends];
type StartsImport = () => () => Promise<Result<object, WriteFailed | ExtensionMissing>>;

function sending(send: Send): StartsImport {
  return function useSend() {
    const submit = useSyncSubmit<never>(send, noFeedback).send;
    return () => submit(undefined as never);
  };
}

function useSessionRetry() {
  const { run } = useRetrySyncSession();
  return () => run("ss-1");
}

function useItemRefresh() {
  const { run } = useRefreshItem();
  return () => run(98_777);
}

const writes = {
  "an item database sync": sending(syncSends.item),
  "a CSV sync": sending(syncSends.csv),
  "an order sync": sending(syncSends.order),
  "an order item sync": sending(syncSends.orderItem),
  "a collection sync": sending(syncSends.collection),
  "an import's retry": useSessionRetry,
  "an Item Refresh": useItemRefresh,
} satisfies Record<string, StartsImport>;

describe.each(Object.entries(writes))("%s", (_name, useStart) => {
  test("without the extension sends nothing and shows how to install it", async () => {
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(`${init?.method ?? "GET"} ${String(input)}`);
        return Response.json(null);
      },
      { preconnect: realFetch.preconnect },
    );
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    render(<ExtensionRequiredDialog />);
    const { result } = renderHook(useStart, { wrapper });

    let started: Result<object, WriteFailed | ExtensionMissing> | undefined;
    await act(async () => {
      started = await result.current();
    });

    expect(started).toMatchObject({ status: "error", error: { kind: "absent" } });
    expect(
      await screen.findByRole("dialog", { name: "Install the myakiba extension first" }),
    ).toBeDefined();
    expect(requests).toEqual([]);
  });
});
