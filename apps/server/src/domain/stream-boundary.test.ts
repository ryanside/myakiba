import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { Elysia, sse } from "elysia";
import { Panic, Result, panic } from "better-result";
import { createRequestLogger, initLogger } from "evlog";
import { createTestDatabase } from "../../test/database";

initLogger({ enabled: false });
afterEach(() => mock.restore());
await createTestDatabase();
const { serve, stream, query } = await import("./kernel");
const { Viewer } = await import("./viewer");
const viewer = Viewer.fromSession({ user: { id: "viewer-1" } });

for (const phase of ["first", "after event", "poll"] as const) {
  for (const ending of ["throw", "panic"] as const) {
    test(`a stream owns its distinct child's ${ending} in ${phase}`, async () => {
      let reads = 0;
      const original = new Error("private child read error");
      const child = query({ action: "test.readChild", failure: "Child read failed" }, async () => {
        reads += 1;
        if (phase === "first" || reads === 2) {
          if (ending === "panic") panic("private child read invariant");
          throw original;
        }
        return Result.ok("ready" as const);
      });
      const event = (message: string, terminalState: string | null) =>
        sse({ data: { message, terminalState } });
      const op = stream(
        {
          action: "test.streamOwner",
          failure: "Parent stream failed",
          onError: (message: string) => event(message, "error"),
        },
        async function* (scope) {
          const first = await scope.readOrThrow(child, {});
          yield event(first.unwrap(), null);
          if (phase === "poll") {
            const polled = await scope.poll(child, {});
            if (polled.isErr()) {
              yield event(first.unwrap(), null);
              yield event((await scope.readOrThrow(child, {})).unwrap(), "success");
              return;
            }
          } else await scope.readOrThrow(child, {});
        },
      );
      const log = createRequestLogger();
      const logged = spyOn(log, "error");
      const app = new Elysia().get("/", async function* () {
        return yield* serve({ viewer, log }, op, {});
      });
      const response = await app.handle(new Request("http://localhost/"));
      const body = await response.text();
      expect(response.status).toBe(phase === "first" ? 500 : 200);
      if (phase === "poll" && ending === "throw")
        expect(body).toContain('"terminalState":"success"');
      else expect(body).toContain("Parent stream failed");
      expect(body).not.toContain("Child read failed");
      expect(body).not.toContain(original.message);
      expect(body).not.toContain("private child read invariant");
      expect(logged).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls[0]?.[1]).toEqual({
        step: "test.streamOwner",
        childAction: "test.readChild",
      });
      if (ending === "panic") expect(logged.mock.calls[0]?.[0]).toBeInstanceOf(Panic);
      else expect(logged.mock.calls[0]?.[0]).toBe(original);
    });
  }
}
