import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { Elysia } from "elysia";
import { Panic, Result, panic } from "better-result";
import { createRequestLogger, initLogger } from "evlog";
import { createTestDatabase } from "../../test/database";

initLogger({ enabled: false });
afterEach(() => mock.restore());
await createTestDatabase();
const { command, compose, query, serve } = await import("./kernel");
const { Viewer } = await import("./viewer");
const { tagged } = await import("./tagged");
const Outage = tagged("Outage")<{ readonly cause: Error }>;
const original = new Error("internal child failure");
const viewer = Viewer.fromSession({ user: { id: "viewer-1" } });

for (const ending of ["throw", "operational", "panic"] as const) {
  for (const form of ["await", "gen", "recover", "recover gen"] as const) {
    const name = form.startsWith("recover")
      ? `${form} owns a child's ${ending} with parent failure and child diagnostics`
      : `${form} forwards a child's ${ending} as a Result with its own failure and log`;
    test(name, async () => {
      const child = query(
        { action: "test.child", failure: "Child failed", operational: [Outage] },
        async () => {
          if (ending === "panic") panic("internal child defect");
          if (ending === "operational") return Result.err(new Outage({ cause: original }));
          throw original;
        },
      );
      const composition = compose(
        {
          action: "test.parent",
          failure: "Parent failed",
          steps: [child],
          before: async () => Result.ok(null),
        },
        async (scope) => {
          if (form === "gen" || form === "recover gen")
            return Result.gen(async function* () {
              return yield* Result.await(scope.execute(child, {}));
            });
          const result = await scope.execute(child, {});
          expect(result.isErr()).toBe(true);
          return result;
        },
      );
      const recovery = command(
        { action: "test.recovery", failure: "Recovery failed" },
        async () => {
          throw new Error("recover me");
        },
        {
          recover: (scope) =>
            form === "recover gen"
              ? Result.gen(async function* () {
                  return yield* Result.await(scope.execute(composition, {}));
                })
              : scope.execute(composition, {}),
        },
      );
      const operation = form.startsWith("recover") ? recovery : composition;
      const log = createRequestLogger();
      const logged = spyOn(log, "error");
      const app = new Elysia().get("/", () => serve({ viewer, log }, operation, {}));
      const response = await app.handle(new Request("http://localhost/"));
      const body = await response.text();
      const recoveryAnswer = () => serve({ viewer, log }, recovery, {});
      type RecoveryBody = Extract<
        Awaited<ReturnType<typeof recoveryAnswer>>,
        { code: 500 }
      >["response"];
      const recoveryFailure: RecoveryBody = "Recovery failed";
      expect({ status: response.status, body }).toEqual({
        status: 500,
        body: form.startsWith("recover") ? recoveryFailure : "Child failed",
      });
      expect(logged).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls[0]?.[1]).toEqual(
        form.startsWith("recover")
          ? { step: "test.recovery", childAction: "test.child" }
          : { step: "test.child" },
      );
      if (ending === "panic") expect(logged.mock.calls[0]?.[0]).toBeInstanceOf(Panic);
      if (ending === "throw") expect(logged.mock.calls[0]?.[0]).toBe(original);
      if (ending === "operational") expect(logged.mock.calls[0]?.[0]).toBeInstanceOf(Outage);
    });
  }
}
