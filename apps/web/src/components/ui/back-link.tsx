import type { ComponentProps, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

type BackLinkProps = Omit<ComponentProps<typeof Link>, "children" | "className"> & {
  readonly text: string;
  readonly font: "orbitron" | "sans";
  readonly className?: string;
};

export function BackLink({ text, font, className, ...linkProps }: BackLinkProps): ReactNode {
  return (
    <Link
      {...linkProps}
      className={cn(
        "group/link relative flex items-center gap-1.5 w-fit py-2.5 -mb-1 rounded-md text-xs font-medium text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground active:scale-[0.98]",
        font === "orbitron" && "font-orbitron lowercase",
        font === "sans" && "font-sans",
        className,
      )}
    >
      <HugeiconsIcon
        icon={ArrowLeft01Icon}
        className="size-3.5 shrink-0 transition-transform duration-150 ease-out group-hover/link:-translate-x-0.5"
        aria-hidden
      />
      {text}
    </Link>
  );
}
