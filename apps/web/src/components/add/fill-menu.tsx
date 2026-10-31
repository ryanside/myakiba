import { ArrowLeft01Icon, PaintBucketIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CONDITIONS, SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Rating } from "@/components/ui/rating";
import { Textarea } from "@/components/ui/textarea";
import type { AddController } from "./add-controller";
import type { RowOverrides } from "./add-draft";
import { AmountInput, EnumSelect, LabeledField, MAX_TAGS, TagsField } from "./add-fields";
import type { SharedFields } from "./commit-input";
import { hasOwnValue, readCount } from "./row-fields";
import type { Field, FieldId } from "./row-fields";

type Condition = (typeof CONDITIONS)[number];
type ShippingMethod = (typeof SHIPPING_METHODS)[number];

type FillDraft = {
  readonly text: string;
  readonly condition: Condition;
  readonly shipping: ShippingMethod;
  readonly date: string | null;
  readonly score: number;
  readonly tags: readonly string[];
};

/** The value every selected row already shares, or the shared fallback. */
function initialDraft(c: AddController, field: FieldId): FillDraft {
  const form = c.resolvedForm;
  const shared = form.shared;
  const same = <Value,>(read: (overrides: RowOverrides) => Value): Value | undefined => {
    const [first, ...rest] = c.commitRows.map(({ row }) => read(row.overrides));
    return first !== undefined && rest.every((value) => value === first) ? first : undefined;
  };
  const isCollection = form.kind === "collection";
  const text = (): string => {
    switch (field) {
      case "price":
        return same((overrides) => overrides.price) ?? "";
      case "count": {
        const count = same((overrides) => overrides.count);
        if (count !== undefined) return String(count);
        return isCollection ? String(shared.count) : "";
      }
      case "shop":
        return same((overrides) => overrides.shop) ?? (isCollection ? shared.shop : "");
      case "notes":
        return same((overrides) => overrides.notes) ?? "";
      default:
        return "";
    }
  };
  const date = (): string | null => {
    if (field === "orderDate" || field === "paymentDate" || field === "shippingDate") {
      return same((overrides) => overrides[field]) ?? null;
    }
    if (field === "collectionDate") {
      return (
        same((overrides) => overrides.collectionDate) ??
        (isCollection ? shared.collectionDate : null)
      );
    }
    return null;
  };
  return {
    text: text(),
    condition: same((overrides) => overrides.condition) ?? shared.condition,
    shipping: same((overrides) => overrides.shippingMethod) ?? shared.shippingMethod,
    date: date(),
    score: same((overrides) => overrides.score) ?? 0,
    tags: [],
  };
}

function writeFill(c: AddController, field: FieldId, draft: FillDraft) {
  const form = c.resolvedForm;
  const ids = c.commitRows.map(({ row }) => row.itemId);
  // Only a fill of every row may become the shared value, which rows without their own value read.
  const setShared = (patch: Partial<SharedFields>) => {
    if (form.kind === "collection" && ids.length === c.rows.length) {
      c.setForm({ ...form, shared: { ...form.shared, ...patch } });
    }
  };
  switch (field) {
    case "price":
      c.bulkEdit(ids, { price: draft.text });
      return;
    case "count": {
      const count = readCount(draft.text);
      c.bulkEdit(ids, { count });
      setShared({ count: count ?? 1 });
      return;
    }
    case "condition":
      c.bulkEdit(ids, { condition: draft.condition });
      setShared({ condition: draft.condition });
      return;
    case "shop":
      c.bulkEdit(ids, { shop: draft.text });
      setShared({ shop: draft.text });
      return;
    case "orderDate":
    case "paymentDate":
    case "shippingDate":
      c.bulkEdit(ids, { [field]: draft.date });
      return;
    case "collectionDate":
      c.bulkEdit(ids, { collectionDate: draft.date });
      setShared({ collectionDate: draft.date });
      return;
    case "score":
      c.bulkEdit(ids, { score: draft.score });
      return;
    case "tags":
      for (const { row } of c.commitRows) {
        const merged = [...new Set([...(row.overrides.tags ?? []), ...draft.tags])];
        c.edit(row.itemId, { tags: merged });
      }
      return;
    case "notes":
      c.bulkEdit(ids, { notes: draft.text });
      return;
    case "shipping":
      c.bulkEdit(ids, { shippingMethod: draft.shipping });
  }
}

function FillForm({
  field,
  c,
  onDone,
}: {
  readonly field: Field;
  readonly c: AddController;
  readonly onDone: (message: string) => void;
}) {
  const [draft, setDraft] = useState(() => initialDraft(c, field.id));
  const set = (patch: Partial<FillDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const count = c.commitRows.length;
  const rows = `${count} selected`;
  const own = c.commitRows.filter(({ row }) => hasOwnValue(row, field.id)).length;
  const id = `add-fill-${field.id}`;
  const overfull =
    field.id === "tags"
      ? c.commitRows.filter(
          ({ row }) => new Set([...(row.overrides.tags ?? []), ...draft.tags]).size > MAX_TAGS,
        ).length
      : 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    writeFill(c, field.id, draft);
    onDone(`Filled ${field.label} on ${rows}`);
  };

  const hint = () => {
    if (field.id === "tags") return "Adds to the tags each row already has.";
    if (own === 0) return null;
    return `Replaces the value in ${own === 1 ? "1 row" : `${own} rows`}.`;
  };
  const note = hint();

  return (
    <form onSubmit={submit} className="grid gap-2.5">
      <FillEditor
        field={field}
        id={id}
        draft={draft}
        c={c}
        set={set}
        tagsError={
          overfull > 0
            ? `${overfull === 1 ? "1 row" : `${overfull} rows`} would have more than ${MAX_TAGS} tags.`
            : undefined
        }
      />
      {note ? <p className="text-xs text-pretty text-muted-foreground">{note}</p> : null}
      <Button type="submit" size="sm" className="w-full" disabled={overfull > 0}>
        {`Fill ${rows}`}
      </Button>
    </form>
  );
}

