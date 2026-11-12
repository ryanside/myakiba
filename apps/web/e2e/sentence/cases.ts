/** A List title as long as people give them, which no width of the sentence shows whole. */
const LONG_TITLE =
  "Scale figures I am still waiting on from the spring and summer preorder windows, sorted by shop";

export const LISTS = [
  { id: "shelf0000001", title: "Display shelf" },
  { id: "gifts0000001", title: "Gifts" },
  { id: "long00000001", title: LONG_TITLE },
] as const;

export type SentenceCase = {
  readonly to: "unset" | "collection" | "order-new" | "order-existing" | "none";
  readonly rows: number;
  readonly selected: number;
  readonly lists: readonly string[];
  readonly wishlist: boolean;
};

export function caseQuery(sentence: SentenceCase, theme: "dark" | "light" = "dark"): string {
  const params = new URLSearchParams({
    to: sentence.to,
    rows: String(sentence.rows),
    selected: String(sentence.selected),
    lists: sentence.lists.join(","),
    wishlist: sentence.wishlist ? "1" : "0",
    theme,
  });
  return `?${params}`;
}
