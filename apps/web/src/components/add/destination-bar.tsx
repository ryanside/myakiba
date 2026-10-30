import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  DatabaseIcon,
  LibraryIcon,
  PackageIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import type { Currency } from "@myakiba/contracts/shared/types";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { commitSummary } from "./commit-input";
import type { CommitIssue, Destination, DestinationForm, Ownership } from "./commit-input";
import { ListsPicker } from "./lists-picker";
import { OrderFields } from "./order-fields";
import { SharedFields } from "./shared-fields";

const KINDS: readonly {
  readonly kind: Ownership["kind"];
  readonly label: string;
  readonly icon: IconSvgElement;
}[] = [
  { kind: "collection", label: "Collection", icon: LibraryIcon },
  { kind: "order", label: "Order", icon: PackageIcon },
  { kind: "none", label: "Not owned", icon: DatabaseIcon },
];

/** Where the selected rows go: exactly one of Collection, Order or Not owned, plus Wishlist and Lists. */
export function DestinationBar({
  form,
  destination,
  selectedCount,
  defaultOrderTitle,
  currency,
  issues,
  onChange,
  action,
}: {
  readonly form: DestinationForm;
  readonly destination: Destination;
  readonly selectedCount: number;
  readonly defaultOrderTitle: string;
  readonly currency: Currency;
  readonly issues: readonly CommitIssue[];
  readonly onChange: (form: DestinationForm) => void;
  /** The commit button, which owns the write. */
  readonly action: ReactNode;
}) {
  const baseId = useId();
  const legendId = `${baseId}-legend`;
  const fieldsId = `${baseId}-fields`;
  const summary = commitSummary(destination, selectedCount);
  // A narrow bar folds its fields away so the rows keep the screen, but never a field the commit
  // is waiting for.
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const needsField =
    issues.length > 0 ||
    (form.kind === "order" && form.order.kind === "existing" && form.order.order === null);
  const showFields = fieldsOpen || needsField;

  return (
    <section
      aria-label="Destination"
      className="@container/bar flex max-h-full min-h-0 shrink-0 flex-col rounded-xl bg-card shadow-lg ring-1 ring-foreground/10"
    >
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <span id={legendId} className="text-sm font-medium tabular-nums">
            Add {selectedCount} selected to
          </span>
          <RadioGroupPrimitive
            aria-labelledby={legendId}
            value={form.kind}
            onValueChange={(kind) => onChange({ ...form, kind: kind as Ownership["kind"] })}
            className="flex min-w-0 flex-wrap gap-1 rounded-lg bg-muted p-0.5 @max-sm/bar:w-full"
          >
            {KINDS.map(({ kind, label, icon }) => (
              <RadioPrimitive.Root
                key={kind}
                value={kind}
                className="flex h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors duration-100 select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:bg-background data-checked:text-foreground data-checked:shadow-xs dark:data-checked:bg-input"
              >
                <HugeiconsIcon
                  icon={icon}
                  className="size-4 shrink-0"
                  aria-hidden="true"
                  strokeWidth={2}
                />
                {label}
              </RadioPrimitive.Root>
            ))}
          </RadioGroupPrimitive>
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 @2xl/bar:ms-auto">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${baseId}-wishlist`}
                checked={form.wishlist}
                onCheckedChange={(checked) => onChange({ ...form, wishlist: checked === true })}
              />
              <Label htmlFor={`${baseId}-wishlist`} className="cursor-pointer font-normal">
                Wishlist
              </Label>
            </div>
            <ListsPicker chosen={form.lists} onChange={(lists) => onChange({ ...form, lists })} />
          </div>
        </div>

        {form.kind === "collection" || form.kind === "order" ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit @2xl/bar:hidden"
              aria-expanded={showFields}
              aria-controls={fieldsId}
              onClick={() => setFieldsOpen(!showFields)}
            >
              <HugeiconsIcon
                icon={showFields ? ArrowUp01Icon : ArrowDown01Icon}
                data-icon="inline-start"
                aria-hidden="true"
              />
              {form.kind === "collection" ? "Collection details" : "Order details"}
            </Button>
            <div id={fieldsId} className={cn("@2xl/bar:block", !showFields && "hidden")}>
              {form.kind === "collection" ? (
                <SharedFields
                  shared={form.shared}
                  onChange={(shared) => onChange({ ...form, shared })}
                />
              ) : (
                <OrderFields
                  choice={form.order}
                  defaultTitle={defaultOrderTitle}
                  currency={currency}
                  issues={issues}
                  onChange={(order) => onChange({ ...form, order })}
                />
              )}
            </div>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-foreground/10 px-3 py-2.5">
        <p className="min-w-0 flex-1 basis-56 text-sm text-pretty text-muted-foreground [overflow-wrap:anywhere]">
          {summary ?? "Choose Collection, Order or Not owned."}
        </p>
        {action}
      </div>
    </section>
  );
}
