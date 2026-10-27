import { afterEach, describe, expect, test } from "bun:test";
import { exportDataTransfer } from "./data-transfer";
import { requestResync } from "./item";
import { retrySyncSession } from "./sync";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function answerWith(respond: () => Promise<Response>) {
  globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
}

const calls = [
  [
    "an item refresh request",
    () => requestResync(1001, { page: "<html></html>" }),
    "Failed to request item refresh",
  ],
  ["an import retry", () => retrySyncSession("session-1"), "Failed to retry failed item results"],
  ["a data export", () => exportDataTransfer(), "Failed to export your data"],
] as const;

describe.each(calls)("%s uses safe error text", (_name, call, fallback) => {
  test("a 500 shows the operation fallback", async () => {
    answerWith(async () => new Response("Failed to queue order creation", { status: 500 }));
    expect(await call()).toMatchObject({
      status: "error",
      error: {
        message: fallback,
      },
    });
  });

  test("a 422 shows the operation fallback", async () => {
    answerWith(async () =>
      Response.json({ type: "validation", message: "Expected string" }, { status: 422 }),
    );
    expect(await call()).toMatchObject({ status: "error", error: { message: fallback } });
  });

  test("an unreachable server shows the operation fallback", async () => {
    answerWith(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await call()).toMatchObject({
      status: "error",
      error: {
        message: fallback,
      },
    });
  });
});
