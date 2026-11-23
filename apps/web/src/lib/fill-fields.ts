import type { ItemFill } from "@myakiba/contracts/collection/fill";
import { ORDER_CASCADE_OPTIONS } from "@myakiba/contracts/orders/constants";
import type { OrderFill } from "@myakiba/contracts/orders/fill";

type FillEditorKind =
  | "status"
  | "paid"
  | "amount"
  | "count"
  | "condition"
  | "shop"
  | "shipping"
  | "date"
  | "score"
  | "tags"
  | "notes";

/**
 * Every field a fill writes: its label, and the editor that takes its one value. A field the
 * contract adds fails the type check here until it has an entry.
 */
export const FILL_FIELD = {
  status: { label: "Status", editor: "status" },
  paid: { label: "Paid", editor: "paid" },
  price: { label: "Price", editor: "amount" },
  count: { label: "Count", editor: "count" },
  condition: { label: "Condition", editor: "condition" },
  shop: { label: "Shop", editor: "shop" },
  orderDate: { label: "Order Date", editor: "date" },
  paymentDate: { label: "Payment Date", editor: "date" },
  shippingDate: { label: "Shipping Date", editor: "date" },
  collectionDate: { label: "Collection Date", editor: "date" },
  shippingMethod: { label: "Shipping Method", editor: "shipping" },
  score: { label: "Score", editor: "score" },
  tags: { label: "Tags", editor: "tags" },
  notes: { label: "Notes", editor: "notes" },
} as const satisfies {
  readonly [Field in ItemFill["field"] | OrderFill["field"]]: {
    readonly label: string;
    readonly editor: FillEditorKind;
  };
};

export type FillFieldId = keyof typeof FILL_FIELD;

const isFillField = (key: string): key is FillFieldId => key in FILL_FIELD;

const FILL_FIELDS: readonly FillFieldId[] = Object.keys(FILL_FIELD).filter(isFillField);

type CollectionFillField = Exclude<ItemFill["field"], "status">;

/**
 * The Collection page lists only Owned items, so a status fill would make them vanish. Paid is
 * the Order's alone.
 */
export const COLLECTION_FILL_FIELDS: readonly CollectionFillField[] = FILL_FIELDS.filter(
  (field): field is CollectionFillField => field !== "status" && field !== "paid",
);

export const ORDER_ITEM_FILL_FIELDS: readonly ItemFill["field"][] = [
  "status",
  ...COLLECTION_FILL_FIELDS,
];

/** An Order fills its Paid and the fields it cascades to its items. */
export const ORDER_FILL_FIELDS: readonly OrderFill["field"][] = FILL_FIELDS.filter(
  (field): field is OrderFill["field"] =>
    field === "paid" || ORDER_CASCADE_OPTIONS.some((option) => option === field),
);
