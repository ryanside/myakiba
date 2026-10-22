import { describe, expect, test } from "bun:test";
import { itemId } from "../test/fake-browser";
import { EMPTY_QUEUE, reduceQueue } from "./queue";
import type { Job, QueueAction, Requester, RunKey } from "./queue";
import { THROTTLE } from "./throttle";

const START = 1_000_000;
const HOUR = 60 * 60_000;
const REQUESTER: Requester = { tabId: 1, context: { incognito: false, cookieStoreId: null } };

const job = (id: number): Job => ({ mfcItemId: itemId(id), context: REQUESTER.context });

function submitted(run: string, ids: readonly number[], at: number): QueueAction {
  return {
    type: "submitted",
    run: run as RunKey,
    requester: REQUESTER,
    mfcItemIds: ids.map(itemId),
    at,
  };
}

function limited(id: number, at: number, pauseMs: number): QueueAction {
  return {
    type: "answered",
    job: job(id),
    outcome: { kind: "rate_limited", pausedUntil: at + pauseMs },
    at,
  };
}

function answered(id: number, at: number, ok: boolean): QueueAction {
  const result = ok
    ? ({ ok: true, html: `<html>${id}</html>`, picture: null } as const)
    : ({ ok: false, error: "challenge_unsolved" } as const);
  return { type: "answered", job: job(id), outcome: { kind: "result", result }, at };
}

function play(actions: readonly QueueAction[]) {
  let state = EMPTY_QUEUE;
  const emitted: { readonly run: string; readonly event: unknown }[] = [];
  for (const action of actions) {
    const step = reduceQueue(state, action);
    state = step.state;
    emitted.push(...step.emit);
  }
  return {
    state,
    eventsOf: (run: string) =>
      emitted.filter((emission) => emission.run === run).map((emission) => emission.event),
  };
}

const STARTED: QueueAction = { type: "started" };

describe("rate limits in the queue", () => {
  test("one an hour after a cancelled backoff gets one backoff and a retry", () => {
    const later = START + HOUR;
    const { eventsOf } = play([
      submitted("a", [1], START),
      STARTED,
      limited(1, START, 10_000),
      { type: "cancelled", run: "a" as RunKey },
      submitted("b", [2], later),
      STARTED,
      limited(2, later, 10_000),
      STARTED,
      answered(2, later + 10_000, true),
    ]);

    expect(eventsOf("b")).toEqual([
      { type: "status", state: "queued", mfcItemId: null, untilMs: null },
      { type: "status", state: "fetching", mfcItemId: itemId(2), untilMs: null },
      { type: "status", state: "backing_off", mfcItemId: itemId(2), untilMs: later + 10_000 },
      {
        type: "item",
        mfcItemId: itemId(2),
        result: { ok: true, html: "<html>2</html>", picture: null },
      },
      { type: "done", reason: "complete" },
    ]);
  });

  test("a second within ten minutes halts every run for five minutes, or twice what MFC asked", () => {
    const { state, eventsOf } = play([
      submitted("a", [1, 2], START),
      STARTED,
      limited(1, START, 200_000),
      limited(1, START + 200_000, 200_000),
    ]);

    expect(state.mode).toEqual({ kind: "halted", until: START + 200_000 + 400_000 });
    expect(eventsOf("a").filter((event) => (event as { type: string }).type === "item")).toEqual([
      { type: "item", mfcItemId: itemId(1), result: { ok: false, error: "rate_limited" } },
      { type: "item", mfcItemId: itemId(2), result: { ok: false, error: "rate_limited" } },
    ]);
  });

  test("a halt fails new runs until its pause has passed", () => {
    const haltedAt = START + 5000;
    const until = haltedAt + THROTTLE.maxPauseMs;
    const { eventsOf } = play([
      submitted("a", [1], START),
      STARTED,
      limited(1, START, 5000),
      limited(1, haltedAt, 5000),
      submitted("early", [3], until - 1),
      submitted("later", [3], until),
    ]);

    expect(eventsOf("early")).toEqual([
      { type: "item", mfcItemId: itemId(3), result: { ok: false, error: "rate_limited" } },
      { type: "done", reason: "complete" },
    ]);
    expect(eventsOf("later")).toEqual([
      { type: "status", state: "queued", mfcItemId: null, untilMs: null },
    ]);
  });
});

describe("an unsolved challenge in the queue", () => {
  test("fails only the runs open now, and the next run starts fresh", () => {
    const { state, eventsOf } = play([
      submitted("a", [7, 8], START),
      submitted("b", [9], START),
      STARTED,
      answered(7, START, false),
      submitted("c", [7], START),
    ]);

    const unsolved = { ok: false, error: "challenge_unsolved" };
    expect(eventsOf("a").slice(-3)).toEqual([
      { type: "item", mfcItemId: itemId(7), result: unsolved },
      { type: "item", mfcItemId: itemId(8), result: unsolved },
      { type: "done", reason: "complete" },
    ]);
    expect(eventsOf("b").slice(-2)).toEqual([
      { type: "item", mfcItemId: itemId(9), result: unsolved },
      { type: "done", reason: "complete" },
    ]);
    expect(eventsOf("c")).toEqual([
      { type: "status", state: "queued", mfcItemId: null, untilMs: null },
    ]);
    expect(state.mode).toEqual({ kind: "running" });
  });
});
