export const ITEM_FETCH_ERROR_CODES = [
  "mfc_signed_out",
  "hidden_or_missing",
  "challenge_unsolved",
  "rate_limited",
  "timeout",
  "unexpected_page",
] as const;
export type ItemFetchErrorCode = (typeof ITEM_FETCH_ERROR_CODES)[number];
