import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import { MAX_PICK_STORE_BYTES, PICK_TTL_MS } from "@myakiba/contracts/add/constants";
import { fakeStorageArea, ok, itemId } from "../test/fake-browser";
import { createPicks, forgetPrivatePicksOnceClosed } from "./picks";
import type { TabContext } from "./queue";
import { storedBytes } from "./stored-bytes";

const NORMAL: TabContext = { incognito: false, cookieStoreId: null };
const CONTAINER: TabContext = { incognito: false, cookieStoreId: "firefox-container-1" };
const PRIVATE: TabContext = { incognito: true, cookieStoreId: null };
const PICTURE = { base64: "/9j/2Q==", contentType: "image/jpeg" };
const MIB = 1024 * 1024;
/** A time past int32, which Chrome stores as a double and writes as `1.730000000123e+12`. */
const REAL_TIME = 1_730_000_000_123;

function capture(id: number, html = `<html>${id}</html>`) {
  return { mfcItemId: itemId(id), title: `Item ${id}`, html, picture: PICTURE };
}

function store(options: { localQuota?: number; now?: number } = {}) {
  let now = options.now ?? 1_000_000;
  const local = fakeStorageArea(options.localQuota);
  const session = fakeStorageArea();
  const open = () =>
    createPicks({
      local: local.area,
      session: session.area,
      clock: { now: () => now },
    });
  const picks = open();
  const ids = async (context: TabContext) => {
    const read = await ok(picks.read(context));
    return read.map((pick) => pick.mfcItemId);
  };
  return {
    picks,
    local,
    session,
    ids,
    advance: (ms: number) => {
      now += ms;
    },
    /** The store a restarted background worker opens over the same storage. */
    restart: open,
  };
}

describe("a pick", () => {
  test("keeps the captured page, title and picture, stamped with when it was picked", async () => {
    const { picks } = store();
    await ok(picks.add(NORMAL, capture(1)));

    expect(await ok(picks.read(NORMAL))).toEqual([
      {
        mfcItemId: itemId(1),
        title: "Item 1",
        pickedAt: 1_000_000,
        html: "<html>1</html>",
        picture: PICTURE,
      },
    ]);
  });

  test("of an Item the context already picked replaces it", async () => {
    const { picks, advance } = store();
    await ok(picks.add(NORMAL, capture(1)));
    advance(5);
    await ok(picks.add(NORMAL, capture(1, "<html>again</html>")));

    const read = await ok(picks.read(NORMAL));
    expect(read.map(({ html, pickedAt }) => ({ html, pickedAt }))).toEqual([
      { html: "<html>again</html>", pickedAt: 1_000_005 },
    ]);
    expect(await ok(picks.state(NORMAL, itemId(1)))).toMatchObject({ count: 1 });
  });

  test("reads back oldest first", async () => {
    const { picks, ids, advance } = store();
    for (const id of [3, 1, 2]) {
      await ok(picks.add(NORMAL, capture(id)));
      advance(1);
    }

    expect(await ids(NORMAL)).toEqual([itemId(3), itemId(1), itemId(2)]);
  });

  test("is stored under its own key beside an index, so one pick writes only its own page", async () => {
    const { picks, local } = store();
    await ok(picks.add(NORMAL, capture(1)));
    await ok(picks.add(CONTAINER, capture(1)));

    expect(local.keys()).toEqual(["pick:n:default:1", "pick:n:firefox-container-1:1", "picks"]);
  });
});

