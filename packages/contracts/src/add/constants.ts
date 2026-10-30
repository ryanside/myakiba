export const MAX_ADD_ROWS = 100;
export const MAX_COMMIT_LISTS = 20;
export const MAX_PICK_STORE_BYTES = 8 * 1024 * 1024;
export const PICK_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const MAX_PICK_TITLE = 300;

const MFC_ORIGIN = "https://myfigurecollection.net";

export const MFC_SIGN_IN_URL = `${MFC_ORIGIN}/session/signin/`;
// The user menu links here; that this page holds the SFW switch is unverified.
export const MFC_SETTINGS_URL = `${MFC_ORIGIN}/settings/`;
export const mfcSearchUrl = (query: string) =>
  `${MFC_ORIGIN}/?_tb=item&keywords=${encodeURIComponent(query)}`;
export const mfcItemUrl = (id: number) => `${MFC_ORIGIN}/item/${id}`;
export const mfcPictureUrl = (id: number) =>
  `${MFC_ORIGIN}/?_tb=commit&commit=nsp&objectType=item&objectId=${id}&size=1`;
