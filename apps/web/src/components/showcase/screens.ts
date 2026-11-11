import type { ComponentType } from "react";
import * as analytics from "./screens/analytics";
import * as collection from "./screens/collection";
import * as dashboard from "./screens/dashboard";
import * as expenses from "./screens/expenses";
import * as orders from "./screens/orders";

/** One app screen, built by hand to look exactly like the app's own. */
export type ShowcaseScreen = {
  /** Names the screen for people who cannot see it. */
  readonly label: string;
  /** The address the screen lives at in the app. It picks the sidebar link and background. */
  readonly path: string;
  /** Renders the page inside the app frame. Every date it shows counts from `now`. */
  readonly Screen: ComponentType<{ readonly now: Date }>;
  /** Pictures the screen shows. The page loads them first, so a screen never paints half done. */
  readonly images: readonly string[];
};

export const SHOWCASE_SCREENS = {
  dashboard: {
    label: "Dashboard",
    path: "/dashboard",
    Screen: dashboard.Screen,
    images: dashboard.images,
  },
  analytics: {
    label: "Analytics",
    path: "/analytics",
    Screen: analytics.Screen,
    images: analytics.images,
  },
  expenses: {
    label: "Expenses",
    path: "/expenses",
    Screen: expenses.Screen,
    images: expenses.images,
  },
  collection: {
    label: "Collection",
    path: "/collection",
    Screen: collection.Screen,
    images: collection.images,
  },
  orders: { label: "Orders", path: "/orders", Screen: orders.Screen, images: orders.images },
} as const satisfies Record<string, ShowcaseScreen>;

export type ShowcaseScreenName = keyof typeof SHOWCASE_SCREENS;
