import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { failureOf } from "../../test/request-answers";

let sessionRechecks = 0;
const realAuthClient = await import("@/lib/auth-client");
await mock.module("@/lib/auth-client", () => ({
  ...realAuthClient,
  recheckSession: async () => {
    sessionRechecks++;
  },
}));
const { getReleaseCalendar } = await import("@/queries/dashboard");
const { getItem } = await import("@/queries/item");
const { getOrder, moveItem } = await import("@/queries/orders");
const { retrySyncSession } = await import("@/queries/sync");
const { getVersion } = await import("@/queries/version");
const { sync } = await import("@/data/resources/sync");

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  sessionRechecks = 0;
});

function answerWith(respond: () => Promise<Response>) {
  globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
}

const unreachable = async (): Promise<Response> => {
  throw new TypeError("Failed to fetch");
};

const body = (status: number, text: string, contentType: string) => async () =>
  new Response(text, { status, headers: { "content-type": contentType } });

const ORDER_FALLBACK = "Couldn't load this order. Check your connection and try again.";
const RETRY_FALLBACK = "Failed to retry failed item results";
const VERSION_FALLBACK = "Failed to get version";
const STREAM_FALLBACK = "Failed to connect to job status stream";
const PARSER_TEXT = "JSON Parse error: Unrecognized token '<'";

const validation = JSON.stringify({ type: "validation", message: "Expected string" });
const gatewayPage = "<html><body><h1>502 Bad Gateway</h1></body></html>";

type Case = {
  readonly answer: () => Promise<Response>;
  /** The failure's tag, the same under every policy. */
  readonly tag: string;
  /** getUserErrorMessage: a 4xx text body with a visible character, otherwise the fallback. */
  readonly safe: string;
  /** getErrorMessage, which shows what the server or fetch said. */
  readonly legacy: string;
  /** The version read shows a JSON body's `message`, or the fetch error's. */
  readonly version: string;
};

const cases = {
  "no response arrives (Eden's synthetic 503)": {
    tag: "ApiUnreachable",
    answer: unreachable,
    safe: ORDER_FALLBACK,
    legacy: "TypeError: Failed to fetch",
    version: "Failed to fetch",
  },
  "a real 503 with a text body": {
    tag: "ApiServerError",
    answer: body(503, "Service Unavailable", "text/plain"),
    safe: ORDER_FALLBACK,
    legacy: "Service Unavailable",
    version: VERSION_FALLBACK,
  },
  "a 500 with text": {
    tag: "ApiServerError",
    answer: body(500, "Failed to get order", "text/plain"),
    safe: ORDER_FALLBACK,
    legacy: "Failed to get order",
    version: VERSION_FALLBACK,
  },
  "a 500 with a JSON body": {
    tag: "ApiServerError",
    answer: body(500, JSON.stringify({ message: "lane forced failure" }), "application/json"),
    safe: ORDER_FALLBACK,
    legacy: "[object Object]",
    version: "lane forced failure",
  },
  "a 502 gateway page": {
    tag: "ApiServerError",
    answer: body(502, gatewayPage, "text/html"),
    safe: ORDER_FALLBACK,
    legacy: gatewayPage,
    version: VERSION_FALLBACK,
  },
  "a 422 validation body": {
    tag: "ApiInvalid",
    answer: body(422, validation, "application/json"),
    safe: ORDER_FALLBACK,
    legacy: "Expected string",
    version: "Expected string",
  },
  "a 401 without a message": {
    tag: "ApiRejected",
    answer: body(401, "", "text/plain"),
    safe: ORDER_FALLBACK,
    legacy: RETRY_FALLBACK,
    version: VERSION_FALLBACK,
  },
  "a 404 with text": {
    tag: "ApiNotFound",
    answer: body(404, "Order not found", "text/plain"),
    safe: "Order not found",
    legacy: "Order not found",
    version: VERSION_FALLBACK,
  },
  "a 404 whose text is only an invisible character": {
    tag: "ApiNotFound",
    answer: body(404, "​", "text/plain"),
    safe: ORDER_FALLBACK,
    legacy: "​",
    version: VERSION_FALLBACK,
  },
  "a 409 with text": {
    tag: "ApiRejected",
    answer: body(409, "Order changed", "text/plain"),
    safe: "Order changed",
    legacy: "Order changed",
    version: VERSION_FALLBACK,
  },
  "a 429 whose text is only whitespace": {
    tag: "ApiRejected",
    answer: body(429, "   ", "text/plain"),
    safe: ORDER_FALLBACK,
    legacy: "   ",
    version: VERSION_FALLBACK,
  },
  "a 3xx answer": {
    tag: "ApiRejected",
    answer: body(302, "moved", "text/plain"),
    safe: ORDER_FALLBACK,
    legacy: "moved",
    version: VERSION_FALLBACK,
  },
  "a JSON content type whose body is not JSON": {
    tag: "ApiUnreadable",
    answer: body(200, "<html>", "application/json"),
    safe: PARSER_TEXT,
    legacy: PARSER_TEXT,
    version: PARSER_TEXT,
  },
  "an error status whose JSON body is not JSON": {
    tag: "ApiUnreadable",
    answer: body(500, "<html>", "application/json"),
    safe: PARSER_TEXT,
    legacy: PARSER_TEXT,
    version: PARSER_TEXT,
  },
} satisfies Record<string, Case>;

