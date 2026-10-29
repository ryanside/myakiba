import { describe, expect, test } from "bun:test";
import { edit, fixture, itemId } from "../test/fixtures";
import { mfcItemId, readMfcEnvelope } from "./page";

const GATED_98777 =
  "https://myfigurecollection.net/?_tb=commit&commit=nsp&objectType=item&objectId=98777&size=1";
const OG_IMAGE_98777 =
  '<meta property="og:image" content="https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98777&amp;size=1"/>';

const item98777 = await fixture("item-98777.html");
const ID_98777 = itemId(98_777);

function envelopeOf(html: string, status = 200, cfMitigated: string | null = null) {
  return readMfcEnvelope({ status, cfMitigated, html });
}

function withOgImage(url: string): string {
  return edit(item98777, OG_IMAGE_98777, `<meta property="og:image" content="${url}">`);
}

describe("mfcItemId", () => {
  test("accepts positive 32-bit integers", () => {
    expect<number | null>(mfcItemId(1)).toBe(1);
    expect<number | null>(mfcItemId(98_777)).toBe(98_777);
    expect<number | null>(mfcItemId(2 ** 31 - 1)).toBe(2 ** 31 - 1);
  });

  test.each([0, -1, 1.5, 2 ** 31, Number.NaN, Infinity])("rejects %p", (value) => {
    expect(mfcItemId(value)).toBeNull();
  });

  test("rejects a numeric string at compile time and at runtime", () => {
    // @ts-expect-error mfcItemId takes a number, so a string id cannot reach it unparsed.
    expect(mfcItemId("98777")).toBeNull();
  });
});

describe("readMfcEnvelope on the signed-in 98777 page", () => {
  test("reads the canonical id, the signed-in menu and the gated og:image", () => {
    expect(envelopeOf(item98777)).toEqual({
      kind: "item",
      mfcItemId: ID_98777,
      signedIn: true,
      ogImage: { kind: "picture", picture: { access: "gated", url: GATED_98777 } },
    });
  });

  test("a cf-mitigated challenge header wins over the body", () => {
    expect(envelopeOf(item98777, 403, "challenge")).toEqual({ kind: "challenge" });
  });

  test("a challenge-platform script on a normal page is not a challenge", () => {
    const html = edit(
      item98777,
      "</body>",
      '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></body>',
    );
    expect(envelopeOf(html).kind).toBe("item");
  });

  test("a comment quoting the not-found sentence leaves it an item page", () => {
    const html = edit(
      item98777,
      "</footer>",
      "<p>The page you requested was not found</p></footer>",
    );
    expect(envelopeOf(html).kind).toBe("item");
  });

  test("a non-200 status with item markup is unexpected", () => {
    expect(envelopeOf(item98777, 500)).toEqual({ kind: "unexpected", status: 500 });
  });

  test("the not-found sentence on a 503 is unexpected, even in a comment", () => {
    const html = edit(item98777, "</body>", "<!-- The page you requested was not found --></body>");
    expect(envelopeOf(html, 503)).toEqual({ kind: "unexpected", status: 503 });
  });
});

describe("readMfcEnvelope on pages derived from item-98777.html", () => {
  test("derived public item: signed out, static og:image", async () => {
    expect(envelopeOf(await fixture("derived-public-item.html"))).toEqual({
      kind: "item",
      mfcItemId: ID_98777,
      signedIn: false,
      ogImage: {
        kind: "picture",
        picture: {
          access: "public",
          url: "https://static.myfigurecollection.net/upload/items/1/98777-a1b2c.jpg",
        },
      },
    });
  });

  test("derived challenge page", async () => {
    expect(envelopeOf(await fixture("derived-challenge.html"), 403)).toEqual({
      kind: "challenge",
    });
  });

  test("derived signed-in 404", async () => {
    const html = await fixture("derived-not-found-signed-in.html");
    expect(envelopeOf(html, 404)).toEqual({ kind: "not_found", signedIn: true });
    expect(envelopeOf(html, 200)).toEqual({ kind: "not_found", signedIn: true });
  });

  test("derived signed-out 404", async () => {
    const html = await fixture("derived-not-found-signed-out.html");
    expect(envelopeOf(html, 404)).toEqual({ kind: "not_found", signedIn: false });
    expect(envelopeOf(html, 200)).toEqual({ kind: "not_found", signedIn: false });
  });
});

describe("readMfcEnvelope on other responses", () => {
  test("a 200 without a canonical item link is unexpected", () => {
    expect(envelopeOf("<html><head></head><body>hello</body></html>")).toEqual({
      kind: "unexpected",
      status: 200,
    });
  });

  test("a canonical link to a non-item page is unexpected", () => {
    const html = edit(
      item98777,
      'href="https://myfigurecollection.net/item/98777"',
      'href="https://myfigurecollection.net/entry/98777"',
    );
    expect(envelopeOf(html)).toEqual({ kind: "unexpected", status: 200 });
  });
});

