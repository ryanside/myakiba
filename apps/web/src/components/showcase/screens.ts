import type { ComponentType } from "react";
import * as add from "./screens/add";
import * as analytics from "./screens/analytics";
import * as analyticsSection from "./screens/analytics-section";
import * as calendar from "./screens/calendar";
import * as collection from "./screens/collection";
import * as dashboard from "./screens/dashboard";
import * as expenses from "./screens/expenses";
import * as itemDetail from "./screens/item-detail";
import * as orderDetail from "./screens/order-detail";
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

// In the order the app's sidebar lists them.
export const SHOWCASE_SCREENS = {
  dashboard: {
    label: "Dashboard",
    path: "/dashboard",
    Screen: dashboard.Screen,
    images: dashboard.images,
  },
  calendar: {
    label: "Calendar",
    path: "/calendar",
    Screen: calendar.Screen,
    images: calendar.images,
  },
  analytics: {
    label: "Analytics",
    path: "/analytics",
    Screen: analytics.Screen,
    images: analytics.images,
  },
  "analytics-section": {
    label: "Analytics section",
    path: "/analytics/origins",
    Screen: analyticsSection.Screen,
    images: analyticsSection.images,
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
  "order-detail": {
    label: "Order",
    path: "/orders/kurisu",
    Screen: orderDetail.Screen,
    images: orderDetail.images,
  },
  "item-detail": {
    label: "Item",
    path: "/item/236103",
    Screen: itemDetail.Screen,
    images: itemDetail.images,
  },
  add: { label: "Add", path: "/add", Screen: add.Screen, images: add.images },
} as const satisfies Record<string, ShowcaseScreen>;

export type ShowcaseScreenName = keyof typeof SHOWCASE_SCREENS;

export const SHOWCASE_SCREEN_NAMES = Object.keys(SHOWCASE_SCREENS) as [
  ShowcaseScreenName,
  ...ShowcaseScreenName[],
];
