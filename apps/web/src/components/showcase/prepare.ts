import { loadFont } from "@/lib/load-font";
import { getPageBackground } from "@/lib/page-background";
import { SHOWCASE_SCREENS } from "./screens";
import type { ShowcaseScreenName } from "./screens";

// The screens paint in these. The page loads them first, so no screen shows a fallback font.
const SCREEN_FONTS = ['16px "Inter Variable"', '16px "Orbitron Variable"'] as const;

async function decodeImage(source: string) {
  const image = new Image();
  image.src = source;
  try {
    await image.decode();
  } catch {
    // A missing picture shows as the app shows it, so the page does not wait on it.
  }
}

/** Loads every picture and font the named screens show, so they paint complete at once. */
export async function prepareShowcaseScreens(names: readonly ShowcaseScreenName[]): Promise<void> {
  const images = new Set<string>();
  for (const name of names) {
    const { path, images: shown } = SHOWCASE_SCREENS[name];
    for (const image of shown) images.add(image);
    const background = getPageBackground(path);
    if (background) images.add(background);
  }
  await Promise.all([...[...images].map(decodeImage), ...SCREEN_FONTS.map(loadFont)]);
}
