const FIELD_LABELS = [
  "Category",
  "Title",
  "Numbering",
  "Classification",
  "Classifications",
  "Origin",
  "Origins",
  "Character",
  "Characters",
  "Company",
  "Companies",
  "Artist",
  "Artists",
  "Event",
  "Events",
  "Material",
  "Materials",
  "Version",
  "Dimensions",
  "Various",
] as const;

/** The labels of the item fields a field reader reads, besides the `Releases…` field. */
export type FieldLabel = (typeof FIELD_LABELS)[number];

/** Every part of an MFC page that `readMfcEnvelope` and `parseMfcItemPage` read, and all that `scrubMfcPage` keeps. */
export const MFC_PAGE_READS = {
  title: "title",
  canonicalLink: 'link[rel="canonical"]',
  ogImage: 'meta[property="og:image"]',
  userMenuClass: "user-menu",
  handleClass: "handle",
  heading: "h1.title",
  headingClass: "title",
  itemObject: ".item-object",
  itemObjectClass: "item-object",
  itemField: ".data-field",
  fieldLabel: ".data-label",
  fieldLabels: new Set<string>(FIELD_LABELS),
  releasesLabel: "Releases",
  extraReleaseClass: "item-extra-release",
  /** Every class a field reader selects on. */
  fieldClasses: new Set([
    "data-field",
    "data-label",
    "data-value",
    "item-entries",
    "item-entry",
    "light",
    "item-scale",
    "time",
    "item-extra-release",
  ]),
  notFoundSentence: "The page you requested was not found",
  entryHref: /\/entry\/(\d+)/,
  ratingHref: /[?&]ratingId=(\d+)/,
  hiddenElements: new Set(["script", "style", "template"]),
} as const;
