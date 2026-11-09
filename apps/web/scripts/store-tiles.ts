import path from "node:path";
import { chromium } from "playwright";

const LOGO = path.join(import.meta.dir, "../src/components/myakiba-logo.tsx");
const BACKGROUND = path.join(
  import.meta.dir,
  "../src/assets/backgrounds/11-akihabara-bright-bitgrain.webp",
);
const OUT = path.join(import.meta.dir, "../../../store-assets");

const source = await Bun.file(LOGO).text();
const wordmark = /viewBox="0 0 154 30"[^>]*>\s*<path d="([^"]+)"/u.exec(source)?.[1];
const mark = /viewBox="0 0 53 18"[^>]*>\s*<path d="([^"]+)"/u.exec(source)?.[1];
if (!wordmark || !mark)
  throw new Error(`no wordmark or icon mark in ${LOGO}, so the tiles cannot be drawn`);
const background = `data:image/webp;base64,${Buffer.from(await Bun.file(BACKGROUND).arrayBuffer()).toString("base64")}`;

type Layout = {
  readonly width: number;
  readonly height: number;
  /** Wordmark width and its left edge; it is centred vertically. */
  readonly logo: { readonly x: number; readonly w: number };
  /** The picked card: its box and the size unit everything inside it scales with. */
  readonly card: { readonly x: number; readonly y: number; readonly w: number; readonly u: number };
  readonly shade: string;
};

/** The Akihabara street the app signs in over, the wordmark, and a picked item arriving. */
function tile({ width, height, logo, card, shade }: Layout): string {
  const { u } = card;
  return `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${width}px; height: ${height}px; overflow: hidden; background: #08080a; }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 45%;
        image-rendering: pixelated; filter: saturate(1.15) contrast(1.05); }
  .shade { position: absolute; inset: 0; background: ${shade}; }
  .logo { position: absolute; left: ${logo.x}px; top: ${(height - (logo.w * 30) / 154) / 2}px; width: ${logo.w}px;
          filter: drop-shadow(0 ${u * 0.3}px ${u * 1.2}px rgba(0,0,0,.55)); }
  .card { position: absolute; left: ${card.x}px; top: ${card.y}px; width: ${card.w}px; padding: ${u * 1.1}px;
          border-radius: ${u * 1.4}px; background: rgba(14,14,16,.72); backdrop-filter: blur(${u * 0.9}px);
          border: 1px solid rgba(255,255,255,.16);
          box-shadow: 0 ${u * 1.6}px ${u * 4}px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.08); }
  .row { display: flex; align-items: center; gap: ${u * 1.1}px; }
  .thumb { width: ${u * 4.4}px; height: ${u * 4.4}px; border-radius: ${u * 0.9}px; flex: none;
           background: linear-gradient(145deg, #2c2c33, #121215); border: 1px solid rgba(255,255,255,.14);
           display: grid; place-items: center; }
  .thumb svg { width: 62%; }
  .lines { flex: 1; display: grid; gap: ${u * 0.7}px; }
  .line { height: ${u * 0.75}px; border-radius: ${u}px; background: rgba(255,255,255,.88); }
  .line.short { width: 55%; height: ${u * 0.6}px; background: rgba(255,255,255,.4); }
  .pill { position: absolute; left: ${card.x + card.w - u * 7.5}px; top: ${card.y - u * 2.6}px;
          width: ${u * 8.6}px; height: ${u * 4}px; border-radius: ${u * 2}px; background: #fff;
          display: grid; place-items: center; transform: rotate(-4deg);
          box-shadow: 0 ${u * 0.9}px ${u * 2.4}px rgba(0,0,0,.45); }
  .pill svg { width: ${u * 2.2}px; }
</style></head><body>
  <img class="bg" src="${background}" alt="">
  <div class="shade"></div>
  <svg class="logo" viewBox="0 0 154 30" fill="#fff"><path d="${wordmark}"/></svg>
  <div class="card"><div class="row">
    <div class="thumb"><svg viewBox="0 0 53 18" fill="#fff"><path d="${mark}"/></svg></div>
    <div class="lines"><div class="line"></div><div class="line short"></div></div>
  </div></div>
  <div class="pill"><svg viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5L19.5 7"/></svg></div>
</body></html>`;
}

const TILES: readonly ({ readonly file: string } & Layout)[] = [
  {
    file: "chrome-small-promo-440x280.png",
    width: 440,
    height: 280,
    logo: { x: 30, w: 190 },
    card: { x: 236, y: 124, w: 184, u: 9 },
    shade:
      "linear-gradient(90deg, rgba(8,8,10,.9) 0%, rgba(8,8,10,.72) 48%, rgba(8,8,10,.25) 100%)",
  },
  {
    file: "chrome-marquee-promo-1400x560.png",
    width: 1400,
    height: 560,
    logo: { x: 110, w: 520 },
    card: { x: 820, y: 250, w: 470, u: 20 },
    shade:
      "linear-gradient(90deg, rgba(8,8,10,.9) 0%, rgba(8,8,10,.74) 40%, rgba(8,8,10,.2) 75%, rgba(8,8,10,.38) 100%)",
  },
];

const browser = await chromium.launch({ channel: "chromium" });
try {
  for (const { file, ...layout } of TILES) {
    const page = await browser.newPage({
      viewport: { width: layout.width, height: layout.height },
    });
    await page.setContent(tile(layout));
    await page.screenshot({
      path: path.join(OUT, file),
      clip: { x: 0, y: 0, width: layout.width, height: layout.height },
    });
    await page.close();
  }
} finally {
  await browser.close();
}