describe("markup the envelope ignores", () => {
  test("a commented-out canonical before the real one", () => {
    const html = edit(
      item98777,
      '<link rel="canonical"',
      '<!-- <link rel="canonical" href="https://myfigurecollection.net/item/98778"/> --><link rel="canonical"',
    );
    expect(envelopeOf(html)).toMatchObject({ kind: "item", mfcItemId: ID_98777 });
  });

  test("a challenge title inside a script", () => {
    const html = edit(item98777, "</body>", '<script>"<title>Just a moment"</script></body>');
    expect(envelopeOf(html).kind).toBe("item");
  });

  test("a challenge title inside a template", () => {
    const html = edit(
      item98777,
      "<head>",
      "<head><template><title>Just a moment</title></template>",
    );
    expect(envelopeOf(html).kind).toBe("item");
  });

  test("a > inside a quoted attribute of the canonical link", () => {
    const html = edit(
      item98777,
      '<link rel="canonical"',
      '<link data-note="a > b" rel="canonical"',
    );
    expect(envelopeOf(html)).toMatchObject({ kind: "item", mfcItemId: ID_98777 });
  });

  test("a duplicate attribute after the first", () => {
    const html = edit(
      item98777,
      'href="https://myfigurecollection.net/item/98777"',
      'href="https://myfigurecollection.net/item/98777" href="https://myfigurecollection.net/item/98778"',
    );
    expect(envelopeOf(html)).toMatchObject({ kind: "item", mfcItemId: ID_98777 });
  });
});

describe("signed-in state", () => {
  test("a single-quoted class list with the user-menu token", async () => {
    const html = edit(
      await fixture("derived-public-item.html"),
      "<header>",
      "<header><div class='tbx-menu user-menu'></div>",
    );
    expect(envelopeOf(html)).toMatchObject({ kind: "item", signedIn: true });
  });

  test("a class that only starts with user-menu", async () => {
    const html = edit(
      await fixture("derived-public-item.html"),
      "<header>",
      '<header><div class="user-menu-guest"></div>',
    );
    expect(envelopeOf(html)).toMatchObject({ kind: "item", signedIn: false });
  });
});

describe("og:image", () => {
  const rejected = (raw: string) => ({ kind: "item", ogImage: { kind: "rejected", raw } });

  test("a gated picture comes back rebuilt with its size", () => {
    const html = withOgImage(
      "https://myfigurecollection.net/?size=2&amp;objectId=98777&amp;objectType=item&amp;commit=nsp&amp;_tb=commit#top",
    );
    expect(envelopeOf(html)).toMatchObject({
      ogImage: {
        kind: "picture",
        picture: {
          access: "gated",
          url: "https://myfigurecollection.net/?_tb=commit&commit=nsp&objectType=item&objectId=98777&size=2",
        },
      },
    });
  });

  test("a public picture loses its query and fragment", () => {
    const html = withOgImage(
      "https://static.myfigurecollection.net/upload/items/1/98777.jpg?x=1#f",
    );
    expect(envelopeOf(html)).toMatchObject({
      ogImage: {
        kind: "picture",
        picture: {
          access: "public",
          url: "https://static.myfigurecollection.net/upload/items/1/98777.jpg",
        },
      },
    });
  });

  test("public pictures must live under /upload/items/ on the static host", () => {
    const raw = "https://static.myfigurecollection.net/upload/users/1/1.jpg";
    expect(envelopeOf(withOgImage(raw))).toMatchObject(rejected(raw));
  });

  test.each([
    [
      "another item's gated picture",
      "https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98778&amp;size=1",
    ],
    [
      "plain http",
      "http://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98777&amp;size=1",
    ],
    ["another host", "https://static.example.com/upload/items/1/98777.jpg"],
    ["a port", "https://static.myfigurecollection.net:8443/upload/items/1/98777.jpg"],
    ["credentials", "https://user:pass@static.myfigurecollection.net/upload/items/1/98777.jpg"],
    [
      "a path escaping /upload/items/",
      "https://static.myfigurecollection.net/upload/items/../users/1.jpg",
    ],
    [
      "a duplicate objectId",
      "https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98777&amp;objectId=98778&amp;size=1",
    ],
    [
      "an extra commit",
      "https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98777&amp;size=1&amp;commit=other",
    ],
    [
      "an unknown parameter",
      "https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98777&amp;size=1&amp;next=x",
    ],
    [
      "no size",
      "https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98777",
    ],
    [
      "a size that is not a small integer",
      "https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98777&amp;size=01",
    ],
    ["not a URL", "not a url"],
  ])("rejects %s", (_, url) => {
    expect(envelopeOf(withOgImage(url))).toMatchObject(rejected(url.replaceAll("&amp;", "&")));
  });

  test("MFC's SFW placeholder means SFW mode hides the picture", () => {
    expect(
      envelopeOf(withOgImage("https://static.myfigurecollection.net/ressources/icons/nsfw.png")),
    ).toMatchObject({ kind: "item", ogImage: { kind: "sfw_hidden" } });
  });

  test("no og:image is absent", () => {
    expect(envelopeOf(edit(item98777, OG_IMAGE_98777, ""))).toMatchObject({
      kind: "item",
      ogImage: { kind: "absent" },
    });
  });
});
