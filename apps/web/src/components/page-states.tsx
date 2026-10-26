import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export const STATE_PANEL_CLASS_NAME =
  "border bg-background/70 py-16 backdrop-blur-sm dark:bg-background/60";

export const STATE_ICON_CLASS_NAME =
  "size-10 rounded-xl bg-background shadow-[0_0_0_1px_oklch(0_0_0/0.08),0_1px_2px_oklch(0_0_0/0.06)] dark:bg-muted dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]";

export function LoadError({
  title,
  message,
}: {
  readonly title: string;
  readonly message: string;
}): React.JSX.Element {
  return (
    <Empty className={STATE_PANEL_CLASS_NAME}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className={cn(STATE_ICON_CLASS_NAME, "text-destructive")}>
          <HugeiconsIcon icon={Alert02Icon} className="size-5" aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>
          <span className="block">{message}</span>
          Reload the page to try again.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
