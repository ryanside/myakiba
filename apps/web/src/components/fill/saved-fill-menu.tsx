import type { ItemFill } from "@myakiba/contracts/collection/fill";
import type { OrderFill } from "@myakiba/contracts/orders/fill";
import type { Currency } from "@myakiba/contracts/shared/types";
import { WRITE_LIMITS } from "@myakiba/contracts/shared/write-limits";
import { Result } from "better-result";
import type { ReactElement } from "react";
import { FillMenu } from "@/components/fill/fill-menu";
import type { FillDraft, FillGroup, FillNoun } from "@/components/fill/fill-menu";
import type { Saving } from "@/data/client";
import {
  COLLECTION_FILL_FIELDS,
  FILL_FIELD,
  ORDER_FILL_FIELDS,
  ORDER_ITEM_FILL_FIELDS,
} from "@/lib/fill-fields";
import type { FillFieldId } from "@/lib/fill-fields";
import { MONEY_INPUT_HINT, parseMoneyInputToMinorUnits } from "@/lib/money-input";

/** Saved rows of one kind that a fill writes to, by id, whether or not this page loaded them. */
export type SavedRows =
  | {
      readonly target: "collection" | "orderItems";
      readonly ids: ReadonlySet<string>;
      readonly onFill: (ids: ReadonlySet<string>, fill: ItemFill) => Saving;
    }
  | {
      readonly target: "orders";
      readonly ids: ReadonlySet<string>;
      readonly onFill: (ids: ReadonlySet<string>, fill: OrderFill) => Saving;
    };

const ITEM = { one: "item", other: "items" } as const;

const TARGET = {
  collection: { fields: COLLECTION_FILL_FIELDS, heading: "Items", noun: ITEM },
  orderItems: { fields: ORDER_ITEM_FILL_FIELDS, heading: "Order Items", noun: ITEM },
  orders: { fields: ORDER_FILL_FIELDS, heading: "Orders", noun: { one: "order", other: "orders" } },
} as const satisfies Record<
  SavedRows["target"],
  { readonly fields: readonly FillFieldId[]; readonly heading: string; readonly noun: FillNoun }
>;

const SEED: FillDraft = {
  status: "Owned",
  paid: true,
  text: "",
  condition: "New",
  shipping: "n/a",
  date: null,
  score: 0,
  tags: [],
};

const WHOLE_NUMBER = /^\d+$/u;

function readFill(field: FillFieldId, draft: FillDraft): Result<ItemFill, string> {
  switch (field) {
    case "status":
      return Result.ok({ field, value: draft.status });
    case "paid":
      return Result.ok({ field, value: draft.paid });
    case "price": {
      if (draft.text.trim() === "") return Result.err("Enter a price.");
      const price = parseMoneyInputToMinorUnits(draft.text);
      return price.isOk() ? Result.ok({ field, value: price.value }) : Result.err(MONEY_INPUT_HINT);
    }
    case "count": {
      const text = draft.text.trim();
      const count = Number(text);
      return WHOLE_NUMBER.test(text) && count >= 1 && count <= 999
        ? Result.ok({ field, value: count })
        : Result.err("Enter a whole number from 1 to 999.");
    }
    case "condition":
      return Result.ok({ field, value: draft.condition });
    case "shop":
      return Result.ok({ field, value: draft.text.trim() });
    case "orderDate":
    case "paymentDate":
    case "shippingDate":
    case "collectionDate":
      return Result.ok({ field, value: draft.date });
    case "shippingMethod":
      return Result.ok({ field, value: draft.shipping });
    case "score":
      return Result.ok({ field, value: String(draft.score) });
    case "tags":
      return draft.tags.length === 0
        ? Result.err("Add at least one tag.")
        : Result.ok({ field, value: [...draft.tags] });
    case "notes":
      return Result.ok({ field, value: draft.text.trim() === "" ? "" : draft.text });
  }
}

function clears(fill: ItemFill): boolean {
  switch (fill.field) {
    case "shop":
    case "notes":
      return fill.value === "";
    case "orderDate":
    case "paymentDate":
    case "shippingDate":
    case "collectionDate":
      return fill.value === null;
    case "score":
      return fill.value === "0";
    default:
      return false;
  }
}

const isOrderFill = (fill: ItemFill): fill is OrderFill =>
  ORDER_FILL_FIELDS.some((field) => field === fill.field);

function groupOf(rows: SavedRows): FillGroup<FillFieldId> {
  const { target, ids } = rows;
  const { fields, heading, noun } = TARGET[target];
  const where =
    target === "orders"
      ? "every selected order and every item in those orders"
      : `every selected ${noun.one}`;
  return {
    key: target,
    heading,
    noun,
    count: ids.size,
    fields,
    seed: () => SEED,
    refusal:
      ids.size > WRITE_LIMITS.ids
        ? `Select ${WRITE_LIMITS.ids.toLocaleString("en-US")} ${noun.other} or fewer to fill.`
        : undefined,
    hint: (field, draft) => {
      if (field === "tags") return `Adds to the tags each ${noun.one} already has.`;
      const { label } = FILL_FIELD[field];
      const fill = readFill(field, draft);
      return `${fill.isOk() && clears(fill.value) ? "Clears" : "Replaces"} ${label} on ${where}.`;
    },
    prepare: (field, draft) =>
      readFill(field, draft).andThen((fill) => {
        if (rows.target !== "orders") return Result.ok({ run: () => rows.onFill(ids, fill) });
        return isOrderFill(fill)
          ? Result.ok({ run: () => rows.onFill(ids, fill) })
          : Result.err(`An order has no ${FILL_FIELD[field].label} to fill.`);
      }),
    pricePlaceholder: "Enter a price",
  };
}

/** Fill all for rows already saved: it sends their ids and one value, and the server writes it. */
export function SavedFillMenu({
  rows,
  currency,
  trigger,
}: {
  readonly rows: readonly SavedRows[];
  readonly currency: Currency;
  readonly trigger: ReactElement;
}) {
  return <FillMenu groups={rows.map(groupOf)} currency={currency} trigger={trigger} />;
}
