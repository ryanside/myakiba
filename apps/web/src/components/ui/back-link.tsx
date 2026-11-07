import type { ComponentProps, ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { BackIcon } from "@/lib/icons";

type LinkProps = ComponentProps<typeof Link>;

type BackLinkProps = {
  readonly text: string;
  readonly font: "orbitron" | "sans";
  readonly className?: string;
} & (
  | {
      readonly fallbackTo: NonNullable<LinkProps["to"]>;
      readonly to?: never;
    }
  | (Omit<LinkProps, "children" | "className" | "to"> & {
      readonly fallbackTo?: never;
      readonly to: NonNullable<LinkProps["to"]>;
    })
);

// Back, "view all" and other arrow links: a colour fade, a text press and a 2px arrow nudge on hover.
export const ARROW_LINK_CLASS_NAME =
  "group/link cursor-pointer relative flex items-center gap-1.5 w-fit py-2.5 -mb-1 rounded-md text-xs font-medium text-muted-foreground press-text outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export const ARROW_ICON_CLASS_NAME =
  "size-3.5 shrink-0 transition-[translate] duration-(--motion-hover) ease-out";

export function BackLink({ text, font, className, ...navigationProps }: BackLinkProps): ReactNode {
  const router = useRouter();
  const styles = cn(
    ARROW_LINK_CLASS_NAME,
    font === "orbitron" && "decorative",
    font === "sans" && "font-sans",
    className,
  );
  const content = (
    <>
      <HugeiconsIcon
        icon={BackIcon}
        className={cn(ARROW_ICON_CLASS_NAME, "group-hover/link:-translate-x-(--nudge)")}
        aria-hidden
      />
      {text}
    </>
  );

  if (navigationProps.to !== undefined) {
    return (
      <Link {...navigationProps} className={styles}>
        {content}
      </Link>
    );
  }

  const handleBack = (): void => {
    if (router.history.canGoBack()) {
      router.history.back();
      return;
    }

    void router.navigate({ to: navigationProps.fallbackTo });
  };

  return (
    <button type="button" className={styles} onClick={handleBack}>
      {content}
    </button>
  );
}
