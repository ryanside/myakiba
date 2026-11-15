type FillEditor =
  | "amount"
  | "count"
  | "condition"
  | "shop"
  | "shipping"
  | "date"
  | "score"
  | "tags"
  | "notes";

/** Every field Fill all writes: its label, and the editor that takes its one value. */
export const FILL_FIELD = {
  price: { label: "Price", editor: "amount" },
  count: { label: "Count", editor: "count" },
  condition: { label: "Condition", editor: "condition" },
  shop: { label: "Shop", editor: "shop" },
  shipping: { label: "Shipping Method", editor: "shipping" },
  orderDate: { label: "Order Date", editor: "date" },
  paymentDate: { label: "Payment Date", editor: "date" },
  shippingDate: { label: "Shipping Date", editor: "date" },
  collectionDate: { label: "Collection Date", editor: "date" },
  score: { label: "Score", editor: "score" },
  tags: { label: "Tags", editor: "tags" },
  notes: { label: "Notes", editor: "notes" },
} as const satisfies Record<string, { readonly label: string; readonly editor: FillEditor }>;
