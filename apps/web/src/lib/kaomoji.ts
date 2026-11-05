// Faces only, in glyphs that common system fonts carry, so none falls back to boxes.
const KAOMOJI_POOL = ["(˶˃ ᵕ ˂˶)", "(⸝⸝> ᴗ•⸝⸝)", "(˵ •̀ ᴗ - ˵ ) ✧"] as const;

export function randomKaomoji(): string {
  return KAOMOJI_POOL[Math.floor(Math.random() * KAOMOJI_POOL.length)] ?? KAOMOJI_POOL[0];
}
