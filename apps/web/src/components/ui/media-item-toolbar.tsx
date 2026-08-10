import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const controlClassName =
  "size-8 rounded-[10px] border-transparent bg-transparent text-white shadow-none transition-[scale,background-color,box-shadow,color] duration-150 ease-out hover:bg-white/15 hover:shadow-[inset_0_0_0_1px_oklch(1_0_0/0.1)] focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-white/60 active:translate-y-0 active:scale-[0.96] active:bg-white/20 aria-expanded:bg-white/15 data-popup-open:bg-white/15";

type MediaItemToolbarProps = {
  readonly checked: boolean;
  readonly itemLabel: string;
  readonly itemSize: number;
  readonly onCheckedChange: () => void;
  readonly active?: boolean;
  readonly children: ReactNode;
};

function MediaItemToolbar({
  checked,
  itemLabel,
  itemSize,
  onCheckedChange,
  active = false,
  children,
}: MediaItemToolbarProps): React.JSX.Element {
  let size: "xs" | "sm" | "md" | "lg" = "lg";
  if (itemSize < 150) {
    size = "xs";
  } else if (itemSize < 180) {
    size = "sm";
  } else if (itemSize < 240) {
    size = "md";
  }
  const isVisible = checked || active;
  const selectionLabel = `${checked ? "Deselect" : "Select"} ${itemLabel}`;

  return (
    <div
      className={cn(
        "absolute top-2 right-2 z-20 flex items-center rounded-[12px] bg-black/45 p-0.5 shadow-[0_0_0_1px_oklch(1_0_0/0.16),0_1px_2px_oklch(0_0_0/0.2),0_8px_24px_oklch(0_0_0/0.16)] backdrop-blur-md transition-[translate,opacity] duration-150 ease-out",
        size === "md" &&
          "top-1.5 right-1.5 rounded-[11px] [&_[data-media-item-control]]:size-7 [&_[data-media-item-control]]:rounded-[9px] [&_svg]:size-3.5",
        size === "sm" &&
          "top-1 right-1 rounded-[9px] p-px [&_[data-media-item-control]]:size-6 [&_[data-media-item-control]]:rounded-[8px] [&_svg]:size-3.5",
        size === "xs" &&
          "top-1 right-1 rounded-[8px] p-px [&_[data-media-item-control]]:size-5 [&_[data-media-item-control]]:rounded-[7px] [&_svg]:size-3",
        !isVisible &&
          "pointer-events-none -translate-y-1 opacity-0 group-hover/media:pointer-events-auto group-hover/media:translate-y-0 group-hover/media:opacity-100 group-focus-within/media:pointer-events-auto group-focus-within/media:translate-y-0 group-focus-within/media:opacity-100",
      )}
    >
      <Checkbox
        data-media-item-control
        checked={checked}
        onCheckedChange={onCheckedChange}
        onPointerUp={(event) => event.currentTarget.blur()}
        aria-label={selectionLabel}
        title={selectionLabel}
        className={cn(
          controlClassName,
          "before:size-4 before:rounded-[4px] before:bg-transparent before:shadow-[inset_0_0_0_1px_white] after:hidden data-checked:bg-black data-checked:text-white data-checked:before:bg-black data-checked:before:shadow-none data-checked:hover:bg-black data-checked:active:bg-black dark:data-checked:bg-white dark:data-checked:text-black dark:data-checked:before:bg-white dark:data-checked:hover:bg-white dark:data-checked:active:bg-white [&_[data-slot=checkbox-indicator]]:absolute",
          size === "xs" && "before:size-3.5 before:rounded-[3px]",
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          "mx-0.5 h-4 w-px bg-white/15",
          size === "md" && "h-3.5",
          size === "sm" && "mx-px h-3",
          size === "xs" && "mx-px h-2.5",
        )}
      />
      {children}
    </div>
  );
}

function MediaItemAction({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      data-media-item-control
      variant="ghost"
      size="icon"
      className={cn(
        controlClassName,
        "hover:text-white focus-visible:text-white active:text-white aria-expanded:text-white data-popup-open:text-white",
        className,
      )}
    />
  );
}

export { MediaItemAction, MediaItemToolbar };
