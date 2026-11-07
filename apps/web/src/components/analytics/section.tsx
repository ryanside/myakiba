import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { ARROW_ICON_CLASS_NAME, ARROW_LINK_CLASS_NAME } from "@/components/ui/back-link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { NavigateIcon } from "@/lib/icons";

export function SectionShell({
  gradientColor,
  children,
  className,
}: {
  readonly gradientColor: string;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactNode {
  return (
    <div
      className={cn(
        // No box: the section sits on the page, and its glow fades out on every side.
        "relative isolate",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-8 -inset-y-6 -z-10 opacity-10 mask-x-from-80% mask-y-from-75%"
        style={{
          background: `radial-gradient(125% 125% at 50% 0%, transparent 40%, ${gradientColor} 60%, transparent 80%)`,
        }}
      />
      {children}
    </div>
  );
}

export function Section({
  title,
  uniqueOwned,
  gradientColor,
  link,
  children,
  isLoading = false,
}: {
  readonly title: string;
  readonly uniqueOwned: number;
  readonly gradientColor: string;
  readonly link?: { to: string; label: string };
  readonly children: ReactNode;
  readonly isLoading?: boolean;
}): ReactNode {
  return (
    <SectionShell gradientColor={gradientColor} className="space-y-3">
      <div className="relative flex items-baseline lowercase justify-between">
        <h3 className="text-sm font-medium font-orbitron">{title}</h3>
        <span className="inline-flex items-baseline gap-1 text-xs text-muted-foreground font-orbitron">
          {isLoading ? (
            <span className="relative inline-block font-medium leading-none">
              <span className="invisible tabular-nums select-none" aria-hidden>
                00
              </span>
              <Skeleton className="absolute inset-0 rounded-sm" />
            </span>
          ) : (
            <span className="font-medium text-foreground tabular-nums">{uniqueOwned}</span>
          )}
          <span>unique {title}</span>
        </span>
      </div>
      <div className="relative">{children}</div>
      {link ? (
        <Link to={link.to} className={cn(ARROW_LINK_CLASS_NAME, "font-orbitron lowercase ml-auto")}>
          {link.label}
          <HugeiconsIcon
            icon={NavigateIcon}
            className={cn(ARROW_ICON_CLASS_NAME, "group-hover/link:translate-x-(--nudge)")}
          />
        </Link>
      ) : null}
    </SectionShell>
  );
}
