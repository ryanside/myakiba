import { describe, expect, test } from "bun:test";
import { BRIDGE_CHANNEL } from "@myakiba/mfc/bridge";
import { mfcItemId } from "@myakiba/mfc/page";
import type { MfcItemId } from "@myakiba/mfc/page";
import { PAGE_ORIGIN, fakeExtension } from "../../test/fake-extension";
import { createExtensionBridge } from "./extension-bridge";
import type { ExtensionBridge, ExtensionFetchEvent } from "./extension-bridge";

const ids = (...values: number[]): MfcItemId[] =>
  values.map((value) => mfcItemId(value)).filter((id) => id !== null);

async function collect(
  bridge: ExtensionBridge,
  mfcItemIds: readonly MfcItemId[],
  signal = new AbortController().signal,
): Promise<ExtensionFetchEvent[]> {
  const events: ExtensionFetchEvent[] = [];
  for await (const event of bridge.fetchItems(mfcItemIds, { signal })) events.push(event);
  return events;
}

const outcomes = (events: readonly ExtensionFetchEvent[]) =>
  events.flatMap((event): [number, string][] =>
    event.type === "item" ? [[event.mfcItemId, event.result.ok ? "ok" : event.result.error]] : [],
  );

describe("probe", () => {
  test("an extension that answers hello is ready", async () => {
    const extension = fakeExtension();
    const bridge = createExtensionBridge(extension.window);

    expect(bridge.status()).toEqual({ kind: "checking" });
    expect(await bridge.probe()).toEqual({ kind: "ready", extensionVersion: "0.1.0" });
    expect(extension.posted.every((post) => post.targetOrigin === PAGE_ORIGIN)).toBe(true);
  });

  test("an extension that speaks no protocol this page speaks is outdated", async () => {
    const bridge = createExtensionBridge(fakeExtension({ protocols: { min: 0, max: 0 } }).window);

    expect(await bridge.probe()).toEqual({ kind: "outdated", extensionVersion: "0.1.0" });
  });

  test("with no answer within 500 ms the extension is absent", async () => {
    const extension = fakeExtension({ installed: false });
    const bridge = createExtensionBridge(extension.window);
    const started = performance.now();

    expect(await bridge.probe()).toEqual({ kind: "absent" });
    expect(performance.now() - started).toBeGreaterThanOrEqual(500);
    expect(extension.posted.length).toBeGreaterThan(1);
  });

  test("each probe asks afresh, so removing or adding the extension shows on the next one", async () => {
    const extension = fakeExtension();
    const bridge = createExtensionBridge(extension.window);

    const kinds = [];
    kinds.push(await bridge.probe());
    extension.setInstalled(false);
    kinds.push(await bridge.probe());
    extension.setInstalled(true);
    kinds.push(await bridge.probe());

    expect(kinds.map((status) => status.kind)).toEqual(["ready", "absent", "ready"]);
  });

  test("works in a browser without Promise.withResolvers", async () => {
    const { withResolvers } = Promise;
    Reflect.deleteProperty(Promise, "withResolvers");
    try {
      const bridge = createExtensionBridge(fakeExtension().window);

      expect(await bridge.probe()).toEqual({ kind: "ready", extensionVersion: "0.1.0" });
    } finally {
      Promise.withResolvers = withResolvers;
    }
  });

  test("probes that overlap share one round of hellos", async () => {
    const extension = fakeExtension({ installed: false });
    const bridge = createExtensionBridge(extension.window);

    const [first, second] = await Promise.all([bridge.probe(), bridge.probe()]);

    expect([first.kind, second.kind]).toEqual(["absent", "absent"]);
    expect(extension.posted.length).toBeLessThanOrEqual(6);
  });

  test("an unprompted announce makes the extension ready without a hello", () => {
    const extension = fakeExtension({ installed: false });
    const bridge = createExtensionBridge(extension.window);
    const seen: string[] = [];
    bridge.subscribe(() => seen.push(bridge.status().kind));

    extension.announce(null);

    expect(bridge.status().kind).toBe("ready");
    expect(seen).toEqual(["ready"]);
  });

  test("a late answer to an earlier probe does not answer a fresh one", async () => {
    const extension = fakeExtension({ installed: false });
    const bridge = createExtensionBridge(extension.window);
    await bridge.probe();
    const earlierHello = extension.posted[0]?.message.requestId ?? null;

    const fresh = bridge.probe();
    extension.announce(earlierHello);

    expect(await fresh).toEqual({ kind: "absent" });
  });

  test("an unprompted announce updates the status but does not answer a probe", async () => {
    const extension = fakeExtension({ installed: false });
    const bridge = createExtensionBridge(extension.window);

    const probing = bridge.probe();
    extension.announce(null);
    expect(bridge.status().kind).toBe("ready");

    expect(await probing).toEqual({ kind: "absent" });
  });

  test("an outdated extension that goes silent after its update stays outdated", async () => {
    const extension = fakeExtension({ protocols: { min: 0, max: 0 } });
    const bridge = createExtensionBridge(extension.window);
    await bridge.probe();

    extension.setInstalled(false);

    expect(await bridge.probe()).toEqual({ kind: "outdated", extensionVersion: "0.1.0" });
  });

  test("an announce from another origin or another window is ignored", async () => {
    const extension = fakeExtension({ installed: false });
    const bridge = createExtensionBridge(extension.window);
    const announce = {
      channel: BRIDGE_CHANNEL,
      requestId: null,
      event: { type: "announce", extensionVersion: "6.6.6", protocols: { min: 1, max: 1 } },
    };

    extension.deliver(announce, { origin: "https://evil.example" });
    extension.deliver(announce, { source: {} });

    expect(await bridge.probe()).toEqual({ kind: "absent" });
  });
});

