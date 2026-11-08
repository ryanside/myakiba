import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DisclosureIcon } from "@/lib/icons";

function FieldTrigger({ className, children, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      type="button"
      className={cn("press-none w-full justify-between", className)}
      {...props}
    >
      {children}
      <HugeiconsIcon icon={DisclosureIcon} data-icon="inline-end" />
    </Button>
  );
}

export { FieldTrigger };
