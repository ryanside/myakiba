export const ITEM_FETCH_ERROR_CODES = [
  "mfc_signed_out",
  "hidden_or_missing",
  "challenge_unsolved",
  "rate_limited",
  "timeout",
  "unexpected_page",
] as const;
export type ItemFetchErrorCode = (typeof ITEM_FETCH_ERROR_CODES)[number];

export const ITEM_FETCH_ERROR_MESSAGE = {
  mfc_signed_out: "Sign in to MyFigureCollection to import this item",
  hidden_or_missing:
    "MyFigureCollection hides this item. Check your MyFigureCollection content settings",
  challenge_unsolved: "The MyFigureCollection security check was not completed",
  rate_limited: "MyFigureCollection asked us to slow down. Try again later",
  timeout: "MyFigureCollection took too long to answer",
  unexpected_page: "MyFigureCollection showed an unexpected page",
  unknown: "The extension could not fetch this item",
} as const satisfies Record<ItemFetchErrorCode | "unknown", string>;
