import type { User } from "@/lib/auth-client";
import { SettingsNav } from "./settings-nav";
import { SettingsPane } from "./settings-pane";
import type { SettingsSectionId } from "./sections";

type SettingsShellProps = {
  readonly user: User;
  readonly section: SettingsSectionId;
  readonly onSectionChange: (section: SettingsSectionId) => void;
};

export function SettingsShell({ user, section, onSectionChange }: SettingsShellProps) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-col gap-8 md:flex-row md:gap-12">
        <aside className="md:w-52 md:shrink-0">
          <p className="mb-4 hidden text-sm font-medium md:block">Settings</p>
          <SettingsNav section={section} onSectionChange={onSectionChange} />
        </aside>
        <SettingsPane user={user} section={section} />
      </div>
    </div>
  );
}
