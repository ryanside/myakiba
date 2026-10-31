import type { addItemSchema } from "@myakiba/contracts/add/schema";
import type {
  CONDITIONS,
  ORDER_STATUSES,
  SHIPPING_METHODS,
} from "@myakiba/contracts/shared/constants";
import { Result } from "better-result";
import type * as z from "zod";
import type { AddChoices } from "@/data/resources/add";
import { MONEY_INPUT_HINT, parseMoneyInputToMinorUnits } from "@/lib/money-input";
import type { AddSearch } from "@/lib/add-search";
import type { DraftRow } from "./add-draft";

export type AddItem = z.infer<typeof addItemSchema>;
type OrderStatus = (typeof ORDER_STATUSES)[number];
type ShippingMethod = (typeof SHIPPING_METHODS)[number];
type Condition = (typeof CONDITIONS)[number];

export type SharedFields = {
  readonly collectionDate: string | null;
  readonly shop: string;
  readonly shippingMethod: ShippingMethod;
  readonly condition: Condition;
  readonly count: number;
};

export type OrderFields = {
  /** Null keeps the title `defaultOrderTitle` writes from the selected rows. */
  readonly title: string | null;
  readonly status: OrderStatus;
  readonly shop: string;
  readonly orderDate: string | null;
  readonly releaseDate: string | null;
  readonly paymentDate: string | null;
  readonly shippingDate: string | null;
  readonly collectionDate: string | null;
  readonly shippingMethod: ShippingMethod;
  readonly shippingFee: string;
  readonly taxes: string;
  readonly duties: string;
  readonly tariffs: string;
  readonly miscFees: string;
  readonly notes: string;
};

type OrderChoice =
  | { readonly kind: "new"; readonly fields: OrderFields }
  | {
      readonly kind: "existing";
      readonly order: { readonly id: string; readonly title: string | null } | null;
    };

export type Ownership =
  | { readonly kind: "collection"; readonly shared: SharedFields }
  | { readonly kind: "order"; readonly order: OrderChoice }
  | { readonly kind: "none" };

export type ChosenList = { readonly id: string; readonly title: string };

export type Destination = {
  /** Null until the user or a preset chooses. Nothing remembers an earlier choice. */
  readonly ownership: Ownership | null;
  readonly wishlist: boolean;
  readonly lists: readonly ChosenList[];
};

/** The destination's state. Trying another kind keeps what was typed for the first one. */
export type DestinationForm = {
  readonly kind: Ownership["kind"] | null;
  readonly shared: SharedFields;
  readonly order: OrderChoice;
  /** The other of New and Existing Order, kept while that one is chosen. It is never saved. */
  readonly otherOrder?: OrderChoice;
  readonly wishlist: boolean;
  readonly lists: readonly ChosenList[];
};

export function destinationOf(form: DestinationForm): Destination {
  const { kind, shared, order, wishlist, lists } = form;
  const owned = (): Ownership | null => {
    switch (kind) {
      case null:
        return null;
      case "none":
        return { kind };
      case "collection":
        return { kind, shared };
      case "order":
        return { kind, order };
    }
  };
  return { ownership: owned(), wishlist, lists };
}

/** A row the server knows, with what the page knows about its Item. */
export type CommitRow = {
  readonly row: DraftRow;
  readonly title: string;
};

export const DEFAULT_SHARED: SharedFields = {
  collectionDate: null,
  shop: "",
  shippingMethod: "n/a",
  condition: "New",
  count: 1,
};

export const DEFAULT_ORDER_FIELDS: OrderFields = {
  title: null,
  status: "Ordered",
  shop: "",
  orderDate: null,
  releaseDate: null,
  paymentDate: null,
  shippingDate: null,
  collectionDate: null,
  shippingMethod: "n/a",
  shippingFee: "",
  taxes: "",
  duties: "",
  tariffs: "",
  miscFees: "",
  notes: "",
};

