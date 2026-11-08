import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
import { DebouncedInput } from "@/components/debounced-input";
import { cn } from "@/lib/utils";

export function SearchPill({
  className,
  ref,
  ...props
}: ComponentProps<typeof DebouncedInput>): React.JSX.Element {
  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <HugeiconsIcon
        icon={Search01Icon}
        aria-hidden
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <DebouncedInput
        {...props}
        ref={ref}
        className="h-8 rounded-full border-transparent bg-muted ps-9 pe-3.5 shadow-none dark:bg-muted"
      />
    </div>
  );
}
