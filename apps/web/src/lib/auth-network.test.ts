import { expect, test } from "bun:test";
import { decodeAuth } from "./auth-client";
import { AuthRequestFailed } from "./errors/auth-request-failed";

test("an auth transport rejection answers an Err with its cause and no server status", async () => {
  const cause = new TypeError("Failed to fetch");
  const answer = await decodeAuth(() => Promise.reject(cause));
  expect(answer.isErr()).toBe(true);
  if (answer.isOk()) throw new Error("Expected auth failure");
  expect(AuthRequestFailed.is(answer.error)).toBe(true);
  expect(answer.error).toMatchObject({
    code: null,
    status: null,
    statusText: "",
    cause,
    message: "Couldn't connect. Check your connection and try again.",
  });
});
