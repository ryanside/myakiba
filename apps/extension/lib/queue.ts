import type { ItemResult, PortPicture, RunEvent } from "@myakiba/mfc/bridge";
import type { MfcItemId } from "@myakiba/mfc/page";

export type RunKey = string & { readonly __brand: "RunKey" };

type Run = {
  readonly key: RunKey;
  readonly requesterTabId: number;
  readonly waitingFor: readonly MfcItemId[];
};

export type QueueState = {
  readonly runs: readonly Run[];
  readonly pending: readonly MfcItemId[];
  readonly active: { readonly mfcItemId: MfcItemId; readonly attempt: number } | null;
};

export type QueueAction =
  | {
      readonly type: "submitted";
      readonly run: RunKey;
      readonly requesterTabId: number;
      readonly mfcItemIds: readonly MfcItemId[];
    }
  | { readonly type: "started" }
  | {
      readonly type: "waiting";
      readonly state: "needs_user" | "backing_off";
      readonly untilMs: number;
    }
  | { readonly type: "retried" }
  | { readonly type: "settled"; readonly result: ItemResult<PortPicture> }
  | { readonly type: "cancelled"; readonly run: RunKey };

type Emission = { readonly run: RunKey; readonly event: RunEvent<PortPicture> };

export type QueueStep = { readonly state: QueueState; readonly emit: readonly Emission[] };

export const EMPTY_QUEUE: QueueState = { runs: [], pending: [], active: null };

export function reduceQueue(state: QueueState, action: QueueAction): QueueStep {
  switch (action.type) {
    case "submitted": {
      if (state.runs.some((run) => run.key === action.run)) return { state, emit: [] };
      const known = new Set([...state.pending, ...(state.active ? [state.active.mfcItemId] : [])]);
      const run = {
        key: action.run,
        requesterTabId: action.requesterTabId,
        waitingFor: action.mfcItemIds,
      };
      return {
        state: {
          ...state,
          runs: [...state.runs, run],
          pending: [...state.pending, ...action.mfcItemIds.filter((id) => !known.has(id))],
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
      const event = { type: "status", state: "fetching", mfcItemId: next, untilMs: null } as const;
      return {
        state: { ...state, pending: rest, active: { mfcItemId: next, attempt: 0 } },
        emit: waitersOf(state, next).map((run) => ({ run: run.key, event })),
      };
    }
    case "waiting": {
      if (!state.active) return { state, emit: [] };
      const { mfcItemId } = state.active;
      const event = {
        type: "status",
        state: action.state,
        mfcItemId,
        untilMs: action.untilMs,
      } as const;
      return { state, emit: waitersOf(state, mfcItemId).map((run) => ({ run: run.key, event })) };
    }
    case "retried": {
      if (!state.active) return { state, emit: [] };
      return {
        state: { ...state, active: { ...state.active, attempt: state.active.attempt + 1 } },
        emit: [],
      };
    }
    case "settled": {
      if (!state.active) return { state, emit: [] };
      const { mfcItemId } = state.active;
      const emit: Emission[] = [];
      const runs: Run[] = [];
      for (const run of state.runs) {
        if (!run.waitingFor.includes(mfcItemId)) {
          runs.push(run);
          continue;
        }
        emit.push({ run: run.key, event: { type: "item", mfcItemId, result: action.result } });
        const waitingFor = run.waitingFor.filter((id) => id !== mfcItemId);
        if (waitingFor.length > 0) runs.push({ ...run, waitingFor });
        else emit.push({ run: run.key, event: { type: "done", reason: "complete" } });
      }
      return { state: { ...state, runs, active: null }, emit };
    }
    case "cancelled": {
      if (!state.runs.some((run) => run.key === action.run)) return { state, emit: [] };
      const runs = state.runs.filter((run) => run.key !== action.run);
      const wanted = new Set(runs.flatMap((run) => run.waitingFor));
      return {
        state: { ...state, runs, pending: state.pending.filter((id) => wanted.has(id)) },
        emit: [{ run: action.run, event: { type: "done", reason: "cancelled" } }],
      };
    }
  }
}

export function waitersOf(state: QueueState, mfcItemId: MfcItemId): readonly Run[] {
  return state.runs.filter((run) => run.waitingFor.includes(mfcItemId));
}
