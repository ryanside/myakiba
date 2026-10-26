import path from "node:path";
import { chromium } from "playwright";

const LOGO = path.join(import.meta.dir, "../../web/src/components/myakiba-logo.tsx");
const PUBLIC = path.join(import.meta.dir, "../public");
const SIZES = [16, 32, 48, 96, 128] as const;

const source = await Bun.file(LOGO).text();
const mark = /viewBox="0 0 53 18"[^>]*>\s*<path d="([^"]+)"/u.exec(source)?.[1];
if (!mark) throw new Error(`no 53x18 icon mark in ${LOGO}, so the icons cannot be drawn`);

function icon(size: number): string {
  // The Chrome Web Store wants the 128 px icon as 96 px of artwork inside 16 px of transparent padding.
  const padding = size === 128 ? 16 : 0;
  const tile = size - 2 * padding;
  const width = tile * 0.8;
  const scale = width / 53;
  const x = padding + (tile - width) / 2;
  const y = padding + (tile - 18 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${padding}" y="${padding}" width="${tile}" height="${tile}" rx="${tile * 0.2}" fill="#000"/>
  <path transform="translate(${x} ${y}) scale(${scale})" fill="#fff" d="${mark}"/>
</svg>`;
}

const browser = await chromium.launch({ channel: "chromium" });
try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0">${icon(size)}</body>`);
    await page.screenshot({
      path: path.join(PUBLIC, `icon-${size}.png`),
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    await page.close();
  }
} finally {
  await browser.close();
}
