import dashboard from "@/assets/backgrounds/11-akihabara-bright-bitgrain.webp";
import analytics from "@/assets/backgrounds/56-blossoms-and-wires-bitgrain.webp";
import expenses from "@/assets/backgrounds/43-blue-gachapon-row-bitgrain.webp";
import orders from "@/assets/backgrounds/17-night-calendar-bitgrain.webp";
import collection from "@/assets/backgrounds/02-collection-room-bitgrain.webp";
import wishlist from "@/assets/backgrounds/24-day-gachapon-bitgrain.webp";
import lists from "@/assets/backgrounds/08-lists-bitgrain.webp";
import items from "@/assets/backgrounds/72-autumn-crossing-bitgrain.webp";
import calendar from "@/assets/backgrounds/83-train-station-display-bitgrain.webp";
import sync from "@/assets/backgrounds/87-tokyo-power-lines-bitgrain.webp";
import settings from "@/assets/backgrounds/10-settings-desk-bitgrain.webp";

const backgrounds: ReadonlyMap<string, string> = new Map([
  ["dashboard", dashboard],
  ["analytics", analytics],
  ["expenses", expenses],
  ["orders", orders],
  ["collection", collection],
  ["wishlist", wishlist],
  ["lists", lists],
  ["items", items],
  ["calendar", calendar],
  ["sync", sync],
  ["settings", settings],
]);

export function getPageBackground(pathname: string) {
  return backgrounds.get(pathname.split("/")[1] ?? "");
}
