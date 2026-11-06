import { afterEach, describe, expect, test } from "bun:test";
import { createList, getLists } from "@/queries/lists";
import { ReadError, userMessageOf } from "./read-response";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function answerWith(respond: () => Promise<Response>) {
  globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
}

async function failureOf(load: () => Promise<object>): Promise<ReadError> {
  try {
    await load();
  } catch (error) {
    if (error instanceof ReadError) return error;
  }
  throw new Error("the request did not reject with a ReadError");
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
  expect(userMessageOf(error)).toBeUndefined();
});

test("a read answered without data fails with the answer's status", async () => {
  answerWith(async () => Response.json(null));

  const error = await failureOf(() => getLists(25, 0));

  expect({ message: error.message, status: error.status }).toEqual({
    message: "Failed to get lists",
    status: 200,
  });
});

describe("userMessageOf", () => {
  test.each([400, 401, 404, 409, 499])("returns the server's %d text", (status) => {
    expect(userMessageOf(new ReadError("Failed", status, { cause: "Order not found" }))).toBe(
      "Order not found",
    );
  });

  test.each([
    ["a 5xx text body", new ReadError("Failed", 500, { cause: "Internal failure" })],
    ["a 503 outage", new ReadError("Failed", 503, { cause: "Service Unavailable" })],
    ["a blank body", new ReadError("Failed", 400, { cause: " \n\t " })],
    ["zero-width spaces", new ReadError("Failed", 400, { cause: "​​" })],
    [
      "a validation object",
      new ReadError("Failed", 422, { cause: { message: "Expected string" } }),
    ],
    ["an answer without data", new ReadError("Failed", 200)],
    ["an error that is not a ReadError", new Error("Order not found")],
    ["no error", null],
  ])("returns nothing for %s", (_name, error) => {
    expect(userMessageOf(error)).toBeUndefined();
  });
});
