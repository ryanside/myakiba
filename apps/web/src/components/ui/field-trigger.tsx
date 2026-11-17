import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DisclosureIcon } from "@/lib/icons";

const fieldTriggerClassName = "bg-input/50 hover:bg-input/80 aria-expanded:bg-input/80";

function FieldTrigger({ className, children, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      type="button"
      className={cn(fieldTriggerClassName, "press-none w-full justify-between", className)}
      {...props}
    >
      {children}
      <HugeiconsIcon icon={DisclosureIcon} data-icon="inline-end" />
    </Button>
  );
}

export { FieldTrigger, fieldTriggerClassName };
