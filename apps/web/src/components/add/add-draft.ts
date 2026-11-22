import { MAX_ADD_ROWS } from "@myakiba/contracts/add/constants";
import type { addItemSchema } from "@myakiba/contracts/add/schema";
import { CONDITIONS, SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import { getRouteApi } from "@tanstack/react-router";
import { useCallback, useEffect, useReducer } from "react";
import * as z from "zod";
import { accountSlot } from "@/lib/account-storage";

const dateOverride = z.iso.date().nullable().optional();

const rowOverridesSchema = z.object({
  /** The text the user typed, in the user's currency. Blank means the release price default. */
  price: z.string().optional(),
  count: z.number().int().min(1).max(999).optional(),
  condition: z.enum(CONDITIONS).optional(),
  score: z.number().min(0).max(10).optional(),
  shop: z.string().optional(),
  orderDate: dateOverride,
  paymentDate: dateOverride,
  shippingDate: dateOverride,
  /** A row's date wins over the shared date, and null clears the shared date for that row. */
  collectionDate: dateOverride,
  shippingMethod: z.enum(SHIPPING_METHODS).optional(),
  /** The release this row saves with. Unset means the Item's latest release. */
  releaseId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export type RowOverrides = z.infer<typeof rowOverridesSchema>;

const draftRowSchema = z.object({
  itemId: z.string(),
  overrides: rowOverridesSchema,
  /** Null until a read sent since the row arrived decides it. */
  selected: z.boolean().nullable(),
});

export type DraftRow = z.infer<typeof draftRowSchema>;

const startsSelected = (item: {
  readonly collectionCount: number;
  readonly onOrderCount: number;
}): boolean => item.collectionCount + item.onOrderCount === 0;

const storedDraft = accountSlot("add-draft", z.array(draftRowSchema).max(MAX_ADD_ROWS).readonly());
const storedWaiting = accountSlot("add-waiting", z.array(z.string()).readonly());
const appRouteApi = getRouteApi("/(app)");

type AddItem = z.infer<typeof addItemSchema>;

type DraftState = {
  readonly rows: readonly DraftRow[];
  readonly waiting: readonly string[];
  readonly newestArrival: number;
  /** Each row's Item as the read that last answered for it found it. It lives only in memory. */
  readonly kept: ReadonlyMap<string, AddItem>;
};

let lastTicket = 0;
const nextTicket = () => {
  lastTicket += 1;
  return lastTicket;
};

function settle(
  state: DraftState,
  rows: readonly DraftRow[],
  queue: readonly string[],
  at: number,
): DraftState {
  const room = MAX_ADD_ROWS - rows.length;
  const entering = queue
    .slice(0, room)
    .map((itemId): DraftRow => ({ itemId, overrides: {}, selected: null }));
  return {
    ...state,
    rows: [...entering, ...rows],
    waiting: queue.slice(room),
    newestArrival: entering.length > 0 ? at : state.newestArrival,
  };
}

export type DraftAction =
  | { readonly type: "add"; readonly itemIds: readonly string[] }
  | { readonly type: "remove"; readonly itemIds: readonly string[] }
  | { readonly type: "select"; readonly itemId: string; readonly selected: boolean }
  | { readonly type: "select-all"; readonly selected: boolean }
  /** What the Items read found for the current rows, which a read that failed never sends. */
  | { readonly type: "answer"; readonly items: readonly AddItem[] }
  | { readonly type: "edit"; readonly itemId: string; readonly overrides: RowOverrides };

export function draftReducer(
  state: DraftState,
  action: DraftAction & { readonly at: number },
): DraftState {
  switch (action.type) {
    case "add": {
      const known = new Set([...state.rows.map((row) => row.itemId), ...state.waiting]);
      const incoming = [...new Set(action.itemIds)].filter((itemId) => !known.has(itemId));
      return settle(state, state.rows, [...state.waiting, ...incoming], action.at);
    }
    case "remove": {
      const removed = new Set(action.itemIds);
      const kept = new Map([...state.kept].filter(([itemId]) => !removed.has(itemId)));
      return settle(
        { ...state, kept },
        state.rows.filter((row) => !removed.has(row.itemId)),
        state.waiting.filter((itemId) => !removed.has(itemId)),
        action.at,
      );
    }
    case "select":
      return {
        ...state,
        rows: state.rows.map((row) =>
          row.itemId === action.itemId ? { ...row, selected: action.selected } : row,
        ),
      };
    case "answer": {
      const found = new Map(action.items.map((item) => [item.itemId, item]));
      const kept = new Map(state.kept);
      const rows = state.rows.map((row) => {
        const item = found.get(row.itemId);
        if (item === undefined) {
          kept.delete(row.itemId);
          return row;
        }
        kept.set(row.itemId, item);
        return row.selected === null ? { ...row, selected: startsSelected(item) } : row;
      });
      return { ...state, rows, kept };
    }
    case "select-all":
      return {
        ...state,
        rows: state.rows.map((row) =>
          row.selected === null ? row : { ...row, selected: action.selected },
        ),
      };
    case "edit":
      return {
        ...state,
        rows: state.rows.map((row) =>
          row.itemId === action.itemId
            ? { ...row, overrides: { ...row.overrides, ...action.overrides } }
            : row,
        ),
      };
  }
}

function readDraft({
  userId,
  presetItem,
}: {
  readonly userId: string;
  readonly presetItem: string | undefined;
}): DraftState {
  const rows = storedDraft.read(userId) ?? [];
  const restored: DraftState = {
    kept: new Map(),
    rows,
    waiting: storedWaiting.read(userId) ?? [],
    newestArrival: rows.some((row) => row.selected === null) ? nextTicket() : 0,
  };
  return draftReducer(restored, {
    type: "add",
    itemIds: presetItem === undefined ? [] : [presetItem],
    at: nextTicket(),
  });
}

/**
 * The signed-in account's Add rows and the Items waiting for one. They live in `sessionStorage`,
 * so a reload keeps them and closing the tab drops them, and another account in the tab starts
 * empty. A link's preset Item is a row from the first render, or waits when the page is full.
 */
export function useAddDraft(presetItem: string | undefined) {
  const userId = appRouteApi.useRouteContext().session.user.id;
  const [state, dispatchAt] = useReducer(draftReducer, { userId, presetItem }, readDraft);
  const dispatch = useCallback(
    (action: DraftAction) => dispatchAt({ ...action, at: nextTicket() }),
    [],
  );
  useEffect(() => {
    storedDraft.write(userId, state.rows);
    storedWaiting.write(userId, state.waiting);
  }, [userId, state.rows, state.waiting]);
  return {
    rows: state.rows,
    waiting: state.waiting,
    newestArrival: state.newestArrival,
    kept: state.kept,
    dispatch,
  } as const;
}
