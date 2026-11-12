import { afterAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { edit, fixture, itemId } from "../test/fixtures";
import { scrubMfcPage } from "./capture";
import { readMfcEnvelope } from "./page";
import { parseMfcItemPage } from "./parse";

const ID_98777 = itemId(98_777);
const item98777 = await fixture("item-98777.html");
const FIXTURES = [
  "item-98777.html",
  "derived-public-item.html",
  "derived-not-found-signed-in.html",
  "derived-not-found-signed-out.html",
  "derived-challenge.html",
];
const fixturePages = await Promise.all(
  FIXTURES.map(async (name) => [name, await fixture(name)] as const),
);

GlobalRegistrator.register();
afterAll(() => GlobalRegistrator.unregister());

function documentOf(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function scrub(html: string): string {
  return scrubMfcPage(documentOf(html));
}

function readings(html: string) {
  const parsed = parseMfcItemPage(html, ID_98777);
  return {
    parsed: parsed.isOk() ? parsed.value : parsed.error.problem,
    envelopes: [200, 403, 404].map((status) =>
      readMfcEnvelope({ status, cfMitigated: null, html }),
    ),
  };
}

const COMPANY_FIELD =
  '<div class="data-field"><div class="data-label">Company</div><div class="data-value"><div class="item-entries"><a href="/entry/7628" class="tbx-tooltip item-entry important"><img src="https://static.myfigurecollection.net/upload/entries/0/7628-40502.jpg" alt="Orchid Seed"/><meta name="vars" content="7:7628"/><span switch="オーキッドシード">Orchid Seed</span></a>&nbsp;<small class="light">as <em>Manufacturer</em></small></div></div></div>';
const DIMENSIONS_FIELD =
  '<div class="data-field"><div class="data-label">Dimensions</div><div class="data-value"><a href="/?_tb=item&amp;scale=7" class="item-scale" title="Scale"><small>1/</small>7</a>&nbsp;&nbsp;<small>H=</small><strong>140</strong><small>mm (5.46in, 1:1=0.98m)</small></div></div>';
const VARIOUS_FIELD = '<div class="data-field"><div class="data-label">Various</div>';
const OG_IMAGE =
  'content="https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98777&amp;size=1"';

const VARIANTS: readonly (readonly [string, string])[] = [
  [
    "a second role group",
    edit(
      item98777,
      COMPANY_FIELD,
      COMPANY_FIELD.replace(
        "</div></div></div>",
        '</div><div class="item-entries"><a href="/entry/7628" class="item-entry"><span switch="">Orchid Seed</span></a>&nbsp;<small class="light">as <em>Distributor</em></small></div></div></div>',
      ),
    ),
  ],
  [
    "a numbered Nendoroid classification",
    edit(
      item98777,
      COMPANY_FIELD,
      `<div class="data-field"><div class="data-label">Classification</div><div class="data-value"><div class="item-entries"><a href="/entry/23355" class="item-entry"><span switch="">Nendoroid (#1234)</span></a></div></div></div>${COMPANY_FIELD}`,
    ),
  ],
  [
    "a material percentage",
    edit(
      item98777,
      '<span switch="塩ビ">PVC</span></a></div>',
      '<span switch="塩ビ">PVC</span></a> <small class="light">70%</small></div>',
    ),
  ],
  [
    "a title, a numbering and a version",
    edit(
      item98777,
      VARIOUS_FIELD,
      `<div class="data-field"><div class="data-label">Title</div><div class="data-value">Hello <b>Good-bye</b></div></div><div class="data-field"><div class="data-label">Numbering</div><div class="data-value">#12</div></div><div class="data-field"><div class="data-label">Version</div><div class="data-value"><a href="/?_tb=item&amp;version=1">Limited</a>, <a href="/?_tb=item&amp;version=2">Bunny</a></div></div>${VARIOUS_FIELD}`,
    ),
  ],
  [
    "width and depth",
    edit(item98777, "<strong>140</strong>", "<strong>140</strong>, W=1,200mm, D=90mm"),
  ],
  [
    "a second release and an extra release",
    edit(
      item98777,
      '<div class="data-field"><div class="data-label">Materials</div>',
      '<div class="data-field"><div class="data-value"><a href="/?_tb=item&amp;year=2019" class="time">03/01/2019</a> <small class="light">as <em>Resale</em></small><br/>14,000 <small>JPY</small> &bull; 4582292601716</div></div><div class="data-field item-extra-release"><div class="data-label">Extra</div><div class="data-value"><a href="/?_tb=item&amp;year=2020" class="time">2020</a> 9.99 <small>USD</small></div></div><div class="data-field"><div class="data-label">Materials</div>',
    ),
  ],
  [
    "an unknown field",
    edit(
      item98777,
      '<div class="data-label">Various</div>',
      '<div class="data-label">Sculpting</div>',
    ),
  ],
  [
    "an unparseable release date",
    edit(item98777, 'class="time">11/15/2018</a>', 'class="time">Spring 2018</a>'),
  ],
  [
    "an unknown title bracket",
    edit(item98777, 'class="title">[Explicit] - Hello', 'class="title">[Mature] - Hello'),
  ],
  [
    "an empty title",
    edit(
      item98777,
      "[Explicit] - Hello, Good-bye - Yukishiro May - 1/7 (Orchid Seed)</h1>",
      "  </h1>",
    ),
  ],
  ["no category", edit(item98777, '<div class="data-label">Category</div>', "")],
  [
    "an unknown category",
    edit(
      item98777,
      '<span class="item-category-1">Prepainted</span>',
      '<span class="item-category-1">Figurines</span>',
    ),
  ],
  [
    "a rejected og:image",
    edit(item98777, OG_IMAGE, 'content="https://static.example.com/upload/items/1/98777.jpg"'),
  ],
  [
    "an og:image hidden by SFW mode",
    edit(
      item98777,
      OG_IMAGE,
      'content="https://static.myfigurecollection.net/ressources/icons/nsfw.png"',
    ),
  ],
  ["no og:image", edit(item98777, `<meta property="og:image" ${OG_IMAGE}/>`, "")],
  ["another item", edit(item98777, "/item/98777", "/item/98778")],
  [
    "a title with struck-out text",
    edit(
      item98777,
      VARIOUS_FIELD,
      `<div class="data-field"><div class="data-label">Title</div><div class="data-value">Hello <s>Good-bye</s></div></div>${VARIOUS_FIELD}`,
    ),
  ],
  [
    "a field label in a label element",
    edit(
      item98777,
      '<div class="data-label">Various</div>',
      '<div class="data-label"><label>Various</label></div>',
    ),
  ],
  [
    "fields that are a section, a definition list and a table row",
    edit(
      item98777,
      DIMENSIONS_FIELD,
      `${DIMENSIONS_FIELD.replace("<div", "<section").replace(/<\/div>$/, "</section>")}<dl class="data-field"><dt class="data-label">Numbering</dt><dd class="data-value">#12</dd></dl><table><tr class="data-field"><td class="data-label">Title</td><td class="data-value">Hello</td></tr></table>`,
    ),
  ],
];

describe("scrubMfcPage keeps every reading of a page", () => {
  test.each([...fixturePages, ...VARIANTS])("%s", (_name, html) => {
    expect(readings(scrub(html))).toEqual(readings(html));
  });
});

const MARKER = "scrub_marker_user";

const PLANTED = [
  [
    '<div class="tbx-target-NOTE"><section>',
    `<div class="tbx-target-NOTE"><section><div class="bbcode">${MARKER} keeps this one boxed</div>`,
  ],
  [
    '<div class="tbx-target-COLLECTION"><section>',
    `<div class="tbx-target-COLLECTION"><section><div class="data-field"><div class="data-label">Status</div><div class="data-value">Owned by ${MARKER}</div></div>`,
  ],
  [
    '<div id="side"><div class="wrapper">',
    `<div id="side"><div class="wrapper"><a href="/?_tb=collection&amp;username=${MARKER}">Collection</a><img class="avatar" src="https://static.myfigurecollection.net/upload/users/200/${MARKER}.jpeg" alt="${MARKER}"/><a href="https://de.myfigurecollection.net/profile/${MARKER}">Profil</a>`,
  ],
  [
    '<h1 itemprop="headline" class="title">',
    `<h1 itemprop="headline" class="title" title="${MARKER}" data-user="${MARKER}" style="--who:${MARKER}">`,
  ],
  ['<div class="tbx-menu user-menu">', `<div class="tbx-menu user-menu" data-user="${MARKER}">`],
  [
    '<link rel="canonical" href="https://myfigurecollection.net/item/98777"/>',
    `<link rel="canonical" href="https://myfigurecollection.net/item/98777" data-user="${MARKER}"/><meta name="author" content="${MARKER}"/>`,
  ],
  [
    '<div class="data-field"><div class="data-label">Category</div>',
    `<div class="data-field" data-user="${MARKER}" style="--who:${MARKER}"><div class="data-label" title="${MARKER}">Category</div>`,
  ],
  [
    '<a href="/entry/23761" class="tbx-tooltip item-entry important">',
    `<a href="/entry/23761?username=${MARKER}" class="tbx-tooltip item-entry important" title="${MARKER}"><img src="https://static.myfigurecollection.net/upload/users/200/${MARKER}.jpeg" alt="${MARKER}"/><meta name="vars" content="${MARKER}"/>`,
  ],
  [
    "<footer>",
    `<section class="comments"><div class="comment"><a href="/profile/${MARKER}">${MARKER}</a><div class="bbcode">Nice one, says ${MARKER}</div></div></section><!-- ${MARKER} --><footer><span>Signed in as ${MARKER}</span>`,
  ],
  ['<body id="ref-top">', `<body id="ref-top" class="user-${MARKER}" data-user="${MARKER}">`],
  [
    '<section class="object">',
    `<section class="object" id="${MARKER}" data-owner="${MARKER}" title="${MARKER}">`,
  ],
  [
    '<div class="data-label">Origin</div><div class="data-value">',
    `<div class="data-label">Origin</div><div class="data-value"><!-- ${MARKER} --><textarea>${MARKER}</textarea><input value="${MARKER}"/><button>${MARKER}</button><script>var u = "${MARKER}";</script>`,
  ],
  ['<meta property="og:image" ', `<meta data-user="${MARKER}" property="og:image" `],
  [
    '<div id="wide">',
    `<script>var viewer = "${MARKER}";</script><style>.${MARKER}{}</style><template><b>${MARKER}</b></template><noscript><img src="/${MARKER}.gif"/>${MARKER}</noscript><input type="hidden" name="token" value="${MARKER}"/><p>${MARKER}: The page you requested was not found.</p><div id="wide">`,
  ],
] as const;

const plantedPage = PLANTED.reduce((html, [from, to]) => edit(html, from, to), item98777);

describe("scrubMfcPage sends nothing of the user", () => {
  const scrubbed = scrub(plantedPage);

  test("the marker is everywhere on the page", () => {
    expect(plantedPage.split(MARKER).length - 1).toBeGreaterThanOrEqual(PLANTED.length * 2);
  });

  test("no trace of the marker or of the capturing user leaves the page", () => {
    for (const leak of [MARKER, "fixture_user", "/profile/", "username="]) {
      expect(scrubbed).not.toContain(leak);
    }
  });

  test("the planted page still reads as the same signed-in item", () => {
    expect(readings(scrubbed)).toEqual(readings(item98777));
  });

  test("no element name carries the marker out", () => {
    const tag = `x-${MARKER}`;
    const html = (
      [
        [
          '<h1 itemprop="headline" class="title">',
          `<${tag}><h1 itemprop="headline" class="title">`,
        ],
        ["(Orchid Seed)</h1>", `(Orchid Seed)</h1></${tag}>`],
        [
          '<div class="tbx-menu user-menu">',
          `<${tag} class="tbx-menu user-menu"></${tag}><div class="tbx-menu user-menu">`,
        ],
        ["<strong>140</strong>", `<strong>140</strong><${tag}></${tag}>`],
      ] as const
    ).reduce((page, [from, to]) => edit(page, from, to), item98777);
    expect(scrub(html)).not.toContain(MARKER);
  });
});

describe("scrubMfcPage output", () => {
  test("keeps only the title, og:image and canonical link in the head", () => {
    const doc = documentOf(scrub(item98777));
    expect([...doc.head.children].map((element) => element.outerHTML)).toEqual([
      "<title>[Explicit] - Hello, Good-bye - Yukishiro May - 1/7 (Orchid Seed) — MyFigureCollection.net</title>",
      '<meta property="og:image" content="https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98777&amp;size=1">',
      '<link rel="canonical" href="https://myfigurecollection.net/item/98777">',
    ]);
  });

  test("leaves a signed-in user menu as an empty shell", () => {
    expect(scrub(item98777)).toContain('<div class="tbx-menu user-menu"></div>');
  });

  test("does not change the document it reads", () => {
    const doc = documentOf(item98777);
    const before = doc.documentElement.outerHTML;
    scrubMfcPage(doc);
    expect(doc.documentElement.outerHTML).toBe(before);
  });
});

describe("scrubMfcPage keeps what readMfcEnvelope reads on other pages", () => {
  test("a guest user menu names no one, so it stays and the page still reads signed out", async () => {
    const html = await fixture("derived-not-found-signed-out.html");
    expect(scrub(html)).toContain('href="/session/signin/"');
    expect(readMfcEnvelope({ status: 404, cfMitigated: null, html: scrub(html) })).toEqual({
      kind: "not_found",
      signedIn: false,
    });
  });

  test("keeps only the sign-in handle of a guest menu", async () => {
    const html = await fixture("derived-not-found-signed-out.html");
    expect(scrub(html)).toContain(
      '<div class="tbx-menu user-menu"><a class="handle" href="/session/signin/"></a></div>',
    );
  });
});
