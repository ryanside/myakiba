import { afterEach, expect, test } from "bun:test";
import { getRefreshStatus, requestRefresh } from "@/queries/item";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const callers = [
  ["refresh status", () => getRefreshStatus(1), "Failed to check item refresh status"],
  [
    "refresh item",
    () => requestRefresh(1, { page: new File(["page"], "page.html") }),
    "Failed to request item refresh",
  ],
] as const;

for (const [screen, request, fallback] of callers) {
  test(`${screen} hides server, validator and network details`, async () => {
    for (const respond of [
      async () => new Response("private server failure", { status: 500 }),
      async () => Response.json({ message: "Expected string" }, { status: 422 }),
      async (): Promise<Response> => {
        throw new TypeError("Failed to fetch");
      },
    ]) {
      globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
      expect(await request()).toMatchObject({ status: "error", error: { message: fallback } });
    }
  });
}
