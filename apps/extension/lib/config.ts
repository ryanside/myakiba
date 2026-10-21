import { env } from "@myakiba/env/extension";
import type { Origins } from "./origins";

export const ORIGINS: Origins = {
  web: env.WXT_WEB_ORIGIN,
  mfc: env.WXT_MFC_ORIGIN,
  mfcStatic: env.WXT_MFC_STATIC_ORIGIN,
};
