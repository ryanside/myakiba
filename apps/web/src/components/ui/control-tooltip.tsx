import { useRef } from "react";
import type { ComponentProps, ReactElement, ReactNode, Ref } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useComposedRefs } from "@/lib/compose-refs";

/**
 * Names a control on hover and focus while it shows only its icon. A control whose
 * `ControlLabel` is on screen keeps quiet, so a labelled button never repeats its own name.
 */
export function ControlTooltip({
  label,
  children,
  ref,
  ...triggerProps
}: Omit<ComponentProps<typeof TooltipTrigger>, "render" | "children"> & {
  readonly label: ReactNode;
  readonly children: ReactElement;
  readonly ref?: Ref<HTMLElement>;
}): React.JSX.Element {
  const triggerRef = useRef<HTMLElement>(null);
  const composedRef = useComposedRefs(ref, triggerRef);

  return (
    <Tooltip
      onOpenChange={(open, details) => {
        if (open && showsLabel(triggerRef.current)) details.cancel();
      }}
    >
      <TooltipTrigger {...triggerProps} ref={composedRef} render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ControlLabel(props: ComponentProps<"span">): React.JSX.Element {
  return <span data-control-label="" {...props} />;
}

function showsLabel(trigger: HTMLElement | null): boolean {
  const label = trigger?.querySelector("[data-control-label]");
  return label instanceof HTMLElement && label.getBoundingClientRect().width > 1;
}
