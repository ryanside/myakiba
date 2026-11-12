import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { AddSearch } from "@/lib/add-search";

/**
 * A way to the Add page. Its `search` presets the destination from where the user came, and the
 * page goes back there once a commit leaves it empty. Without `children` it is a toolbar's Add, which
 * shows only its icon below `sm`, as main's toolbar Add does.
 */
export function AddLink({
  search,
  variant = "default",
  size = "default",
  className,
  icon = true,
  children,
}: {
  readonly search?: Omit<AddSearch, "returnTo">;
  readonly variant?: "default" | "outline";
  readonly size?: "default" | "sm";
  readonly className?: string;
  readonly icon?: boolean;
  readonly children?: ReactNode;
}) {
  const returnTo = useLocation({ select: ({ href }) => href });
  return (
    <Link
      to="/add"
      search={{ ...search, returnTo }}
      className={buttonVariants({ variant, size, className })}
    >
      {icon ? (
        <HugeiconsIcon
          icon={Add01Icon}
          data-icon="inline-start"
          strokeWidth={2}
          aria-hidden="true"
        />
      ) : null}
      {children ?? <span className="sr-only sm:not-sr-only">Add</span>}
    </Link>
  );
}
