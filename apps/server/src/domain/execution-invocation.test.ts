import { expect, spyOn, test } from "bun:test";
import { Elysia } from "elysia";
import { Result } from "better-result";
import { createRequestLogger, initLogger } from "evlog";
import type { ExecutionFailed as Outcome } from "./kernel";
import { createTestDatabase } from "../../test/database";

initLogger({ enabled: false });
await createTestDatabase();
const { compose, query, run, serve, ExecutionFailed } = await import("./kernel");
const { Viewer } = await import("./viewer");

for (const concurrent of [false, true]) {
  test(`an outcome cannot cross ${concurrent ? "concurrent" : "sequential"} invocations of the same op`, async () => {
    const ready = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const original = new Error("first request error");
    let captured: Outcome | undefined;
    const child = query({ action: "test.child", failure: "Child text" }, async () => {
      throw original;
    });
    const owner = compose(
      {
        action: "test.owner",
        failure: "Owner text",
        steps: [child],
        before: async (_scope, input: { capture: boolean }) => Result.ok(input),
      },
      async (scope, input) => {
        if (input.capture) {
          const result = await scope.execute(child, {});
          if (result.isErr() && ExecutionFailed.is(result.error)) captured = result.error;
          ready.resolve();
          await release.promise;
          return Result.ok(1);
        }
        if (!captured) throw new Error("Expected a captured outcome");
        return Result.err(captured);
      },
    );
    const first = run(
      Viewer.fromSession({ user: { id: "first-user" } }),
      owner,
      { capture: true },
      createRequestLogger(),
    );
    await ready.promise;
    if (!concurrent) {
      release.resolve();
      await first;
    }
    const log = createRequestLogger();
    const logged = spyOn(log, "error");
    const fields = spyOn(log, "set");
    try {
      const viewer = Viewer.fromSession({ user: { id: "second-user" } });
      const app = new Elysia().get("/", () => serve({ viewer, log }, owner, { capture: false }));
      const response = await app.handle(new Request("http://localhost/"));
      expect({ status: response.status, body: await response.text() }).toEqual({
        status: 500,
        body: "Owner text",
      });
      expect(logged).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls[0]?.[0]).toBe(original);
      expect(logged.mock.calls[0]?.[1]).toEqual({ step: "test.owner", childAction: "test.child" });
      expect(fields).toHaveBeenCalledWith({ action: "test.owner", user: { id: "second-user" } });
    } finally {
      release.resolve();
      await first;
      logged.mockRestore();
      fields.mockRestore();
    }
  });
}