describe("removing picks", () => {
  test("deletes only the named Items of that context, and a second removal changes nothing", async () => {
    const { picks, ids, local } = store();
    for (const id of [1, 2, 3]) await ok(picks.add(NORMAL, capture(id)));
    await ok(picks.add(CONTAINER, capture(2)));

    await ok(picks.remove(NORMAL, [itemId(2), itemId(3)]));
    await ok(picks.remove(NORMAL, [itemId(2), itemId(3), itemId(9)]));

    expect(await ids(NORMAL)).toEqual([itemId(1)]);
    expect(await ids(CONTAINER)).toEqual([itemId(2)]);
    expect(local.keys()).toEqual(["pick:n:default:1", "pick:n:firefox-container-1:2", "picks"]);
  });

  test("reading picks deletes none of them", async () => {
    const { picks, ids } = store();
    await ok(picks.add(NORMAL, capture(1)));
    await picks.read(NORMAL);

    expect(await ids(NORMAL)).toEqual([itemId(1)]);
  });
});

describe("browsing contexts", () => {
  test("each sees and counts only its own picks", async () => {
    const { picks, ids } = store();
    await ok(picks.add(NORMAL, capture(1)));
    await ok(picks.add(CONTAINER, capture(2)));
    await ok(picks.add(PRIVATE, capture(3)));

    expect(await ids(NORMAL)).toEqual([itemId(1)]);
    expect(await ids(CONTAINER)).toEqual([itemId(2)]);
    expect(await ids(PRIVATE)).toEqual([itemId(3)]);
    expect(await ok(picks.state(CONTAINER, itemId(1)))).toEqual({
      picked: false,
      count: 1,
      full: false,
    });
    expect(await ok(picks.state(CONTAINER, itemId(2)))).toMatchObject({ picked: true });
  });

  test("a private window's picks never touch local storage", async () => {
    const { picks, local, session } = store();
    await ok(picks.add(PRIVATE, capture(1)));
    await ok(picks.add({ incognito: true, cookieStoreId: "firefox-private" }, capture(2)));
    await picks.read(PRIVATE);
    await ok(picks.remove(PRIVATE, [itemId(1)]));

    expect(local.keys()).toEqual([]);
    expect(session.keys()).toEqual(["pick:p:firefox-private:2", "picks"]);
  });

  test("forgetting private picks keeps the normal ones and the session's other values", async () => {
    const { picks, ids, local, session } = store();
    session.put("throttle", { nextPageAt: 5 });
    await ok(picks.add(NORMAL, capture(1)));
    await ok(picks.add(PRIVATE, capture(2)));

    await ok(picks.forgetPrivate());

    expect(await ids(PRIVATE)).toEqual([]);
    expect(await ids(NORMAL)).toEqual([itemId(1)]);
    expect(session.keys()).toEqual(["throttle"]);
    expect(local.keys()).toEqual(["pick:n:default:1", "picks"]);
  });

  test("forgetting private picks also deletes a private page its index lost", async () => {
    const { picks, session } = store();
    await ok(picks.add(PRIVATE, capture(1)));
    session.put("pick:p:default:2", { ...capture(2), pickedAt: 1_000_000 });

    await ok(picks.forgetPrivate());

    expect(session.keys()).toEqual([]);
  });

  test("private picks go when the last private window closes, and not before", async () => {
    const { picks, ids } = store();
    await ok(picks.add(PRIVATE, capture(2)));
    const windows = [{ incognito: false }, { incognito: true }];
    const list = { getAll: async () => windows };

    await ok(forgetPrivatePicksOnceClosed(list, picks));
    expect(await ids(PRIVATE)).toEqual([itemId(2)]);

    windows.pop();
    await ok(forgetPrivatePicksOnceClosed(list, picks));
    expect(await ids(PRIVATE)).toEqual([]);
  });
});

