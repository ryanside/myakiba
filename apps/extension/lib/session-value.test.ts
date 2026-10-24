import { describe, expect, test } from "bun:test";
import type { SessionValue } from "./clock";
import { SessionStorageUnavailable } from "./errors/session-storage-unavailable";
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

describe("a session value whose storage fails", () => {
  const refused = () => Promise.reject(new Error("storage is gone"));

  test("answers a refused read as SessionStorageUnavailable for its key", async () => {
    const value = sessionValue(
      { ...memoryArea(), get: refused },
      "throttle",
      throttleStateSchema,
      OPEN_THROTTLE,
    );
    const read = await value.load();

    expect(read.isErr() && SessionStorageUnavailable.is(read.error) && read.error).toMatchObject({
      key: "throttle",
      op: "get",
    });
  });

  test("answers a refused write as SessionStorageUnavailable for its key", async () => {
    const value = sessionValue(
      { ...memoryArea(), set: refused },
      "ownedTab",
      throttleStateSchema,
      OPEN_THROTTLE,
    );
    const written = await value.save(PAUSED);

    expect(written.isErr() && written.error).toMatchObject({
      _tag: "SessionStorageUnavailable",
      key: "ownedTab",
      op: "set",
      cause: new Error("storage is gone"),
    });
  });
});
