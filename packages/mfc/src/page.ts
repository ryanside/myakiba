export type MfcItemId = number & { readonly __brand: "MfcItemId" };

const MAX_MFC_ITEM_ID = 2 ** 31 - 1;

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
      readonly picture: MfcPicture | null;
    }
  | { readonly kind: "not_found"; readonly signedIn: boolean }
  | { readonly kind: "challenge" }
  | { readonly kind: "unexpected"; readonly status: number };

export type MfcPicture = {
  readonly access: "gated" | "public";
  readonly url: string;
};

const CHALLENGE_TITLE = /<title>\s*Just a moment/i;
const USER_MENU = /class="[^"]*\buser-menu\b/;
const NOT_FOUND_TEXT = /The page you requested was not found/;
const CANONICAL_ITEM_URL = /^https:\/\/myfigurecollection\.net\/item\/(\d+)$/;

export function readMfcEnvelope(response: {
  readonly status: number;
  readonly cfMitigated: string | null;
  readonly html: string;
}): MfcEnvelope {
  const { status, cfMitigated, html } = response;
  if (cfMitigated?.trim().toLowerCase() === "challenge" || CHALLENGE_TITLE.test(html)) {
    return { kind: "challenge" };
  }
  const signedIn = USER_MENU.test(html);
  if (status === 404) return { kind: "not_found", signedIn };
  const id = canonicalItemId(html);
  if (status === 200 && id !== null) {
    return {
      kind: "item",
      mfcItemId: id,
      signedIn,
      picture: allowPicture(metaContent(html, "og:image"), id),
    };
  }
  if (NOT_FOUND_TEXT.test(html)) return { kind: "not_found", signedIn };
  return { kind: "unexpected", status };
}

function canonicalItemId(html: string): MfcItemId | null {
  for (const attributes of tagsNamed(html, "link")) {
    if (attributes.get("rel") !== "canonical") continue;
    const match = CANONICAL_ITEM_URL.exec(attributes.get("href") ?? "");
    return match?.[1] ? mfcItemId(Number(match[1])) : null;
  }
  return null;
}

function metaContent(html: string, property: string): string | null {
  for (const attributes of tagsNamed(html, "meta")) {
    if (attributes.get("property") === property) return attributes.get("content") ?? null;
  }
  return null;
}

function allowPicture(raw: string | null, id: MfcItemId): MfcPicture | null {
  const url = raw === null ? null : URL.parse(raw);
  if (!url || url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const query = url.searchParams;
  if (
    url.hostname === "myfigurecollection.net" &&
    url.pathname === "/" &&
    query.get("_tb") === "commit" &&
    query.get("commit") === "nsp" &&
    query.get("objectType") === "item" &&
    query.get("objectId") === String(id)
  ) {
    return { access: "gated", url: url.href };
  }
  if (
    url.hostname === "static.myfigurecollection.net" &&
    url.pathname.startsWith("/upload/items/")
  ) {
    return { access: "public", url: url.href };
  }
  return null;
}

const ATTRIBUTE = /([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

function* tagsNamed(html: string, name: string): Generator<ReadonlyMap<string, string>> {
  for (const [tag] of html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))) {
    const attributes = new Map<string, string>();
    for (const [, key = "", double, single, bare] of tag.matchAll(ATTRIBUTE)) {
      attributes.set(key.toLowerCase(), decodeEntities(double ?? single ?? bare ?? ""));
    }
    yield attributes;
  }
}

const MAX_CODE_POINT = 0x10_ff_ff;
const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["quot", '"'],
]);

function decodeEntities(value: string): string {
  return value.replaceAll(
    /&(?:#x([\da-f]+)|#(\d+)|([a-z]+));/gi,
    (
      entity: string,
      hex: string | undefined,
      decimal: string | undefined,
      name: string | undefined,
    ) => {
      if (name !== undefined) return NAMED_ENTITIES.get(name) ?? entity;
      const codePoint = hex === undefined ? Number(decimal) : Number.parseInt(hex, 16);
      return codePoint <= MAX_CODE_POINT ? String.fromCodePoint(codePoint) : entity;
    },
  );
}
