import { expect, spyOn, test } from "bun:test";
import { Result, Panic } from "better-result";
import { createRequestLogger, initLogger } from "evlog";
import type { ExecutionFailed as ExecutionOutcome } from "./kernel";
import { createTestDatabase } from "../../test/database";

initLogger({ enabled: false });
await createTestDatabase();
const { compose, query, run, serve, ExecutionFailed } = await import("./kernel");
const { Viewer } = await import("./viewer");
const viewer = Viewer.fromSession({ user: { id: "viewer-1" } });

test("only kernel-created execution failures can forward an outcome", async () => {
  const log = createRequestLogger();
  let captured: ExecutionOutcome | undefined;
  const child = query({ action: "test.child", failure: "Child failed" }, async () => {
    throw new Error("original child error");
  });
  const capture = compose(
    {
      action: "test.capture",
      failure: "Capture failed",
      steps: [child],
      before: async () => Result.ok(null),
    },
    async (scope) => {
      const result = await scope.execute(child, {});
      if (result.isErr() && ExecutionFailed.is(result.error)) captured = result.error;
      return Result.ok(1);
    },
  );
  await run(viewer, capture, {}, log);
  if (!captured) throw new Error("Expected an execution failure to capture");
  expect(ExecutionFailed.is(captured)).toBe(true);
  const forged: ExecutionOutcome = Object.create(captured);
  Object.defineProperty(forged, "operation", {
    value: { action: "forged.action", failure: "forged secret failure" },
  });
  const operation = compose(
    {
      action: "test.owner",
      failure: "Safe owner failure",
      steps: [],
      before: async () => Result.ok(null),
    },
    async () => Result.err(forged),
  );
  const errors = spyOn(log, "error");
  try {
    const response = await serve({ viewer, log }, operation, {});
    expect({ recognized: ExecutionFailed.is(forged), response }).toMatchObject({
      recognized: false,
      response: { code: 500, response: "Safe owner failure" },
    });
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0]?.[0]).toBeInstanceOf(Panic);
    expect(errors.mock.calls[0]?.[1]).toEqual({ step: "test.owner" });
  } finally {
    errors.mockRestore();
  }
});

test("kernel exports only its public operation API and execution guard", async () => {
  expect(Object.keys(await import("./kernel")).toSorted()).toEqual([
    "ExecutionFailed",
    "command",
    "compose",
    "paginate",
    "paginateBy",
    "ping",
    "prepared",
    "query",
    "run",
    "serve",
  ]);
  expect(Object.keys(ExecutionFailed)).toEqual(["is"]);
});

test("a real execution failure cannot have its trusted metadata replaced", async () => {
  const log = createRequestLogger();
  const errors = spyOn(log, "error");
  const child = query({ action: "test.child", failure: "Child failed" }, async () => {
    throw new Error("original child error");
  });
  let mutationRejected = false;
  const operation = compose(
    {
      action: "test.owner",
      failure: "Safe owner failure",
      steps: [child],
      before: async () => Result.ok(null),
    },
    async (scope) => {
      const result = await scope.execute(child, {});
      if (result.isErr()) {
        try {
          Object.assign(result.error, {
            operation: { action: "forged.action", failure: "forged wire body" },
          });
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
          mutationRejected = true;
        }
        expect(() =>
          Object.assign(result.error.operation, { failure: "forged nested body" }),
        ).toThrow(TypeError);
      }
      return result;
    },
  );
  try {
    const response = await serve({ viewer, log }, operation, {});
    expect({ mutationRejected, response }).toMatchObject({
      mutationRejected: true,
      response: { code: 500, response: "Child failed" },
    });
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0]?.[1]).toEqual({ step: "test.child" });
  } finally {
    errors.mockRestore();
  }
});
