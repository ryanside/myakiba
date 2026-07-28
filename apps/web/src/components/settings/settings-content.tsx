import type { ReactNode } from "react";
import { BackLink } from "@/components/ui/back-link";
import { SETTINGS_SECTIONS } from "./settings-sections";
import type { SettingsId } from "./settings-sections";

type SettingsContentProps = {
  readonly activeId: SettingsId;
  readonly children: ReactNode;
};

export function SettingsContent({ activeId, children }: SettingsContentProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <BackLink to="/settings" text="Settings" font="sans" className="self-start md:hidden" />
      <h1 className="text-balance text-lg font-medium tracking-tight">
        {SETTINGS_SECTIONS[activeId].label}
      </h1>
      {children}
    </div>
  );
}
