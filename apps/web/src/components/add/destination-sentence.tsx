import { DatabaseIcon, LibraryIcon, PackageAddIcon, PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { motion } from "motion/react";
import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useMotionPreference } from "@/hooks/use-appearance";
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
    // Arrow keys choose as they move, so passing through a choice must not cost the other's fields.
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

/**
 * Where the rows go: every choice in view, one press away, with one surface that travels to the
 * chosen one. With nothing chosen the whole control carries the ring, as the page's next step.
 */
function DestinationChoices({ controller: c }: { readonly controller: AddController }) {
  const surfaceId = useId();
  const reduce = useMotionPreference().reduce;
  const form = c.resolvedForm;
  const choice = choiceOf(form);
  return (
    <RadioGroupPrimitive
      aria-label="Where these go"
      value={choice}
      onValueChange={(next) => {
        const chosen = CHOICES.find(({ value }) => value === next);
        if (chosen) c.setForm(choose(form, chosen.value));
      }}
      className={cn(
        "grid grid-cols-2 gap-1 rounded-xl bg-card p-1 ring-1 ring-foreground/10 @2xl/add:grid-cols-4",
        choice === null && "ring-2 ring-primary",
      )}
    >
      {CHOICES.map(({ value, label, icon }) => (
        <RadioPrimitive.Root
          key={value}
          value={value}
          className={cn(
            "relative flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium whitespace-nowrap transition-[color,scale] duration-150 ease-out outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96] motion-reduce:active:scale-100",
            value === choice
              ? "text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === choice ? (
            <motion.span
              layoutId={surfaceId}
              aria-hidden="true"
              className="absolute inset-0 rounded-lg bg-primary shadow-xs"
              transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }}
            />
          ) : null}
          <HugeiconsIcon icon={icon} className="relative size-4 shrink-0" aria-hidden="true" />
          <span className="relative">{label}</span>
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  );
}

/** The destination: what is going where, the choice, and what else it goes on. */
export function DestinationSentence({ controller: c }: { readonly controller: AddController }) {
  const baseId = useId();
  const form = c.resolvedForm;
  const choice = choiceOf(form);
  const total = c.rows.filter((row) => c.items.has(row.itemId)).length;
  const phrase = itemsPhrase(c.commitRows.length, total, c.itemsLoading);

  return (
    <section aria-label="Destination" className="flex flex-col gap-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="font-medium tabular-nums">
          {choice === "none" ? `Keep ${phrase} in` : `Add ${phrase} to`}
        </span>
        <span className="flex flex-wrap items-center gap-2">
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
      </div>
      <DestinationChoices controller={c} />
    </section>
  );
}
