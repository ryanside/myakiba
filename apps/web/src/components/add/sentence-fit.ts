/**
 * How the destination sentence stays on one line, by the room its row has. Each step down keeps what
 * means most and leaves the words it drops to screen readers:
 *
 * - under 48rem the commit shows only its verb;
 * - under 41rem Wishlist and Lists show as icons with their state, and "and" goes;
 * - under 36rem "also on" goes;
 * - under 31rem the lead ("Add 12 items to") goes;
 * - under 21rem Wishlist and Lists are one control, and the choice loses its icon.
 *
 * Each width fits the widest choice, Item Database with Keep, and a List title too long for the row
 * is cut short in the Lists trigger, which is the one part that shrinks.
 */

export const FULL_LABEL = "block @max-[48rem]/sentence:sr-only";
export const SHORT_LABEL = "hidden @max-[48rem]/sentence:block";

/** Words an icon stands in for. */
export const ICON_WORDS = "@max-[41rem]/sentence:sr-only";
export const ICONS = "hidden @max-[41rem]/sentence:flex";
export const WORDS_ONLY = "@max-[41rem]/sentence:hidden";

export const AND = "@max-[41rem]/sentence:sr-only @max-[21rem]/sentence:hidden";
export const ALSO_ON = "@max-[36rem]/sentence:sr-only @max-[21rem]/sentence:hidden";
export const LEAD = "@max-[31rem]/sentence:sr-only";

/** Wishlist and Lists as two controls, and as the one that holds both. */
export const APART = "@max-[21rem]/sentence:hidden";
export const FOLDED = "hidden @max-[21rem]/sentence:flex";
export const CHOICE_ICON = "@max-[21rem]/sentence:hidden";
export const GAP = "gap-2 @max-[21rem]/sentence:gap-1.5";
