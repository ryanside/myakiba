import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";
import { hasLostFocus } from "./settings-content";
import { SETTINGS_NAV_GROUPS, SETTINGS_SECTIONS } from "./settings-registry";
import type { SettingsSectionId } from "./settings-registry";

export function SettingsNav({
  current,
  selected,
}: {
  readonly current: SettingsSectionId | null;
  /** The section the URL names, if any. */
  readonly selected: SettingsSectionId | undefined;
}) {
  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-5 md:gap-4">
      {SETTINGS_NAV_GROUPS.map((group) => (
        <NavGroup key={group.sections[0]} label={group.label}>
          {group.sections.map((id) => (
            <NavItem key={id} id={id} isCurrent={id === current} isSelected={id === selected} />
          ))}
        </NavGroup>
      ))}
    </nav>
  );
}

function NavGroup({
  label,
  children,
}: {
  readonly label: string | null;
  readonly children: React.ReactNode;
}) {
  const labelId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <p id={labelId} className="px-3 text-xs font-medium text-muted-foreground md:px-2.5">
          {label}
        </p>
      ) : null}
      <ul
        aria-labelledby={label ? labelId : undefined}
        className="flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 max-md:divide-y max-md:divide-border/70 md:gap-0.5 md:overflow-visible md:rounded-none md:bg-transparent md:ring-0"
      >
        {children}
      </ul>
    </div>
  );
}

function NavItem({
  id,
  isCurrent,
  isSelected,
}: {
  readonly id: SettingsSectionId;
  readonly isCurrent: boolean;
  readonly isSelected: boolean;
}) {
  const section = SETTINGS_SECTIONS[id];
  const ref = useRef<HTMLAnchorElement>(null);
  const wasSelected = useRef(isSelected);

  // Back from a section on a phone, the section's back link is gone, so focus returns here.
  useEffect(() => {
    if (wasSelected.current && !isSelected && hasLostFocus()) ref.current?.focus();
    wasSelected.current = isSelected;
  }, [isSelected]);

  return (
    <li>
      <Link
        ref={ref}
        to="/settings"
        search={{ section: id }}
        aria-current={isCurrent ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 text-foreground hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          "md:gap-2.5 md:rounded-md md:px-2.5 md:py-1.5 md:text-sm md:hover:bg-sidebar-accent md:hover:text-sidebar-accent-foreground",
          isCurrent
            ? "md:bg-sidebar-accent md:text-sidebar-accent-foreground md:shadow-[0_0_0_1px_var(--color-border),0_1px_2px_0_rgb(0_0_0/0.05)]"
            : "md:text-muted-foreground",
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center md:size-auto">
          <HugeiconsIcon icon={section.icon} className="size-4" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] md:text-sm">{section.label}</span>
          <span className="truncate text-[13px] text-muted-foreground md:hidden">
            {section.description}
          </span>
        </span>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          className="size-4 shrink-0 text-muted-foreground/60 md:hidden"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}
