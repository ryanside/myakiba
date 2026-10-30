import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { AddSearch } from "@/lib/add-search";

/** A way to the Add page. Its `search` presets the destination from where the user came. */
export function AddLink({
  search,
  variant = "default",
  size = "default",
  className,
  icon = true,
  children = "Add",
}: {
  readonly search?: AddSearch;
  readonly variant?: "default" | "outline";
  readonly size?: "default" | "sm";
  readonly className?: string;
  readonly icon?: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <Link to="/add" search={search} className={buttonVariants({ variant, size, className })}>
      {icon ? (
        <HugeiconsIcon
          icon={Add01Icon}
          data-icon="inline-start"
          strokeWidth={2}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </Link>
  );
}
