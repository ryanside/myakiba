import { describe, expect, spyOn, test } from "bun:test";
import { Panic, Result } from "better-result";
import { memoryValue } from "../test/fake-browser";
import { SessionStorageUnavailable } from "./errors/session-storage-unavailable";
import { remembered, sessionValue } from "./session-value";
import type { SessionValue } from "./session-value";
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
    const value = sessionValue(area, "throttle", throttleStateSchema);
    await value.save(PAUSED);

    expect(area.items).toEqual({ throttle: PAUSED });
    expect(await loaded(value)).toEqual(PAUSED);
  });

  test("reads as nothing stored before anything was saved", async () => {
    const value = sessionValue(memoryArea(), "throttle", throttleStateSchema);

    expect(await loaded(value)).toBeUndefined();
  });

  test("reads a stored value that fails its schema as nothing stored", async () => {
    const area = {
      ...memoryArea(),
      /** Storage answers untyped values, as Response.json does. */
      get: () => new Response('{"throttle":{"nextPageAt":"soon"}}').json(),
    };
    const value = sessionValue(area, "throttle", throttleStateSchema);

    expect(await loaded(value)).toBeUndefined();
  });
});

describe("a session value whose storage fails", () => {
  const refused = () => Promise.reject(new Error("storage is gone"));

  test("answers a refused read as SessionStorageUnavailable for its key", async () => {
    const value = sessionValue({ ...memoryArea(), get: refused }, "throttle", throttleStateSchema);
    const read = await value.load();

    expect(read.isErr() && SessionStorageUnavailable.is(read.error) && read.error).toMatchObject({
      key: "throttle",
      op: "get",
    });
  });

  test("answers a refused write as SessionStorageUnavailable for its key", async () => {
    const value = sessionValue({ ...memoryArea(), set: refused }, "ownedTab", throttleStateSchema);
    const written = await value.save(PAUSED);

    expect(written.isErr() && written.error).toMatchObject({
      _tag: "SessionStorageUnavailable",
      key: "ownedTab",
      op: "set",
      cause: new Error("storage is gone"),
    });
  });
});

describe("a remembered session value", () => {
  test("reads storage once, then answers from memory what was last set", async () => {
    const stored = memoryValue(PAUSED);
    let reads = 0;
    const value = remembered(
      {
        load: () => {
          reads += 1;
          return stored.load();
        },
        save: stored.save,
      },
      OPEN_THROTTLE,
    );
    await Promise.all([value.ready(), value.ready()]);
    const first = value.get();
    const written = value.set(OPEN_THROTTLE);
    const second = value.get();
    await written;
    await value.ready();

    expect([first, second]).toEqual([PAUSED, OPEN_THROTTLE]);
    expect(stored.peek()).toEqual(OPEN_THROTTLE);
    expect(reads).toBe(1);
  });

  test("starts from its fallback when nothing is stored", async () => {
    const value = remembered(
      sessionValue(memoryArea(), "throttle", throttleStateSchema),
      OPEN_THROTTLE,
    );
    await value.ready();

    expect(value.get()).toEqual(OPEN_THROTTLE);
  });

  test("starts from its fallback when storage will not read, and logs why", async () => {
    const unavailable = new SessionStorageUnavailable({ key: "throttle", op: "get", cause: null });
    const value = remembered(
      { load: async () => Result.err(unavailable), save: async () => Result.ok() },
      OPEN_THROTTLE,
    );
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      await value.ready();

      expect(value.get()).toEqual(OPEN_THROTTLE);
      expect(warn).toHaveBeenCalledWith(`SessionStorageUnavailable: ${unavailable.message}`);
    } finally {
      warn.mockRestore();
    }
  });

  test("keeps a value storage will not write, and answers why", async () => {
    const value = remembered(
      {
        load: async () => Result.ok(OPEN_THROTTLE),
        save: async () =>
          Result.err(new SessionStorageUnavailable({ key: "throttle", op: "set", cause: null })),
      },
      OPEN_THROTTLE,
    );
    await value.ready();
    const written = await value.set(PAUSED);

    expect(written.isErr() && SessionStorageUnavailable.is(written.error)).toBe(true);
    expect(value.get()).toEqual(PAUSED);
  });

  test("whose read throws reports a Panic, and reads again on the next call", async () => {
    let reads = 0;
    const value = remembered(
      {
        load: async () => {
          reads += 1;
          if (reads === 1) throw new Error("storage broke");
          return Result.ok(PAUSED);
        },
        save: async () => Result.ok(),
      },
      OPEN_THROTTLE,
    );

    await expect(value.ready()).rejects.toBeInstanceOf(Panic);
    await value.ready();
    expect(value.get()).toEqual(PAUSED);
  });

  test("read before it is ready is a defect", () => {
    const value = remembered(memoryValue(PAUSED), OPEN_THROTTLE);

    expect(() => value.get()).toThrow(Panic);
  });
});
