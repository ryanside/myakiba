import { describe, expect, test } from "bun:test";
import { itemId } from "../test/fake-browser";
import { EMPTY_QUEUE, reduceQueue } from "./queue";
import type { Job, QueueAction, Requester, RunKey } from "./queue";
import { THROTTLE } from "./throttle";

const START = 1_000_000;
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

function limited(id: number, pausedUntil: number): QueueAction {
  return { type: "answered", job: job(id), outcome: { kind: "rate_limited", pausedUntil } };
}

function halted(id: number, until: number): QueueAction {
  return { type: "answered", job: job(id), outcome: { kind: "halted", until } };
}

function answered(id: number, ok: boolean): QueueAction {
  const result = ok
    ? ({ ok: true, html: `<html>${id}</html>`, picture: null } as const)
    : ({ ok: false, error: "challenge_unsolved" } as const);
  return { type: "answered", job: job(id), outcome: { kind: "result", result } };
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
  test("a rate limit backs off and keeps the item for its retry", () => {
    const { eventsOf } = play([
      submitted("a", [1], START),
      STARTED,
      limited(1, START + 10_000),
      STARTED,
      answered(1, true),
    ]);

    expect(eventsOf("a")).toEqual([
      { type: "status", state: "queued", mfcItemId: null, untilMs: null },
      { type: "status", state: "fetching", mfcItemId: itemId(1), untilMs: null },
      { type: "status", state: "backing_off", mfcItemId: itemId(1), untilMs: START + 10_000 },
      {
        type: "item",
        mfcItemId: itemId(1),
        result: { ok: true, html: "<html>1</html>", picture: null },
      },
      { type: "done", reason: "complete" },
    ]);
  });

  test("a halt fails every run, and new runs until it has passed", () => {
    const until = START + THROTTLE.maxPauseMs;
    const { eventsOf } = play([
      submitted("a", [1, 2], START),
      STARTED,
      halted(1, until),
      submitted("early", [3], until - 1),
      submitted("later", [3], until),
    ]);

    expect(eventsOf("a").slice(-3)).toEqual([
      { type: "item", mfcItemId: itemId(1), result: { ok: false, error: "rate_limited" } },
      { type: "item", mfcItemId: itemId(2), result: { ok: false, error: "rate_limited" } },
      { type: "done", reason: "complete" },
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
      answered(7, false),
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
