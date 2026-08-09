import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const raisedSurface = "inset-shadow-xs shadow-xs ring-0 dark:shadow-black/25";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup=menu]:not-aria-[haspopup=listbox]:not-aria-[haspopup=tree]:not-aria-[haspopup=grid]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: cn(
          raisedSurface,
          "inset-shadow-white/20 border-black/25 bg-primary text-primary-foreground shadow-foreground/15 hover:bg-[color-mix(in_srgb,var(--color-background)_14%,var(--color-primary))] active:bg-[color-mix(in_srgb,var(--color-background)_22%,var(--color-primary))] dark:border-black/20",
        ),
        outline: cn(
          raisedSurface,
          "inset-shadow-white dark:inset-shadow-white/5 border-border bg-background bg-clip-padding shadow-foreground/5 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        ),
        secondary: cn(
          raisedSurface,
          "inset-shadow-white dark:inset-shadow-white/15 border-black/12 bg-secondary text-secondary-foreground shadow-foreground/5 hover:bg-[color-mix(in_srgb,var(--color-foreground)_8%,var(--color-secondary))] active:bg-[color-mix(in_srgb,var(--color-foreground)_14%,var(--color-secondary))] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground dark:border-black/30",
        ),
        ghost:
          "border-transparent bg-transparent text-foreground shadow-none ring-0 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive: cn(
          raisedSurface,
          "inset-shadow-white dark:inset-shadow-white/15 border-destructive/20 bg-destructive/10 bg-clip-padding text-destructive shadow-destructive/5 hover:bg-destructive/20 active:bg-destructive/30 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:border-destructive/30 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:active:bg-destructive/40 dark:focus-visible:ring-destructive/40",
        ),
        link: "border-transparent bg-transparent text-primary underline-offset-4 shadow-none ring-0 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
