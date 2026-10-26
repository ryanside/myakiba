import {
  ArrowDataTransferHorizontalIcon,
  InformationCircleIcon,
  LayoutGridIcon,
  PaintBoardIcon,
  PreferenceHorizontalIcon,
  SquareLockPasswordIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export const SETTINGS_NAV_GROUPS = [
  { label: null, sections: ["preferences", "appearance", "layout"] },
  { label: "Account", sections: ["profile", "account", "data-transfer"] },
  { label: null, sections: ["about"] },
] as const satisfies readonly {
  readonly label: string | null;
  readonly sections: readonly string[];
}[];

export type SettingsSectionId = (typeof SETTINGS_NAV_GROUPS)[number]["sections"][number];

/** Nav order. Search results group in this order too. */
export const SETTINGS_SECTION_IDS: readonly SettingsSectionId[] = SETTINGS_NAV_GROUPS.flatMap(
  (group) => group.sections,
);

type SettingsSection = {
  readonly label: string;
  readonly description: string;
  readonly icon: IconSvgElement;
};

export const SETTINGS_SECTIONS = {
  preferences: {
    label: "Preferences",
    description: "The currency and date format myakiba shows everywhere.",
    icon: PreferenceHorizontalIcon,
  },
  appearance: {
    label: "Appearance",
    description: "Theme, page backgrounds and motion on this device.",
    icon: PaintBoardIcon,
  },
  layout: {
    label: "Layout",
    description: "How your pages open and how their tables are arranged on this device.",
    icon: LayoutGridIcon,
  },
  profile: {
    label: "Profile",
    description: "The name myakiba knows you by.",
    icon: UserIcon,
  },
  account: {
    label: "Account",
    description: "Your email, how you sign in, and the devices signed in to your account.",
    icon: SquareLockPasswordIcon,
  },
  "data-transfer": {
    label: "Data Transfer",
    description: "Move your orders and collection in and out of myakiba.",
    icon: ArrowDataTransferHorizontalIcon,
  },
  about: {
    label: "About",
    description: "The version you are using, what changed, and where to find help.",
    icon: InformationCircleIcon,
  },
} as const satisfies Record<SettingsSectionId, SettingsSection>;

type SettingEntry = {
  readonly section: SettingsSectionId;
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
  /** Search opens the section, because the setting has no row to jump to. */
  readonly target?: "section";
};

/** Every setting a row shows and search finds. A row reads its title and description from here. */
export const SETTINGS = {
  currency: {
    section: "preferences",
    title: "Display currency",
    description: "Prices and totals across myakiba show in this currency.",
    keywords: ["money", "price", "cost", "usd", "jpy", "yen", "eur"],
  },
  "date-format": {
    section: "preferences",
    title: "Date format",
    description: "How release, order and payment dates are written.",
    keywords: ["day", "month", "year", "release date", "calendar"],
  },
  theme: {
    section: "appearance",
    title: "Theme",
    description: "Light, dark, or whichever your device uses.",
    keywords: ["dark mode", "light mode", "system", "color", "colour", "night"],
  },
  "page-backgrounds": {
    section: "appearance",
    title: "Page backgrounds",
    description: "Show a pixel-art photo behind the top of each page.",
    keywords: ["photo", "image", "wallpaper", "picture", "data", "bandwidth"],
  },
  "reduce-motion": {
    section: "appearance",
    title: "Reduce motion",
    description: "Turn off animations and transitions across myakiba.",
    keywords: ["animation", "accessibility", "transition", "calm", "vestibular"],
  },
  "view-collection": {
    section: "layout",
    title: "Collection",
    description: "The items you own.",
    keywords: ["default view", "compact", "table", "grid", "gallery", "cards"],
  },
  "view-orders": {
    section: "layout",
    title: "Orders",
    description: "Your orders and what is in them.",
    keywords: ["default view", "compact", "table", "grid", "gallery", "cards"],
  },
  "view-wishlist": {
    section: "layout",
    title: "Wishlist",
    description: "Items you are keeping an eye on.",
    keywords: ["default view", "grid", "list", "gallery"],
  },
  "view-lists": {
    section: "layout",
    title: "Lists",
    description: "The Lists page and every list. The Lists page shows Gallery as Grid.",
    keywords: ["default view", "grid", "list", "gallery", "folders"],
  },
  "view-item-database": {
    section: "layout",
    title: "Item Database",
    description: "Every item synced to myakiba.",
    keywords: ["default view", "grid", "list", "gallery", "items"],
  },
  "table-collection": {
    section: "layout",
    title: "Collection table",
    description: "Columns you hid, moved, resized or pinned on Collection.",
    keywords: ["reset", "columns", "table layout"],
  },
  "table-orders": {
    section: "layout",
    title: "Orders table",
    description: "Columns you hid, moved, resized or pinned on Orders.",
    keywords: ["reset", "columns", "table layout"],
  },
  "table-order-items": {
    section: "layout",
    title: "Order items table",
    description: "Columns you hid, moved, resized or pinned inside an order.",
    keywords: ["reset", "columns", "table layout"],
  },
  username: {
    section: "profile",
    title: "Username",
    description: "Your name across myakiba.",
    keywords: ["name", "handle", "rename", "display name"],
  },
  email: {
    section: "account",
    title: "Email",
    description: "Where myakiba sends account email. It can't be changed.",
    keywords: ["address", "verify", "verification", "confirm", "resend"],
  },
  password: {
    section: "account",
    title: "Password",
    description: "Sign in with your email and a password.",
    keywords: ["change password", "set password", "security", "credentials", "login"],
  },
  google: {
    section: "account",
    title: "Google",
    description: "Sign in with your Google account.",
    keywords: ["connect", "link", "disconnect", "unlink", "oauth", "social"],
  },
  devices: {
    section: "account",
    title: "Devices",
    description: "Browsers and phones signed in to your account.",
    keywords: ["sessions", "signed in", "browsers", "phones", "security", "revoke"],
  },
  "sign-out-others": {
    section: "account",
    title: "Sign out of other devices",
    description: "Every other device signs out. Some take up to 5 minutes.",
    keywords: ["sessions", "revoke", "log out", "everywhere"],
  },
  "delete-account": {
    section: "account",
    title: "Delete account",
    description: "Permanently delete your account and all associated data.",
    keywords: ["remove", "close", "erase", "danger"],
  },
  export: {
    section: "data-transfer",
    title: "Export",
    description: "Download your orders and collection records as a JSON file.",
    keywords: ["backup", "download", "json", "save"],
    target: "section",
  },
  import: {
    section: "data-transfer",
    title: "Import",
    description: "Add the records from a myakiba JSON export to your account.",
    keywords: ["restore", "upload", "json", "migrate"],
    target: "section",
  },
  version: {
    section: "about",
    title: "Version",
    description: "The build of myakiba running in this tab.",
    keywords: ["build", "update", "release", "commit", "refresh"],
  },
  changelog: {
    section: "about",
    title: "Changelog",
    description: "New features, improvements and fixes.",
    keywords: ["what's new", "release notes", "updates", "news"],
  },
  "getting-started": {
    section: "about",
    title: "Getting Started",
    description: "The welcome tour that sets your formats and starts your first import.",
    keywords: ["onboarding", "tour", "welcome", "setup", "help"],
  },
  discord: {
    section: "about",
    title: "Discord",
    description: "Ask questions, suggest features and meet other collectors.",
    keywords: ["community", "chat", "help", "support", "feedback"],
  },
  github: {
    section: "about",
    title: "GitHub",
    description: "Report a bug or read the source.",
    keywords: ["source code", "issue", "bug", "open source", "contribute"],
  },
} as const satisfies Record<string, SettingEntry>;

type SettingKey = keyof typeof SETTINGS;
type Setting = (typeof SETTINGS)[SettingKey];
/** A setting with a row of its own. */
export type SettingId = {
  [Id in SettingKey]: (typeof SETTINGS)[Id] extends { readonly target: "section" } ? never : Id;
}[SettingKey];

/**
 * The row's DOM id and the URL hash that jumps to it. The prefix keeps it clear of form
 * field ids, such as a `password` input in a dialog.
 */
export function settingAnchor(id: SettingId): string {
  return `setting-${id}`;
}

function hasRow(id: SettingKey): id is SettingId {
  return !("target" in SETTINGS[id]);
}

/** The hash a search result jumps to, or none when the setting has no row of its own. */
export function settingHash(id: SettingKey): string | undefined {
  return hasRow(id) ? settingAnchor(id) : undefined;
}

export type SettingsSearchGroup = {
  readonly section: SettingsSectionId;
  readonly settings: readonly SettingKey[];
};

export function searchTerms(query: string): readonly string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function words(text: string): readonly string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
}

