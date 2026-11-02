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

/** What a commit does to the rows, as a narrow button says it. */
type CommitVerb = "Add" | "Create" | "Keep";

export type CommitPlan = { readonly verb: CommitVerb; readonly label: string } &
  /** The button cannot act yet, and its label says why. */
  (
    | { readonly kind: "blocked" }
    /** Item Database alone: saving the pick already put the Item there. */
    | { readonly kind: "done" }
    | { readonly kind: "commit" }
  );

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

/** The verb a commit to `destination` acts with, whether or not it can act yet. */
function verbOf({ ownership, wishlist, lists }: Destination): CommitVerb {
  if (ownership?.kind === "order" && ownership.order.kind === "new") return "Create";
  return ownership?.kind === "none" && !wishlist && lists.length === 0 ? "Keep" : "Add";
}

export function commitPlan(
  destination: Destination,
  count: number,
  context: { readonly emailVerified: boolean },
): CommitPlan {
  const verb = verbOf(destination);
  const blocked = (label: string): CommitPlan => ({ kind: "blocked", verb, label });
  if (!context.emailVerified) return blocked("Verify your email to add items");
  if (count === 0) return blocked("Select items to add");
  const { ownership, wishlist, lists } = destination;
  switch (ownership?.kind) {
    case undefined:
      return blocked("Choose where these go");
    case "collection":
      return { kind: "commit", verb, label: `Add ${count} to collection` };
    case "order": {
      const { order } = ownership;
      if (order.kind === "new")
        return { kind: "commit", verb, label: `Create order with ${count}` };
      if (order.order === null) return blocked("Choose an Order");
      return { kind: "commit", verb, label: `Add ${count} to order` };
    }
    case "none":
      return wishlist || lists.length > 0
        ? {
            kind: "commit",
            verb,
            label: `Add ${count} to ${namedTargets(wishlist ? "Wishlist" : null, lists)}`,
          }
        : { kind: "done", verb, label: `Keep ${count} in Item Database` };
  }
}

export type Choice = "collection" | "order-new" | "order-existing" | "none";

export const choiceOf = (form: DestinationForm): Choice | null => {
  if (form.kind === "order") return form.order.kind === "new" ? "order-new" : "order-existing";
  return form.kind;
};

export function choose(form: DestinationForm, choice: Choice): DestinationForm {
  switch (choice) {
    case "collection":
    case "none":
      return { ...form, kind: choice };
    // Trying the other kind of Order must not cost this one's fields.
    case "order-new":
      if (form.order.kind === "new") return { ...form, kind: "order" };
      return {
        ...form,
        kind: "order",
        order: form.otherOrder ?? { kind: "new", fields: DEFAULT_ORDER_FIELDS },
        otherOrder: form.order,
      };
    case "order-existing":
      if (form.order.kind === "existing") return { ...form, kind: "order" };
      return {
        ...form,
        kind: "order",
        order: form.otherOrder ?? { kind: "existing", order: null },
        otherOrder: form.order,
      };
  }
}
