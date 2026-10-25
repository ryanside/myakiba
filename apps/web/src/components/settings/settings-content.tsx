import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { BackLink } from "@/components/ui/back-link";
import { SETTINGS_SECTIONS } from "./settings-registry";
import type { SettingsSectionId } from "./settings-registry";

type SettingsContentProps = {
  readonly section: SettingsSectionId;
  /** The user opened this section, rather than landing on the default one beside the list. */
  readonly isSelected: boolean;
  readonly children: ReactNode;
};

/** Focus sits on the body, or on an element that a layout change just hid. */
export function hasLostFocus(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return true;
  // Browsers such as Safari before 17.4 lack checkVisibility. An element with no box has no rects.
  return !(active.checkVisibility?.() ?? active.getClientRects().length > 0);
}

export function SettingsContent({ section, isSelected, children }: SettingsContentProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { label, description } = SETTINGS_SECTIONS[section];

  // On a phone the section replaces the nav, which hides the link that opened it. The default
  // section is already mounted behind the phone's list, so selecting it shows it without a remount.
  useEffect(() => {
    if (isSelected && hasLostFocus()) headingRef.current?.focus({ preventScroll: true });
  }, [isSelected]);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <BackLink to="/settings" text="Settings" font="sans" className="-my-2 self-start md:hidden" />
      <header className="flex flex-col gap-1">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-medium tracking-tight outline-none"
        >
          {label}
        </h2>
        <p className="text-pretty text-sm text-muted-foreground">{description}</p>
      </header>
      {children}
    </div>
  );
}
