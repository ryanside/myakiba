export const NO_SCALE = "n/a";

export function normalizeScale(scale: string | null | undefined): string {
  const value = scale?.trim();

  if (!value) {
    return NO_SCALE;
  }

  return value;
}
