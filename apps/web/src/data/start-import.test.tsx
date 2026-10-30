import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SUPPORTED_BROWSERS, listIn, browseWith } from "../../test/extension-browser";

const [CHROME] = SUPPORTED_BROWSERS;
browseWith(CHROME.userAgent);
listIn(CHROME.store);
const { ExtensionRequiredDialog } =
  await import("@/components/extension/extension-required-dialog");
const { dismissMissingExtension } = await import("@/lib/extension-gate");
const { useRefreshItem } = await import("./resources/item");

const realFetch = globalThis.fetch;
const requests: string[] = [];

afterEach(() => {
  cleanup();
  dismissMissingExtension();
  globalThis.fetch = realFetch;
  requests.length = 0;
});

test("an Item Refresh without the extension sends nothing and shows how to install it", async () => {
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
  const { result } = renderHook(() => useRefreshItem(), { wrapper });

  let started: Awaited<ReturnType<typeof result.current.run>> | undefined;
  await act(async () => {
    started = await result.current.run(98_777);
  });

  expect(started).toMatchObject({ status: "error", error: { kind: "absent" } });
  expect(
    await screen.findByRole("dialog", { name: "Install the myakiba extension first" }),
  ).toBeDefined();
  expect(requests).toEqual([]);
});
