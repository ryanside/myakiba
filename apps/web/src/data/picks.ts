import type { MfcItemId } from "@myakiba/mfc/page";
import { Result } from "better-result";
import { useEffect, useState, useSyncExternalStore } from "react";
import { reportDefect } from "@/lib/as-panic";
import { extensionBridge } from "@/lib/extension-bridge";
import type { ExtensionBridge, TakenPick } from "@/lib/extension-bridge";
import type { PickFailure } from "@/lib/pick-failure";

const PICKS_LOCK = "myakiba-picks";

/**
 * A pick on its way into the Item Database. A saved pick leaves the rows and becomes a draft row.
 * A discarded pick leaves once the extension drops it, and comes back failed as it was if the
 * extension does not answer.
 */
export type PickRow =
  | { readonly mfcItemId: MfcItemId; readonly title: string | null; readonly state: "saving" }
  | {
      readonly mfcItemId: MfcItemId;
      readonly title: string | null;
      readonly state: "failed";
      readonly reason: PickFailure;
    }
  | {
      readonly mfcItemId: MfcItemId;
      readonly title: string | null;
      readonly state: "discarding";
      readonly reason: PickFailure;
    };

type PickStopped = Extract<PickFailure, { kind: "stopped" }>;

type PickLocks = {
  readonly request: (name: string, granted: () => Promise<void>) => Promise<void>;
};

type PickIntakeDeps = {
  readonly bridge: Pick<ExtensionBridge, "takePicks" | "picksSaved" | "picksDiscarded">;
  /** Without Web Locks, as in an insecure context, each tab pulls on its own. */
  readonly locks: PickLocks | undefined;
  readonly visible: () => boolean;
};

/** What the page knows when it pulls or retries. */
export type PickContext = {
  /** Resolves, never rejects, once the server saved the pick's Item or refused it. */
  readonly save: (pick: TakenPick) => Promise<Result<{ readonly itemId: string }, PickFailure>>;
  readonly emailVerified: boolean;
  readonly onSaved: (itemIds: readonly string[]) => void;
};

const UNVERIFIED: PickFailure = { kind: "unverified" };
const STOPPED: PickStopped = { kind: "stopped" };

/**
 * Takes the extension's picks into the Item Database. The extension keeps each pick until this
 * reports it saved, after the server saved its Item, or discarded, after the user discarded it.
 * A pick that failed waits for the user's Retry, except one that waited for a verified email.
 */
