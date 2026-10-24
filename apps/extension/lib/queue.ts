import type { ItemError, ItemResult, PortPicture, RunEvent } from "@myakiba/mfc/bridge";
import type { MfcItemId } from "@myakiba/mfc/page";
import type { Result } from "better-result";
import type { ItemFetchError } from "./fetcher";

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

type QueueMode =
  | { readonly kind: "running" }
  /** MFC limited the queue in a row or for long, so new runs fail with rate_limited until then. */
  | { readonly kind: "halted"; readonly until: number };

export type QueueState = {
  readonly mode: QueueMode;
  readonly runs: readonly Run[];
  readonly pending: readonly Job[];
  readonly active: Job | null;
};

export type ItemPage = { readonly html: string; readonly picture: PortPicture | null };

/** What one attempt at an item answered: its page, or why there is none. */
export type ItemAnswer = Result<ItemPage, ItemFetchError>;

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
  | { readonly type: "answered"; readonly job: Job; readonly answer: ItemAnswer }
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
  return { state: { ...state, runs, active: null }, emit };
}

function toActiveWaiters(state: QueueState, event: RunEvent<PortPicture>): Emission[] {
  return state.active ? waitersOf(state, state.active).map((run) => ({ run: run.key, event })) : [];
}

function answer(state: QueueState, job: Job, answered: ItemAnswer): QueueStep {
  if (answered.isOk()) return settle(state, job, { ok: true, ...answered.value });
  const failed = (error: ItemError) => () => settle(state, job, { ok: false, error });
  return answered.error.match({
    // An unsolved challenge fails the runs open now, so none of them asks the user again. A later run may.
    MfcChallengeUnsolved: () => ({
      state: EMPTY_QUEUE,
      emit: failAll(state.runs, "challenge_unsolved"),
    }),
    MfcQueueHalted: ({ until }) => halt(state, until),
    MfcRateLimited: ({ pausedUntil }) => ({
      state,
      emit: toActiveWaiters(state, {
        type: "status",
        state: "backing_off",
        mfcItemId: job.mfcItemId,
        untilMs: pausedUntil,
      }),
    }),
    MfcSignedOut: failed("mfc_signed_out"),
    MfcItemHiddenOrMissing: failed("hidden_or_missing"),
    MfcLoadTimedOut: failed("timeout"),
    MfcWrongItem: failed("unexpected_page"),
    MfcPageUnrecognized: failed("unexpected_page"),
    MfcPageFetchFailed: failed("unexpected_page"),
    CollectorInjectionFailed: failed("unexpected_page"),
    CollectorAnswerInvalid: failed("unexpected_page"),
    MfcTabUnavailable: failed("unexpected_page"),
    TabClosed: failed("unexpected_page"),
    TabEditRefused: failed("unexpected_page"),
    TabOpenFailed: failed("unexpected_page"),
    TabQueryFailed: failed("unexpected_page"),
    UnhandledException: failed("unexpected_page"),
    SessionStorageUnavailable: failed("unexpected_page"),
  });
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
    case "answered":
      return sameJob(state.active, action.job)
        ? answer(state, action.job, action.answer)
        : { state, emit: [] };
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
