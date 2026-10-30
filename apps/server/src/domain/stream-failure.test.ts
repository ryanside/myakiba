import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { Elysia, sse } from "elysia";
import { Panic, Result, panic } from "better-result";
import { createRequestLogger, initLogger } from "evlog";
import { createTestDatabase } from "../../test/database";
import { Failure } from "./failure";

initLogger({ enabled: false });
afterEach(() => mock.restore());
await createTestDatabase();
const { ExecutionFailed, query, serve, stream } = await import("./kernel");
const { Viewer } = await import("./viewer");
const viewer = Viewer.fromSession({ user: { id: "viewer-1" } });

for (const phase of ["factory", "first next", "after event"] as const) {
  for (const defect of ["panic", "throw"] as const) {
    test(`a stream ${defect} in ${phase} logs once and answers safely`, async () => {
      const fail = () => {
        if (defect === "panic") panic("internal stream defect");
        throw new Error("internal stream defect");
      };
      const event = (terminalState: string | null, message: string) =>
        sse({ data: { terminalState, message } });
      const operation = stream(
        {
          action: "test.stream",
          failure: "Safe stream failure",
          onError: (message: string) => event("error", message),
        },
        () => {
          if (phase === "factory") fail();
          return (async function* () {
            if (phase === "first next") fail();
            yield event(null, "ready");
            fail();
          })();
        },
      );
      const log = createRequestLogger();
      const logged = spyOn(log, "error");
      const app = new Elysia().get("/", async function* () {
        return yield* serve({ viewer, log }, operation, {});
      });
      const response = await app.handle(new Request("http://localhost/"));
      const body = await response.text();
      expect(response.status).toBe(phase === "after event" ? 200 : 500);
      expect(body).not.toContain("internal stream defect");
      if (phase === "after event") {
        expect(body).toContain('data: {"terminalState":null,"message":"ready"}');
        expect(body).toContain('data: {"terminalState":"error","message":"Safe stream failure"}');
      } else expect(body).toBe("Safe stream failure");
      expect(logged).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls[0]?.[1]).toEqual({ step: "test.stream" });
      if (defect === "panic") expect(logged.mock.calls[0]?.[0]).toBeInstanceOf(Panic);
    });
  }
}

type Status = { readonly terminalState: "success" | "error" | null; readonly message: string };

const WORKING: Status = { terminalState: null, message: "Working" };
const RECOVERED: Status = { terminalState: "success", message: "Recovered" };
const statusEvent = (data: Status) => sse({ data });

const StatusMissing = Failure("StatusMissing", "not_found", "Status not found");

/** A stream shaped like a status feed: an initial read, a replay read, then polling reads. */
function pollingStream(read: (call: number) => Result<Status, InstanceType<typeof StatusMissing>>) {
  let reads = 0;
  const readStatus = query(
    { action: "test.statusRead", failure: "Safe read failure" },
    async (): Promise<Result<Status, InstanceType<typeof StatusMissing>>> => {
      reads += 1;
      return read(reads);
    },
  );
  const ended = (message: string) => statusEvent({ terminalState: "error", message });
  const operation = stream(
    {
      action: "test.statusStream",
      failure: "Safe status failure",
      onError: (message: string, last: { readonly data: Status }) =>
        statusEvent({ ...last.data, terminalState: "error", message }),
    },
    (scope) =>
      (async function* () {
        const initial = await scope.readOrThrow(readStatus, {});
        if (initial.isErr()) {
          yield ended(initial.error.message);
          return;
        }
        let last = initial.value;
        yield statusEvent(last);
        const replay = await scope.readOrThrow(readStatus, {});
        if (replay.isErr()) {
          yield ended(replay.error.message);
          return;
        }
        last = replay.value;
        while (last.terminalState === null) {
          const polled = await scope.poll(readStatus, {});
          if (polled.isErr()) {
            if (!ExecutionFailed.is(polled.error)) {
              yield ended(polled.error.message);
              return;
            }
          } else last = polled.value;
          yield statusEvent(last);
        }
      })(),
  );
  return { operation, reads: () => reads };
}

const readCases = [
  ["panic", 1, "first read panic answers a logged safe 500"],
  ["panic", 3, "read panic terminates without another poll"],
  ["throw", 1, "first read throw answers a logged safe 500"],
  ["throw", 3, "polling read throw retries with the last status and recovers"],
] as const;

for (const [defect, failAt, description] of readCases) {
  test(`a polling stream ${description}`, async () => {
    const original = new Error("internal read failure");
    const { operation, reads } = pollingStream((call) => {
      if (call === failAt) {
        if (defect === "panic") panic("internal read defect");
        throw original;
      }
      return Result.ok(failAt === 3 && call > failAt ? RECOVERED : WORKING);
    });
    const log = createRequestLogger();
    const logged = spyOn(log, "error");
    const app = new Elysia().get("/", async function* () {
      return yield* serve({ viewer, log }, operation, {});
    });
    const response = await app.handle(new Request("http://localhost/"));
    const body = await response.text();
    expect(response.status).toBe(failAt === 1 ? 500 : 200);
    if (failAt === 3 && defect === "throw") {
      const events = body.split("\n\n").filter(Boolean);
      expect(events).toHaveLength(3);
      expect(events[1]).toBe(events[0]);
      expect(events[2]).toContain('"terminalState":"success"');
      expect(events[2]).toContain('"message":"Recovered"');
      expect(reads()).toBe(4);
    } else {
      if (failAt === 3) expect(body).toContain('"terminalState":"error"');
      expect(body).toContain("Safe status failure");
      expect(reads()).toBe(failAt);
    }
    expect(body).not.toContain("internal read defect");
    expect(body).not.toContain(original.message);
    expect(logged).toHaveBeenCalledTimes(1);
    if (defect === "panic") expect(logged.mock.calls[0]?.[0]).toBeInstanceOf(Panic);
    else expect(logged.mock.calls[0]?.[0]).toBe(original);
    expect(logged.mock.calls[0]?.[1]).toEqual({
      step: "test.statusStream",
      childAction: "test.statusRead",
    });
  });
}

for (const [phase, missingAt] of [
  ["initial", 1],
  ["replay", 2],
  ["polling", 3],
] as const) {
  test(`a missing status in ${phase} records the not_found outcome`, async () => {
    const { operation, reads } = pollingStream((call) =>
      call === missingAt ? Result.err(new StatusMissing()) : Result.ok(WORKING),
    );
    const log = createRequestLogger();
    const logged = spyOn(log, "error");
    const fields = spyOn(log, "set");
    const app = new Elysia().get("/", async function* () {
      return yield* serve({ viewer, log }, operation, {});
    });
    const response = await app.handle(new Request("http://localhost/"));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("Status not found");
    expect(body).toContain('"terminalState":"error"');
    expect(reads()).toBe(missingAt);
    expect(logged).not.toHaveBeenCalled();
    expect(fields).toHaveBeenCalledWith({ outcome: "not_found" });
  });
}
