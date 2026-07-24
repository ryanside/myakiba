import {
  Delete02Icon,
  SlidersHorizontalIcon,
  SquareLock02Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { ReactElement } from "react";
import * as z from "zod";
import type { User } from "@/lib/auth-client";
import { Account } from "./account";
import { DeleteAccount } from "./delete-account";
import { Preferences } from "./preferences";
import { Profile } from "./profile";

export const SETTINGS_SECTION_IDS = ["preferences", "profile", "account", "danger"] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = "preferences";

export const settingsSearchSchema = z.object({
  section: z.enum(SETTINGS_SECTION_IDS).default(DEFAULT_SETTINGS_SECTION),
});

export type SettingsSearch = z.infer<typeof settingsSearchSchema>;

export type SettingsLayoutKind = "rows" | "form-stack" | "custom";

export type SettingsPanelProps = {
  readonly user: User;
};

export type SettingsPanelComponent = (props: SettingsPanelProps) => ReactElement;

export type SettingsSectionEntry = {
  readonly id: SettingsSectionId;
  readonly navLabel: string;
  readonly paneTitle: string;
  readonly icon: IconSvgElement;
  readonly layout: SettingsLayoutKind;
  readonly Panel: SettingsPanelComponent;
};

function accountPanel(_props: SettingsPanelProps): ReactElement {
  return <Account />;
}

function deleteAccountPanel(_props: SettingsPanelProps): ReactElement {
  return <DeleteAccount />;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionEntry[] = [
  {
    id: "preferences",
    navLabel: "Preferences",
    paneTitle: "Preferences",
    icon: SlidersHorizontalIcon,
    layout: "rows",
    Panel: Preferences,
  },
  {
    id: "profile",
    navLabel: "Profile",
    paneTitle: "Profile",
    icon: UserIcon,
    layout: "form-stack",
    Panel: Profile,
  },
  {
    id: "account",
    navLabel: "Account",
    paneTitle: "Account",
    icon: SquareLock02Icon,
    layout: "form-stack",
    Panel: accountPanel,
  },
  {
    id: "danger",
    navLabel: "Danger",
    paneTitle: "Danger zone",
    icon: Delete02Icon,
    layout: "form-stack",
    Panel: deleteAccountPanel,
  },
];

export function resolveSettingsSection(section: SettingsSectionId): SettingsSectionEntry {
  const entry = SETTINGS_SECTIONS.find((item) => item.id === section);
  if (entry) {
    return entry;
  }

  const fallback = SETTINGS_SECTIONS[0];
  if (!fallback) {
    throw new Error("SETTINGS_SECTIONS is empty");
  }
  return fallback;
}
