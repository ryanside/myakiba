import { afterEach, describe, expect, test } from "bun:test";
import { itemId } from "../test/fake-browser";
import { armCollector, runArmed, stopCollector } from "./collect";
import type { CollectRequest } from "./collect";

const REQUEST: CollectRequest = { kind: "page", mode: "fetch", mfcItemId: itemId(1) };

afterEach(() => {
  globalThis.myakibaCollectRequest = undefined;
  globalThis.myakibaCollectAbort = undefined;
});

describe("the functions injected into the MFC tab", () => {
  test("a stop that lands before the collector runs still aborts its fetch", async () => {
    armCollector(REQUEST);
    stopCollector();

    expect(await runArmed(async (_request, signal) => signal.aborted)).toBe(true);
  });

  test("a stop that lands while the collector runs aborts its fetch", async () => {
    armCollector(REQUEST);
    const running = runArmed(
      (_request, signal) =>
        new Promise<boolean>((resolve) => {
          signal.addEventListener("abort", () => resolve(true));
        }),
    );
    stopCollector();

    expect(await running).toBe(true);
  });

  test("a stop that lands after the collector finished aborts nothing", async () => {
    armCollector(REQUEST);
    const signal = await runArmed(async (_request, running) => running);
    stopCollector();

    expect(signal.aborted).toBe(false);
  });
});