describe("the byte cap", () => {
  test("refuses a pick that would take the store over the cap, counting the new pick, and keeps the rest", async () => {
    const { picks, ids } = store();
    await ok(picks.add(NORMAL, capture(1, "a".repeat(3 * MIB))));
    await ok(picks.add(CONTAINER, capture(2, "a".repeat(3 * MIB))));

    const refused = await picks.add(NORMAL, capture(3, "a".repeat(2 * MIB)));

    expect(refused.isErr() && refused.error._tag).toBe("PickStoreFull");
    expect(await ids(NORMAL)).toEqual([itemId(1)]);
    expect(await ids(CONTAINER)).toEqual([itemId(2)]);
    await ok(picks.add(NORMAL, capture(3, "a".repeat(MIB))));
  });

  test("counts a replaced pick once", async () => {
    const { picks } = store();
    await ok(picks.add(NORMAL, capture(1, "a".repeat(5 * MIB))));

    expect(await picks.add(NORMAL, capture(1, "b".repeat(5 * MIB)))).toEqual(Result.ok());
  });

  test("reads as full once its picks and their index take the whole cap, as Chrome counts them", async () => {
    const { picks, local } = store({ now: REAL_TIME });
    const page = storedBytes("pick:n:default:1", { ...capture(1, ""), pickedAt: REAL_TIME });
    // The index's `bytes` has seven digits at either size below.
    const index = storedBytes("picks", [
      { contextKey: "n:default", mfcItemId: itemId(1), pickedAt: REAL_TIME, bytes: 1_000_000 },
    ]);
    const room = MAX_PICK_STORE_BYTES - page - index;
    // Chrome writes each `<` as the six bytes `\u003C`.
    const markup = (bytes: number) => "<".repeat(Math.floor(bytes / 6)) + "a".repeat(bytes % 6);
    await ok(picks.add(NORMAL, capture(1, markup(room - 1))));
    expect(local.bytes()).toBe(MAX_PICK_STORE_BYTES - 1);
    expect(await ok(picks.state(CONTAINER, itemId(2)))).toMatchObject({ full: false });

    await ok(picks.add(NORMAL, capture(1, markup(room))));
    expect(local.bytes()).toBe(MAX_PICK_STORE_BYTES);
    expect(await ok(picks.state(CONTAINER, itemId(2)))).toMatchObject({ full: true });
  });

  test("refuses a page full of `<` before Chrome's count of the store would pass the cap", async () => {
    const { picks, local } = store();
    // 1,960,000 characters, which Chrome counts as 4,410,000 bytes.
    const markup = "<p>x</p>".repeat(245_000);
    await ok(picks.add(NORMAL, capture(1, markup)));

    const refused = await picks.add(CONTAINER, capture(2, markup));

    expect(refused.isErr() && refused.error._tag).toBe("PickStoreFull");
    expect(local.bytes()).toBeLessThanOrEqual(MAX_PICK_STORE_BYTES);
  });

  test("counts line separators and control characters at their six-byte escapes", async () => {
    const { picks } = store();

    const over = await picks.add(NORMAL, capture(1, "\u2028\u0001".repeat(700_000)));
    expect(over.isErr() && over.error._tag).toBe("PickStoreFull");

    await ok(picks.add(NORMAL, capture(1, "\u2028\u0001".repeat(690_000))));
  });

  test("counts the index, so the stored picks never take more than the cap", async () => {
    const { picks, local } = store();
    const page = storedBytes("pick:n:default:1", { ...capture(1, ""), pickedAt: 1_000_000 });
    const quarter = "a".repeat(MAX_PICK_STORE_BYTES / 4 - page);

    const added = [];
    for (const id of [1, 2, 3, 4]) added.push(await picks.add(NORMAL, capture(id, quarter)));

    expect(added.map((result) => (result.isOk() ? "kept" : result.error._tag))).toEqual([
      "kept",
      "kept",
      "kept",
      "PickStoreFull",
    ]);
    expect(local.bytes()).toBeLessThanOrEqual(MAX_PICK_STORE_BYTES);
  });

  test("a write the browser refuses fails as storage, and keeps the picks it had", async () => {
    const { picks, ids } = store({ localQuota: 4096 });
    await ok(picks.add(NORMAL, capture(1)));

    const refused = await picks.add(NORMAL, capture(2, "a".repeat(8192)));

    expect(refused.isErr() && refused.error._tag).toBe("PickStorageFailed");
    expect(await ids(NORMAL)).toEqual([itemId(1)]);
  });
});

