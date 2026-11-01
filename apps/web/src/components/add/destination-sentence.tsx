import { DatabaseIcon, LibraryIcon, PackageAddIcon, PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { Fragment, useId, useState } from "react";
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
import { keyJustPressed, useGlide } from "@/hooks/use-glide";
import { cn } from "@/lib/utils";
import type { AddController } from "./add-controller";
import { DEFAULT_ORDER_FIELDS } from "./commit-input";
import type { DestinationForm } from "./commit-input";
import { Swap, WORDS } from "./destination-motion";
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

export const choiceOf = (form: DestinationForm): Choice | null => {
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

function itemsPhrase(selected: number, total: number): string {
  if (total === 0) return "items";
  const noun = total === 1 ? "item" : "items";
  return selected === total ? `${selected} ${noun}` : `${selected} of ${total} ${noun}`;
}

/** The sentence's choice. The menu separates what the rows are from where they only get recorded. */
function DestinationSelect({
  controller: c,
  disabled,
}: {
  readonly controller: AddController;
  readonly disabled: boolean;
}) {
  const form = c.resolvedForm;
  const choice = choiceOf(form);
  const chosen = CHOICES.find(({ value }) => value === choice);
  const glide = useGlide<HTMLDivElement>(choice);
  const [openedByKey, setOpenedByKey] = useState(false);
  return (
    <div ref={glide} className="max-w-full min-w-0">
      <Select
        items={CHOICES}
        value={choice}
        disabled={disabled}
        onOpenChange={() => setOpenedByKey(keyJustPressed())}
        onValueChange={(next) => {
          if (next !== null) c.setForm(choose(form, next));
        }}
      >
        <SelectTrigger
          aria-label="Where these go"
          className={cn(
            "gap-2",
            // The glide's width is the trigger's, so its edge and chevron stay whole as it grows.
            "w-full",
            chosen && "pl-2",
            choice === null &&
              !disabled &&
              "border-transparent bg-primary text-primary-foreground data-placeholder:text-primary-foreground dark:bg-primary dark:hover:bg-primary [&_svg]:text-primary-foreground",
          )}
        >
          <Swap
            move={WORDS}
            id={choice ?? "unset"}
            className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
          >
            {chosen ? (
              <HugeiconsIcon
                icon={chosen.icon}
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            ) : null}
            {/* Its own text, as the Select's reads the choice a render late, past what `useGlide` measures. */}
            <SelectValue>{chosen?.label ?? "choose where"}</SelectValue>
          </Swap>
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          align="start"
          className={cn("w-52 max-w-[90vw] p-1", !openedByKey && "menu-settle")}
        >
          {CHOICES.map(({ value, label, icon }) => (
            <Fragment key={value}>
              {value === "order-new" || value === "none" ? <SelectSeparator /> : null}
              <SelectItem value={value}>
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
    </div>
  );
}

/** The destination, as one sentence. */
export function DestinationSentence({
  controller: c,
  disabled,
}: {
  readonly controller: AddController;
  /** No rows yet: the page keeps its shape, with nothing to choose for. */
  readonly disabled: boolean;
}) {
  const baseId = useId();
  const form = c.resolvedForm;
  const choice = choiceOf(form);
  const phrase = itemsPhrase(c.selectedCount, c.rowCount);
  const lead = choice === "none" ? `Keep ${phrase} in` : `Add ${phrase} to`;
  const glide = useGlide<HTMLSpanElement>(lead, { clip: false });

  return (
    <section
      aria-label="Destination"
      className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm"
    >
      <span ref={glide} className="shrink-0 font-medium whitespace-nowrap tabular-nums">
        <Swap move={WORDS} id={choice === "none" ? "keep" : "add"}>
          {lead}
        </Swap>
      </span>
      <DestinationSelect controller={c} disabled={disabled} />
      <span className="flex flex-wrap items-center gap-2 @2xl/add:ms-2">
        <span className="text-muted-foreground">also on</span>
        <span className="flex items-center gap-2">
          <Checkbox
            id={`${baseId}-wishlist`}
            checked={form.wishlist}
            disabled={disabled}
            onCheckedChange={(checked) => c.setForm({ ...form, wishlist: checked === true })}
          />
          <Label
            htmlFor={`${baseId}-wishlist`}
            className={cn("font-normal", disabled ? "opacity-50" : "cursor-pointer")}
          >
            Wishlist
          </Label>
        </span>
        <span className="text-muted-foreground">and</span>
        <ListsPicker
          chosen={form.lists}
          disabled={disabled}
          onChange={(lists) => c.setForm({ ...form, lists })}
        />
      </span>
    </section>
  );
}
