import { describe, expect, test } from "bun:test";
import { assembleScrapedData } from "./assemble-scraped-data";
import type { ScrapedItem } from "./types";

const nendoroid033 = {
  id: 186,
  title: "Vocaloid - Hatsune Miku - Nendoroid (#033) (Good Smile Company)",
  mfcTitle: null,
  numbering: null,
  category: "Action/Dolls",
  classification: [{ id: 23_355, name: "Nendoroid (#033)", role: "Product line" }],
  origin: [],
  character: [],
  company: [],
  artist: [],
  version: [],
  releaseDate: [
    {
      date: "10/13/2010",
      type: "Standard (Japan)",
      price: 300_000,
      priceCurrency: "JPY",
      barcode: "4582191963372",
    },
  ],
  event: [],
  materials: [],
  scale: "",
  height: 100,
  width: null,
  depth: null,
  image: "https://example.com/item.jpg",
} satisfies ScrapedItem;

const itemWithTwoArtistRoles = {
  ...nendoroid033,
  id: 2_163_938,
  title: "Persona 5 The Royal - Takamaki Anne - Pop Up Parade - Panther (Good Smile Company)",
  classification: [],
  artist: [
    { id: 129_595, name: "Namoji", role: "Sculptor" },
    { id: 129_595, name: "Namoji", role: "Color producer" },
  ],
  releaseDate: [],
  height: 170,
} satisfies ScrapedItem;

const itemWithMaterialPercentages = {
  ...nendoroid033,
  id: 201_038,
  title: "Kyoukai no Kanata - Kuriyama Mirai - Cardigan - Mirai Kuriyama Knit Cardigan (Cospa)",
  mfcTitle: "Mirai Kuriyama Knit Cardigan",
  category: "Apparel",
  classification: [],
  artist: [],
  releaseDate: [],
  materials: [
    { id: 25_887, name: "Acrylic", percentage: 50 },
    { id: 26_315, name: "Wool", percentage: 50 },
  ],
  height: null,
} satisfies ScrapedItem;

describe("assembleScrapedData", () => {
  test("builds item 186 metadata without changing its release UUID contract", () => {
    const assembled = assembleScrapedData([nendoroid033]);

    expect(assembled.items).toEqual([
      {
        externalId: 186,
        source: "mfc",
        title: "Vocaloid - Hatsune Miku - Nendoroid (#033) (Good Smile Company)",
        mfcTitle: null,
        numbering: null,
        category: "Action/Dolls",
        version: [],
        scale: "n/a",
        height: 100,
        width: null,
        depth: null,
        mfcMetadataVersion: 1,
        image: "https://example.com/item.jpg",
      },
    ]);
    expect(assembled.itemReleases).toEqual([
      {
        id: "d2f8873c-7ec8-5aa4-be56-1e1bb7235796",
        itemExternalId: 186,
        date: "2010-10-13",
        type: "Standard (Japan)",
        price: 300_000,
        priceCurrency: "JPY",
        barcode: "4582191963372",
      },
    ]);
  });

  test("keeps item 186's decorated Nendoroid label on its relationship", () => {
    const assembled = assembleScrapedData([nendoroid033]);

    expect(assembled.entryToItems).toEqual([
      {
        entryExternalId: 23_355,
        itemExternalId: 186,
        roles: ["Product line"],
        sourceLabel: "Nendoroid (#033)",
        materialPercentage: null,
      },
    ]);
    expect(assembled.entries).toEqual([
      {
        externalId: 23_355,
        source: "mfc",
        category: "Classifications",
        name: "Nendoroid",
      },
    ]);
  });

  test("aggregates Namoji's two roles on item 2163938", () => {
    const assembled = assembleScrapedData([itemWithTwoArtistRoles]);

    expect(assembled.entryToItems).toEqual([
      {
        entryExternalId: 129_595,
        itemExternalId: 2_163_938,
        roles: ["Sculptor", "Color producer"],
        sourceLabel: "Namoji",
        materialPercentage: null,
      },
    ]);
  });

  test("keeps item 201038's material percentages on its relationships", () => {
    const assembled = assembleScrapedData([itemWithMaterialPercentages]);

    expect(assembled.entryToItems).toEqual([
      {
        entryExternalId: 25_887,
        itemExternalId: 201_038,
        roles: [],
        sourceLabel: "Acrylic",
        materialPercentage: 50,
      },
      {
        entryExternalId: 26_315,
        itemExternalId: 201_038,
        roles: [],
        sourceLabel: "Wool",
        materialPercentage: 50,
      },
    ]);
  });

  test("canonicalizes the shared Nendoroid entry without changing numbered item labels", () => {
    const nendoroid039 = {
      ...nendoroid033,
      id: 1008,
      title: "Vocaloid - Kagamine Rin - Nendoroid (#039) (Good Smile Company)",
      classification: [{ id: 23_355, name: "Nendoroid (#039)", role: "Product line" }],
      releaseDate: [],
    } satisfies ScrapedItem;

    const assembled = assembleScrapedData([nendoroid033, nendoroid039]);

    expect(assembled.entries.filter((entry) => entry.externalId === 23_355)).toEqual([
      {
        externalId: 23_355,
        source: "mfc",
        category: "Classifications",
        name: "Nendoroid",
      },
    ]);
    expect(
      assembled.entryToItems
        .filter((link) => link.entryExternalId === 23_355)
        .map(({ itemExternalId, sourceLabel }) => ({ itemExternalId, sourceLabel })),
    ).toEqual([
      { itemExternalId: 186, sourceLabel: "Nendoroid (#033)" },
      { itemExternalId: 1008, sourceLabel: "Nendoroid (#039)" },
    ]);
  });
});
