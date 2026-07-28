import {
  PreferenceHorizontalIcon,
  SquareLockPasswordIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export const SETTINGS_IDS = ["preferences", "profile", "account"] as const;

export type SettingsId = (typeof SETTINGS_IDS)[number];

type SettingsSection = {
  readonly label: string;
  readonly icon: IconSvgElement;
};

export const SETTINGS_SECTIONS = {
  preferences: {
    label: "Preferences",
    icon: PreferenceHorizontalIcon,
  },
  profile: {
    label: "Profile",
    icon: UserIcon,
  },
  account: {
    label: "Account",
    icon: SquareLockPasswordIcon,
  },
} as const satisfies Record<SettingsId, SettingsSection>;
