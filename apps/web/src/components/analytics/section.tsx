import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

export const SECTION_GRADIENT_COLORS = [
  "var(--color-blue-600)",
  "var(--color-violet-600)",
  "var(--color-emerald-600)",
  "var(--color-amber-500)",
  "var(--color-rose-500)",
  "var(--color-sky-500)",
] as const;

export function Section({
  title,
  uniqueOwned,
  gradientColor,
  link,
  children,
}: {
  readonly title: string;
  readonly uniqueOwned: number;
  readonly gradientColor: string;
  readonly link?: { to: string; label: string };
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="animate-data-in relative overflow-hidden border rounded-lg p-4 space-y-3">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{
          background: `radial-gradient(125% 125% at 50% 0%, transparent 40%, ${gradientColor} 60%, transparent 80%)`,
        }}
      />
      <div className="relative flex items-baseline lowercase justify-between">
        <h3 className="text-sm font-medium font-orbitron">{title}</h3>
        <span className="text-xs text-muted-foreground font-orbitron">
          <span className="font-medium text-foreground">{uniqueOwned}</span> unique {title}
        </span>
      </div>
      <div className="relative">{children}</div>
      {link && (
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
      )}
    </div>
  );
}
