import { afterEach, describe, expect, mock, test } from "bun:test";
import { Panic } from "better-result";

let sessionRechecks = 0;
const realAuthClient = await import("@/lib/auth-client");
await mock.module("@/lib/auth-client", () => ({
  ...realAuthClient,
  recheckSession: async () => {
    sessionRechecks++;
  },
}));
const { getReleaseCalendar } = await import("@/queries/dashboard");
const { getItem, requestRefresh } = await import("@/queries/item");
const { getOrder, moveItem } = await import("@/queries/orders");
const { getVersion } = await import("@/queries/version");
const { call } = await import("@/data/api");

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
const REFRESH_FALLBACK = "Failed to request item refresh";
const VERSION_FALLBACK = "Failed to get version";

const validation = JSON.stringify({ type: "validation", message: "Expected string" });
const gatewayPage = "<html><body><h1>502 Bad Gateway</h1></body></html>";

type Case = {
  readonly answer: () => Promise<Response>;
  /** The failure's tag, the same under every policy. */
  readonly tag: string;
  /** getUserErrorMessage: a 4xx text body with a visible character, otherwise the fallback. */
  readonly safe: string;
  /** The version read shows a JSON body's `message`, or the fetch error's. */
  readonly version: string;
};

const cases = {
  "no response arrives (Eden's synthetic 503)": {
    tag: "ApiUnreachable",
    answer: unreachable,
    safe: ORDER_FALLBACK,
    version: "Failed to fetch",
  },
  "a real 503 with a text body": {
    tag: "ApiServerError",
    answer: body(503, "Service Unavailable", "text/plain"),
    safe: ORDER_FALLBACK,
    version: VERSION_FALLBACK,
  },
  "a 500 with text": {
    tag: "ApiServerError",
    answer: body(500, "Failed to get order", "text/plain"),
    safe: ORDER_FALLBACK,
    version: VERSION_FALLBACK,
  },
  "a 500 with a JSON body": {
    tag: "ApiServerError",
    answer: body(500, JSON.stringify({ message: "lane forced failure" }), "application/json"),
    safe: ORDER_FALLBACK,
    version: "lane forced failure",
  },
  "a 502 gateway page": {
    tag: "ApiServerError",
    answer: body(502, gatewayPage, "text/html"),
    safe: ORDER_FALLBACK,
    version: VERSION_FALLBACK,
  },
  "a 422 validation body": {
    tag: "ApiInvalid",
    answer: body(422, validation, "application/json"),
    safe: ORDER_FALLBACK,
    version: "Expected string",
  },
  "a 401 without a message": {
    tag: "ApiRejected",
    answer: body(401, "", "text/plain"),
    safe: ORDER_FALLBACK,
    version: VERSION_FALLBACK,
  },
  "a 404 with text": {
    tag: "ApiNotFound",
    answer: body(404, "Order not found", "text/plain"),
    safe: "Order not found",
    version: VERSION_FALLBACK,
  },
  "a 404 whose text is only an invisible character": {
    tag: "ApiNotFound",
    answer: body(404, "​", "text/plain"),
    safe: ORDER_FALLBACK,
    version: VERSION_FALLBACK,
  },
  "a 409 with text": {
    tag: "ApiRejected",
    answer: body(409, "Order changed", "text/plain"),
    safe: "Order changed",
    version: VERSION_FALLBACK,
  },
  "a 429 whose text is only whitespace": {
    tag: "ApiRejected",
    answer: body(429, "   ", "text/plain"),
    safe: ORDER_FALLBACK,
    version: VERSION_FALLBACK,
  },
  "a 3xx answer": {
    tag: "ApiRejected",
    answer: body(302, "moved", "text/plain"),
    safe: ORDER_FALLBACK,
    version: VERSION_FALLBACK,
  },
  "a JSON content type whose body is not JSON": {
    tag: "ApiUnreadable",
    answer: body(200, "<html>", "application/json"),
    safe: ORDER_FALLBACK,
    version: VERSION_FALLBACK,
  },
  "an error status whose JSON body is not JSON": {
    tag: "ApiUnreadable",
    answer: body(500, "<html>", "application/json"),
    safe: ORDER_FALLBACK,
    version: VERSION_FALLBACK,
  },
} satisfies Record<string, Case>;

