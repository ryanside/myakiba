import path from "node:path";
import { chromium } from "playwright";

const LOGO = path.join(import.meta.dir, "../src/components/myakiba-logo.tsx");
const OUT = path.join(import.meta.dir, "../../../store-assets");

const source = await Bun.file(LOGO).text();
const wordmark = /viewBox="0 0 154 30"[^>]*>\s*<path d="([^"]+)"/u.exec(source)?.[1];
if (!wordmark) throw new Error(`no 154x30 wordmark in ${LOGO}, so the tiles cannot be drawn`);

type Box = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** A Pick button in its picked state, three rows arriving under it, and the wordmark. */
function tile(width: number, height: number, logo: Box, picks: Box): string {
  const u = picks.h / 10;
  const chip = { x: picks.x, y: picks.y, w: picks.w * 0.42, h: u * 2.2 };
  const check = `M ${chip.x + chip.w / 2 - u * 0.64} ${chip.y + chip.h / 2 + u * 0.03} l ${u * 0.42} ${u * 0.42} l ${u * 0.86} ${-u * 0.9}`;
  const rows = [0, 1, 2].map((i) => {
    const y = picks.y + u * 3.4 + i * u * 2.2;
    const opacity = [1, 0.72, 0.48][i];
    return `<g opacity="${opacity}">
      <rect x="${picks.x}" y="${y}" width="${picks.w}" height="${u * 1.8}" rx="${u * 0.45}" fill="#ffffff" fill-opacity="0.07" stroke="#ffffff" stroke-opacity="0.16"/>
      <rect x="${picks.x + u * 0.35}" y="${y + u * 0.3}" width="${u * 1.2}" height="${u * 1.2}" rx="${u * 0.3}" fill="#ffffff" fill-opacity="0.85"/>
      <rect x="${picks.x + u * 2}" y="${y + u * 0.55}" width="${picks.w * 0.48}" height="${u * 0.3}" rx="${u * 0.15}" fill="#ffffff" fill-opacity="0.8"/>
      <rect x="${picks.x + u * 2}" y="${y + u * 1.05}" width="${picks.w * 0.26}" height="${u * 0.24}" rx="${u * 0.12}" fill="#ffffff" fill-opacity="0.38"/>
    </g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#26262b"/>
      <stop offset="1" stop-color="#050506"/>
    </linearGradient>
    <radialGradient id="glow" cx="${(picks.x + picks.w / 2) / width}" cy="${(picks.y + picks.h / 2) / height}" r="0.55">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <path transform="translate(${logo.x} ${logo.y}) scale(${logo.w / 154})" fill="#ffffff" d="${wordmark}"/>
  <rect x="${chip.x}" y="${chip.y}" width="${chip.w}" height="${chip.h}" rx="${chip.h / 2}" fill="#ffffff"/>
  <path d="${check}" fill="none" stroke="#0a0a0a" stroke-width="${u * 0.32}" stroke-linecap="round" stroke-linejoin="round"/>
  ${rows.join("\n  ")}
</svg>`;
}

const TILES = [
  {
    file: "chrome-small-promo-440x280.png",
    width: 440,
    height: 280,
    svg: tile(440, 280, { x: 36, y: 112, w: 176, h: 0 }, { x: 246, y: 62, w: 160, h: 156 }),
  },
  {
    file: "chrome-marquee-promo-1400x560.png",
    width: 1400,
    height: 560,
    svg: tile(1400, 560, { x: 120, y: 226, w: 520, h: 0 }, { x: 780, y: 108, w: 500, h: 344 }),
  },
] as const;

const browser = await chromium.launch({ channel: "chromium" });
try {
  for (const { file, width, height, svg } of TILES) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width, height } });
    await page.close();
  }
} finally {
  await browser.close();
}
