import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { SETTINGS_SECTIONS } from "./sections";
import type { SettingsSectionId } from "./sections";

type SettingsNavProps = {
  readonly section: SettingsSectionId;
  readonly onSectionChange: (section: SettingsSectionId) => void;
};

export function SettingsNav({ section, onSectionChange }: SettingsNavProps) {
  return (
    <>
      <nav className="hidden flex-col gap-1 md:flex" aria-label="Settings sections">
        {SETTINGS_SECTIONS.map((entry) => {
          const isActive = entry.id === section;

          return (
            <button
              key={entry.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onSectionChange(entry.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <HugeiconsIcon icon={entry.icon} className="size-4 shrink-0" aria-hidden="true" />
              {entry.navLabel}
            </button>
          );
        })}
      </nav>

      <nav
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:hidden"
        aria-label="Settings sections"
      >
        {SETTINGS_SECTIONS.map((entry) => {
          const isActive = entry.id === section;

          return (
            <button
              key={entry.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onSectionChange(entry.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-border bg-muted text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <HugeiconsIcon icon={entry.icon} className="size-3.5 shrink-0" aria-hidden="true" />
              {entry.navLabel}
            </button>
          );
        })}
      </nav>
    </>
  );
}
