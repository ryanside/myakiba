/**
 * The screens, in the order the app's sidebar lists them. This file imports no screen, so a route can
 * check a screen name without pulling every screen into the page that checks it.
 */
export const SHOWCASE_SCREEN_NAMES = [
  "dashboard",
  "calendar",
  "analytics",
  "analytics-section",
  "expenses",
  "collection",
  "orders",
  "order-detail",
  "item-detail",
  "add",
] as const;

export type ShowcaseScreenName = (typeof SHOWCASE_SCREEN_NAMES)[number];
