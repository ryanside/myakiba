import { CONDITIONS, SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import type { Currency } from "@myakiba/contracts/shared/types";
import type { Result } from "better-result";
import { useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { AmountInput, EnumSelect, LabeledField, TagsField } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Rating } from "@/components/ui/rating";
import { Textarea } from "@/components/ui/textarea";
import { ShopInput } from "@/components/vocabulary-fields";
import type { Saving } from "@/data/client";
import { FILL_FIELD } from "@/lib/fill-fields";
import type { FillFieldId } from "@/lib/fill-fields";
import { PreviousIcon } from "@/lib/icons";
import { HugeiconsIcon } from "@hugeicons/react";

/** The one value a fill writes, as its editor holds it. */
export type FillDraft = {
  readonly text: string;
  readonly condition: (typeof CONDITIONS)[number];
  readonly shipping: (typeof SHIPPING_METHODS)[number];
  readonly date: string | null;
  readonly score: number;
  readonly tags: readonly string[];
};

/** Selected rows of one kind, and how a fill of them starts, reads and writes. */
export type FillGroup<Field extends FillFieldId> = {
  readonly key: string;
  readonly count: number;
  readonly fields: readonly Field[];
  readonly seed: (field: Field) => FillDraft;
  readonly hint: (field: Field, draft: FillDraft) => string | null;
  /** The write for this draft, or the sentence that says why it cannot be written. */
  readonly prepare: (
    field: Field,
    draft: FillDraft,
  ) => Result<{ readonly run: () => Saving }, string>;
  readonly pricePlaceholder: string;
};

function FillForm<Field extends FillFieldId>({
  group,
  field,
  currency,
  onDone,
}: {
  readonly group: FillGroup<Field>;
  readonly field: Field;
  readonly currency: Currency;
  readonly onDone: () => void;
}) {
  const [draft, setDraft] = useState(() => group.seed(field));
  const set = (patch: Partial<FillDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const prepared = group.prepare(field, draft);
  const note = group.hint(field, draft);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (prepared.isErr()) return;
    const saved = await prepared.value.run();
    if (saved.isErr()) return;
    onDone();
  };

  return (
    <form onSubmit={submit} className="grid gap-2.5">
      <FillEditor
        field={field}
        id={`add-fill-${field}`}
        draft={draft}
        currency={currency}
        pricePlaceholder={group.pricePlaceholder}
        error={prepared.isErr() ? prepared.error : undefined}
        set={set}
      />
      {note ? <p className="text-xs text-pretty text-muted-foreground">{note}</p> : null}
      <Button type="submit" size="sm" className="w-full" disabled={prepared.isErr()}>
        {`Fill ${group.count} selected`}
      </Button>
    </form>
  );
}

function FillEditor({
  field,
  id,
  draft,
  currency,
  pricePlaceholder,
  error,
  set,
}: {
  readonly field: FillFieldId;
  readonly id: string;
  readonly draft: FillDraft;
  readonly currency: Currency;
  readonly pricePlaceholder: string;
  readonly error: string | undefined;
  readonly set: (patch: Partial<FillDraft>) => void;
}): ReactElement {
  const { label, editor } = FILL_FIELD[field];
  switch (editor) {
    case "amount":
      return (
        <LabeledField id={id} label={label} error={error}>
          <AmountInput
            id={id}
            value={draft.text}
            currency={currency}
            placeholder={pricePlaceholder}
            invalid={error !== undefined}
            onChange={(text) => set({ text })}
          />
        </LabeledField>
      );
    case "count":
      return (
        <LabeledField id={id} label={label} error={error}>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            className="tabular-nums"
            value={draft.text}
            placeholder="1"
            aria-invalid={error === undefined ? undefined : true}
            aria-describedby={error === undefined ? undefined : `${id}-error`}
            onChange={(event) => set({ text: event.target.value })}
          />
        </LabeledField>
      );
    case "condition":
      return (
        <LabeledField id={id} label={label} error={error}>
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
        <LabeledField id={id} label={label} error={error}>
          <ShopInput
            id={id}
            value={draft.text}
            maxLength={200}
            placeholder="Enter shop name"
            onValueChange={(text) => set({ text })}
          />
        </LabeledField>
      );
    case "date":
      return (
        <LabeledField id={id} label={label} error={error}>
          <DatePicker
            id={id}
            value={draft.date}
            placeholder="Select date"
            onChange={(date) => set({ date })}
          />
        </LabeledField>
      );
    case "score":
      return (
        <div className="grid gap-1.5">
          <span className="text-sm leading-none font-medium">{label}</span>
          <Rating
            rating={draft.score}
            maxRating={10}
            size="md"
            editable
            showValue
            starClassName="w-7 tabular-nums"
            aria-label="Score for every selected row"
            onRatingChange={(score) => set({ score: score === draft.score ? 0 : score })}
          />
        </div>
      );
    case "tags":
      return (
        <TagsField
          id={id}
          label={label}
          tags={draft.tags}
          error={error}
          onChange={(tags) => set({ tags })}
        />
      );
    case "notes":
      return (
        <LabeledField id={id} label={label} error={error}>
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
        <LabeledField id={id} label={label} error={error}>
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
export function FillMenu<Field extends FillFieldId>({
  groups,
  currency,
  trigger,
}: {
  readonly groups: readonly FillGroup<Field>[];
  readonly currency: Currency;
  readonly trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<{ readonly group: string; readonly field: Field } | null>(
    null,
  );
  const group = groups.find(({ key }) => key === chosen?.group);
  const count = groups.reduce((sum, each) => sum + each.count, 0);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setChosen(null);
      }}
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent
        aria-label="Fill all"
        className="max-h-(--available-height) w-76 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain"
        align="end"
      >
        {chosen && group ? (
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
              <HugeiconsIcon icon={PreviousIcon} data-icon="inline-start" aria-hidden="true" />
              All fields
            </Button>
            <FillForm
              group={group}
              field={chosen.field}
              currency={currency}
              onDone={() => {
                setOpen(false);
                setChosen(null);
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
            {groups.flatMap(({ key, count: selected, fields }) =>
              fields.map((field) => (
                <Button
                  key={`${key}:${field}`}
                  type="button"
                  variant="ghost"
                  className="justify-start font-normal"
                  disabled={selected === 0}
                  onClick={() => {
                    setChosen({ group: key, field });
                    // The button that held focus just left and the popup takes focus for a moment,
                    // so the field it opened takes focus after that.
                    setTimeout(() => {
                      const target =
                        document.querySelector<HTMLElement>(`[id="add-fill-${field}"]`) ??
                        document.querySelector<HTMLElement>('[id="add-fill-back"]');
                      target?.focus();
                      if (target instanceof HTMLInputElement) target.select();
                    }, 50);
                  }}
                >
                  {FILL_FIELD[field].label}
                </Button>
              )),
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
