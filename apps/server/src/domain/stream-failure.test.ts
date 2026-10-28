import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { Elysia, sse } from "elysia";
import { Panic, Result, panic } from "better-result";
import { createRequestLogger, initLogger } from "evlog";
import { createTestDatabase } from "../../test/database";

initLogger({ enabled: false });
afterEach(() => mock.restore());
await createTestDatabase();
const { serve, stream } = await import("./kernel");
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

const status = {
  jobId: "stream-job",
  phase: "importing",
  statusMessage: "Importing",
  progress: null,
  recentItems: [],
  error: null,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  terminalState: null,
} as const;

for (const kind of ["sync", "data transfer"] as const) {
  for (const defect of ["panic", "throw"] as const) {
    test(`a ${kind} read ${defect} terminates without another poll`, async () => {
      const { jobStatusSubscriptionRegistry } =
        await import("@/lib/job-status-subscription-registry");
      const timing = await import("@/lib/job-status-stream");
      const unsubscribe = mock(async () => {});
      spyOn(jobStatusSubscriptionRegistry, "subscribe").mockResolvedValue({
        next: () => new Promise(() => {}),
        unsubscribe,
      });
      spyOn(timing, "waitForNextJobStatusEvent").mockResolvedValue({ kind: "heartbeat" });
      let now = Date.now();
      spyOn(Date, "now").mockImplementation(() => {
        now += 31_000;
        return now;
      });
      let reads = 0;
      const read = () => {
        reads += 1;
        if (reads > 2) {
          if (defect === "panic") panic("internal read defect");
          throw new Error("internal read defect");
        }
        return status;
      };
      const { default: syncService } = await import("@/routers/sync/service");
      const { SyncRequests } = await import("@/routers/sync/module");
      const { default: DataTransferService } = await import("@/routers/data-transfer/service");
      const { DataTransfer } = await import("@/routers/data-transfer/module");
      spyOn(syncService, "getJobStatus").mockImplementation(async () => Result.ok(read()));
      spyOn(DataTransferService, "getImportJobStatus").mockImplementation(async () => read());
      const log = createRequestLogger();
      const logged = spyOn(log, "error");
      const app = new Elysia().get("/", async function* (ctx) {
        if (kind === "sync")
          return yield* serve({ viewer, log }, SyncRequests.stream, {
            jobId: status.jobId,
            signal: ctx.request.signal,
          });
        else
          return yield* serve({ viewer, log }, DataTransfer.stream, { signal: ctx.request.signal });
      });
      const response = await app.handle(new Request("http://localhost/"));
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(body).toContain('"terminalState":"error"');
      expect(body).toContain(
        kind === "sync" ? "Error fetching job status" : "Failed to check import status.",
      );
      expect(body).not.toContain("internal read defect");
      expect(reads).toBe(3);
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(logged).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls[0]?.[1]).toEqual({
        step: kind === "sync" ? "sync.jobStatus" : "dataTransfer.importStatus",
      });
    });
  }
}
