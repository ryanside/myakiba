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
import { pageBackgroundsEnabled } from "@/hooks/use-appearance";

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

const plainDetailSections: ReadonlySet<string> = new Set(["orders"]);

const decodeCap = 50;
// Keeps one downloaded image per background for the page's lifetime, so the
// browser holds its bytes in memory cache and a page change's decode skips disk.
const downloads = new Map<string, HTMLImageElement>();

export function getPageBackground(pathname: string) {
  const [, section = "", detail] = pathname.split("/");
  if (detail && plainDetailSections.has(section)) return;
  return backgrounds.get(section);
}

export async function preparePageBackground(pathname: string) {
  const source = getPageBackground(pathname);
  if (!source || !pageBackgroundsEnabled()) return;
  const image = new Image();
  image.src = source;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      image.decode(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, decodeCap);
      }),
    ]);
  } catch {
    // The page renders without a background that fails to decode.
  } finally {
    clearTimeout(timeout);
  }
}

export function downloadPageBackground(pathname: string) {
  const source = getPageBackground(pathname);
  if (!source || !pageBackgroundsEnabled()) return;
  const image = new Image();
  image.src = source;
  downloads.set(source, image);
}
