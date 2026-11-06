import { afterEach, describe, expect, test } from "bun:test";
import { createList, getLists } from "@/queries/lists";
import { ApiError, shownMessageOf } from "./api-response";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function answerWith(respond: () => Promise<Response>) {
  globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
}

async function failureOf(load: () => Promise<object>): Promise<ApiError> {
  try {
    await load();
  } catch (error) {
    if (error instanceof ApiError) return error;
  }
  throw new Error("the request did not reject with an ApiError");
}

test.each([400, 409, 500, 503])(
  "a failed List save keeps its diagnostic, its %d status and the server's body",
  async (status) => {
    answerWith(async () => new Response("Server detail", { status }));

    const error = await failureOf(() => createList({ title: "My List", description: "" }));

    expect({ message: error.message, status: error.status, cause: error.cause }).toEqual({
      message: "Failed to create list",
      status,
      cause: "Server detail",
    });
  },
);

test("a request that never reaches the server keeps the network error as its cause", async () => {
  const offline = new TypeError("Failed to fetch");
  answerWith(async () => {
    throw offline;
  });

  const error = await failureOf(() => getLists(25, 0));

  expect({ message: error.message, status: error.status, cause: error.cause }).toEqual({
    message: "Failed to get lists",
    status: 503,
    cause: offline,
  });
  expect(shownMessageOf(error)).toBe("The server didn't answer.");
});

test("a read answered without data fails with the answer's status", async () => {
  answerWith(async () => Response.json(null));

  const error = await failureOf(() => getLists(25, 0));

  expect({ message: error.message, status: error.status }).toEqual({
    message: "Failed to get lists",
    status: 200,
  });
});

describe("shownMessageOf", () => {
  test.each([400, 401, 404, 409, 499])("returns the server's %d text", (status) => {
    expect(
      shownMessageOf(new ApiError("Failed", status, { cause: "Order not found" }), "Try again."),
    ).toBe("Order not found");
  });

  test.each([
    ["a 5xx text body", new ApiError("Failed", 500, { cause: "Internal failure" })],
    ["a 503 outage", new ApiError("Failed", 503, { cause: "Service Unavailable" })],
    ["an answer without data", new ApiError("Failed", 200)],
    ["an error that is not an ApiError", new Error("Order not found")],
    ["no error", null],
  ])("returns the fallback for %s", (_name, error) => {
    expect(shownMessageOf(error, "Try again.")).toBe("Try again.");
    expect(shownMessageOf(error)).toBe("The server didn't answer.");
  });

  test.each([
    ["a blank body", new ApiError("Failed", 400, { cause: " \n\t " })],
    ["zero-width spaces", new ApiError("Failed", 400, { cause: "​​" })],
    ["a validation object", new ApiError("Failed", 422, { cause: { message: "Expected string" } })],
  ])("returns the fallback, or says the request was rejected, for %s", (_name, error) => {
    expect(shownMessageOf(error, "Try again.")).toBe("Try again.");
    expect(shownMessageOf(error)).toBe("The server rejected this request.");
  });
});
