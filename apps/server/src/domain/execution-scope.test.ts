import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { Elysia } from "elysia";
import { Result } from "better-result";
import { createRequestLogger, initLogger } from "evlog";
import type { ExecutionFailed as ExecutionOutcome } from "./kernel";
import { createTestDatabase } from "../../test/database";

initLogger({ enabled: false });
afterEach(() => mock.restore());
await createTestDatabase();
const { command, query, serve, ExecutionFailed } = await import("./kernel");
const { Viewer } = await import("./viewer");
const viewer = Viewer.fromSession({ user: { id: "viewer-1" } });
const throwing = async () => {
  throw new Error("recover me");
};

test("a stashed real outcome belongs to the returning recovery", async () => {
  const original = new Error("original child error");
  const child = query({ action: "test.child", failure: "Child secret text" }, async () => {
    throw original;
  });
  let captured: ExecutionOutcome | undefined;
  const capture = command({ action: "test.capture", failure: "Capture failed" }, throwing, {
    recover: async (scope) => {
      const result = await scope.execute(child, {});
      if (result.isErr() && ExecutionFailed.is(result.error)) captured = result.error;
      return Result.ok(1);
    },
  });
  await serve({ viewer, log: createRequestLogger() }, capture, {});
  if (!captured) throw new Error("Expected a real outcome to capture");
  const stashed = captured;
  const unrelated = command({ action: "test.unrelated", failure: "Unrelated failure" }, throwing, {
    recover: async () => Result.err(stashed),
  });
  const log = createRequestLogger();
  const logged = spyOn(log, "error");
  const app = new Elysia().get("/", () => serve({ viewer, log }, unrelated, {}));
  const response = await app.handle(new Request("http://localhost/"));
  const body = await response.text();
  expect({ status: response.status, body }).toEqual({ status: 500, body: "Unrelated failure" });
  expect(logged).toHaveBeenCalledTimes(1);
  expect(logged.mock.calls[0]?.[0]).toBe(original);
  expect(logged.mock.calls[0]?.[1]).toEqual({
    step: "test.unrelated",
    childAction: "test.child",
  });
});
