import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ENTRY_CATEGORIES } from "@myakiba/contracts/shared/constants";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Matches the overview page, which colors sections by display position.
export const SECTION_DISPLAY_ORDER: readonly string[] = [
  ...ENTRY_CATEGORIES.map((c) => c.toLowerCase()),
  "shops",
  "scales",
];

export function sectionLabel(sectionName: string): string {
  return sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
}

export function sectionGradientColor(sectionName: string): string {
  return SECTION_GRADIENT_COLORS[
    SECTION_DISPLAY_ORDER.indexOf(sectionName) % SECTION_GRADIENT_COLORS.length
  ];
}

export const SECTION_GRADIENT_COLORS = [
  "var(--color-blue-600)",
  "var(--color-violet-600)",
  "var(--color-emerald-600)",
  "var(--color-amber-500)",
  "var(--color-rose-500)",
  "var(--color-sky-500)",
] as const;

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
    <div className={cn("relative overflow-hidden border rounded-lg p-4", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-10"
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
        <Link
          to={link.to}
          className="font-orbitron lowercase group/link relative flex items-center gap-1.5 w-fit ml-auto py-2.5 -mb-1 rounded-md text-xs font-medium text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground active:scale-[0.98]"
        >
          {link.label}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="size-3.5 transition-transform duration-150 ease-out group-hover/link:translate-x-0.5"
          />
        </Link>
      ) : null}
    </SectionShell>
  );
}
