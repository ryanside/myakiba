import { DatabaseIcon, LibraryIcon, PackageAddIcon, PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { Fragment, useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AddController } from "./add-controller";
import { DEFAULT_ORDER_FIELDS } from "./commit-input";
import type { DestinationForm } from "./commit-input";
import { ListsPicker } from "./lists-picker";

type Choice = "collection" | "order-new" | "order-existing" | "none";

const CHOICES: readonly {
  readonly value: Choice;
  readonly label: string;
  readonly icon: IconSvgElement;
}[] = [
  { value: "collection", label: "Collection", icon: LibraryIcon },
  { value: "order-new", label: "New Order", icon: PackageAddIcon },
  { value: "order-existing", label: "Existing Order", icon: PackageIcon },
  { value: "none", label: "Item Database", icon: DatabaseIcon },
];

const choiceOf = (form: DestinationForm): Choice | null => {
  if (form.kind === "order") return form.order.kind === "new" ? "order-new" : "order-existing";
  return form.kind;
};

function choose(form: DestinationForm, choice: Choice): DestinationForm {
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

function itemsPhrase(selected: number, total: number, loading: boolean): string {
  // Until the rows' Items are read, no count is true.
  if (loading || total === 0) return "items";
  const noun = total === 1 ? "item" : "items";
  return selected === total ? `${selected} ${noun}` : `${selected} of ${total} ${noun}`;
}

/** The sentence's choice. The menu separates what the rows are from where they only get recorded. */
function DestinationSelect({ controller: c }: { readonly controller: AddController }) {
  const form = c.resolvedForm;
  const choice = choiceOf(form);
  const chosen = CHOICES.find(({ value }) => value === choice);
  return (
    <Select
      items={CHOICES}
      value={choice}
      onValueChange={(next) => {
        if (next !== null) c.setForm(choose(form, next));
      }}
    >
      <SelectTrigger
        aria-label="Where these go"
        className={cn(
          "gap-2 font-medium",
          chosen && "pl-2",
          choice === null &&
            "border-transparent bg-primary text-primary-foreground data-placeholder:text-primary-foreground dark:bg-primary dark:hover:bg-primary [&_svg]:text-primary-foreground",
        )}
      >
        {chosen ? (
          <HugeiconsIcon
            icon={chosen.icon}
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        ) : null}
        <SelectValue placeholder="choose where" />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start" className="w-52 max-w-[90vw] p-1">
        {CHOICES.map(({ value, label, icon }) => (
          <Fragment key={value}>
            {value === "order-new" || value === "none" ? <SelectSeparator /> : null}
            <SelectItem value={value} className="py-1.5">
              <span className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={icon}
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                {label}
              </span>
            </SelectItem>
          </Fragment>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The destination, as one sentence. */
export function DestinationSentence({ controller: c }: { readonly controller: AddController }) {
  const baseId = useId();
  const form = c.resolvedForm;
  const choice = choiceOf(form);
  const total = c.rows.filter((row) => c.items.has(row.itemId)).length;
  const phrase = itemsPhrase(c.commitRows.length, total, c.itemsLoading);

  return (
    <section
      aria-label="Destination"
      className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm"
    >
      <span className="font-medium tabular-nums">
        {choice === "none" ? `Keep ${phrase} in` : `Add ${phrase} to`}
      </span>
      <DestinationSelect controller={c} />
      <span className="flex flex-wrap items-center gap-2 @2xl/add:ms-2">
        <span className="text-foreground/80">also on</span>
        <span className="flex items-center gap-2">
          <Checkbox
            id={`${baseId}-wishlist`}
            checked={form.wishlist}
            onCheckedChange={(checked) => c.setForm({ ...form, wishlist: checked === true })}
          />
          <Label htmlFor={`${baseId}-wishlist`} className="cursor-pointer font-normal">
            Wishlist
          </Label>
        </span>
        <span className="text-foreground/80">and</span>
        <ListsPicker chosen={form.lists} onChange={(lists) => c.setForm({ ...form, lists })} />
      </span>
    </section>
  );
}
