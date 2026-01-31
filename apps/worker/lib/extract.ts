import * as cheerio from "cheerio";
import type { Element } from "domhandler";

export const REGEX_PATTERNS = {
  height: /H=(\d+)mm/,
  width: /W=(\d+)mm/,
  depth: /D=(\d+)mm/,
  price: /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s+(?:<small>)?([A-Z]{3})(?:<\/small>)?/,
  priceCurrency: /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s+(?:<small>)?([A-Z]{3})(?:<\/small>)?/,
  barcode: /([A-Z0-9-]+)$/,
  typeEnd: /\d{2,}|•|JPY|USD|EUR|CNY/,
  trailingSpace: /\s+$/,
  entryId: /\/entry\/(\d+)/,
} as const;

export const extractArrayData = (
  $element: cheerio.Cheerio<Element>,
  selector: string,
  $: cheerio.CheerioAPI,
): string[] => {
  const items: string[] = [];
  const elements = $element.find(selector);
  for (let i = 0; i < elements.length; i++) {
    const text = $(elements[i]).text().trim();
    if (text) items.push(text);
  }
  return items;
};

export const extractArrayDataWithIds = (
  $element: cheerio.Cheerio<Element>,
  $: cheerio.CheerioAPI,
): Array<{ id: number; name: string }> => {
  const items: Array<{ id: number; name: string }> = [];
  const links = $element.find(".item-entry");
  for (let i = 0; i < links.length; i++) {
    const $link = $(links[i]);
    const name = $link.find("span[switch]").text().trim();
    const href = $link.attr("href");

    if (name && href) {
      const entryMatch = href.match(REGEX_PATTERNS.entryId);
      const id = entryMatch ? parseInt(entryMatch[1], 10) : 0;
      items.push({ id, name });
    }
  }
  return items;
};

export const extractEntitiesWithRoles = (
  $element: cheerio.Cheerio<Element>,
  $: cheerio.CheerioAPI,
): Array<{ id: number; name: string; role: string }> => {
  const entities: Array<{ id: number; name: string; role: string }> = [];
  const entries = $element.find(".item-entries");

  for (let i = 0; i < entries.length; i++) {
    const $entry = $(entries[i]);
    const contents = $entry.contents();
    let currentRole = "";
    let tempEntities: Array<{ id: number; name: string; role: string }> = [];

    for (let j = 0; j < contents.length; j++) {
      const node = contents[j];
      const $node = $(node);

      if ($node.hasClass("item-entry")) {
        const name = $node.find("span[switch]").text().trim();
        const href = $node.attr("href");

        if (name && href) {
          const entryMatch = href.match(REGEX_PATTERNS.entryId);
          const id = entryMatch ? parseInt(entryMatch[1], 10) : 0;
          tempEntities.push({ id, name, role: "" });
        }
      } else if ($node.is("small.light") && $node.find("em").length > 0) {
        currentRole = $node.find("em").text().trim();

        // Apply role to all temp entities and move them to main array
        for (const entity of tempEntities) {
          entity.role = currentRole;
          entities.push(entity);
        }
        tempEntities = [];
      }
    }

    // Handle any remaining entities without explicit roles
    for (const entity of tempEntities) {
      entity.role = currentRole;
      entities.push(entity);
    }
  }

  return entities;
};

export const extractDimensions = (dimensionText: string, $element: cheerio.Cheerio<Element>) => {
  let scale = "";
  let height = 0;
  let width = 0;
  let depth = 0;

  const scaleElement = $element.find("a.item-scale");
  if (scaleElement.length > 0) {
    scale = scaleElement.text().trim();
  }

  const heightMatch = dimensionText.match(REGEX_PATTERNS.height);
  if (heightMatch) height = parseInt(heightMatch[1], 10);

  const widthMatch = dimensionText.match(REGEX_PATTERNS.width);
  if (widthMatch) width = parseInt(widthMatch[1], 10);

  const depthMatch = dimensionText.match(REGEX_PATTERNS.depth);
  if (depthMatch) depth = parseInt(depthMatch[1], 10);

  return { scale, height, width, depth };
};

export const extractReleaseData = ($element: cheerio.Cheerio<Element>, $: cheerio.CheerioAPI) => {
  const releaseDate: Array<{
    date: string;
    type: string;
    price: number;
    priceCurrency: string;
    barcode: string;
  }> = [];

  const allReleaseFields = $element.add(
    $element.nextAll(".data-field").filter((_, field) => {
      const $field = $(field);
      return $field.find(".data-label").length === 0 || $field.hasClass("item-extra-release");
    }),
  );

  for (let i = 0; i < allReleaseFields.length; i++) {
    const $releaseField = $(allReleaseFields[i]);
    const dateElement = $releaseField.find("a.time");

    if (dateElement.length > 0) {
      const date = dateElement.text().trim();
      const valueText = $releaseField.find(".data-value").text();

      // Extract type from <em> tags within <small class="light"> elements
      let type = "";
      const $smallLight = $releaseField.find("small.light");
      const emElements = $smallLight.find("em");

      if (emElements.length > 0) {
        // Concatenate all <em> tag contents to handle multiple em tags
        const typeComponents: string[] = [];
        for (let j = 0; j < emElements.length; j++) {
          const emText = $(emElements[j]).text().trim();
          if (emText) {
            typeComponents.push(emText);
          }
        }
        type = typeComponents.join(" ");
      }

      const priceMatch = valueText.match(REGEX_PATTERNS.price);
      const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : 0;

      const priceCurrencyMatch = valueText.match(REGEX_PATTERNS.priceCurrency);
      const priceCurrency = priceCurrencyMatch ? priceCurrencyMatch[2] : "JPY";

      const barcodeMatch = valueText.match(REGEX_PATTERNS.barcode);
      const barcode = barcodeMatch ? barcodeMatch[1] : "";

      releaseDate.push({ date, type, price, priceCurrency, barcode });
    }
  }

  return releaseDate;
};

export const extractMaterialsData = (
  $element: cheerio.Cheerio<Element>,
  $: cheerio.CheerioAPI,
): Array<{ id: number; name: string }> => {
  const materials: Array<{ id: number; name: string }> = [];
  const entries = $element.find(".item-entry");
  for (let i = 0; i < entries.length; i++) {
    const $entry = $(entries[i]);
    const name = $entry.find("span[switch]").text().trim();
    const href = $entry.attr("href");

    if (name && href) {
      const entryMatch = href.match(REGEX_PATTERNS.entryId);
      const id = entryMatch ? parseInt(entryMatch[1], 10) : 0;
      materials.push({ id, name });
    }
  }
  return materials;
};