function hasWordStartingWith(text: string, term: string): boolean {
  return words(text).some((word) => word.startsWith(term));
}

function scoreTerm(setting: Setting, term: string): number {
  if (words(setting.title)[0]?.startsWith(term)) return 4;
  if (hasWordStartingWith(setting.title, term)) return 3;
  if (setting.keywords.some((keyword) => hasWordStartingWith(keyword, term))) return 2;
  if (hasWordStartingWith(SETTINGS_SECTIONS[setting.section].label, term)) return 1.5;
  if (hasWordStartingWith(setting.description, term)) return 1;
  return 0;
}

function score(setting: Setting, terms: readonly string[]): number {
  let total = 0;
  for (const term of terms) {
    const termScore = scoreTerm(setting, term);
    if (termScore === 0) return 0;
    total += termScore;
  }
  return total;
}

/** Settings that match every term, grouped by section in nav order, best match first. */
export function searchSettings(query: string): readonly SettingsSearchGroup[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  const matches = (Object.keys(SETTINGS) as SettingKey[])
    .map((id) => ({ id, score: score(SETTINGS[id], terms) }))
    .filter((match) => match.score > 0);
  return SETTINGS_SECTION_IDS.flatMap((section) => {
    const settings = matches
      .filter((match) => SETTINGS[match.id].section === section)
      .toSorted((a, b) => b.score - a.score)
      .map((match) => match.id);
    return settings.length > 0 ? [{ section, settings }] : [];
  });
}
