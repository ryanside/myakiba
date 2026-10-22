import type { ItemError, ItemResult, PortPicture, RunEvent } from "@myakiba/mfc/bridge";
import type { MfcItemId } from "@myakiba/mfc/page";
import { THROTTLE } from "./throttle";

export type RunKey = string & { readonly __brand: "RunKey" };

/** The cookie jar a tab browses with. MFC tabs are only borrowed or opened in the requester's. */
export type TabContext = { readonly incognito: boolean; readonly cookieStoreId: string | null };

export type Requester = { readonly tabId: number; readonly context: TabContext };

export type Job = { readonly mfcItemId: MfcItemId; readonly context: TabContext };

type Run = {
  readonly key: RunKey;
  readonly requester: Requester;
  readonly waitingFor: readonly MfcItemId[];
};

/** A rate limit this soon after the last one, with no other answer between them, is in a row. */
const CONSECUTIVE_LIMIT_MS = 10 * 60_000;

type QueueMode =
  | { readonly kind: "running" }
  | { readonly kind: "paused"; readonly limitedAt: number }
  /** MFC limited the queue in a row or for long, so new runs fail with rate_limited until then. */
  | { readonly kind: "halted"; readonly until: number };

export type QueueState = {
  readonly mode: QueueMode;
  readonly runs: readonly Run[];
  readonly pending: readonly Job[];
  readonly active: Job | null;
};

export type Outcome =
  | { readonly kind: "result"; readonly result: ItemResult<PortPicture> }
  | { readonly kind: "rate_limited"; readonly pausedUntil: number };

export type QueueAction =
  | {
      readonly type: "submitted";
      readonly run: RunKey;
      readonly requester: Requester;
      readonly mfcItemIds: readonly MfcItemId[];
      readonly at: number;
    }
  | { readonly type: "started" }
  | { readonly type: "needs_user"; readonly untilMs: number }
  | {
      readonly type: "answered";
      readonly job: Job;
      readonly outcome: Outcome;
      readonly at: number;
    }
  | { readonly type: "cancelled"; readonly run: RunKey };

type Emission = { readonly run: RunKey; readonly event: RunEvent<PortPicture> };

export type QueueStep = { readonly state: QueueState; readonly emit: readonly Emission[] };

const RUNNING: QueueMode = { kind: "running" };

export const EMPTY_QUEUE: QueueState = { mode: RUNNING, runs: [], pending: [], active: null };

export function sameContext(a: TabContext, b: TabContext): boolean {
  return a.incognito === b.incognito && a.cookieStoreId === b.cookieStoreId;
}

export function sameJob(a: Job | null, b: Job | null): boolean {
  return (
    a !== null && b !== null && a.mfcItemId === b.mfcItemId && sameContext(a.context, b.context)
  );
}

function waits(run: Run, job: Job): boolean {
  return sameContext(run.requester.context, job.context) && run.waitingFor.includes(job.mfcItemId);
}

export function waitersOf(state: QueueState, job: Job): readonly Run[] {
  return state.runs.filter((run) => waits(run, job));
}

function failAll(
  runs: readonly { readonly key: RunKey; readonly waitingFor: readonly MfcItemId[] }[],
  error: ItemError,
): Emission[] {
  return runs.flatMap((run) => [
    ...run.waitingFor.map((mfcItemId) => ({
      run: run.key,
      event: { type: "item", mfcItemId, result: { ok: false, error } } as const,
    })),
    { run: run.key, event: { type: "done", reason: "complete" } as const },
  ]);
}

function halt(state: QueueState, until: number): QueueStep {
  return {
    state: { mode: { kind: "halted", until }, runs: [], pending: [], active: null },
    emit: failAll(state.runs, "rate_limited"),
  };
}

/** The pause a halt asks for. One for limits in a row outlasts what MFC asked, so a restarted worker keeps it. */
function haltUntil(state: QueueState, pausedUntil: number, at: number): number | null {
  const pauseMs = pausedUntil - at;
  if (pauseMs > THROTTLE.maxPauseMs) return pausedUntil;
  const inRow = state.mode.kind === "paused" && at - state.mode.limitedAt <= CONSECUTIVE_LIMIT_MS;
  return inRow ? at + Math.max(THROTTLE.maxPauseMs, 2 * pauseMs) : null;
}

