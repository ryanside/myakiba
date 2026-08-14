import { ENTRY_CATEGORIES } from "@myakiba/contracts/shared/constants";

const SECTION_DISPLAY_ORDER: readonly string[] = [
  ...ENTRY_CATEGORIES.map((category) => category.toLowerCase()),
  "shops",
  "scales",
];

export const SECTION_GRADIENT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
  "var(--chart-9)",
  "var(--chart-10)",
] as const;

export function sectionLabel(sectionName: string): string {
  return sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
}

export function sectionGradientColor(sectionName: string): string {
  const sectionIndex = SECTION_DISPLAY_ORDER.indexOf(sectionName);
  return SECTION_GRADIENT_COLORS[sectionIndex % SECTION_GRADIENT_COLORS.length];
}
