import type { IconSvgElement } from "@hugeicons/react";
import {
  ChartColumnIcon,
  Home01Icon,
  LibraryIcon,
  PackageIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";

export type AppNavigationTarget =
  | "/dashboard"
  | "/analytics"
  | "/orders"
  | "/collection"
  | "/settings";

export type AppNavigationItem = {
  readonly title: string;
  readonly to: AppNavigationTarget;
  readonly icon: IconSvgElement;
  readonly keywords: readonly string[];
};

export const APP_PRIMARY_NAVIGATION_ITEMS = [
  { title: "Dashboard", to: "/dashboard", icon: Home01Icon, keywords: ["home", "overview"] },
  {
    title: "Analytics",
    to: "/analytics",
    icon: ChartColumnIcon,
    keywords: ["reports", "insights", "stats"],
  },
  { title: "Orders", to: "/orders", icon: PackageIcon, keywords: ["purchases", "order history"] },
  {
    title: "Collection",
    to: "/collection",
    icon: LibraryIcon,
    keywords: ["items", "figures", "owned"],
  },
] as const satisfies readonly AppNavigationItem[];

export const APP_COMMAND_NAVIGATION_ITEMS = [
  ...APP_PRIMARY_NAVIGATION_ITEMS,
  {
    title: "Settings",
    to: "/settings",
    icon: Settings01Icon,
    keywords: ["preferences", "account"],
  },
] as const satisfies readonly AppNavigationItem[];
