import type { User } from "@/lib/auth-client";
import { resolveSettingsSection } from "./sections";
import type { SettingsSectionId } from "./sections";

type SettingsPaneProps = {
  readonly user: User;
  readonly section: SettingsSectionId;
};

export function SettingsPane({ user, section }: SettingsPaneProps) {
  const entry = resolveSettingsSection(section);
  const Panel = entry.Panel;

  return (
    <div className="min-w-0 flex-1">
      <h2 className="text-2xl font-semibold tracking-tight">{entry.paneTitle}</h2>
      <div className="mt-6">
        <Panel user={user} />
      </div>
    </div>
  );
}
