import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { AddSearch } from "@/lib/add-search";

/**
 * A way to the Add page. Its `search` presets the destination from where the user came, and the
 * page goes back there once a commit leaves it empty.
 */
export function AddLink({
  search,
  variant = "default",
  size = "default",
  className,
  icon = true,
  children = "Add",
}: {
  readonly search?: Omit<AddSearch, "returnTo">;
  readonly variant?: "default" | "outline";
  readonly size?: "default" | "sm";
  readonly className?: string;
  readonly icon?: boolean;
  readonly children?: ReactNode;
}) {
  const returnTo = useRouterState({ select: ({ location }) => location.href });
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
      {children}
    </Link>
  );
}