describe.each(Object.entries(cases))("%s", (_name, { answer, tag, safe, version }) => {
  test("a safe read shows the server's 4xx text or its fallback", async () => {
    answerWith(answer);
    expect(await getOrder("od-alpha")).toMatchObject({
      status: "error",
      error: { _tag: tag, message: safe },
    });
  });

  test("a write shows safe server text or its own fallback", async () => {
    answerWith(answer);
    expect(await requestRefresh(98_777, { page: "<html></html>" })).toMatchObject({
      status: "error",
      error: {
        _tag: tag,
        message: safe === ORDER_FALLBACK ? REFRESH_FALLBACK : safe,
      },
    });
  });

  test("the version read shows a body's message", async () => {
    answerWith(answer);
    expect(await getVersion()).toMatchObject({
      status: "error",
      error: { _tag: tag, message: version },
    });
  });
});

describe("a read that names its own 422 text", () => {
  test("shows it for a validation body", async () => {
    answerWith(body(422, validation, "application/json"));
    expect(await getReleaseCalendar(13, 2026)).toMatchObject({
      status: "error",
      error: {
        _tag: "ApiInvalid",
        message: "Invalid month or year",
      },
    });
  });

  test("shows the server's text for a 422 with visible text", async () => {
    answerWith(body(422, "Month out of range", "text/plain"));
    expect(await getReleaseCalendar(13, 2026)).toMatchObject({
      status: "error",
      error: {
        message: "Month out of range",
      },
    });
  });

  test("keeps its general fallback for other failures", async () => {
    answerWith(unreachable);
    expect(await getReleaseCalendar(1, 2026)).toMatchObject({
      status: "error",
      error: {
        message: "Failed to get release calendar",
      },
    });
  });
});

describe("a read that requires data", () => {
  test("fails with its empty text when a 2xx has no body", async () => {
    answerWith(body(200, "", "text/plain"));
    expect(await getOrder("od-alpha")).toMatchObject({
      status: "error",
      error: {
        _tag: "ApiUnreadable",
        message: "Failed to get order",
      },
    });
  });

  test("a write without that check passes an empty 2xx through", async () => {
    answerWith(body(200, "", "text/plain"));
    expect(await requestRefresh(98_777, { page: "<html></html>" })).toMatchObject({
      status: "ok",
      value: "",
    });
  });
});

describe("a read whose screen has its own not-found view", () => {
  test("answers no item for a 404", async () => {
    answerWith(body(404, "Item not found", "text/plain"));
    expect(await getItem(98_777)).toMatchObject({ status: "ok", value: null });
  });

  test("fails with its fallback for any other failure", async () => {
    answerWith(body(500, "Failed to get item", "text/plain"));
    expect(await getItem(98_777)).toMatchObject({
      status: "error",
      error: { message: "Failed to get item" },
    });
  });
});

describe("a move whose target is gone", () => {
  test("fails with the server's 404 text", async () => {
    answerWith(body(404, "Order items not found", "text/plain"));
    expect(await moveItem("od-2", new Set(["c-1"]))).toMatchObject({
      status: "error",
      error: {
        _tag: "MoveTargetGone",
        message: "Order items not found",
      },
    });
  });

  test("fails with an empty text for an empty 404", async () => {
    answerWith(body(404, "", "text/plain"));
    expect(await moveItem("od-2", new Set(["c-1"]))).toMatchObject({
      status: "error",
      error: { message: "" },
    });
  });

  test("fails with its fallback for any other failure", async () => {
    answerWith(body(500, "Move crashed", "text/plain"));
    expect(await moveItem("od-2", new Set(["c-1"]))).toMatchObject({
      status: "error",
      error: {
        message: "Failed to move items",
      },
    });
  });
});

test("a defect while the answer is read stays a defect", async () => {
  const defect = new Panic({ message: "the answer reader lost its schema" });

  await expect(
    call(Promise.reject(defect), { fallback: "Couldn't load this order." }),
  ).rejects.toBe(defect);
});

test("a 401 rechecks the session before the failure is decoded", async () => {
  answerWith(body(401, "", "text/plain"));
  await getOrder("od-alpha");
  expect(sessionRechecks).toBe(1);
});
