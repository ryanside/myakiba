import { afterEach, describe, expect, mock, test } from "bun:test";
import { failureOf } from "../../test/request-answers";

const realAuthClient = await import("@/lib/auth-client");
await mock.module("@/lib/auth-client", () => ({
  ...realAuthClient,
  recheckSession: async () => {},
}));
const { getDashboard } = await import("./dashboard");
const { getOrder } = await import("./orders");

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function answerWith(respond: () => Promise<Response>) {
  globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
}

const unreachable = async (): Promise<Response> => {
  throw new TypeError("Failed to fetch");
};

const body = (status: number, text: string, contentType: string) => async () =>
  new Response(text, { status, headers: { "content-type": contentType } });

function loadOrder(respond: () => Promise<Response>) {
  answerWith(respond);
  return getOrder("od-alpha");
}

const ORDER_FALLBACK = "Couldn't load this order. Check your connection and try again.";

describe("an order that fails to load", () => {
  test("reads as a connection problem when the server cannot be reached", async () => {
    expect(await failureOf(loadOrder(unreachable))).toMatchObject({ message: ORDER_FALLBACK });
  });

  test("reads as a connection problem when the server answers 500 with a JSON body", async () => {
    const json = JSON.stringify({ message: "lane forced failure" });
    expect(await failureOf(loadOrder(body(500, json, "application/json")))).toMatchObject({
      message: ORDER_FALLBACK,
    });
  });

  test("reads as a connection problem when a gateway answers 502 with a page", async () => {
    const page = "<html><body><h1>502 Bad Gateway</h1></body></html>";
    expect(await failureOf(loadOrder(body(502, page, "text/html")))).toMatchObject({
      message: ORDER_FALLBACK,
    });
  });

  test("reads as a connection problem when the server answers 500 with text", async () => {
    expect(
      await failureOf(loadOrder(body(500, "Failed to get order", "text/plain"))),
    ).toMatchObject({
      message: ORDER_FALLBACK,
    });
  });

  test("reads as a connection problem when the server answers 422 with a validation body", async () => {
    const json = JSON.stringify({ type: "validation", message: "Expected string" });
    expect(await failureOf(loadOrder(body(422, json, "application/json")))).toMatchObject({
      message: ORDER_FALLBACK,
    });
  });

  test("reads as a connection problem when the server answers 401 without a message", async () => {
    expect(await failureOf(loadOrder(body(401, "", "text/plain")))).toMatchObject({
      message: ORDER_FALLBACK,
    });
  });

  test("shows the server's message when the server answers 404 with text", async () => {
    expect(await failureOf(loadOrder(body(404, "Order not found", "text/plain")))).toMatchObject({
      message: "Order not found",
    });
  });
});

test("a dashboard that cannot reach the server fails with a readable message", async () => {
  answerWith(unreachable);
  expect(await failureOf(getDashboard())).toMatchObject({ message: "Failed to get dashboard" });
});