/** The form a link's `to` presets. Only the URL presets anything. */
export function presetDestination(to?: AddSearch["to"]): DestinationForm {
  const base: DestinationForm = {
    kind: null,
    shared: DEFAULT_SHARED,
    order: { kind: "new", fields: DEFAULT_ORDER_FIELDS },
    wishlist: false,
    lists: [],
  };
  switch (to) {
    case undefined:
      return base;
    case "collection":
      return { ...base, kind: "collection" };
    case "order-new":
      return { ...base, kind: "order" };
    case "wishlist":
      return { ...base, kind: "none", wishlist: true };
    case "none":
      return { ...base, kind: "none" };
    default:
      return {
        ...base,
        kind: "order",
        order: { kind: "existing", order: { id: to.slice("order:".length), title: null } },
      };
  }
}

export function defaultOrderTitle(titles: readonly string[]): string {
  const [first, ...rest] = titles;
  if (first === undefined) return "New Order";
  return rest.length === 0 ? first : `${first} + ${rest.length} more`;
}

/** A value `buildCommitChoices` could not send, with the id of the field that holds it. */
export type CommitIssue = { readonly fieldId: string; readonly message: string };

export const priceFieldId = (itemId: string) => `add-price-${itemId}`;
export const orderFieldId = (field: string) => `add-order-${field}`;
export const removeButtonId = (itemId: string) => `add-remove-${itemId}`;

const FEE_FIELDS = ["shippingFee", "taxes", "duties", "tariffs", "miscFees"] as const;

function readAmount(text: string, fieldId: string, issues: CommitIssue[]): number | null {
  if (text.trim() === "") return null;
  const parsed = parseMoneyInputToMinorUnits(text);
  if (parsed.isOk()) return parsed.value;
  issues.push({ fieldId, message: MONEY_INPUT_HINT });
  return null;
}

/** The details a row always carries when it becomes a Collection Item. */
function ownedRow({ itemId, overrides }: DraftRow, issues: CommitIssue[]) {
  const { count, condition, score, tags, notes, releaseId, price = "" } = overrides;
  return {
    itemId,
    price: readAmount(price, priceFieldId(itemId), issues),
    ...(count !== undefined && { count }),
    ...(condition !== undefined && { condition }),
    ...(score !== undefined && score > 0 && { score: String(score) }),
    ...(tags !== undefined && tags.length > 0 && { tags }),
    ...(notes !== undefined && notes !== "" && { notes }),
    ...(releaseId !== undefined && { releaseId }),
  };
}

function collectionRow(row: DraftRow, issues: CommitIssue[]) {
  const { shop, orderDate, paymentDate, shippingDate, collectionDate, shippingMethod } =
    row.overrides;
  return {
    ...ownedRow(row, issues),
    ...(shop !== undefined && shop.trim() !== "" && { shop: shop.trim() }),
    ...(orderDate !== undefined && { orderDate }),
    ...(paymentDate !== undefined && { paymentDate }),
    ...(shippingDate !== undefined && { shippingDate }),
    ...(collectionDate !== undefined && { collectionDate }),
    ...(shippingMethod !== undefined && { shippingMethod }),
  };
}

function newOrderInput(fields: OrderFields, titles: readonly string[], issues: CommitIssue[]) {
  const { title, shop, notes, ...rest } = fields;
  // A title typed and cleared again falls back to the one the page wrote.
  const orderTitle = title?.trim() || defaultOrderTitle(titles);
  const fees = Object.fromEntries(
    FEE_FIELDS.map((fee) => [fee, readAmount(fields[fee], orderFieldId(fee), issues) ?? 0]),
  ) as Record<(typeof FEE_FIELDS)[number], number>;
  return {
    ...rest,
    ...fees,
    title: orderTitle,
    shop: shop.trim(),
    notes,
  };
}

/**
 * The commit for the selected rows, in page order. The same page always builds the same choices,
 * so a retry of a failed click keeps its `commitId` (see `useCommitAdd`).
 */
