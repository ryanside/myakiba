import { createContext, use } from "react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type ItemControlsVariant = "media" | "surface";
type ItemControlsSize = "xs" | "sm" | "md" | "lg";

const ItemControlsContext = createContext<ItemControlsVariant | null>(null);

const controlBaseClassName =
  "size-8 rounded-[10px] border-transparent bg-transparent shadow-none transition-[scale,background-color,box-shadow,color] duration-150 ease-out focus-visible:border-transparent focus-visible:ring-2 active:translate-y-0 active:not-aria-[haspopup=menu]:scale-[0.96]";

const selectionBaseClassName =
  "size-8 rounded-[10px] border-transparent bg-transparent shadow-none outline-none transition-[scale] duration-150 ease-out after:pointer-events-none after:top-1/2 after:right-auto after:bottom-auto after:left-1/2 after:size-5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-[6px] after:opacity-0 focus-visible:border-transparent focus-visible:ring-0 focus-visible:after:opacity-100 active:translate-y-0 active:scale-[0.96] aria-invalid:border-transparent aria-invalid:ring-0 aria-invalid:aria-checked:border-transparent data-checked:border-transparent data-checked:bg-transparent dark:bg-transparent dark:aria-invalid:border-transparent dark:aria-invalid:ring-0 dark:data-checked:bg-transparent";

function useItemControlsVariant(): ItemControlsVariant {
  const variant = use(ItemControlsContext);
  if (!variant) throw new Error("Item control elements must be used inside ItemControls");
  return variant;
}

function ItemControls({
  variant = "surface",
  size = "lg",
  active = false,
  className,
  children,
  ...props
}: ComponentProps<"div"> & {
  readonly variant?: ItemControlsVariant;
  readonly size?: ItemControlsSize;
  readonly active?: boolean;
  readonly children: ReactNode;
}): React.JSX.Element {
  return (
    <ItemControlsContext value={variant}>
      <div
        data-slot="item-controls"
        data-size={size}
        className={cn(
          "z-20 flex shrink-0 translate-y-0 items-center gap-px rounded-[12px] p-0.5 transition-[translate,opacity] duration-150 ease-out pointer-coarse:rounded-[13px]",
          variant === "media" &&
            "absolute top-2 right-2 bg-black/45 shadow-[0_0_0_1px_oklch(1_0_0/0.16),0_1px_2px_oklch(0_0_0/0.2),0_8px_24px_oklch(0_0_0/0.16)] backdrop-blur-md",
          size === "md" &&
            "top-1.5 right-1.5 rounded-[11px] [&_[data-slot=item-control]]:size-7 [&_[data-slot=item-selection]]:size-7 [&_[data-slot=item-control]]:rounded-[9px] [&_[data-slot=item-selection]]:rounded-[9px] [&_svg]:size-3.5",
          size === "sm" &&
            "top-1 right-1 rounded-[9px] p-px [&_[data-slot=item-control]]:size-6 [&_[data-slot=item-selection]]:size-6 [&_[data-slot=item-control]]:rounded-[8px] [&_[data-slot=item-selection]]:rounded-[8px] [&_svg]:size-3.5",
          size === "xs" &&
            "top-1 right-1 rounded-[8px] p-px [&_[data-slot=item-control]]:size-5 [&_[data-slot=item-selection]]:size-5 [&_[data-slot=item-control]]:rounded-[7px] [&_[data-slot=item-selection]]:rounded-[7px] [&_svg]:size-3",
          !active &&
            "pointer-fine:pointer-events-none pointer-fine:opacity-0 pointer-fine:group-hover/item:pointer-events-auto pointer-fine:group-hover/item:opacity-100 pointer-fine:group-has-[:focus-visible]/item:pointer-events-auto pointer-fine:group-has-[:focus-visible]/item:opacity-100",
          !active &&
            variant === "media" &&
            "pointer-fine:-translate-y-1 pointer-fine:group-hover/item:translate-y-0 pointer-fine:group-has-[:focus-visible]/item:translate-y-0",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </ItemControlsContext>
  );
}

function ItemControl({ className, ...props }: ComponentProps<typeof Button>): React.JSX.Element {
  const variant = useItemControlsVariant();

  return (
    <Button
      {...props}
      data-slot="item-control"
      variant="ghost"
      size="icon"
      className={cn(
        controlBaseClassName,
        variant === "media"
          ? "text-white hover:bg-white/15 hover:text-white hover:shadow-[inset_0_0_0_1px_oklch(1_0_0/0.1)] focus-visible:text-white focus-visible:ring-white/60 active:bg-white/20 active:text-white aria-expanded:bg-white/15 aria-expanded:text-white data-popup-open:bg-white/15 data-popup-open:text-white"
          : "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/60 active:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground data-popup-open:bg-muted data-popup-open:text-foreground pointer-coarse:size-10 pointer-coarse:rounded-[11px]",
        className,
      )}
    />
  );
}

function ItemControlsSelection({
  label,
  className,
  ...props
}: Omit<ComponentProps<typeof Checkbox>, "aria-label"> & {
  readonly label: string;
}): React.JSX.Element {
  const variant = useItemControlsVariant();

  return (
    <Checkbox
      {...props}
      data-slot="item-selection"
      aria-label={label}
      title={label}
      onPointerUp={(event) => event.currentTarget.blur()}
      className={cn(
        selectionBaseClassName,
        "before:size-4 before:rounded-[4px] before:bg-transparent [&_[data-slot=checkbox-indicator]]:absolute",
        variant === "media"
          ? "text-white before:shadow-[inset_0_0_0_1px_white] focus-visible:after:shadow-[0_0_0_2px_oklch(1_0_0/0.6)] data-checked:text-white data-checked:before:bg-black data-checked:before:shadow-none dark:data-checked:text-black dark:data-checked:before:bg-white"
          : "text-primary before:shadow-[inset_0_0_0_1px_var(--color-muted-foreground)] focus-visible:after:shadow-[0_0_0_2px_var(--color-ring)] data-checked:text-primary-foreground data-checked:before:bg-primary data-checked:before:shadow-none pointer-coarse:size-10 pointer-coarse:rounded-[11px]",
        className,
      )}
    />
  );
}

export { ItemControl, ItemControls, ItemControlsSelection };
