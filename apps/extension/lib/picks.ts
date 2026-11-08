import {
  MAX_PICK_STORE_BYTES,
  MAX_PICK_TITLE,
  PICK_TTL_MS,
} from "@myakiba/contracts/add/constants";
import { mfcItemIdSchema, portPictureSchema } from "@myakiba/mfc/bridge";
import type { MfcItemId } from "@myakiba/mfc/page";
import { Result } from "better-result";
import * as z from "zod";
import type { Clock } from "./clock";
import { PickStorageFailed } from "./errors/pick-storage-failed";
import { PickStoreFull } from "./errors/pick-store-full";
import type { pickCaptureSchema } from "./messages";
import type { TabContext } from "./queue";
import { storedBytes } from "./stored-bytes";

/** The part of a `browser.storage` area the pick store uses. It reads back untyped items, which the schemas check. */
export type PickArea = {
  readonly get: (keys: string[] | null) => Promise<object>;
  readonly set: (items: Readonly<Record<string, StoredPick | Index>>) => Promise<void>;
  readonly remove: (keys: string[]) => Promise<void>;
};

type PickCapture = z.output<typeof pickCaptureSchema>;

const storedPickSchema = z.strictObject({
  mfcItemId: mfcItemIdSchema,
  title: z.string().max(MAX_PICK_TITLE).nullable(),
  pickedAt: z.number().int(),
  html: z.string(),
  picture: portPictureSchema.nullable(),
});
export type StoredPick = z.output<typeof storedPickSchema>;

const storedItemsSchema = z.record(z.string(), z.unknown());

type ContextKey = `${"p" | "n"}:${string}`;

const INDEX_KEY = "picks";

/** One entry per pick, so a check of the caps or of one page's state never reads a stored page. */
const indexSchema = z.object({
  [INDEX_KEY]: z.array(
    z.strictObject({
      contextKey: z.string(),
      mfcItemId: mfcItemIdSchema,
      pickedAt: z.number().int(),
      bytes: z.number().int().nonnegative(),
    }),
  ),
});
type Index = z.output<typeof indexSchema>[typeof INDEX_KEY];

function contextKey(context: TabContext): ContextKey {
  return `${context.incognito ? "p" : "n"}:${context.cookieStoreId ?? "default"}`;
}

const PICK_PREFIX = "pick:";

function pickKey(key: string, mfcItemId: MfcItemId): string {
  return `${PICK_PREFIX}${key}:${mfcItemId}`;
}

/** The bytes the area's picks take: each pick's page and the index that names them. */
const totalBytes = (index: Index) =>
  index.reduce((sum, entry) => sum + entry.bytes, storedBytes(INDEX_KEY, index));

type PicksState = {
  readonly picked: boolean;
  readonly count: number;
  readonly full: boolean;
};

export type Picks = ReturnType<typeof createPicks>;

/**
 * The picks the user made, per browsing context, until myakiba's Add page collects them. Private-window picks live in
 * `session`, which the browser never writes to disk; the rest in `local`. Each area holds at most MAX_PICK_STORE_BYTES.
 */