describe("fetchItems", () => {
  test("streams one outcome per id and turns picture bytes into a Blob", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;
    const extension = fakeExtension({
      onFetch: (run) => {
        run.status("needs_user", 1);
        run.send({
          type: "item",
          mfcItemId: 1,
          result: { ok: true, html: "<p>1</p>", picture: { bytes, contentType: "image/jpeg" } },
        });
        run.fail(2, "mfc_signed_out");
        run.done("complete");
      },
    });
    const bridge = createExtensionBridge(extension.window);

    const events = await collect(bridge, ids(1, 2));

    expect(events[0]).toEqual({ type: "status", state: "needs_user", untilMs: null });
    expect(outcomes(events)).toEqual([
      [1, "ok"],
      [2, "mfc_signed_out"],
    ]);
    const first = events[1];
    if (first?.type !== "item" || !first.result.ok || !first.result.picture) {
      throw new Error("expected item 1 to arrive with its picture");
    }
    expect(first.result.html).toBe("<p>1</p>");
    expect(first.result.picture.type).toBe("image/jpeg");
    expect(new Uint8Array(await first.result.picture.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    );
  });

  test("an error code from a newer extension reads as unknown", async () => {
    const extension = fakeExtension({
      onFetch: (run) => {
        run.fail(1, "solar_flare");
        run.done("complete");
      },
    });

    expect(outcomes(await collect(createExtensionBridge(extension.window), ids(1)))).toEqual([
      [1, "unknown"],
    ]);
  });

  test("a fetch state, done reason or event type from a newer extension reads as unknown", async () => {
    const extension = fakeExtension({
      onFetch: (run) => {
        run.status("warp_drive", 1);
        run.send({ type: "progress" });
        run.item(1);
        run.done("solar_flare");
      },
    });

    const events = await collect(createExtensionBridge(extension.window), ids(1, 2));

    expect(events[0]).toEqual({ type: "status", state: "unknown", untilMs: null });
    expect(outcomes(events)).toEqual([
      [1, "ok"],
      [2, "extension_stopped"],
    ]);
  });

  test("an item event the page cannot read leaves its id to end as extension_stopped", async () => {
    const extension = fakeExtension({
      onFetch: (run) => {
        run.send({ type: "item", mfcItemId: 1, result: { ok: true } });
        run.send({ type: "teleport", mfcItemId: 1 });
        run.item(2);
        run.item(2);
        run.done("complete");
      },
    });

    expect(outcomes(await collect(createExtensionBridge(extension.window), ids(1, 2)))).toEqual([
      [2, "ok"],
      [1, "extension_stopped"],
    ]);
  });

  test("a closed port ends every unanswered id as extension_stopped", async () => {
    const extension = fakeExtension({
      onFetch: (run) => {
        run.item(1);
        run.done("interrupted");
      },
    });

    expect(outcomes(await collect(createExtensionBridge(extension.window), ids(1, 2, 3)))).toEqual([
      [1, "ok"],
      [2, "extension_stopped"],
      [3, "extension_stopped"],
    ]);
  });

  test("events for another request are not this run's", async () => {
    const extension = fakeExtension({
      onFetch: (run) => {
        extension.emit(crypto.randomUUID(), {
          type: "item",
          mfcItemId: 1,
          result: { ok: false, error: "timeout" },
        });
        run.item(1);
        run.done("complete");
      },
    });

    expect(outcomes(await collect(createExtensionBridge(extension.window), ids(1)))).toEqual([
      [1, "ok"],
    ]);
  });

  test("aborting posts cancel for the run and ends it at once", async () => {
    const controller = new AbortController();
    const extension = fakeExtension({
      onFetch: (run) => {
        run.item(1);
        setTimeout(() => controller.abort(), 10);
      },
    });

    const events = await collect(
      createExtensionBridge(extension.window),
      ids(1, 2, 3),
      controller.signal,
    );

    expect(outcomes(events)).toEqual([
      [1, "ok"],
      [2, "extension_stopped"],
      [3, "extension_stopped"],
    ]);
    expect(extension.cancelled).toEqual(extension.runs.map((run) => run.requestId));
  });
});
