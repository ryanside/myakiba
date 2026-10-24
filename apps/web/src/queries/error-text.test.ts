import { afterEach, describe, expect, test } from "bun:test";
import { failureOf } from "../../test/request-answers";
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
  ["an item refresh request", () => requestResync(1001, { page: "<html></html>" })],
  ["an import retry", () => retrySyncSession("session-1")],
  ["a data export", () => exportDataTransfer()],
] as const;

describe.each(calls)("%s keeps the error text it had before F1", (_name, call) => {
  test("a 500 shows the server's text", async () => {
    answerWith(async () => new Response("Failed to queue order creation", { status: 500 }));
    expect(await failureOf<unknown>(call())).toMatchObject({
      message: "Failed to queue order creation",
    });
  });

  test("a 422 shows the validator's message", async () => {
    answerWith(async () =>
      Response.json({ type: "validation", message: "Expected string" }, { status: 422 }),
    );
    expect(await failureOf<unknown>(call())).toMatchObject({ message: "Expected string" });
  });

  test("an unreachable server shows the fetch error's text", async () => {
    answerWith(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await failureOf<unknown>(call())).toMatchObject({
      message: "TypeError: Failed to fetch",
    });
  });
});