describe("picks older than 14 days", () => {
  test("are deleted by the next store operation of their area", async () => {
    const { picks, ids, local, advance } = store();
    await ok(picks.add(NORMAL, capture(1)));
    advance(PICK_TTL_MS - 10);
    await ok(picks.add(NORMAL, capture(2)));

    advance(10);
    expect(await ids(NORMAL)).toEqual([itemId(1), itemId(2)]);

    advance(1);
    expect(await ok(picks.state(CONTAINER, itemId(1)))).toMatchObject({ count: 0 });
    expect(local.keys()).toEqual(["pick:n:default:2", "picks"]);
    expect(await ids(NORMAL)).toEqual([itemId(2)]);
  });
});

describe("a store call stopped partway", () => {
  test("leaves no page behind that a failed removal dropped from the index, so later picks still fit", async () => {
    const { picks, local } = store({ localQuota: 10 * MIB });
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      await ok(picks.add(NORMAL, capture(id, "a".repeat(MIB))));
      local.refuse("remove");
      const removed = await picks.remove(NORMAL, [itemId(id)]);
      expect(removed.isErr() && removed.error._tag).toBe("PickStorageFailed");
    }

    await ok(picks.add(NORMAL, capture(10, "a".repeat(MIB))));

    expect(local.keys()).toEqual(["pick:n:default:10", "picks"]);
  });

  test("leaves no page behind that an add wrote without its index", async () => {
    const { picks, local, restart } = store();
    await ok(picks.add(NORMAL, capture(1)));
    local.put("pick:n:default:2", { ...capture(2), pickedAt: 1_000_000 });

    expect(await ok(restart().state(NORMAL, itemId(2)))).toEqual({
      picked: false,
      count: 1,
      full: false,
    });
    expect(local.keys()).toEqual(["pick:n:default:1", "picks"]);
  });

  test("counts a replacement page an add wrote without its index at the page's own size", async () => {
    const { picks, local, restart } = store();
    await ok(picks.add(NORMAL, capture(1)));
    local.put("pick:n:default:1", { ...capture(1, "a".repeat(6 * MIB)), pickedAt: 1_000_000 });

    const refused = await restart().add(CONTAINER, capture(2, "a".repeat(3 * MIB)));

    expect(refused.isErr() && refused.error._tag).toBe("PickStoreFull");
    expect(local.bytes()).toBeLessThanOrEqual(MAX_PICK_STORE_BYTES);
  });

  test("drops an index entry whose page was never written", async () => {
    const { picks, local, restart } = store();
    await ok(picks.add(NORMAL, capture(1)));
    local.put("picks", [
      { contextKey: "n:default", mfcItemId: 1, pickedAt: 1_000_000, bytes: 100 },
      { contextKey: "n:default", mfcItemId: 2, pickedAt: 1_000_000, bytes: 100 },
    ]);

    expect(await ok(restart().state(NORMAL, itemId(2)))).toEqual({
      picked: false,
      count: 1,
      full: false,
    });
  });
});

describe("the store", () => {
  test("runs calls one at a time, so concurrent picks all land", async () => {
    const { picks, ids } = store();
    const added = await Promise.all([1, 2, 3, 4].map((id) => picks.add(NORMAL, capture(id))));

    expect(added.every((result) => result.isOk())).toBe(true);
    const stored = await ids(NORMAL);
    expect(stored.toSorted()).toEqual([1, 2, 3, 4].map(itemId));
  });

  test("reads an index it cannot parse as no picks", async () => {
    const { picks, local } = store();
    local.put("picks", [{ contextKey: "n:default", mfcItemId: "1" }]);

    expect(await ok(picks.read(NORMAL))).toEqual([]);
    expect(await ok(picks.state(NORMAL, itemId(1)))).toEqual({
      picked: false,
      count: 0,
      full: false,
    });
  });
});
