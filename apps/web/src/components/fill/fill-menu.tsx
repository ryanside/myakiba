import {
  COLLECTION_STATUSES,
  CONDITIONS,
  SHIPPING_METHODS,
} from "@myakiba/contracts/shared/constants";
import type { CollectionStatus, Currency } from "@myakiba/contracts/shared/types";
import type { Result } from "better-result";
import { useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { AmountInput, EnumSelect, LabeledField, TagsField } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Rating } from "@/components/ui/rating";
import { closesOnSuccess, StatusButton, useButtonStatus } from "@/components/ui/status-button";
import type { ButtonStatus } from "@/components/ui/status-button";
import { Textarea } from "@/components/ui/textarea";
import { ShopInput } from "@/components/vocabulary-fields";
import type { Saving } from "@/data/client";
import { FILL_FIELD } from "@/lib/fill-fields";
import type { FillFieldId } from "@/lib/fill-fields";
import { PreviousIcon } from "@/lib/icons";
import { HugeiconsIcon } from "@hugeicons/react";

/** The one value a fill writes, as its editor holds it. */
export type FillDraft = {
  readonly status: CollectionStatus;
  readonly paid: boolean;
  readonly text: string;
  readonly condition: (typeof CONDITIONS)[number];
  readonly shipping: (typeof SHIPPING_METHODS)[number];
  readonly date: string | null;
  readonly score: number;
  readonly tags: readonly string[];
};

/** What one and several selected rows are called, as in "2 selected items". */
export type FillNoun = { readonly one: string; readonly other: string };

const selectedRows = (count: number, noun: FillNoun) =>
  `${count} selected ${count === 1 ? noun.one : noun.other}`;

/** Selected rows of one kind, and how a fill of them starts, reads and writes. */
export type FillGroup<Field extends FillFieldId> = {
  readonly key: string;
  readonly noun: FillNoun;
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
  /** Why no value can be written to these rows, such as a selection the server will not take. */
  readonly refusal?: string;
};

function FillForm<Field extends FillFieldId>({
  group,
  field,
  currency,
  status,
  run,
  onDone,
}: {
  readonly group: FillGroup<Field>;
  readonly field: Field;
  readonly currency: Currency;
  readonly status: ButtonStatus;
  readonly run: ReturnType<typeof useButtonStatus>["run"];
  readonly onDone: () => void;
}) {
  const [draft, setDraft] = useState(() => group.seed(field));
  const [edited, setEdited] = useState(false);
  const saving = status === "loading";
  const set = (patch: Partial<FillDraft>) => {
    setEdited(true);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const prepared = group.prepare(field, draft);
  const note = group.refusal ?? group.hint(field, draft);
  const unwritable = group.refusal !== undefined || prepared.isErr();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || group.refusal !== undefined || prepared.isErr()) return;
    const saved = await run(prepared.value.run, closesOnSuccess);
    if (saved.isErr()) return;
    onDone();
  };

  return (
    <form onSubmit={submit} aria-busy={saving} className="grid gap-2.5">
      <fieldset disabled={saving} className="grid min-w-0 gap-2.5">
        <FillEditor
          field={field}
          id={`fill-${field}`}
          draft={draft}
          noun={group.noun}
          currency={currency}
          pricePlaceholder={group.pricePlaceholder}
          error={edited && prepared.isErr() ? prepared.error : undefined}
          set={set}
        />
        {note ? <p className="text-xs text-pretty text-muted-foreground">{note}</p> : null}
      </fieldset>
      <StatusButton
        type="submit"
        size="sm"
        className="w-full"
        status={status}
        disabled={unwritable}
      >
        {`Fill ${group.count} selected`}
      </StatusButton>
    </form>
  );
}

function FillEditor({
  field,
  id,
  draft,
  noun,
  currency,
  pricePlaceholder,
  error,
  set,
}: {
  readonly field: FillFieldId;
  readonly id: string;
  readonly draft: FillDraft;
  readonly noun: FillNoun;
  readonly currency: Currency;
  readonly pricePlaceholder: string;
  readonly error: string | undefined;
  readonly set: (patch: Partial<FillDraft>) => void;
}): ReactElement {
  const { label, editor } = FILL_FIELD[field];
  switch (editor) {
    case "status":
      return (
        <LabeledField id={id} label={label} error={error}>
          <EnumSelect
            id={id}
            value={draft.status}
            options={COLLECTION_STATUSES}
            onChange={(status) => set({ status })}
          />
        </LabeledField>
      );
    case "paid":
      return (
        <div className="flex h-8 items-center gap-2">
          <Checkbox
            id={id}
            checked={draft.paid}
            onCheckedChange={(paid) => set({ paid: paid === true })}
          />
          <Label htmlFor={id} className="cursor-pointer">
            {label}
          </Label>
        </div>
      );
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
            aria-label={`Score for every selected ${noun.one}`}
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
  const { status, run } = useButtonStatus();
  const [chosen, setChosen] = useState<{ readonly group: string; readonly field: Field } | null>(
    null,
  );
  const group = groups.find(({ key }) => key === chosen?.group);
  const filled = groups.filter(({ count }) => count > 0);
  const change = (next: boolean) => {
    setOpen(next);
    if (!next) setChosen(null);
  };
  return (
    <Popover open={open} onOpenChange={change}>
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
              id="fill-back"
              className="w-fit"
              disabled={status === "loading"}
              onClick={() => {
                setChosen(null);
                setTimeout(() => {
                  document.querySelector<HTMLElement>("[data-fill-list] button:enabled")?.focus();
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
              status={status}
              run={run}
              onDone={() => change(false)}
            />
          </div>
        ) : (
          <div data-fill-list="" className="grid gap-0.5">
            <p className="px-2 pb-1 text-xs text-muted-foreground tabular-nums">
              {filled.length === 0
                ? "Select items to fill."
                : `Write one value to ${filled.map(({ count, noun }) => selectedRows(count, noun)).join(" and ")}.`}
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
                        document.querySelector<HTMLElement>(`[id="fill-${field}"]`) ??
                        document.querySelector<HTMLElement>('[id="fill-back"]');
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