export function createPicks(deps: {
  readonly local: PickArea;
  readonly session: PickArea;
  readonly clock: Pick<Clock, "now">;
}) {
  const areas = { local: deps.local, session: deps.session };
  type AreaName = keyof typeof areas;
  let last: Promise<unknown> = Promise.resolve();
  /** Areas whose pages match their index: reconciled since this worker started, with no storage call failing since. */
  const reconciled = new Set<AreaName>();

  /** Each call reads the index and writes from what it read, so calls run one at a time. */
  function serialized<T>(work: () => Promise<T>): Promise<T> {
    const previous = last;
    const next = (async () => {
      await previous;
      return work();
    })();
    last = Promise.allSettled([next]);
    return next;
  }

  const areaOf = (context: TabContext): AreaName => (context.incognito ? "session" : "local");

  async function attempt<T>(area: AreaName, op: "read" | "write", call: () => Promise<T>) {
    const result = await Result.tryPromise({
      try: call,
      catch: (cause) => new PickStorageFailed({ area, op, cause }),
    });
    if (result.isErr()) reconciled.delete(area);
    return result;
  }

  /** Writes the new index first, so a call stopped before the removal leaves only pages the index does not name. */
  async function save(
    area: AreaName,
    index: Index,
    removed: readonly string[],
  ): Promise<Result<void, PickStorageFailed>> {
    const saved = await attempt(area, "write", () => areas[area].set({ [INDEX_KEY]: index }));
    if (saved.isErr() || removed.length === 0) return saved;
    return attempt(area, "write", () => areas[area].remove([...removed]));
  }

  /**
   * Makes the area's pages match its index from what is stored, so it converges wherever an earlier call stopped. An
   * entry keeps only a page that is there, at that page's own size and time, and every other `pick:` key is deleted.
   */
  async function reconcile(area: AreaName): Promise<Result<void, PickStorageFailed>> {
    const read = await attempt(area, "read", () => areas[area].get(null));
    if (read.isErr()) return Result.err(read.error);
    const items = storedItemsSchema.safeParse(read.value).data ?? {};
    const index = indexSchema.safeParse(items).data?.[INDEX_KEY] ?? [];
    const kept = index.flatMap((entry) => {
      const key = pickKey(entry.contextKey, entry.mfcItemId);
      const pick = storedPickSchema.safeParse(items[key]).data;
      return pick ? [{ ...entry, pickedAt: pick.pickedAt, bytes: storedBytes(key, pick) }] : [];
    });
    const named = new Set(kept.map((entry) => pickKey(entry.contextKey, entry.mfcItemId)));
    const unnamed = Object.keys(items).filter(
      (key) => key.startsWith(PICK_PREFIX) && !named.has(key),
    );
    if (unnamed.length === 0 && JSON.stringify(kept) === JSON.stringify(index)) {
      return Result.ok();
    }
    return save(area, kept, unnamed);
  }

  /** The area's index, without the picks older than PICK_TTL_MS, which it deletes. */
  async function current(area: AreaName): Promise<Result<Index, PickStorageFailed>> {
    if (!reconciled.has(area)) {
      const repaired = await reconcile(area);
      if (repaired.isErr()) return Result.err(repaired.error);
      reconciled.add(area);
    }
    const read = await attempt(area, "read", () => areas[area].get([INDEX_KEY]));
    if (read.isErr()) return Result.err(read.error);
    // An index that no longer fits its schema, as after an update, reads as no picks.
    const index = indexSchema.safeParse(read.value).data?.[INDEX_KEY] ?? [];
    const oldest = deps.clock.now() - PICK_TTL_MS;
    const kept = index.filter((entry) => entry.pickedAt >= oldest);
    if (kept.length === index.length) return Result.ok(index);
    const expired = index
      .filter((entry) => entry.pickedAt < oldest)
      .map((entry) => pickKey(entry.contextKey, entry.mfcItemId));
    const pruned = await save(area, kept, expired);
    return pruned.map(() => kept);
  }

  return {
    /** Keeps the capture as this context's pick of its Item, in place of any earlier one. */
    add: (context: TabContext, capture: PickCapture) =>
      serialized(async (): Promise<Result<void, PickStoreFull | PickStorageFailed>> => {
        const area = areaOf(context);
        const read = await current(area);
        if (read.isErr()) return Result.err(read.error);
        const owner = contextKey(context);
        const pickedAt = deps.clock.now();
        const pick: StoredPick = { ...capture, pickedAt };
        const key = pickKey(owner, capture.mfcItemId);
        const bytes = storedBytes(key, pick);
        const others = read.value.filter(
          (entry) => entry.contextKey !== owner || entry.mfcItemId !== capture.mfcItemId,
        );
        const index = [
          ...others,
          { contextKey: owner, mfcItemId: capture.mfcItemId, pickedAt, bytes },
        ];
        const total = totalBytes(index);
        if (total > MAX_PICK_STORE_BYTES) {
          return Result.err(new PickStoreFull({ bytes, storedBytes: total - bytes }));
        }
        return attempt(area, "write", () => areas[area].set({ [key]: pick, [INDEX_KEY]: index }));
      }),

    /** Deletes this context's picks of these Items. An Item it has no pick of is already gone. */
    remove: (context: TabContext, mfcItemIds: readonly MfcItemId[]) =>
      serialized(async (): Promise<Result<void, PickStorageFailed>> => {
        const area = areaOf(context);
        const read = await current(area);
        if (read.isErr()) return Result.err(read.error);
        const owner = contextKey(context);
        const doomed = (entry: Index[number]) =>
          entry.contextKey === owner && mfcItemIds.includes(entry.mfcItemId);
        const removed = read.value.filter(doomed);
        if (removed.length === 0) return Result.ok();
        return save(
          area,
          read.value.filter((entry) => !doomed(entry)),
          removed.map((entry) => pickKey(owner, entry.mfcItemId)),
        );
      }),

    /** This context's picks, oldest first. */
    read: (context: TabContext) =>
      serialized(async (): Promise<Result<StoredPick[], PickStorageFailed>> => {
        const area = areaOf(context);
        const read = await current(area);
        if (read.isErr()) return Result.err(read.error);
        const owner = contextKey(context);
        const keys = read.value
          .filter((entry) => entry.contextKey === owner)
          .toSorted((a, b) => a.pickedAt - b.pickedAt)
          .map((entry) => pickKey(owner, entry.mfcItemId));
        if (keys.length === 0) return Result.ok([]);
        const items = await attempt(area, "read", () => areas[area].get(keys));
        return items.map((stored) => {
          const found = storedItemsSchema.safeParse(stored).data ?? {};
          return keys.flatMap((key) => {
            const parsed = storedPickSchema.safeParse(found[key]);
            return parsed.success ? [parsed.data] : [];
          });
        });
      }),

    /** Whether this context picked the Item, how many picks it has, and whether its area is at the byte cap. */
    state: (context: TabContext, mfcItemId: MfcItemId) =>
      serialized(async (): Promise<Result<PicksState, PickStorageFailed>> => {
        const read = await current(areaOf(context));
        const owner = contextKey(context);
        return read.map((index) => {
          const own = index.filter((entry) => entry.contextKey === owner);
          return {
            picked: own.some((entry) => entry.mfcItemId === mfcItemId),
            count: own.length,
            full: totalBytes(index) >= MAX_PICK_STORE_BYTES,
          };
        });
      }),

    forgetPrivate: () =>
      serialized(async (): Promise<Result<void, PickStorageFailed>> => {
        const read = await attempt("session", "read", () => areas.session.get(null));
        if (read.isErr()) return Result.err(read.error);
        const keys = Object.keys(read.value).filter((key) => key.startsWith(PICK_PREFIX));
        return attempt("session", "write", () => areas.session.remove([INDEX_KEY, ...keys]));
      }),
  };
}

export type WindowList = {
  readonly getAll: () => Promise<readonly { readonly incognito?: boolean }[]>;
};

/** A private window's picks last only as long as its private session, so they go when the last one closes. */
export async function forgetPrivatePicksOnceClosed(
  windows: WindowList,
  picks: Pick<Picks, "forgetPrivate">,
): Promise<Result<void, PickStorageFailed>> {
  const open = await windows.getAll();
  if (open.some((window) => window.incognito === true)) return Result.ok();
  return picks.forgetPrivate();
}
