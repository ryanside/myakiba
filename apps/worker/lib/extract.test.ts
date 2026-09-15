import { describe, expect, test } from "bun:test";
import * as cheerio from "cheerio";
import {
  extractDimensions,
  extractEntitiesWithRoles,
  extractMaterialsData,
  extractReleaseData,
} from "./extract";

describe("extractDimensions", () => {
  test("maps item 1730863's length to depth and strips thousands separators", () => {
    const $ = cheerio.load(`
      <div class="data-field">
        <div class="data-value">W=500mm (19.5in) L=1,600mm (62.4in)</div>
      </div>
    `);
    const $field = $(".data-field");

    expect(extractDimensions($field.text(), $field)).toEqual({
      scale: "",
      height: null,
      width: 500,
      depth: 1600,
    });
  });

  test("keeps item 116441's missing axes nullable", () => {
    const $ = cheerio.load('<div class="data-field">H=1,000mm (39in)</div>');
    const $field = $(".data-field");

    expect(extractDimensions($field.text(), $field)).toEqual({
      scale: "",
      height: 1000,
      width: null,
      depth: null,
    });
  });
});

describe("extractEntitiesWithRoles", () => {
  test("preserves Namoji's two roles on item 2163938 in source order", () => {
    const $ = cheerio.load(`
      <div class="data-field">
        <div class="item-entries">
          <a class="item-entry" href="/entry/129595"><span switch>Namoji</span></a>
          <small class="light">as <em>Sculptor</em></small>
        </div>
        <div class="item-entries">
          <a class="item-entry" href="/entry/129595"><span switch>Namoji</span></a>
          <small class="light">as <em>Color producer</em></small>
        </div>
      </div>
    `);

    expect(extractEntitiesWithRoles($(".data-field"), $)).toEqual([
      { id: 129_595, name: "Namoji", role: "Sculptor" },
      { id: 129_595, name: "Namoji", role: "Color producer" },
    ]);
  });
});

describe("extractMaterialsData", () => {
  test("copies item 201038's structured group percentage to each linked material", () => {
    const $ = cheerio.load(`
      <div class="data-field">
        <div class="item-entries">
          <a class="item-entry" href="/entry/25887"><span switch>Acrylic</span></a>
          <a class="item-entry" href="/entry/26315"><span switch>Wool</span></a>
          <small class="light">50%</small>
        </div>
      </div>
    `);

    expect(extractMaterialsData($(".data-field"), $)).toEqual([
      { id: 25_887, name: "Acrylic", percentage: 50 },
      { id: 26_315, name: "Wool", percentage: 50 },
    ]);
  });

  test("keeps item 186's omitted material percentages nullable", () => {
    const $ = cheerio.load(`
      <div class="data-field">
        <div class="item-entries">
          <a class="item-entry" href="/entry/23442"><span switch>ABS</span></a>
          <a class="item-entry" href="/entry/23441"><span switch>PVC</span></a>
        </div>
      </div>
    `);

    expect(extractMaterialsData($(".data-field"), $)).toEqual([
      { id: 23_442, name: "ABS", percentage: null },
      { id: 23_441, name: "PVC", percentage: null },
    ]);
  });
});

describe("extractReleaseData", () => {
  test("keeps item 708290's release identity inputs unchanged", () => {
    const $ = cheerio.load(
      '<div class="data-field"><div class="data-label">Releases</div><div class="data-value"><a class="time">2011</a><small class="light">as <em>Limited + Exclusive (Japan)</em> <em>«M»</em></small><br><a target="_blank" title="Buy">107P201</a></div></div>',
    );

    expect(extractReleaseData($(".data-field"), $)).toEqual([
      {
        date: "2011",
        type: "Limited + Exclusive (Japan) «M»",
        price: 0,
        priceCurrency: "JPY",
        barcode: "107P201",
      },
    ]);
  });
});
