import type { CollectRequest } from "../collect";

/** What the fetcher does after a collector run fails, which depends on what the collector was asked for. */
export function afterCollectorFailure(kind: CollectRequest["kind"]): string {
  return kind === "page"
    ? "An item page the extension asked for in its own tab closes that tab, and one asked for in a borrowed tab is tried once more in a tab of its own."
    : "The item imports without its picture.";
}
