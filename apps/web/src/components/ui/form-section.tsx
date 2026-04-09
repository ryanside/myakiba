import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

type FormSectionProps = {
  readonly title: string;
  readonly description?: string;
  readonly defaultOpen?: boolean;
  readonly children: React.ReactNode;
  readonly className?: string;
};

function FormSection({
  title,
  description,
  defaultOpen = true,
  children,
  className,
}: FormSectionProps) {
  return (
    <CollapsiblePrimitive.Root defaultOpen={defaultOpen} className={className}>
      <CollapsiblePrimitive.Trigger
        className={cn(
          "group/trigger flex w-full items-center gap-2 py-1 cursor-pointer select-none",
          "text-xs font-normal tracking-wide",
          "text-muted-foreground/70 hover:text-muted-foreground",
          "transition-colors duration-150",
        )}
      >
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          className="size-3.5 shrink-0 transition-transform duration-200 group-aria-expanded/trigger:rotate-90"
        />
        <span>{title}</span>
        {description && (
          <span className="ml-auto text-[10px] font-normal normal-case tracking-normal text-muted-foreground/50">
            {description}
          </span>
        )}
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Panel className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0">
        <div className="grid gap-2.5 pt-1.5 pb-0.5">{children}</div>
      </CollapsiblePrimitive.Panel>
    </CollapsiblePrimitive.Root>
  );
}

export { FormSection };
export type { FormSectionProps };
