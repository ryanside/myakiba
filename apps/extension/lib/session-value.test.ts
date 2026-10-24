import { describe, expect, test } from "bun:test";
import type { SessionValue } from "./clock";
import { sessionValue } from "./session-value";
import { OPEN_THROTTLE, throttleStateSchema } from "./throttle";
import type { ThrottleState } from "./throttle";

const PAUSED: ThrottleState = { ...OPEN_THROTTLE, pausedUntil: 5000 };

async function loaded(value: SessionValue<ThrottleState>) {
  const read = await value.load();
  return read.unwrap();
}

function memoryArea(initial: Partial<Record<string, ThrottleState>> = {}) {
  const items = { ...initial };
  return {
    items,
    get: async (key: string) => ({ [key]: items[key] }),
    set: async (next: Record<string, ThrottleState>) => {
      Object.assign(items, next);
    },
  };
}

describe("a session value", () => {
  test("reads back what it saved under its key", async () => {
    const area = memoryArea();
    const value = sessionValue(area, "throttle", throttleStateSchema, OPEN_THROTTLE);
    await value.save(PAUSED);

    expect(area.items).toEqual({ throttle: PAUSED });
    expect(await loaded(value)).toEqual(PAUSED);
  });

  test("reads as its fallback before anything was saved", async () => {
    const value = sessionValue(memoryArea(), "throttle", throttleStateSchema, OPEN_THROTTLE);

    expect(await loaded(value)).toEqual(OPEN_THROTTLE);
  });

  test("reads a stored value that fails its schema as its fallback", async () => {
    const area = {
      ...memoryArea(),
      /** Storage answers untyped values, as Response.json does. */
      get: () => new Response('{"throttle":{"nextPageAt":"soon"}}').json(),
    };
    const value = sessionValue(area, "throttle", throttleStateSchema, OPEN_THROTTLE);

    expect(await loaded(value)).toEqual(OPEN_THROTTLE);
  });
});
