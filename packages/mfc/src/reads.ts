/** Every part of an MFC page that `readMfcEnvelope` and `parseMfcItemPage` read, and all that `scrubMfcPage` keeps. */
export const MFC_PAGE_READS = {
  title: "title",
  canonicalLink: 'link[rel="canonical"]',
  ogImage: 'meta[property="og:image"]',
  userMenuClass: "user-menu",
  handleClass: "handle",
  heading: "h1.title",
  itemObject: ".item-object",
  itemField: ".data-field",
  notFoundSentence: "The page you requested was not found",
  entryHref: /\/entry\/(\d+)/,
  ratingHref: /[?&]ratingId=(\d+)/,
  hiddenElements: new Set(["script", "style", "template"]),
} as const;
