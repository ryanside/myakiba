import type { ComponentProps, ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

type LinkProps = ComponentProps<typeof Link>;

type BackLinkProps = {
  readonly text: string;
  readonly font: "orbitron" | "sans";
  readonly className?: string;
} & (
  | { readonly to?: never }
  | (Omit<LinkProps, "children" | "className" | "to"> & {
      readonly to: NonNullable<LinkProps["to"]>;
    })
);

export function BackLink({ text, font, className, ...navigationProps }: BackLinkProps): ReactNode {
  const router = useRouter();
  const styles = cn(
    "group/link cursor-pointer relative flex items-center gap-1.5 w-fit py-2.5 -mb-1 rounded-md text-xs font-medium text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground",
    font === "orbitron" && "font-orbitron lowercase",
    font === "sans" && "font-sans",
    className,
  );
  const content = (
    <>
      <HugeiconsIcon
        icon={ArrowLeft01Icon}
        className="size-3.5 shrink-0 transition-transform duration-150 ease-out group-hover/link:-translate-x-0.5"
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

  return (
    <button type="button" className={styles} onClick={() => router.history.back()}>
      {content}
    </button>
  );
}
