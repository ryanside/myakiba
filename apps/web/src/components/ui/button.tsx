import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent text-sm font-medium whitespace-nowrap press outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/85 aria-expanded:bg-primary/85 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
        outline:
          "border-border bg-card text-foreground hover:bg-muted aria-expanded:bg-muted dark:border-input dark:bg-transparent dark:hover:bg-muted",
        secondary:
          "bg-muted text-foreground hover:bg-[color-mix(in_oklab,var(--color-foreground)_8%,var(--color-muted))] aria-expanded:bg-[color-mix(in_oklab,var(--color-foreground)_8%,var(--color-muted))]",
        ghost:
          "bg-transparent text-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/15 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
        link: "border-transparent bg-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-3 text-[0.8125rem] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

// CSS can't read an element's own width, and the press caps its travel in px (`press` in index.css).
function handPressWidth(button: HTMLElement): void {
  button.style.setProperty("--press-width", String(button.offsetWidth));
}

function Button({
  className,
  variant = "default",
  size = "default",
  onPointerDown,
  onKeyDown,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      onPointerDown={(event) => {
        handPressWidth(event.currentTarget);
        onPointerDown?.(event);
      }}
      onKeyDown={(event) => {
        handPressWidth(event.currentTarget);
        onKeyDown?.(event);
      }}
      {...props}
    />
  );
}

export { Button, buttonVariants };
