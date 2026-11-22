import { MAX_ADD_ROWS } from "@myakiba/contracts/add/constants";
import { CONDITIONS, SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useReducer } from "react";
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
  selected: z.boolean(),
});

export type DraftRow = z.infer<typeof draftRowSchema>;

const storedDraft = accountSlot("add-draft", z.array(draftRowSchema).max(MAX_ADD_ROWS).readonly());
const storedWaiting = accountSlot("add-waiting", z.array(z.string()).readonly());
const appRouteApi = getRouteApi("/(app)");

type DraftState = {
  readonly rows: readonly DraftRow[];
  readonly waiting: readonly string[];
};

function settle(rows: readonly DraftRow[], queue: readonly string[]): DraftState {
  const room = MAX_ADD_ROWS - rows.length;
  const entering = queue
    .slice(0, room)
    .map((itemId): DraftRow => ({ itemId, overrides: {}, selected: true }));
  return { rows: [...entering, ...rows], waiting: queue.slice(room) };
}

export type DraftAction =
  | { readonly type: "add"; readonly itemIds: readonly string[] }
  | { readonly type: "remove"; readonly itemIds: readonly string[] }
  | { readonly type: "select"; readonly itemId: string; readonly selected: boolean }
  | { readonly type: "select-all"; readonly selected: boolean }
  | { readonly type: "edit"; readonly itemId: string; readonly overrides: RowOverrides };

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "add": {
      const known = new Set([...state.rows.map((row) => row.itemId), ...state.waiting]);
      const incoming = [...new Set(action.itemIds)].filter((itemId) => !known.has(itemId));
      return settle(state.rows, [...state.waiting, ...incoming]);
    }
    case "remove": {
      const removed = new Set(action.itemIds);
      return settle(
        state.rows.filter((row) => !removed.has(row.itemId)),
        state.waiting.filter((itemId) => !removed.has(itemId)),
      );
    }
    case "select":
      return {
        ...state,
        rows: state.rows.map((row) =>
          row.itemId === action.itemId ? { ...row, selected: action.selected } : row,
        ),
      };
    case "select-all":
      return {
        ...state,
        rows: state.rows.map((row) => ({ ...row, selected: action.selected })),
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
  return draftReducer(
    { rows: storedDraft.read(userId) ?? [], waiting: storedWaiting.read(userId) ?? [] },
    { type: "add", itemIds: presetItem === undefined ? [] : [presetItem] },
  );
}

/**
 * The signed-in account's Add rows and the Items waiting for one. They live in `sessionStorage`,
 * so a reload keeps them and closing the tab drops them, and another account in the tab starts
 * empty. A link's preset Item is a row from the first render, or waits when the page is full.
 */
export function useAddDraft(presetItem: string | undefined) {
  const userId = appRouteApi.useRouteContext().session.user.id;
  const [state, dispatch] = useReducer(draftReducer, { userId, presetItem }, readDraft);
  useEffect(() => {
    storedDraft.write(userId, state.rows);
    storedWaiting.write(userId, state.waiting);
  }, [userId, state.rows, state.waiting]);
  return { rows: state.rows, waiting: state.waiting, dispatch } as const;
}
