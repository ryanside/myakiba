const KAOMOJI_POOL = [
  "(˶˃ ᵕ ˂˶) .ᐟ.ᐟ",
  "⋆˚꩜｡",
  "ദ്ദി◝ ⩊ ◜.ᐟ",
  "₊˚⊹ᰔ",
  "⋆˙⟡",
  "(˶˃𐃷˂˶)",
  "⭑.ᐟ",
  "⋆✴︎˚｡⋆",
  "₍^ >⩊< ^₎Ⳋ",
  "(⸝⸝> ᴗ•⸝⸝)",
  "ദ്ദി ˉ͈̀꒳ˉ͈́ )✧",
  "(˵ •̀ ᴗ - ˵ ) ✧",
] as const;

export function randomKaomoji(): string {
  return KAOMOJI_POOL[Math.floor(Math.random() * KAOMOJI_POOL.length)];
}
