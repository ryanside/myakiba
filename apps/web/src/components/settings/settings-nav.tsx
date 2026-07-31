import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { SETTINGS_IDS, SETTINGS_SECTIONS } from "./settings-sections";
import type { SettingsId } from "./settings-sections";

type SettingsNavProps = {
  readonly activeId: SettingsId;
  readonly onSelect: (id: SettingsId) => void;
};

export function SettingsNav({ activeId, onSelect }: SettingsNavProps) {
  return (
    <nav className="flex w-full flex-col gap-4 md:w-52 md:shrink-0 md:gap-3" aria-label="Settings">
      <h1 className="text-2xl font-medium tracking-tight md:hidden">Settings</h1>
      <p className="hidden px-2.5 text-[13px] font-medium text-muted-foreground md:block">
        Settings
      </p>
      <ul className="flex flex-col divide-y divide-border/80 overflow-hidden rounded-xl bg-card text-card-foreground shadow-xs ring-1 ring-foreground/10 md:gap-0.5 md:divide-y-0 md:overflow-visible md:rounded-none md:bg-transparent md:shadow-none md:ring-0">
        {SETTINGS_IDS.map((id) => {
          const section = SETTINGS_SECTIONS[id];
          const isActive = id === activeId;

          return (
            <li key={id} className="w-full">
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left text-[15px] text-foreground hover:bg-muted md:min-h-0 md:gap-2.5 md:rounded-lg md:px-2.5 md:py-2 md:text-sm",
                  isActive
                    ? "md:bg-muted md:text-foreground"
                    : "md:text-muted-foreground md:hover:text-foreground",
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground md:size-auto md:rounded-none md:text-current">
                  <HugeiconsIcon icon={section.icon} className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate">{section.label}</span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="size-4 shrink-0 text-muted-foreground/60 md:hidden"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
