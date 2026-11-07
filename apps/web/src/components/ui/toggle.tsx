import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-lg text-sm font-medium whitespace-nowrap press outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-muted data-pressed:bg-muted dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent hover:bg-muted",
        pill: "rounded-full bg-muted px-3 text-foreground hover:bg-[color-mix(in_oklab,var(--color-foreground)_8%,var(--color-muted))] aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90 data-pressed:bg-primary data-pressed:text-primary-foreground data-pressed:hover:bg-primary/90",
        segmented:
          "rounded-full bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs dark:aria-pressed:bg-input dark:data-pressed:bg-input",
      },
      size: {
        default: "h-8 min-w-8 px-2",
        sm: "h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8125rem]",
        lg: "h-9 min-w-9 px-2.5",
      },
    },
    // A segmented option sits inside a 2px track, so the whole control matches a 32px button.
    compoundVariants: [
      { variant: "segmented", size: "default", class: "h-7 min-w-7 px-3" },
      // Chips and segments stay fully round; the small size's corner radius is for square toggles.
      { variant: ["pill", "segmented"], class: "rounded-full" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