export function buildCommitChoices(
  rows: readonly CommitRow[],
  destination: Destination,
): Result<AddChoices, readonly CommitIssue[]> {
  const { ownership, wishlist, lists } = destination;
  const issues: CommitIssue[] = [];
  const listIds = lists.map((list) => list.id);
  const titles = rows.map((row) => row.title);

  const build = (): Pick<AddChoices, "rows" | "ownership"> | null => {
    switch (ownership?.kind) {
      case undefined:
        return null;
      case "none":
        return {
          rows: rows.map(({ row }) => ({ itemId: row.itemId, price: null })),
          ownership: { kind: "none" },
        };
      case "collection":
        return {
          rows: rows.map(({ row }) => collectionRow(row, issues)),
          ownership: {
            kind: "collection",
            shared: { ...ownership.shared, shop: ownership.shared.shop.trim() },
          },
        };
      case "order": {
        const { order } = ownership;
        if (order.kind === "existing" && order.order === null) {
          issues.push({ fieldId: orderFieldId("existing"), message: "Choose an Order" });
          return null;
        }
        return {
          rows: rows.map(({ row }) => ownedRow(row, issues)),
          ownership: {
            kind: "order",
            order:
              order.kind === "new"
                ? { kind: "new", fields: newOrderInput(order.fields, titles, issues) }
                : { kind: "existing", orderId: order.order?.id ?? "" },
          },
        };
      }
    }
  };

  const built = build();
  if (built === null || issues.length > 0) return Result.err(issues);
  return Result.ok({ ...built, wishlist, listIds });
}

export type CommitPlan =
  /** The button cannot act yet, and its label says why. */
  | { readonly kind: "blocked"; readonly label: string }
  /** Item Database alone: saving the pick already put the Item there. */
  | { readonly kind: "done"; readonly label: "Done" }
  | { readonly kind: "commit"; readonly label: string };

export const quoted = (text: string) => `‘${text}’`;

/** The Wishlist and Lists a commit names, or null when it names none. */
export function namedTargets(wishlist: string | null, lists: readonly ChosenList[]): string | null {
  const [first] = lists;
  let listPart: string | null = null;
  if (first !== undefined) {
    listPart = lists.length === 1 ? quoted(first.title) : `${lists.length} Lists`;
  }
  const parts = [wishlist, listPart].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" and ") : null;
}

export function commitPlan(
  destination: Destination,
  count: number,
  context: { readonly emailVerified: boolean },
): CommitPlan {
  if (!context.emailVerified) return { kind: "blocked", label: "Verify your email to add items" };
  if (count === 0) return { kind: "blocked", label: "Select items to add" };
  const { ownership, wishlist, lists } = destination;
  switch (ownership?.kind) {
    case undefined:
      return { kind: "blocked", label: "Choose where these go" };
    case "collection":
      return { kind: "commit", label: `Add ${count} to collection` };
    case "order": {
      const { order } = ownership;
      if (order.kind === "new") return { kind: "commit", label: `Create order with ${count}` };
      if (order.order === null) return { kind: "blocked", label: "Choose an Order" };
      return { kind: "commit", label: `Add ${count} to order` };
    }
    case "none":
      return wishlist || lists.length > 0
        ? {
            kind: "commit",
            label: `Add ${count} to ${namedTargets(wishlist ? "Wishlist" : null, lists)}`,
          }
        : { kind: "done", label: "Done" };
  }
}

function ownershipSummary(ownership: Ownership): string | null {
  switch (ownership.kind) {
    case "collection":
      return "to your Collection";
    case "order":
      return ownership.order.kind === "new" ? "to a new Order" : "to an existing Order";
    case "none":
      return null;
  }
}

/** Where the commit will put the rows, in the Add page's own words, one place per part. */
export function commitSummary(destination: Destination, count: number): readonly string[] | null {
  const { ownership, wishlist, lists } = destination;
  if (ownership === null) return null;
  const places = [
    ownershipSummary(ownership),
    wishlist ? "on your Wishlist" : null,
    ...lists.map((list) => `in ${quoted(list.title)}`),
  ].filter((place) => place !== null);
  const [first = "in the Item Database", ...rest] = places;
  return [`${count} ${count === 1 ? "item" : "items"} ${first}`, ...rest];
}