describe.each(Object.entries(cases))("%s", (_name, { answer, tag, safe, legacy, version }) => {
  test("a safe read shows the server's 4xx text or its fallback", async () => {
    answerWith(answer);
    expect(await failureOf(getOrder("od-alpha"))).toMatchObject({ _tag: tag, message: safe });
  });

  test("a legacy write shows what the server or fetch said", async () => {
    answerWith(answer);
    expect(await failureOf(retrySyncSession("session-1"))).toMatchObject({
      _tag: tag,
      message: legacy,
    });
  });

  test("the version read shows a body's message", async () => {
    answerWith(answer);
    expect(await failureOf(getVersion())).toMatchObject({ _tag: tag, message: version });
  });

  test("the job status stream shows one fixed text", async () => {
    answerWith(answer);
    const watch = sync.jobStatus.options({ jobId: "job-1", onEnd: () => {} });
    const expected = version === PARSER_TEXT ? PARSER_TEXT : STREAM_FALLBACK;
    expect(await failureOf(new QueryClient().fetchQuery(watch))).toMatchObject({
      message: expected,
    });
  });
});

describe("a read that names its own 422 text", () => {
  test("shows it for a validation body", async () => {
    answerWith(body(422, validation, "application/json"));
    expect(await failureOf(getReleaseCalendar(13, 2026))).toMatchObject({
      _tag: "ApiInvalid",
      message: "Invalid month or year",
    });
  });

  test("shows the server's text for a 422 with visible text", async () => {
    answerWith(body(422, "Month out of range", "text/plain"));
    expect(await failureOf(getReleaseCalendar(13, 2026))).toMatchObject({
      message: "Month out of range",
    });
  });

  test("keeps its general fallback for other failures", async () => {
    answerWith(unreachable);
    expect(await failureOf(getReleaseCalendar(1, 2026))).toMatchObject({
      message: "Failed to get release calendar",
    });
  });
});

describe("a read that requires data", () => {
  test("fails with its empty text when a 2xx has no body", async () => {
    answerWith(body(200, "", "text/plain"));
    expect(await failureOf(getOrder("od-alpha"))).toMatchObject({
      _tag: "ApiUnreadable",
      message: "Failed to get order",
    });
  });

  test("a write without that check passes an empty 2xx through", async () => {
    answerWith(body(200, "", "text/plain"));
    expect(await retrySyncSession("session-1")).toMatchObject({ status: "ok", value: "" });
  });
});

describe("a read whose screen has its own not-found view", () => {
  test("answers no item for a 404", async () => {
    answerWith(body(404, "Item not found", "text/plain"));
    expect(await getItem(98_777)).toMatchObject({ status: "ok", value: null });
  });

  test("fails with its fallback for any other failure", async () => {
    answerWith(body(500, "Failed to get item", "text/plain"));
    expect(await failureOf(getItem(98_777))).toMatchObject({ message: "Failed to get item" });
  });
});

describe("a move whose target is gone", () => {
  test("fails with the server's 404 text", async () => {
    answerWith(body(404, "Order items not found", "text/plain"));
    expect(await failureOf(moveItem("od-2", new Set(["c-1"])))).toMatchObject({
      _tag: "MoveTargetGone",
      message: "Order items not found",
    });
  });

  test("fails with an empty text for an empty 404", async () => {
    answerWith(body(404, "", "text/plain"));
    expect(await failureOf(moveItem("od-2", new Set(["c-1"])))).toMatchObject({ message: "" });
  });

  test("fails with its fallback for any other failure", async () => {
    answerWith(body(500, "Move crashed", "text/plain"));
    expect(await failureOf(moveItem("od-2", new Set(["c-1"])))).toMatchObject({
      message: "Failed to move items",
    });
  });
});

test("a 401 rechecks the session before the failure is decoded", async () => {
  answerWith(body(401, "", "text/plain"));
  await failureOf(getOrder("od-alpha"));
  expect(sessionRechecks).toBe(1);
});
