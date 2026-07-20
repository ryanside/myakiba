import type { IconSvgElement } from "@hugeicons/react";
import {
  Calendar01Icon,
  ChartColumnIcon,
  CreditCardIcon,
  GitCompareIcon,
  Home01Icon,
  LibraryIcon,
  PackageIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";

export type AppNavigationTarget =
  | "/dashboard"
  | "/analytics"
  | "/expenses"
  | "/orders"
  | "/collection"
  | "/calendar"
  | "/sync"
  | "/settings";

export type AppNavigationItem = {
  readonly title: string;
  readonly to: AppNavigationTarget;
  readonly icon: IconSvgElement;
  readonly keywords: readonly string[];
};

const APP_PRIMARY_NAVIGATION_ITEMS = [
  { title: "Dashboard", to: "/dashboard", icon: Home01Icon, keywords: ["home", "overview"] },
  {
    title: "Analytics",
    to: "/analytics",
    icon: ChartColumnIcon,
    keywords: ["reports", "insights", "stats"],
  },
  {
    title: "Expenses",
    to: "/expenses",
    icon: CreditCardIcon,
    keywords: ["costs", "spending", "budget", "payments"],
  },
  { title: "Orders", to: "/orders", icon: PackageIcon, keywords: ["purchases", "order history"] },
  {
    title: "Collection",
    to: "/collection",
    icon: LibraryIcon,
    keywords: ["items", "figures", "owned"],
  },
  {
    title: "Calendar",
    to: "/calendar",
    icon: Calendar01Icon,
    keywords: ["releases", "schedule", "dates", "month"],
  },
] as const satisfies readonly AppNavigationItem[];

export const APP_COMMAND_NAVIGATION_ITEMS = [
  ...APP_PRIMARY_NAVIGATION_ITEMS,
  {
    title: "Sync History",
    to: "/sync",
    icon: GitCompareIcon,
    keywords: ["history", "sessions", "import", "csv", "mfc"],
  },
  {
    title: "Settings",
    to: "/settings",
    icon: Settings01Icon,
    keywords: ["preferences", "account"],
  },
] as const satisfies readonly AppNavigationItem[];