export function createPickIntake(deps: PickIntakeDeps) {
  const held = new Map<MfcItemId, { readonly pick: TakenPick; readonly row: PickRow }>();
  const listeners = new Set<() => void>();
  let rows: readonly PickRow[] = [];
  let pulling = false;
  let stopped = false;
  let answered = false;

  const changed = () => {
    rows = [...held.values()].map(({ row }) => row);
    for (const listener of listeners) listener();
  };

  const show = (pick: TakenPick, row: PickRow) => {
    held.set(pick.mfcItemId, { pick, row });
    changed();
  };

  const fail = (pick: TakenPick, reason: PickFailure) => {
    const latest = held.get(pick.mfcItemId)?.pick ?? pick;
    const { mfcItemId, title } = latest;
    show(latest, { mfcItemId, title, state: "failed", reason });
    return Result.err(reason);
  };

  /** The user may have picked the Item again on MFC, so Retry uploads the page taken last. */
  const recapture = (pick: TakenPick) => {
    const entry = held.get(pick.mfcItemId);
    if (entry === undefined) return;
    if (entry.row.title === pick.title) held.set(pick.mfcItemId, { ...entry, pick });
    else show(pick, { ...entry.row, title: pick.title });
  };

  async function save(pick: TakenPick, context: PickContext): Promise<Result<void, PickFailure>> {
    const { mfcItemId, title } = pick;
    if (!context.emailVerified) return fail(pick, UNVERIFIED);
    show(pick, { mfcItemId, title, state: "saving" });
    const saved = await context.save(pick);
    if (saved.isErr()) return fail(pick, saved.error);
    held.delete(mfcItemId);
    changed();
    context.onSaved([saved.value.itemId]);
    return Result.ok();
  }

  const waiting = (pick: TakenPick) => {
    const row = held.get(pick.mfcItemId)?.row;
    return row === undefined || (row.state === "failed" && row.reason.kind === "unverified");
  };

  async function takeAndSave(context: PickContext): Promise<void> {
    if (!deps.visible()) return;
    const taken = await deps.bridge.takePicks();
    if (stopped !== taken.isErr() || !answered) {
      stopped = taken.isErr();
      answered = true;
      changed();
    }
    // Taking deletes nothing, so picks a tab hid too late to upload wait for the tab now showing.
    if (taken.isErr() || !deps.visible()) return;
    for (const pick of taken.value) recapture(pick);
    const settled = await Promise.all(
      taken.value.filter(waiting).map(async (pick) => ({ pick, saved: await save(pick, context) })),
    );
    const [first, ...rest] = settled
      .filter(({ saved }) => saved.isOk())
      .map(({ pick }) => pick.captureId);
    // A report that does not arrive is harmless: the next pull uploads again and the server answers `existing`.
    if (first !== undefined) await deps.bridge.picksSaved([first, ...rest]);
  }

  return {
    /**
     * Runs on load and whenever the tab shows again. A hidden tab does nothing, and a second Add tab
     * waits for the first to finish, so it finds only the picks the first left.
     * It never rejects: a defect is reported here, so a listener can start it without waiting.
     */
    pull: async (context: PickContext): Promise<void> => {
      if (pulling) return;
      pulling = true;
      try {
        if (deps.locks === undefined) await takeAndSave(context);
        else await deps.locks.request(PICKS_LOCK, () => takeAndSave(context));
      } catch (error) {
        reportDefect(error);
      } finally {
        pulling = false;
      }
    },
    retry: async (
      mfcItemId: MfcItemId,
      context: PickContext,
    ): Promise<Result<void, PickFailure>> => {
      const entry = held.get(mfcItemId);
      if (entry === undefined || entry.row.state !== "failed") return Result.ok();
      const saved = await save(entry.pick, context);
      if (saved.isOk()) await deps.bridge.picksSaved([entry.pick.captureId]);
      return saved;
    },
    discard: async (mfcItemId: MfcItemId): Promise<Result<void, PickStopped>> => {
      const entry = held.get(mfcItemId);
      if (entry === undefined || entry.row.state !== "failed") return Result.ok();
      show(entry.pick, { ...entry.row, state: "discarding" });
      const discarded = await deps.bridge.picksDiscarded([entry.pick.captureId]);
      if (discarded.isErr()) {
        fail(entry.pick, entry.row.reason);
        return Result.err(STOPPED);
      }
      held.delete(mfcItemId);
      changed();
      return Result.ok();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    rows: () => rows,
    /** Whether the extension's last answer to a take said it stopped. */
    stopped: () => stopped,
    /** Whether the extension has answered a take yet, so the page knows what picks it holds. */
    answered: () => answered,
  };
}

/** The extension's state here, and how many picks it keeps for this tab once it is ready. */
export type WaitingPicks =
  | { readonly kind: "checking" }
  | { readonly kind: "absent" }
  | { readonly kind: "outdated" }
  | { readonly kind: "stopped" }
  | { readonly kind: "ready"; readonly count: number };

type Taken = Extract<WaitingPicks, { readonly kind: "stopped" | "ready" }>;

const CHECKING: WaitingPicks = { kind: "checking" };

/**
 * Counts the extension's picks while `active`, and again each time the tab shows. Taking deletes
 * nothing, so the Add page still gets every pick. Only the latest take counts, and the count is
 * cleared when `active` ends, so a screen never shows a count from before it opened.
 */
export function useWaitingPicks(active: boolean): WaitingPicks {
  const status = useSyncExternalStore(extensionBridge.subscribe, extensionBridge.status);
  const [taken, setTaken] = useState<Taken | null>(null);
  const ready = active && status.kind === "ready";

  useEffect(() => {
    // A probe never rejects: an extension that stays silent reads as absent.
    if (active) void extensionBridge.probe();
  }, [active]);

  useEffect(() => {
    if (!ready) return;
    let latest = 0;
    const take = async () => {
      latest += 1;
      const mine = latest;
      try {
        const picks = await extensionBridge.takePicks();
        if (mine !== latest) return;
        setTaken(picks.isOk() ? { kind: "ready", count: picks.value.length } : { kind: "stopped" });
      } catch (error) {
        reportDefect(error);
      }
    };
    const refresh = () => {
      if (document.visibilityState === "visible") void take();
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      latest += 1;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      setTaken(null);
    };
  }, [ready]);

  if (!active || status.kind === "checking") return CHECKING;
  if (status.kind !== "ready") return { kind: status.kind };
  return taken ?? CHECKING;
}
