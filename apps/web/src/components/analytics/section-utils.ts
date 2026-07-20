import { ENTRY_CATEGORIES } from "@myakiba/contracts/shared/constants";

const SECTION_DISPLAY_ORDER: readonly string[] = [
  ...ENTRY_CATEGORIES.map((category) => category.toLowerCase()),
  "shops",
  "scales",
];

export const SECTION_GRADIENT_COLORS = [
  "var(--color-blue-600)",
  "var(--color-violet-600)",
  "var(--color-emerald-600)",
  "var(--color-amber-500)",
  "var(--color-rose-500)",
  "var(--color-sky-500)",
] as const;

export function sectionLabel(sectionName: string): string {
  return sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
}

export function sectionGradientColor(sectionName: string): string {
  const sectionIndex = SECTION_DISPLAY_ORDER.indexOf(sectionName);
  return SECTION_GRADIENT_COLORS[sectionIndex % SECTION_GRADIENT_COLORS.length];
}
