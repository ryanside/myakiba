import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { Elysia } from "elysia";
import { Result } from "better-result";
import { createRequestLogger, initLogger } from "evlog";
import type { ExecutionFailed as ExecutionOutcome } from "./kernel";
import { createTestDatabase } from "../../test/database";

initLogger({ enabled: false });
afterEach(() => mock.restore());
await createTestDatabase();
const { compose, command, query, run, serve, ExecutionFailed } = await import("./kernel");
const { Viewer } = await import("./viewer");
const viewer = Viewer.fromSession({ user: { id: "viewer-1" } });

for (const form of ["compose", "compose before", "recovery"] as const) {
  test(`a stashed real outcome belongs to the returning ${form}`, async () => {
    const original = new Error("original child error");
    const child = query({ action: "test.child", failure: "Child secret text" }, async () => {
      throw original;
    });
    let captured: ExecutionOutcome | undefined;
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
    await run(viewer, capture, {}, createRequestLogger());
    if (!captured) throw new Error("Expected a real outcome to capture");
    const stashed = captured;
    const config = { action: "test.unrelated", failure: "Unrelated failure" } as const;
    const unrelated =
      form === "recovery"
        ? command(
            config,
            async () => {
              throw new Error("recover me");
            },
            { recover: async () => Result.err(stashed) },
          )
        : compose(
            {
              ...config,
              steps: [],
              before: async () =>
                form === "compose before" ? Result.err(stashed) : Result.ok(null),
            },
            async () => Result.err(stashed),
          );
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
}
