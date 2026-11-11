import { describe, expect, test } from "bun:test";
import { edit, fixture, itemId } from "../test/fixtures";
import { parseMfcItemPage, splitContentLabel } from "./parse";
import type { MfcEntryLink, MfcItemPage, MfcPageProblem } from "./parse";

const item98777 = await fixture("item-98777.html");
const ID_98777 = itemId(98_777);

const RELEASE_98777 = {
  date: "2018-11-15",
  type: "Standard (Japan)",
  price: 1_350_000,
  priceCurrency: "JPY",
  barcode: "4582292601715",
};

const ENTRIES_98777: readonly MfcEntryLink[] = [
  {
    externalId: 23_761,
    category: "Origins",
    name: "Hello, Good-bye",
    sourceLabel: "Hello, Good-bye",
    roles: [],
    materialPercentage: null,
  },
  {
    externalId: 23_762,
    category: "Characters",
    name: "Yukishiro May",
    sourceLabel: "Yukishiro May",
    roles: [],
    materialPercentage: null,
  },
  {
    externalId: 7628,
    category: "Companies",
    name: "Orchid Seed",
    sourceLabel: "Orchid Seed",
    roles: ["Manufacturer"],
    materialPercentage: null,
  },
  {
    externalId: 9613,
    category: "Artists",
    name: "Minheru",
    sourceLabel: "Minheru",
    roles: ["Sculptor"],
    materialPercentage: null,
  },
  {
    externalId: 21_937,
    category: "Artists",
    name: "Moekibara Fumitake",
    sourceLabel: "Moekibara Fumitake",
    roles: ["Illustrator"],
    materialPercentage: null,
  },
  {
    externalId: 23_442,
    category: "Materials",
    name: "ABS",
    sourceLabel: "ABS",
    roles: [],
    materialPercentage: null,
  },
  {
    externalId: 23_441,
    category: "Materials",
    name: "PVC",
    sourceLabel: "PVC",
    roles: [],
    materialPercentage: null,
  },
];

const COMPANY_FIELD =
  '<div class="data-field"><div class="data-label">Company</div><div class="data-value"><div class="item-entries"><a href="/entry/7628" class="tbx-tooltip item-entry important"><img src="https://static.myfigurecollection.net/upload/entries/0/7628-40502.jpg" alt="Orchid Seed"/><meta name="vars" content="7:7628"/><span switch="オーキッドシード">Orchid Seed</span></a>&nbsp;<small class="light">as <em>Manufacturer</em></small></div></div></div>';

function problemOf(html: string, expected = ID_98777): MfcPageProblem | null {
  const result = parseMfcItemPage(html, expected);
  return result.isOk() ? null : result.error.problem;
}

function parsedPage(html: string): MfcItemPage {
  const result = parseMfcItemPage(html, ID_98777);
  if (result.isErr()) throw new Error(`expected an item page, got ${result.error.problem.kind}`);
  return result.value;
}

describe("parseMfcItemPage on the signed-in 98777 page", () => {
  test("reads the item in Item Database vocabulary", () => {
    expect(parsedPage(item98777)).toEqual({
      mfcItemId: ID_98777,
      title: "Hello, Good-bye - Yukishiro May - 1/7 (Orchid Seed)",
      contentLabel: "explicit",
      mfcRatingId: 3,
      mfcTitle: null,
      numbering: null,
      category: "Prepainted",
      version: [],
      scale: "1/7",
      height: 140,
      width: null,
      depth: null,
      entries: ENTRIES_98777,
      releases: [RELEASE_98777],
      picture: {
        access: "gated",
        url: "https://myfigurecollection.net/?_tb=commit&commit=nsp&objectType=item&objectId=98777&size=1",
      },
      warnings: [],
    });
  });

  test("a page for another item is wrong_item, so it can never overwrite that Item", () => {
    expect(problemOf(item98777, itemId(98_778))).toEqual({ kind: "wrong_item", found: ID_98777 });
  });
});

