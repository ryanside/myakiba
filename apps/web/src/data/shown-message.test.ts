import { afterEach, describe, expect, test } from "bun:test";
import { Panic, UnhandledException } from "better-result";
import type { Result } from "better-result";
import { ApiInvalid } from "@/lib/errors/api-invalid";
import { ApiNotFound } from "@/lib/errors/api-not-found";
import { ApiRejected } from "@/lib/errors/api-rejected";
import { ApiServerError } from "@/lib/errors/api-server-error";
import { ApiUnreachable } from "@/lib/errors/api-unreachable";
import { ApiUnreadable } from "@/lib/errors/api-unreadable";
import { WriteFailed } from "@/lib/errors/write-failed";
import { createList, getLists } from "@/queries/lists";
import { shownMessageOf } from "./api";
import type { ApiFailure } from "./api";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function answerWith(respond: () => Promise<Response>) {
  globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
}

async function failureOf<Value>(
  load: () => Promise<Result<Value, ApiFailure>>,
): Promise<ApiFailure> {
  const result = await load();
  if (result.isErr()) return result.error;
  throw new Error("the request did not fail");
}

test.each([
  [400, "ApiRejected"],
  [409, "ApiRejected"],
  [500, "ApiServerError"],
  [503, "ApiServerError"],
])("a failed List save keeps its %d status and the server's body", async (status, tag) => {
  answerWith(async () => new Response("Server detail", { status }));

  const failure = await failureOf(() => createList({ title: "My List", description: "" }));

  expect(failure).toMatchObject({ _tag: tag, status, body: "Server detail" });
});

test("a request that never reaches the server keeps the network error as its cause", async () => {
  const offline = new TypeError("Failed to fetch");
  answerWith(async () => {
    throw offline;
  });

  const failure = await failureOf(() => getLists(25, 0));

  expect(failure).toMatchObject({ _tag: "ApiUnreachable", cause: offline });
  expect(shownMessageOf(failure)).toBe("The server didn't answer.");
});

test("a read answered without data fails", async () => {
  answerWith(async () => Response.json(null));

  const failure = await failureOf(() => getLists(25, 0));

  expect(failure).toMatchObject({ _tag: "ApiUnreadable", message: "Failed to get lists" });
  expect(shownMessageOf(failure)).toBe("The server didn't answer.");
});

describe("shownMessageOf", () => {
  test.each([400, 401, 409, 499])("returns the server's %d text", (status) => {
    const failure = new ApiRejected({ status, body: "Order not found", message: "Failed" });
    expect(shownMessageOf(failure, "Try again.")).toBe("Order not found");
  });

  test("returns the server's 404 and 422 text", () => {
    expect(shownMessageOf(new ApiNotFound({ body: "Order not found", message: "Failed" }))).toBe(
      "Order not found",
    );
    expect(shownMessageOf(new ApiInvalid({ body: "Bad month", message: "Failed" }))).toBe(
      "Bad month",
    );
  });

  test.each([
    [
      "a 5xx text body",
      new ApiServerError({ status: 500, body: "Internal failure", message: "Failed" }),
    ],
    [
      "a 503 outage",
      new ApiServerError({ status: 503, body: "Service Unavailable", message: "Failed" }),
    ],
    ["no answer", new ApiUnreachable({ cause: new TypeError("offline"), message: "Failed" })],
    ["an answer without data", new ApiUnreadable({ cause: null, message: "Failed" })],
    ["an error that is not tagged", new Error("Order not found")],
    ["an UnhandledException", new UnhandledException({ cause: new Error("Order not found") })],
    ["no error", null],
  ])("returns the fallback for %s", (_name, error) => {
    expect(shownMessageOf(error, "Try again.")).toBe("Try again.");
    expect(shownMessageOf(error)).toBe("The server didn't answer.");
  });

  test.each([
    ["a blank body", new ApiRejected({ status: 400, body: " \n\t ", message: "Failed" })],
    ["zero-width spaces", new ApiRejected({ status: 400, body: "​​", message: "Failed" })],
    [
      "a validation object",
      new ApiInvalid({ body: { message: "Expected string" }, message: "Failed" }),
    ],
    ["an empty 404", new ApiNotFound({ body: "", message: "Failed" })],
  ])("returns the fallback, or says the request was rejected, for %s", (_name, error) => {
    expect(shownMessageOf(error, "Try again.")).toBe("Try again.");
    expect(shownMessageOf(error)).toBe("The server rejected this request.");
  });

  test("shows the safe message of a defect or another declared failure", () => {
    const defect = new Panic({ message: "Something went wrong. Reload the page and try again" });
    expect(shownMessageOf(defect, "Try again.")).toBe(defect.message);
    const write = new WriteFailed({ cause: new Error("detail"), message: "Couldn't save" });
    expect(shownMessageOf(write, "Try again.")).toBe("Couldn't save");
  });
});
