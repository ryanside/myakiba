import { expect, test } from "bun:test";
import { parseJson } from "@myakiba/utils/parse-json";
import * as z from "zod";

const captureSchema = z.object({
  events: z.array(z.unknown()),
  text: z.string(),
  status: z.number(),
});

/** A runtime process keeps evlog's real ALS lifecycle independent of Bun's test runner. */
async function driveStream(scenario: string) {
  const child = Bun.spawn(
    [
      "bun",
      "--env-file=test.env",
      new URL("../../test/stream-logging.ts", import.meta.url).pathname,
      scenario,
    ],
    {
      cwd: `${import.meta.dir}/../..`,
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [output, errors, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit, errors).toBe(0);
  return { ...parseJson(captureSchema, output).unwrap(), errors };
}

for (const outcome of ["success", "timeout", "aborted", "not_found"] as const) {
  test(`a drained stream end records ${outcome} after request emission`, async () => {
    const { events, status, errors } = await driveStream(outcome);
    expect(status).toBe(200);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ action: "test.loggedStream", requestId: "stream-request" });
    expect(events[1]).toMatchObject({
      requestId: "stream-request",
      action: "test.loggedStream",
      event: "stream.end",
      outcome,
      result: { terminalState: outcome },
    });
    expect(events[0]).not.toHaveProperty("result");
    expect(errors).toBe("");
  });
}

test("a drained post-event Panic keeps its stream step, child action and original error", async () => {
  const { events, text, status } = await driveStream("panic");
  expect(status).toBe(200);
  expect(text).toContain("Safe stream failure");
  expect(text).not.toContain("private stream invariant");
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({
    requestId: "stream-request",
    action: "test.loggedStream",
    outcome: "error",
    step: "test.loggedStream",
    childAction: "test.panicRead",
    error: { name: "Panic", message: "private stream invariant" },
  });
});

test("a drained stream retains a polling failure it survives", async () => {
  const { events, text } = await driveStream("poll");
  expect(text).toContain("last status");
  expect(text).not.toContain("private polling failure");
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({
    requestId: "stream-request",
    action: "test.loggedStream",
    outcome: "success",
    step: "test.loggedStream",
    childAction: "test.pollRead",
    error: { name: "Error", message: "private polling failure" },
    errorCauses: [{ message: "driver cause" }],
  });
});

test("a drained stream retains every polling failure before it completes", async () => {
  const { events } = await driveStream("repeated");
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({
    outcome: "success",
    pollingErrors: [
      {
        step: "test.loggedStream",
        childAction: "test.repeatedPoll",
        error: { message: "poll failure 1" },
      },
      {
        step: "test.loggedStream",
        childAction: "test.repeatedPoll",
        error: { message: "poll failure 2" },
      },
    ],
  });
});

test("a drained stream keeps post-event info and warn messages", async () => {
  const { events } = await driveStream("messages");
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({
    level: "warn",
    outcome: "timeout",
    progress: 2,
    requestLogs: [
      { level: "info", message: "stream still running" },
      { level: "warn", message: "stream slow" },
    ],
  });
});

test("a pre-event Panic stays on the request event with a safe 500", async () => {
  const { events, text, status } = await driveStream("initial");
  expect(status).toBe(500);
  expect(text).toBe("Safe initial failure");
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    outcome: "error",
    step: "test.initialStream",
    childAction: "test.initialRead",
    error: { name: "Panic", message: "private initial invariant" },
  });
});

test("a drained stream end records an unrecovered polling failure when the body ends", async () => {
  const { events } = await driveStream("poll-end");
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({
    outcome: "error",
    step: "test.loggedStream",
    childAction: "test.pollRead",
    error: { message: "private polling failure" },
  });
});

test("closing an Elysia generator drains one aborted end event after cleanup", async () => {
  const { events } = await driveStream("close");
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({
    requestId: "stream-request",
    action: "test.loggedStream",
    outcome: "aborted",
    cleanup: true,
  });
});