describe("parseMfcItemPage on pages derived from item-98777.html", () => {
  test("derived public item has no content label, no rating and a public picture", async () => {
    const page = parsedPage(await fixture("derived-public-item.html"));
    expect(page.title).toBe("Hello, Good-bye - Yukishiro May - 1/7 (Orchid Seed)");
    expect(page.contentLabel).toBeNull();
    expect(page.mfcRatingId).toBeNull();
    expect(page.picture).toEqual({
      access: "public",
      url: "https://static.myfigurecollection.net/upload/items/1/98777-a1b2c.jpg",
    });
  });

  test.each([
    ["derived-challenge.html", "challenge"],
    ["derived-not-found-signed-in.html", "not_found"],
    ["derived-not-found-signed-out.html", "not_found"],
  ] as const)("%s is a %s problem", async (name, kind) => {
    expect(problemOf(await fixture(name))).toEqual({ kind });
  });
});

describe("parseMfcItemPage problems", () => {
  test.each(["", "<<<not html", "<html><body><h1 class=title>x</h1></body></html>"])(
    "%p is not an item page",
    (html) => {
      expect(problemOf(html)).toEqual({ kind: "not_an_item_page" });
    },
  );

  test("an empty title is missing_title", () => {
    const html = edit(
      item98777,
      "[Explicit] - Hello, Good-bye - Yukishiro May - 1/7 (Orchid Seed)</h1>",
      "  </h1>",
    );
    expect(problemOf(html)).toEqual({ kind: "missing_title" });
  });

  test("no Category field is missing_category", () => {
    const html = edit(item98777, '<div class="data-label">Category</div>', "");
    expect(problemOf(html)).toEqual({ kind: "missing_category" });
  });

  test("a category myakiba does not know is unsupported_category", () => {
    const html = edit(
      item98777,
      '<span class="item-category-1">Prepainted</span>',
      '<span class="item-category-1">Figurines</span>',
    );
    expect(problemOf(html)).toEqual({ kind: "unsupported_category", raw: "Figurines" });
  });
});

describe("parseMfcItemPage entries", () => {
  test("merges an entry's roles across groups, first role first", () => {
    const twoRoles = COMPANY_FIELD.replace(
      "</div></div></div>",
      '</div><div class="item-entries"><a href="/entry/7628" class="tbx-tooltip item-entry"><span switch="">Orchid Seed</span></a>&nbsp;<small class="light">as <em>Distributor</em></small></div></div></div>',
    );
    const page = parsedPage(edit(item98777, COMPANY_FIELD, twoRoles));
    expect(page.entries.filter((entry) => entry.externalId === 7628)).toEqual([
      {
        externalId: 7628,
        category: "Companies",
        name: "Orchid Seed",
        sourceLabel: "Orchid Seed",
        roles: ["Manufacturer", "Distributor"],
        materialPercentage: null,
      },
    ]);
  });

  test("an entry under two labels keeps the stored category order, not page order", () => {
    const classification =
      '<div class="data-field"><div class="data-label">Classification</div><div class="data-value"><div class="item-entries"><a href="/entry/9613" class="item-entry"><span switch="">Minheru</span></a>&nbsp;<small class="light">as <em>Designer</em></small></div></div></div>';
    const releases = '<div class="data-field"><div class="data-label">Releases';
    const page = parsedPage(edit(item98777, releases, classification + releases));
    expect(page.entries.filter((entry) => entry.externalId === 9613)).toEqual([
      {
        externalId: 9613,
        category: "Classifications",
        name: "Minheru",
        sourceLabel: "Minheru",
        roles: ["Designer", "Sculptor"],
        materialPercentage: null,
      },
    ]);
  });

  test("strips the item number from the Nendoroid entry name only", () => {
    const classification =
      '<div class="data-field"><div class="data-label">Classification</div><div class="data-value"><div class="item-entries"><a href="/entry/23355" class="item-entry"><span switch="">Nendoroid (#1234)</span></a></div><div class="item-entries"><a href="/entry/500" class="item-entry"><span switch="">Figma (#12)</span></a></div></div></div>';
    const page = parsedPage(edit(item98777, COMPANY_FIELD, classification + COMPANY_FIELD));
    expect(
      page.entries
        .filter((entry) => entry.category === "Classifications")
        .map(({ externalId, name, sourceLabel }) => ({ externalId, name, sourceLabel })),
    ).toEqual([
      { externalId: 23_355, name: "Nendoroid", sourceLabel: "Nendoroid (#1234)" },
      { externalId: 500, name: "Figma (#12)", sourceLabel: "Figma (#12)" },
    ]);
  });

  test("reads material percentages", () => {
    const html = edit(
      item98777,
      '<span switch="塩ビ">PVC</span></a></div>',
      '<span switch="塩ビ">PVC</span></a> <small class="light">70%</small></div>',
    );
    expect(
      parsedPage(html)
        .entries.filter((entry) => entry.category === "Materials")
        .map(({ name, materialPercentage }) => ({ name, materialPercentage })),
    ).toEqual([
      { name: "ABS", materialPercentage: 70 },
      { name: "PVC", materialPercentage: 70 },
    ]);
  });
});

