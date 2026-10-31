import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AddController } from "./add-controller";
import { DEFAULT_ORDER_FIELDS } from "./commit-input";
import type { DestinationForm } from "./commit-input";
import { ListsPicker } from "./lists-picker";

type Choice = "collection" | "order-new" | "order-existing" | "none";

const CHOICES: readonly { readonly value: Choice; readonly label: string }[] = [
  { value: "collection", label: "Collection" },
  { value: "order-new", label: "New Order" },
  { value: "order-existing", label: "Existing Order" },
  { value: "none", label: "Item Database" },
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
    // Switching between new and existing restarts that side, as the production toggle does.
    case "order-new":
      return {
        ...form,
        kind: "order",
        order:
          form.order.kind === "new" ? form.order : { kind: "new", fields: DEFAULT_ORDER_FIELDS },
      };
    case "order-existing":
      return {
        ...form,
        kind: "order",
        order: form.order.kind === "existing" ? form.order : { kind: "existing", order: null },
      };
  }
}

function itemsPhrase(selected: number, total: number, loading: boolean): string {
  // Until the rows' Items are read, no count is true.
  if (loading || total === 0) return "items";
  const noun = total === 1 ? "item" : "items";
  return selected === total ? `${selected} ${noun}` : `${selected} of ${total} ${noun}`;
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
            choice === null &&
              "border-transparent bg-primary text-primary-foreground data-placeholder:text-primary-foreground dark:hover:bg-primary [&_svg]:text-primary-foreground",
          )}
        >
          <SelectValue placeholder="choose where" />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start" className="w-48 max-w-[90vw]">
          {CHOICES.map(({ value, label }) => (
            <SelectItem key={value} value={value}>
              <span className="font-medium">{label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="flex flex-wrap items-center gap-2 @2xl/add:ms-2">
        <span className="text-muted-foreground">also on</span>
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
        <span className="text-muted-foreground">and</span>
        <ListsPicker chosen={form.lists} onChange={(lists) => c.setForm({ ...form, lists })} />
      </span>
    </section>
  );
}
