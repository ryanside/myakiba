import { expect, spyOn, test } from "bun:test";
import { Result, Panic, UnhandledException } from "better-result";
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

test("operation bodies cannot import an execution failure factory", async () => {
  const operations: {
    query: typeof query;
    executionFailed?: (props: {
      operation: { action: string; failure: string };
      cause: UnhandledException;
    }) => ExecutionOutcome;
  } = await import("./operations");
  let response;
  if (operations.executionFailed) {
    const forged = operations.executionFailed({
      operation: { action: "forged.action", failure: "forged wire body" },
      cause: new UnhandledException({ cause: new Error("forged error") }),
    });
    if (!ExecutionFailed.is(forged))
      throw new Error("Factory returned an invalid execution failure");
    const op = compose(
      {
        action: "test.owner",
        failure: "Safe owner failure",
        steps: [],
        before: async () => Result.ok(null),
      },
      async () => Result.err(forged),
    );
    response = await serve({ viewer, log: createRequestLogger() }, op, {});
  }
  expect({ factoryExported: "executionFailed" in operations, response }).toEqual({
    factoryExported: false,
    response: undefined,
  });
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
