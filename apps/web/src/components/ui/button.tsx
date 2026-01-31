import * as React from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Slot as SlotPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "cursor-pointer group whitespace-nowrap focus-visible:outline-hidden inline-flex items-center justify-center has-data-[arrow=true]:justify-between whitespace-nowrap text-sm font-medium ring-offset-background transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-60 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "from-primary to-primary/85 text-primary-foreground border border-zinc-950/25 bg-gradient-to-t shadow-md shadow-zinc-950/20 ring-1 ring-inset ring-white/20 transition-[filter] duration-200 hover:brightness-110 active:brightness-90 dark:border-white/20 dark:ring-transparent",
        mono: "from-zinc-950 to-zinc-950/85 text-white dark:from-zinc-300 dark:to-zinc-300/85 dark:text-black border border-zinc-950/25 bg-gradient-to-t shadow-md shadow-zinc-950/20 ring-1 ring-inset ring-white/20 transition-[filter] duration-200 hover:brightness-110 active:brightness-90 dark:border-white/20 dark:ring-transparent data-[state=open]:brightness-90",
        destructive:
          "from-destructive to-destructive/85 text-destructive-foreground border border-zinc-950/25 bg-gradient-to-t shadow-md shadow-zinc-950/20 ring-1 ring-inset ring-white/20 transition-[filter] duration-200 hover:brightness-110 active:brightness-90 dark:border-white/15 dark:ring-transparent",
        secondary:
          "from-secondary to-secondary/85 text-secondary-foreground border border-zinc-950/25 bg-gradient-to-t shadow-md shadow-zinc-950/20 ring-1 ring-inset ring-white/20 transition-[filter] duration-200 hover:brightness-110 active:brightness-90 dark:border-white/20 dark:ring-transparent data-[state=open]:brightness-90",
        outline:
          "bg-muted hover:bg-background dark:bg-muted/25 dark:hover:bg-muted/50 dark:border-border inset-shadow-2xs inset-shadow-white dark:inset-shadow-transparent relative flex border border-zinc-300 shadow-sm shadow-zinc-950/10 ring-0 duration-150",
        dashed:
          "text-accent-foreground border border-input border-dashed bg-background hover:bg-accent hover:text-accent-foreground data-[state=open]:text-accent-foreground",
        ghost:
          "text-accent-foreground hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
        dim: "text-muted-foreground hover:text-foreground data-[state=open]:text-foreground",
        foreground: "",
        inverse: "",
      },
      appearance: {
        default: "",
        ghost: "",
      },
      underline: {
        solid: "",
        dashed: "",
      },
      underlined: {
        solid: "",
        dashed: "",
      },
      size: {
        lg: "h-10 rounded-md px-4 text-sm gap-1.5 [&_svg:not([class*=size-])]:size-4",
        md: "h-8.5 rounded-md px-3 gap-1.5 text-[0.8125rem] leading-(--text-sm--line-height) [&_svg:not([class*=size-])]:size-4",
        sm: "h-7 rounded-md px-2.5 gap-1.25 text-xs [&_svg:not([class*=size-])]:size-3.5",
        icon: "size-8.5 rounded-md [&_svg:not([class*=size-])]:size-4 shrink-0",
      },
      autoHeight: {
        true: "",
        false: "",
      },
      shape: {
        default: "",
        circle: "rounded-full",
      },
      mode: {
        default: "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        icon: "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 shrink-0",
        link: "text-primary h-auto p-0 bg-transparent rounded-none hover:bg-transparent data-[state=open]:bg-transparent",
        input: `
            justify-start font-normal hover:bg-background [&_svg]:transition-colors [&_svg]:hover:text-foreground data-[state=open]:bg-background 
            focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/30 
            [[data-state=open]>&]:border-ring [[data-state=open]>&]:outline-hidden [[data-state=open]>&]:ring-[3px] 
            [[data-state=open]>&]:ring-ring/30 
            aria-invalid:border-destructive/60 aria-invalid:ring-destructive/10 dark:aria-invalid:border-destructive dark:aria-invalid:ring-destructive/20
            in-data-[invalid=true]:border-destructive/60 in-data-[invalid=true]:ring-destructive/10  dark:in-data-[invalid=true]:border-destructive dark:in-data-[invalid=true]:ring-destructive/20
          `,
      },
      placeholder: {
        true: "text-muted-foreground",
        false: "",
      },
    },
    compoundVariants: [
      // Icons opacity for default mode
      {
        variant: "ghost",
        mode: "default",
        className: "[&_svg:not([role=img]):not([class*=text-]):not([class*=opacity-])]:opacity-60",
      },
      {
        variant: "outline",
        mode: "default",
        className: "[&_svg:not([role=img]):not([class*=text-]):not([class*=opacity-])]:opacity-60",
      },
      {
        variant: "dashed",
        mode: "default",
        className: "[&_svg:not([role=img]):not([class*=text-]):not([class*=opacity-])]:opacity-60",
      },
      {
        variant: "secondary",
        mode: "default",
        className: "[&_svg:not([role=img]):not([class*=text-]):not([class*=opacity-])]:opacity-60",
      },

      // Icons opacity for default mode
      {
        variant: "outline",
        mode: "input",
        className: "[&_svg:not([role=img]):not([class*=text-]):not([class*=opacity-])]:opacity-60",
      },
      {
        variant: "outline",
        mode: "icon",
        className: "[&_svg:not([role=img]):not([class*=text-]):not([class*=opacity-])]:opacity-60",
      },

      // Auto height
      {
        size: "md",
        autoHeight: true,
        className: "h-auto min-h-8.5",
      },
      {
        size: "sm",
        autoHeight: true,
        className: "h-auto min-h-7",
      },
      {
        size: "lg",
        autoHeight: true,
        className: "h-auto min-h-10",
      },

      // Shadow support
      {
        variant: "primary",
        mode: "default",
        appearance: "default",
        className: "shadow-xs shadow-black/5",
      },
      {
        variant: "mono",
        mode: "default",
        appearance: "default",
        className: "shadow-xs shadow-black/5",
      },
      {
        variant: "secondary",
        mode: "default",
        appearance: "default",
        className: "shadow-xs shadow-black/5",
      },
      {
        variant: "outline",
        mode: "default",
        appearance: "default",
        className: "shadow-xs shadow-black/5",
      },
      {
        variant: "dashed",
        mode: "default",
        appearance: "default",
        className: "shadow-xs shadow-black/5",
      },
      {
        variant: "destructive",
        mode: "default",
        appearance: "default",
        className: "shadow-xs shadow-black/5",
      },

      // Shadow support
      {
        variant: "primary",
        mode: "icon",
        appearance: "default",
        className: "shadow-xs shadow-black/5",
      },
      {
        variant: "mono",
        mode: "icon",
        appearance: "default",
        className: "shadow-xs shadow-black/5",
      },
      {
        variant: "secondary",
        mode: "icon",
        appearance: "default",
        className: "shadow-xs shadow-black/5",
      },
      {
        variant: "outline",
        mode: "icon",
        appearance: "default",
        className: "shadow-xs shadow-black/5",
      },
      {
        variant: "dashed",
        mode: "icon",
        appearance: "default",
        className: "shadow-xs shadow-black/5",
      },
      {
        variant: "destructive",
        mode: "icon",
        appearance: "default",
        className: "shadow-xs shadow-black/5",
      },

      // Link
      {
        variant: "primary",
        mode: "link",
        underline: "solid",
        className:
          "font-medium text-primary hover:text-primary/90 [&_svg:not([role=img]):not([class*=text-])]:opacity-60 hover:underline hover:underline-offset-4 hover:decoration-solid",
      },
      {
        variant: "primary",
        mode: "link",
        underline: "dashed",
        className:
          "font-medium text-primary hover:text-primary/90 [&_svg:not([role=img]):not([class*=text-])]:opacity-60 hover:underline hover:underline-offset-4 hover:decoration-dashed decoration-1",
      },
      {
        variant: "primary",
        mode: "link",
        underlined: "solid",
        className:
          "font-medium text-primary hover:text-primary/90 [&_svg:not([role=img]):not([class*=text-])]:opacity-60 underline underline-offset-4 decoration-solid",
      },
      {
        variant: "primary",
        mode: "link",
        underlined: "dashed",
        className:
          "font-medium text-primary hover:text-primary/90 [&_svg]:opacity-60 underline underline-offset-4 decoration-dashed decoration-1",
      },

      {
        variant: "inverse",
        mode: "link",
        underline: "solid",
        className:
          "font-medium text-inherit [&_svg:not([role=img]):not([class*=text-])]:opacity-60 hover:underline hover:underline-offset-4 hover:decoration-solid",
      },
      {
        variant: "inverse",
        mode: "link",
        underline: "dashed",
        className:
          "font-medium text-inherit [&_svg:not([role=img]):not([class*=text-])]:opacity-60 hover:underline hover:underline-offset-4 hover:decoration-dashed decoration-1",
      },
      {
        variant: "inverse",
        mode: "link",
        underlined: "solid",
        className:
          "font-medium text-inherit [&_svg:not([role=img]):not([class*=text-])]:opacity-60 underline underline-offset-4 decoration-solid",
      },
      {
        variant: "inverse",
        mode: "link",
        underlined: "dashed",
        className:
          "font-medium text-inherit [&_svg:not([role=img]):not([class*=text-])]:opacity-60 underline underline-offset-4 decoration-dashed decoration-1",
      },

      {
        variant: "foreground",
        mode: "link",
        underline: "solid",
        className:
          "font-medium text-foreground [&_svg:not([role=img]):not([class*=text-])]:opacity-60 hover:underline hover:underline-offset-4 hover:decoration-solid",
      },
      {
        variant: "foreground",
        mode: "link",
        underline: "dashed",
        className:
          "font-medium text-foreground [&_svg:not([role=img]):not([class*=text-])]:opacity-60 hover:underline hover:underline-offset-4 hover:decoration-dashed decoration-1",
      },
      {
        variant: "foreground",
        mode: "link",
        underlined: "solid",
        className:
          "font-medium text-foreground [&_svg:not([role=img]):not([class*=text-])]:opacity-60 underline underline-offset-4 decoration-solid",
      },
      {
        variant: "foreground",
        mode: "link",
        underlined: "dashed",
        className:
          "font-medium text-foreground [&_svg:not([role=img]):not([class*=text-])]:opacity-60 underline underline-offset-4 decoration-dashed decoration-1",
      },

      // Ghost
      {
        variant: "primary",
        appearance: "ghost",
        className:
          "bg-transparent text-primary/90 hover:bg-primary/5 data-[state=open]:bg-primary/5",
      },
      {
        variant: "destructive",
        appearance: "ghost",
        className:
          "bg-transparent text-destructive/90 hover:bg-destructive/5 data-[state=open]:bg-destructive/5",
      },
      {
        variant: "ghost",
        mode: "icon",
        className: "text-muted-foreground",
      },

      // Size
      {
        size: "sm",
        mode: "icon",
        className: "w-7 h-7 p-0 [[&_svg:not([class*=size-])]:size-3.5",
      },
      {
        size: "md",
        mode: "icon",
        className: "w-8.5 h-8.5 p-0 [&_svg:not([class*=size-])]:size-4",
      },
      {
        size: "icon",
        className: "w-8.5 h-8.5 p-0 [&_svg:not([class*=size-])]:size-4",
      },
      {
        size: "lg",
        mode: "icon",
        className: "w-10 h-10 p-0 [&_svg:not([class*=size-])]:size-4",
      },

      // Input mode
      {
        mode: "input",
        placeholder: true,
        variant: "outline",
        className: "font-normal text-muted-foreground",
      },
      {
        mode: "input",
        variant: "outline",
        size: "sm",
        className: "gap-1.25",
      },
      {
        mode: "input",
        variant: "outline",
        size: "md",
        className: "gap-1.5",
      },
      {
        mode: "input",
        variant: "outline",
        size: "lg",
        className: "gap-1.5",
      },
    ],
    defaultVariants: {
      variant: "primary",
      mode: "default",
      size: "md",
      shape: "default",
      appearance: "default",
    },
  },
);

function Button({
  className,
  selected,
  variant,
  shape,
  appearance,
  mode,
  size,
  autoHeight,
  underlined,
  underline,
  asChild = false,
  placeholder = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    selected?: boolean;
    asChild?: boolean;
  }) {
  const Comp = asChild ? SlotPrimitive.Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(
        buttonVariants({
          variant,
          size,
          shape,
          appearance,
          mode,
          autoHeight,
          placeholder,
          underlined,
          underline,
          className,
        }),
        asChild && props.disabled && "pointer-events-none opacity-50",
      )}
      {...(selected && { "data-state": "open" })}
      {...props}
    />
  );
}

interface ButtonArrowProps extends React.SVGProps<SVGSVGElement> {
  icon?: LucideIcon; // Allows passing Lucide icon
}

function ButtonArrow({ icon: Icon = ChevronDown, className, ...props }: ButtonArrowProps) {
  return <Icon data-slot="button-arrow" className={cn("ms-auto -me-1", className)} {...props} />;
}

export { Button, ButtonArrow, buttonVariants };