describe("parseMfcItemPage warnings", () => {
  test("an unparseable release date drops the release and warns", () => {
    const html = edit(item98777, 'class="time">11/15/2018</a>', 'class="time">Spring 2018</a>');
    const page = parsedPage(html);
    expect(page.releases).toEqual([]);
    expect(page.warnings).toEqual(['release skipped: unsupported date "Spring 2018"']);
  });

  test("an unknown label in the content-label shape stays in the title and warns", () => {
    const html = edit(
      item98777,
      'class="title">[Explicit] - Hello',
      'class="title">[Mature] - Hello',
    );
    const page = parsedPage(html);
    expect(page.title).toBe("[Mature] - Hello, Good-bye - Yukishiro May - 1/7 (Orchid Seed)");
    expect(page.contentLabel).toBeNull();
    expect(page.warnings).toEqual(['unknown title bracket "[Mature]"']);
  });

  test("a bracket that is part of the name does not warn", () => {
    const html = edit(
      item98777,
      'class="title">[Explicit] - Hello',
      'class="title">[Re:Zero] Hello',
    );
    const page = parsedPage(html);
    expect(page.title).toBe("[Re:Zero] Hello, Good-bye - Yukishiro May - 1/7 (Orchid Seed)");
    expect(page.warnings).toEqual([]);
  });

  test("a rejected og:image leaves no picture and warns", () => {
    const raw = "https://static.example.com/upload/items/1/98777.jpg";
    const html = edit(
      item98777,
      'content="https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98777&amp;size=1"',
      `content="${raw}"`,
    );
    const page = parsedPage(html);
    expect(page.picture).toBeNull();
    expect(page.warnings).toEqual([`picture rejected: "${raw}"`]);
  });

  test("an og:image hidden by SFW mode is sfw_hidden, so the item is never imported without its picture", () => {
    const html = edit(
      item98777,
      'content="https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98777&amp;size=1"',
      'content="https://static.myfigurecollection.net/ressources/icons/nsfw.png"',
    );
    expect(problemOf(html)).toEqual({ kind: "sfw_hidden" });
  });

  test("no og:image leaves no picture and no warning", () => {
    const html = edit(
      item98777,
      '<meta property="og:image" content="https://myfigurecollection.net/?_tb=commit&amp;commit=nsp&amp;objectType=item&amp;objectId=98777&amp;size=1"/>',
      "",
    );
    const page = parsedPage(html);
    expect(page.picture).toBeNull();
    expect(page.warnings).toEqual([]);
  });

  test("a field the parser does not read warns", () => {
    const html = edit(
      item98777,
      '<div class="data-label">Various</div>',
      '<div class="data-label">Sculpting</div>',
    );
    const page = parsedPage(html);
    expect(page.mfcRatingId).toBeNull();
    expect(page.warnings).toEqual(['unread field "Sculpting"']);
  });
});

describe("splitContentLabel", () => {
  test.each([
    ["[Intermediate] - A", { title: "A", contentLabel: "intermediate" }],
    ["[Explicit] - A - B", { title: "A - B", contentLabel: "explicit" }],
    ["[Controversial] - A", { title: "A", contentLabel: "controversial" }],
    ["[Re:Zero] Rem", { title: "[Re:Zero] Rem", contentLabel: null }],
    ["[Re:Zero] - Rem", { title: "[Re:Zero] - Rem", contentLabel: null }],
    ["A [Explicit] - B", { title: "A [Explicit] - B", contentLabel: null }],
    ["[Explicit]A", { title: "[Explicit]A", contentLabel: null }],
    ["Plain title", { title: "Plain title", contentLabel: null }],
  ] as const)("%p", (rawTitle, expected) => {
    expect(splitContentLabel(rawTitle)).toEqual(expected);
  });
});
