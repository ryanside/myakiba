import { Parser } from "htmlparser2";
import { MAX_MFC_ITEM_ID } from "@myakiba/contracts/shared/constants";

export type MfcItemId = number & { readonly __brand: "MfcItemId" };

export function mfcItemId(value: number): MfcItemId | null {
  return Number.isInteger(value) && value >= 1 && value <= MAX_MFC_ITEM_ID
    ? (value as MfcItemId)
    : null;
}

export type MfcEnvelope =
  | {
      readonly kind: "item";
      readonly mfcItemId: MfcItemId;
      readonly signedIn: boolean;
      readonly ogImage: MfcOgImage;
    }
  | { readonly kind: "not_found"; readonly signedIn: boolean }
  | { readonly kind: "challenge" }
  | { readonly kind: "unexpected"; readonly status: number };

type MfcOgImage =
  | { readonly kind: "picture"; readonly picture: MfcPicture }
  | { readonly kind: "rejected"; readonly raw: string }
  | { readonly kind: "absent" };

export type MfcPicture = {
  readonly access: "gated" | "public";
  readonly url: string;
};

const CHALLENGE_TITLE = /^\s*Just a moment/i;
const NOT_FOUND_SENTENCE = "The page you requested was not found";
const CANONICAL_ITEM_URL = /^https:\/\/myfigurecollection\.net\/item\/(\d+)$/;

export function readMfcEnvelope(response: {
  readonly status: number;
  readonly cfMitigated: string | null;
  readonly html: string;
}): MfcEnvelope {
  const { status, cfMitigated, html } = response;
  const page = scanPage(html);
  if (cfMitigated?.trim().toLowerCase() === "challenge" || CHALLENGE_TITLE.test(page.title)) {
    return { kind: "challenge" };
  }
  const { signedIn } = page;
  if (status === 404) return { kind: "not_found", signedIn };
  if (status !== 200) return { kind: "unexpected", status };
  const match = CANONICAL_ITEM_URL.exec(page.canonicalHref ?? "");
  const id = match?.[1] ? mfcItemId(Number(match[1])) : null;
  if (id !== null) {
    return { kind: "item", mfcItemId: id, signedIn, ogImage: readOgImage(page.ogImage, id) };
  }
  if (page.notFoundSentence) return { kind: "not_found", signedIn };
  return { kind: "unexpected", status };
}

type PageMarkers = {
  canonicalHref: string | null;
  ogImage: string | null;
  title: string;
  signedIn: boolean;
  notFoundSentence: boolean;
};

const HIDDEN_ELEMENTS = new Set(["script", "style", "template"]);
const ASCII_WHITESPACE = /[\t\n\f\r ]+/;

function scanPage(html: string): PageMarkers {
  const page: PageMarkers = {
    canonicalHref: null,
    ogImage: null,
    title: "",
    signedIn: false,
    notFoundSentence: false,
  };
  let hiddenDepth = 0;
  let titleState: "before" | "inside" | "after" = "before";
  const parser = new Parser({
    onopentag(name, attributes) {
      if (HIDDEN_ELEMENTS.has(name)) hiddenDepth += 1;
      if (hiddenDepth > 0) return;
      if (name === "title" && titleState === "before") titleState = "inside";
      if (name === "link" && attributes.rel === "canonical") {
        page.canonicalHref ??= attributes.href ?? "";
      }
      if (name === "meta" && attributes.property === "og:image") {
        page.ogImage ??= attributes.content ?? "";
      }
      if (attributes.class?.split(ASCII_WHITESPACE).includes("user-menu")) page.signedIn = true;
    },
    onclosetag(name) {
      if (HIDDEN_ELEMENTS.has(name)) hiddenDepth -= 1;
      else if (name === "title" && titleState === "inside") titleState = "after";
    },
    ontext(text) {
      if (hiddenDepth > 0) return;
      if (titleState === "inside") page.title += text;
      if (text.includes(NOT_FOUND_SENTENCE)) page.notFoundSentence = true;
    },
  });
  parser.end(html);
  return page;
}

function readOgImage(raw: string | null, id: MfcItemId): MfcOgImage {
  if (raw === null) return { kind: "absent" };
  const picture = allowPicture(raw, id);
  return picture ? { kind: "picture", picture } : { kind: "rejected", raw };
}

function allowPicture(raw: string, id: MfcItemId): MfcPicture | null {
  const url = URL.parse(raw);
  if (!url || url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (url.hostname === "myfigurecollection.net" && url.pathname === "/") {
    const size = gatedPictureSize(url.searchParams, id);
    return size === null
      ? null
      : {
          access: "gated",
          url: `https://myfigurecollection.net/?_tb=commit&commit=nsp&objectType=item&objectId=${id}&size=${size}`,
        };
  }
  if (
    url.hostname === "static.myfigurecollection.net" &&
    url.pathname.startsWith("/upload/items/")
  ) {
    return { access: "public", url: url.origin + url.pathname };
  }
  return null;
}

const GATED_PARAMETERS = new Set(["_tb", "commit", "objectType", "objectId", "size"]);
const PICTURE_SIZE = /^(?:0|[1-9]\d?)$/;

function gatedPictureSize(query: URLSearchParams, id: MfcItemId): string | null {
  const values = new Map<string, string>();
  for (const [name, value] of query) {
    if (!GATED_PARAMETERS.has(name) || values.has(name)) return null;
    values.set(name, value);
  }
  const size = values.get("size") ?? "";
  return values.get("_tb") === "commit" &&
    values.get("commit") === "nsp" &&
    values.get("objectType") === "item" &&
    values.get("objectId") === String(id) &&
    PICTURE_SIZE.test(size)
    ? size
    : null;
}
