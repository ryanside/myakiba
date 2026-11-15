import type { ItemFill } from "@myakiba/contracts/collection/fill";

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
  readonly [Field in ItemFill["field"]]: {
    readonly label: string;
    readonly editor: FillEditorKind;
  };
};

export type FillFieldId = keyof typeof FILL_FIELD;

const isFillField = (key: string): key is FillFieldId => key in FILL_FIELD;

const FILL_FIELDS: readonly FillFieldId[] = Object.keys(FILL_FIELD).filter(isFillField);

type CollectionFillField = Exclude<FillFieldId, "status">;

/** The Collection page lists only Owned items, so a status fill would make them vanish. */
export const COLLECTION_FILL_FIELDS: readonly CollectionFillField[] = FILL_FIELDS.filter(
  (field): field is CollectionFillField => field !== "status",
);
