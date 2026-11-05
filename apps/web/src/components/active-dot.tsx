import { cn } from "@/lib/utils";

/** Marks the current item in a nav list. */
export function ActiveDot({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full bg-foreground", className)} />
  );
}
