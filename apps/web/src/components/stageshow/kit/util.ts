import { env } from "@myakiba/env/web";

// Small helpers shared by the stage and its script API.

// Development only: a production build never warns.
export const isDev = () => env.DEV;

export function warn(msg: string) {
  if (isDev()) console.warn(`[stageshow] ${msg}`);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const hash = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43_758.5453;
  return x - Math.floor(x);
};
