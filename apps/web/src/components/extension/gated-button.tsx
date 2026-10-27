import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { useExtensionGate } from "@/lib/extension-gate";
import { cn } from "@/lib/utils";

type GatedButtonProps = Omit<ComponentProps<typeof Button>, "onClick" | "aria-busy"> & {
  /** Runs once the extension answers. A refusal shows the notice instead. */
  readonly onProceed: () => void;
  readonly icon: IconSvgElement;
  /** What the button started still runs, so its icon spins as it does while the button checks. */
  readonly pending?: boolean;
};

/**
 * A button that asks for the extension before it starts an import, so the notice shows before
 * anything opens or sends. It shows it is checking and ignores clicks until the check ends.
 */
export function GatedButton({
  onProceed,
  icon,
  pending = false,
  children,
  ...props
}: GatedButtonProps) {
  const { checking, gate } = useExtensionGate();
  const busy = pending || checking;
  return (
    <Button {...props} aria-busy={checking || undefined} onClick={() => gate(onProceed)}>
      <HugeiconsIcon
        icon={busy ? Loading03Icon : icon}
        data-icon="inline-start"
        className={cn(busy && "animate-spin motion-reduce:animate-none")}
        aria-hidden="true"
      />
      {children}
    </Button>
  );
}
