export function readCount(text: string): number | undefined {
  const count = Number.parseInt(text, 10);
  return Number.isNaN(count) ? undefined : Math.min(Math.max(count, 1), 999);
}