function FillEditor({
  field,
  id,
  draft,
  c,
  set,
  tagsError,
}: {
  readonly field: Field;
  readonly id: string;
  readonly draft: FillDraft;
  readonly c: AddController;
  readonly set: (patch: Partial<FillDraft>) => void;
  readonly tagsError: string | undefined;
}) {
  switch (field.id) {
    case "price":
      return (
        <LabeledField id={id} label="Price">
          <AmountInput
            id={id}
            value={draft.text}
            currency={c.currency}
            placeholder="Blank uses the release price"
            invalid={false}
            onChange={(text) => set({ text })}
          />
        </LabeledField>
      );
    case "count":
      return (
        <LabeledField id={id} label="Count">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            className="tabular-nums"
            value={draft.text}
            placeholder="1"
            onChange={(event) => set({ text: event.target.value })}
          />
        </LabeledField>
      );
    case "condition":
      return (
        <LabeledField id={id} label="Condition">
          <EnumSelect
            id={id}
            value={draft.condition}
            options={CONDITIONS}
            onChange={(condition) => set({ condition })}
          />
        </LabeledField>
      );
    case "shop":
      return (
        <LabeledField id={id} label="Shop">
          <Input
            id={id}
            value={draft.text}
            maxLength={200}
            placeholder="e.g., AmiAmi"
            onChange={(event) => set({ text: event.target.value })}
          />
        </LabeledField>
      );
    case "orderDate":
    case "paymentDate":
    case "shippingDate":
    case "collectionDate":
      return (
        <LabeledField id={id} label={field.label}>
          <DatePicker
            id={id}
            value={draft.date}
            placeholder="No date"
            onChange={(date) => set({ date })}
          />
        </LabeledField>
      );
    case "score":
      return (
        <div className="grid gap-1.5">
          <span className="text-sm leading-none font-medium">Score</span>
          <Rating
            rating={draft.score}
            maxRating={10}
            size="md"
            editable
            showValue
            starClassName="w-7 tabular-nums"
            className="flex-wrap"
            aria-label="Score for every selected row"
            onRatingChange={(score) => set({ score: score === draft.score ? 0 : score })}
          />
        </div>
      );
    case "tags":
      return (
        <TagsField
          id={id}
          label="Tags"
          tags={draft.tags}
          error={tagsError}
          onChange={(tags) => set({ tags })}
        />
      );
    case "notes":
      return (
        <LabeledField id={id} label="Notes">
          <Textarea
            id={id}
            value={draft.text}
            rows={3}
            maxLength={5000}
            onChange={(event) => set({ text: event.target.value })}
          />
        </LabeledField>
      );
    case "shipping":
      return (
        <LabeledField id={id} label="Shipping Method">
          <EnumSelect
            id={id}
            value={draft.shipping}
            options={SHIPPING_METHODS}
            onChange={(shipping) => set({ shipping })}
          />
        </LabeledField>
      );
  }
}

/** Fill all: choose a field, then write one value to every selected row. */
export function FillMenu({
  fields,
  c,
  onFilled,
}: {
  readonly fields: readonly Field[];
  readonly c: AddController;
  readonly onFilled: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Field | null>(null);
  const count = c.commitRows.length;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setChosen(null);
      }}
    >
      <PopoverTrigger
        render={
          <Button type="button" variant="outline">
            <HugeiconsIcon icon={PaintBucketIcon} data-icon="inline-start" aria-hidden="true" />
            Fill all
          </Button>
        }
      />
      <PopoverContent
        aria-label="Fill all"
        className="max-h-(--available-height) w-76 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain"
        align="end"
      >
        {chosen ? (
          <div className="grid gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              id="add-fill-back"
              className="w-fit"
              onClick={() => {
                setChosen(null);
                setTimeout(() => {
                  document
                    .querySelector<HTMLElement>("[data-add-fill-list] button:enabled")
                    ?.focus();
                }, 50);
              }}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" aria-hidden="true" />
              All fields
            </Button>
            <FillForm
              field={chosen}
              c={c}
              onDone={(message) => {
                setOpen(false);
                setChosen(null);
                onFilled(message);
              }}
            />
          </div>
        ) : (
          <div data-add-fill-list="" className="grid gap-0.5">
            <p className="px-2 pb-1 text-xs text-muted-foreground tabular-nums">
              {count === 0
                ? "Select items to fill."
                : `Write one value to ${count === 1 ? "1 selected row" : `${count} selected rows`}.`}
            </p>
            {fields.map((field) => (
              <Button
                key={field.id}
                type="button"
                variant="ghost"
                className="justify-start font-normal"
                disabled={count === 0}
                onClick={() => {
                  setChosen(field);
                  // The button that held focus just left and the popup takes focus for a moment, so
                  // the field it opened takes focus after that.
                  setTimeout(() => {
                    const target =
                      document.querySelector<HTMLElement>(`[id="add-fill-${field.id}"]`) ??
                      document.querySelector<HTMLElement>('[id="add-fill-back"]');
                    target?.focus();
                    if (target instanceof HTMLInputElement) target.select();
                  }, 50);
                }}
              >
                {field.label}
              </Button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