function settle(state: QueueState, job: Job, result: ItemResult<PortPicture>): QueueStep {
  const emit: Emission[] = [];
  const runs: Run[] = [];
  for (const run of state.runs) {
    if (!waits(run, job)) {
      runs.push(run);
      continue;
    }
    emit.push({ run: run.key, event: { type: "item", mfcItemId: job.mfcItemId, result } });
    const waitingFor = run.waitingFor.filter((id) => id !== job.mfcItemId);
    if (waitingFor.length > 0) runs.push({ ...run, waitingFor });
    else emit.push({ run: run.key, event: { type: "done", reason: "complete" } });
  }
  return { state: { ...state, mode: RUNNING, runs, active: null }, emit };
}

function toActiveWaiters(state: QueueState, event: RunEvent<PortPicture>): Emission[] {
  return state.active ? waitersOf(state, state.active).map((run) => ({ run: run.key, event })) : [];
}

export function reduceQueue(state: QueueState, action: QueueAction): QueueStep {
  switch (action.type) {
    case "submitted": {
      if (state.runs.some((run) => run.key === action.run)) return { state, emit: [] };
      const { mode } = state;
      if (mode.kind === "halted" && action.at < mode.until) {
        return {
          state,
          emit: failAll([{ key: action.run, waitingFor: action.mfcItemIds }], "rate_limited"),
        };
      }
      const { context } = action.requester;
      const known = [...state.pending, ...(state.active ? [state.active] : [])];
      const fresh = action.mfcItemIds
        .map((mfcItemId) => ({ mfcItemId, context }))
        .filter((job) => !known.some((other) => sameJob(other, job)));
      const run = { key: action.run, requester: action.requester, waitingFor: action.mfcItemIds };
      return {
        state: {
          ...state,
          mode: mode.kind === "halted" ? RUNNING : mode,
          runs: [...state.runs, run],
          pending: [...state.pending, ...fresh],
        },
        emit: [
          {
            run: run.key,
            event: { type: "status", state: "queued", mfcItemId: null, untilMs: null },
          },
        ],
      };
    }
    case "started": {
      const [next, ...rest] = state.pending;
      if (state.active || next === undefined) return { state, emit: [] };
      const started = { ...state, pending: rest, active: next };
      return {
        state: started,
        emit: toActiveWaiters(started, {
          type: "status",
          state: "fetching",
          mfcItemId: next.mfcItemId,
          untilMs: null,
        }),
      };
    }
    case "needs_user": {
      if (!state.active) return { state, emit: [] };
      return {
        state,
        emit: toActiveWaiters(state, {
          type: "status",
          state: "needs_user",
          mfcItemId: state.active.mfcItemId,
          untilMs: action.untilMs,
        }),
      };
    }
    case "answered": {
      if (!sameJob(state.active, action.job)) return { state, emit: [] };
      const { outcome } = action;
      if (outcome.kind === "result") {
        // An unsolved challenge fails the runs open now, so none of them asks the user again. A later run may.
        if (!outcome.result.ok && outcome.result.error === "challenge_unsolved") {
          return { state: EMPTY_QUEUE, emit: failAll(state.runs, "challenge_unsolved") };
        }
        return settle(state, action.job, outcome.result);
      }
      const until = haltUntil(state, outcome.pausedUntil, action.at);
      if (until !== null) return halt(state, until);
      const paused = { ...state, mode: { kind: "paused", limitedAt: action.at } } as const;
      return {
        state: paused,
        emit: toActiveWaiters(paused, {
          type: "status",
          state: "backing_off",
          mfcItemId: action.job.mfcItemId,
          untilMs: outcome.pausedUntil,
        }),
      };
    }
    case "cancelled": {
      if (!state.runs.some((run) => run.key === action.run)) return { state, emit: [] };
      const runs = state.runs.filter((run) => run.key !== action.run);
      const wanted = (job: Job) => runs.some((run) => waits(run, job));
      return {
        state: {
          ...state,
          runs,
          pending: state.pending.filter(wanted),
          active: state.active && wanted(state.active) ? state.active : null,
        },
        emit: [{ run: action.run, event: { type: "done", reason: "cancelled" } }],
      };
    }
  }
}
