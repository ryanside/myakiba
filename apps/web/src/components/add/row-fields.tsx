import { releasePriceDefault } from "@myakiba/contracts/add/schema";
import { CONDITIONS, SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import { formatCurrencyFromMinorUnits } from "@myakiba/utils/currency";
import type { FocusEvent, ReactNode } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { MaskInput } from "@/components/ui/mask-input";
import { Rating } from "@/components/ui/rating";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getCurrencyLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import type { AddController } from "./add-controller";
import type { DraftRow, RowOverrides } from "./add-draft";
import { LabeledField, TagsField } from "./add-fields";
import { priceFieldId } from "./commit-input";
import type { AddItem, CommitIssue, DestinationForm } from "./commit-input";

type RowDate = "orderDate" | "paymentDate" | "shippingDate" | "collectionDate";

export type FieldId =
  | "price"
  | "count"
  | "condition"
  | "shop"
  | "shipping"
  | RowDate
  | "score"
  | "tags"
  | "notes";

export type Field = {
  readonly id: FieldId;
  readonly label: string;
  /** Which destinations this field means anything for. Null is "nothing chosen yet". */
  readonly kinds: readonly DestinationForm["kind"][];
  /** Tailwind width of its table field. A field without one lives in the open row. */
  readonly width?: string;
};

const COLLECTION_ONLY = ["collection"] as const;
const OWNED = ["collection", "order"] as const;
const ALWAYS = ["collection", "order", null] as const;

export const FIELD = {
  price: { id: "price", label: "Price", width: "w-32 min-w-32", kinds: ALWAYS },
  count: { id: "count", label: "Count", width: "w-20 min-w-20", kinds: ALWAYS },
  condition: { id: "condition", label: "Condition", width: "w-36 min-w-36", kinds: ALWAYS },
  shop: { id: "shop", label: "Shop", kinds: COLLECTION_ONLY },
  shipping: { id: "shipping", label: "Shipping Method", kinds: COLLECTION_ONLY },
  orderDate: { id: "orderDate", label: "Order Date", kinds: COLLECTION_ONLY },
  paymentDate: { id: "paymentDate", label: "Payment Date", kinds: COLLECTION_ONLY },
  shippingDate: { id: "shippingDate", label: "Shipping Date", kinds: COLLECTION_ONLY },
  collectionDate: { id: "collectionDate", label: "Collection Date", kinds: COLLECTION_ONLY },
  score: { id: "score", label: "Score", kinds: OWNED },
  tags: { id: "tags", label: "Tags", kinds: OWNED },
  notes: { id: "notes", label: "Notes", kinds: OWNED },
} satisfies Record<FieldId, Field>;

/** Every field a destination allows, in the order Fill all lists them. */
export function fieldsFor(kind: DestinationForm["kind"]): readonly Field[] {
  const all: readonly Field[] = Object.values(FIELD);
  return all.filter((field) => field.kinds.includes(kind));
}

export const THUMBNAIL =
  "size-8 shrink-0 rounded-md outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10";

// A cell of the Collection and Orders grids: plain text that takes a surface when it is hovered or
// edited. It stays an input throughout, so the table's keys and an issue's focus always find it. The
// surface reaches past the text, which stays on the column's edge. A touch screen has no hover, so
// there it always shows its edge.
const INLINE_CELL =
  "-ms-2 w-[calc(100%+0.5rem)] border-transparent bg-transparent ps-2 text-foreground placeholder:text-foreground hover:bg-muted focus-visible:bg-control dark:bg-transparent [@media(hover:none)]:ms-0 [@media(hover:none)]:w-full [@media(hover:none)]:border-control-edge [@media(hover:none)]:bg-control";

const selectAll = (event: FocusEvent<HTMLInputElement>) => event.currentTarget.select();

/** A named run of fields, for the Order section and the open row. The name is for screen readers. */
export function FieldGroup({
  title,
  className,
  children,
}: {
  readonly title: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={title}
      className={cn("grid grid-cols-2 items-start gap-3", className)}
    >
      {children}
    </div>
  );
}

const fieldId = (field: FieldId, itemId: string) =>
  field === "price" ? priceFieldId(itemId) : `add-${field}-${itemId}`;

export function readCount(text: string): number | undefined {
  const count = Number.parseInt(text, 10);
  return Number.isNaN(count) ? undefined : Math.min(Math.max(count, 1), 999);
}

/** What a blank Price saves. A release in another currency saves nothing, so it reads as no price. */
function pricePlaceholder(release: AddItem["latestRelease"], currency: AddController["currency"]) {
  const saved = releasePriceDefault(release, currency);
  return saved === 0
    ? "No price"
    : formatCurrencyFromMinorUnits(saved, currency, getCurrencyLocale(currency));
}

export function hasOwnValue(row: DraftRow, field: FieldId): boolean {
  const { overrides } = row;
  switch (field) {
    case "price":
      return (overrides.price ?? "") !== "";
    case "count":
      return overrides.count !== undefined;
    case "condition":
      return overrides.condition !== undefined;
    case "shop":
      return (overrides.shop ?? "") !== "";
    case "orderDate":
    case "paymentDate":
    case "shippingDate":
    case "collectionDate":
      return overrides[field] !== undefined;
    case "score":
      return (overrides.score ?? 0) > 0;
    case "tags":
      return (overrides.tags ?? []).length > 0;
    case "notes":
      return (overrides.notes ?? "") !== "";
    case "shipping":
      return overrides.shippingMethod !== undefined;
  }
}

/**
 * One field of one row. A field with a column sits under its header, so its label is only for screen
 * readers until the table reflows to cards. The others sit in the open row with a visible label.
 */
export function RowField({
  field,
  row,
  item,
  release,
  c,
  issues,
}: {
  readonly field: Field;
  readonly row: DraftRow;
  readonly item: AddItem;
  /** The release this row saves with, which a blank Price takes its default from. */
  readonly release: AddItem["latestRelease"];
  readonly c: AddController;
  readonly issues: readonly CommitIssue[];
}) {
  const { itemId, overrides } = row;
  const { title } = item;
  const id = fieldId(field.id, itemId);
  const form = c.resolvedForm;
  const shared = form.kind === "collection" ? form.shared : null;
  const onEdit = (next: RowOverrides) => c.edit(itemId, next);
  const cellLabel = (
    <>
      <span className="@3xl/rows:sr-only">{field.label}</span>
      <span className="sr-only"> for {title}</span>
    </>
  );
  const openLabel = (
    <>
      {field.label}
      <span className="sr-only"> for {title}</span>
    </>
  );
  // A label only screen readers get takes no room, so it leaves no gap above the field.
  const cellGap = "@3xl/rows:gap-0";

  switch (field.id) {
    case "price": {
      const issue = issues.find((candidate) => candidate.fieldId === id);
      return (
        <LabeledField id={id} label={cellLabel} error={issue?.message} className={cellGap}>
          <MaskInput
            id={id}
            mask="currency"
            currency={c.currency}
            locale={getCurrencyLocale(c.currency)}
            placeholder={pricePlaceholder(release, c.currency)}
            invalid={issue !== undefined}
            aria-describedby={issue ? `${id}-error` : undefined}
            inputMode="decimal"
            className={cn(
              INLINE_CELL,
              "tabular-nums",
              releasePriceDefault(release, c.currency) === 0 && "placeholder:text-muted-foreground",
            )}
            onFocus={selectAll}
            value={overrides.price ?? ""}
            onValueChange={(_masked, unmasked) => onEdit({ price: unmasked })}
          />
        </LabeledField>
      );
    }
    case "count":
      return (
        <LabeledField id={id} label={cellLabel} className={cellGap}>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            className={cn(
              INLINE_CELL,
              "tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            )}
            onFocus={selectAll}
            value={overrides.count ?? ""}
            placeholder={String(shared?.count ?? 1)}
            onChange={(event) => onEdit({ count: readCount(event.target.value) })}
          />
        </LabeledField>
      );
    case "condition":
      return (
        <LabeledField id={id} label={cellLabel} className={cellGap}>
          <Select
            value={overrides.condition ?? shared?.condition ?? "New"}
            onValueChange={(next) => {
              if (next !== null) onEdit({ condition: next });
            }}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabeledField>
      );
    case "shop":
      return (
        <LabeledField id={id} label={openLabel}>
          <Input
            id={id}
            value={overrides.shop ?? ""}
            placeholder={shared?.shop || "e.g., AmiAmi"}
            title={overrides.shop || shared?.shop || undefined}
            maxLength={200}
            onChange={(event) => onEdit({ shop: event.target.value })}
          />
        </LabeledField>
      );
    case "orderDate":
    case "paymentDate":
    case "shippingDate":
      return (
        <LabeledField id={id} label={openLabel}>
          <DatePicker
            id={id}
            value={overrides[field.id] ?? null}
            placeholder="No date"
            onChange={(value) => onEdit({ [field.id]: value })}
          />
        </LabeledField>
      );
    case "collectionDate":
      return (
        <LabeledField id={id} label={openLabel}>
          <DatePicker
            id={id}
            value={
              overrides.collectionDate === undefined
                ? shared?.collectionDate
                : overrides.collectionDate
            }
            placeholder="No date"
            onChange={(collectionDate) => onEdit({ collectionDate })}
          />
        </LabeledField>
      );
    case "score":
      return (
        <div className="grid gap-1.5">
          <span className="text-sm leading-none font-medium">{field.label}</span>
          <div className="flex min-h-8 items-center">
            <Rating
              rating={overrides.score ?? 0}
              maxRating={10}
              size="md"
              editable
              showValue
              starClassName="w-7 tabular-nums"
              aria-label={`Score for ${title}`}
              onRatingChange={(score) => onEdit({ score: score === overrides.score ? 0 : score })}
            />
          </div>
        </div>
      );
    case "tags":
      return (
        <TagsField
          id={id}
          label={openLabel}
          tags={overrides.tags ?? []}
          onChange={(tags) => onEdit({ tags })}
        />
      );
    case "notes":
      return (
        <LabeledField id={id} label={openLabel}>
          <Textarea
            id={id}
            value={overrides.notes ?? ""}
            maxLength={5000}
            placeholder="Add any notes..."
            onChange={(event) => onEdit({ notes: event.target.value })}
          />
        </LabeledField>
      );
    case "shipping":
      return (
        <LabeledField id={id} label={openLabel}>
          <Select
            value={overrides.shippingMethod ?? shared?.shippingMethod ?? "n/a"}
            onValueChange={(next) => {
              if (next !== null) onEdit({ shippingMethod: next });
            }}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHIPPING_METHODS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabeledField>
      );
  }
}
