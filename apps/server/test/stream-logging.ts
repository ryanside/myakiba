import { Elysia, sse } from "elysia";
import { panic } from "better-result";
import type { Result } from "better-result";
import { initLogger } from "evlog";
import type { DrainContext } from "evlog";
import { evlog } from "evlog/elysia";
import * as z from "zod";
import { serve, stream, query } from "../src/domain/kernel";
import { Viewer } from "../src/domain/viewer";

const scenario = z
  .enum([
    "success",
    "timeout",
    "aborted",
    "not_found",
    "panic",
    "poll",
    "repeated",
    "messages",
    "initial",
    "close",
    "poll-end",
  ])
  .parse(process.argv[2]);
const events: DrainContext["event"][] = [];
const drain = ({ event }: DrainContext) => {
  events.push(structuredClone(event));
};
initLogger({ enabled: true, silent: true, env: { environment: "production" }, drain });
const viewer = Viewer.fromSession({ user: { id: "stream-viewer" } });
const event = (message: string) => sse({ data: message });
const defect = query(
  {
    action: scenario === "initial" ? "test.initialRead" : "test.panicRead",
    failure: "Child failure",
  },
  async (): Promise<Result<"ready", never>> => {
    panic(scenario === "initial" ? "private initial invariant" : "private stream invariant");
  },
);
let reads = 0;
const polling = query(
  {
    action: scenario === "repeated" ? "test.repeatedPoll" : "test.pollRead",
    failure: "Child failure",
  },
  async (): Promise<Result<"ready", never>> => {
    reads += 1;
    throw scenario === "repeated"
      ? new Error(`poll failure ${reads}`)
      : new Error("private polling failure", { cause: new Error("driver cause") });
  },
);
const op = stream(
  {
    action: scenario === "initial" ? "test.initialStream" : "test.loggedStream",
    failure: scenario === "initial" ? "Safe initial failure" : "Safe stream failure",
    onError: event,
  },
  async function* (scope) {
    if (scenario === "close") {
      try {
        while (true) yield event("ready");
      } finally {
        scope.log.set({ cleanup: true });
      }
    }
    if (scenario === "initial") await scope.readOrThrow(defect, {});
    yield event("ready");
    // The actual plugin's after-response hook runs before the next event-loop turn.
    await Bun.sleep(0);
    if (events.length !== 1)
      throw new Error("Expected the request event before resuming the stream");
    switch (scenario) {
      case "initial":
      case "panic":
        await scope.readOrThrow(defect, {});
        return;
      case "poll-end":
      case "poll":
      case "repeated": {
        const result = await scope.poll(polling, {});
        if (result.isOk()) throw new Error("Expected the polling read to fail");
        yield event("last status");
        if (scenario === "repeated") await scope.poll(polling, {});
        if (scenario !== "poll-end")
          scope.log.set({ outcome: "success", result: { terminalState: "success" } });
        return;
      }
      case "messages":
        scope.log.info("stream still running", { progress: 1 });
        yield event("last status");
        scope.log.warn("stream slow", { progress: 2 });
        scope.log.set({ outcome: "timeout" });
        return;
      case "success":
      case "timeout":
      case "aborted":
      case "not_found":
        yield event("last status");
        scope.log.set({ outcome: scenario, result: { terminalState: scenario } });
    }
  },
);
const app = new Elysia().use(evlog({ drain })).get("/stream", async function* ({ log }) {
  if (!log) throw new Error("evlog must supply the request logger");
  return yield* serve({ viewer, log }, op, {});
});
const response = await app.handle(
  new Request("http://localhost/stream", { headers: { "x-request-id": "stream-request" } }),
);
let text = "";
if (scenario === "close") {
  await Bun.sleep(0);
  await response.body?.cancel();
} else text = await response.text();
await Bun.sleep(0);
process.stdout.write(JSON.stringify({ events, text, status: response.status }));
