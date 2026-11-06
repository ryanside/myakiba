import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A full-width button that reads as a field and opens a menu of choices. Like an input, it keeps still when pressed. */
function FieldTrigger({ className, children, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      type="button"
      className={cn("press-none w-full justify-between", className)}
      {...props}
    >
      {children}
      <HugeiconsIcon icon={ArrowDown01Icon} data-icon="inline-end" />
    </Button>
  );
}

export { FieldTrigger };
