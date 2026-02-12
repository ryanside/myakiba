import type { ScrapedItem } from "./types";
import { normalizeDateString } from "@myakiba/utils";
import { v5 as uuidv5 } from "uuid";
import type {
  AssembledScrapedData,
  AssembledItem,
  AssembledItemRelease,
  AssembledEntry,
  AssembledEntryToItem,
  LatestReleaseInfo,
} from "./types";

const RELEASE_UUID_NAMESPACE = "2c8ed313-3f54-4401-a280-2410ce639ef3";

export function assembleScrapedData(
  successfulResults: readonly ScrapedItem[],
): AssembledScrapedData {
  const items: AssembledItem[] = successfulResults.map((scrapedItem) => ({
    externalId: scrapedItem.id,
    source: "mfc" as const,
    title: scrapedItem.title,
    category: scrapedItem.category,
    version: scrapedItem.version,
    scale: scrapedItem.scale,
    height: scrapedItem.height,
    width: scrapedItem.width,
    depth: scrapedItem.depth,
    image: scrapedItem.image,
  }));

  const itemReleases: AssembledItemRelease[] = [];
  const entries: AssembledEntry[] = [];
  const entryToItems: AssembledEntryToItem[] = [];
  const latestReleaseIdByExternalId = new Map<number, LatestReleaseInfo>();

  for (const scraped of successfulResults) {
    for (const classification of scraped.classification) {
      entryToItems.push({
        entryExternalId: classification.id,
        itemExternalId: scraped.id,
        role: classification.role,
      });
      entries.push({
        externalId: classification.id,
        source: "mfc",
        category: "Classifications",
        name: classification.name,
      });
    }

    for (const origin of scraped.origin) {
      entryToItems.push({
        entryExternalId: origin.id,
        itemExternalId: scraped.id,
        role: "",
      });
      entries.push({
        externalId: origin.id,
        source: "mfc",
        category: "Origins",
        name: origin.name,
      });
    }

    for (const character of scraped.character) {
      entryToItems.push({
        entryExternalId: character.id,
        itemExternalId: scraped.id,
        role: "",
      });
      entries.push({
        externalId: character.id,
        source: "mfc",
        category: "Characters",
        name: character.name,
      });
    }

    for (const company of scraped.company) {
      entryToItems.push({
        entryExternalId: company.id,
        itemExternalId: scraped.id,
        role: company.role,
      });
      entries.push({
        externalId: company.id,
        source: "mfc",
        category: "Companies",
        name: company.name,
      });
    }

    for (const artist of scraped.artist) {
      entryToItems.push({
        entryExternalId: artist.id,
        itemExternalId: scraped.id,
        role: artist.role,
      });
      entries.push({
        externalId: artist.id,
        source: "mfc",
        category: "Artists",
        name: artist.name,
      });
    }

    for (const event of scraped.event) {
      entryToItems.push({
        entryExternalId: event.id,
        itemExternalId: scraped.id,
        role: event.role,
      });
      entries.push({
        externalId: event.id,
        source: "mfc",
        category: "Events",
        name: event.name,
      });
    }

    for (const material of scraped.materials) {
      entryToItems.push({
        entryExternalId: material.id,
        itemExternalId: scraped.id,
        role: "",
      });
      entries.push({
        externalId: material.id,
        source: "mfc",
        category: "Materials",
        name: material.name,
      });
    }

    const releasesForItem = scraped.releaseDate.map((release) => {
      const normalizedDate = normalizeDateString(release.date);
      return {
        id: uuidv5(
          `${scraped.id}-${normalizedDate}-${release.type}-${release.price}-${release.priceCurrency}-${release.barcode}`,
          RELEASE_UUID_NAMESPACE,
        ),
        itemExternalId: scraped.id,
        date: normalizedDate,
        type: release.type,
        price: release.price,
        priceCurrency: release.priceCurrency,
        barcode: release.barcode,
      };
    });

    if (releasesForItem.length > 0) {
      const latest = [...releasesForItem].sort((a, b) => a.date.localeCompare(b.date))[
        releasesForItem.length - 1
      ];
      latestReleaseIdByExternalId.set(scraped.id, {
        releaseId: latest.id,
        date: latest.date,
      });
    } else {
      latestReleaseIdByExternalId.set(scraped.id, {
        releaseId: null,
        date: null,
      });
    }

    itemReleases.push(...releasesForItem);
  }

  return {
    items,
    entries,
    entryToItems,
    itemReleases,
    latestReleaseIdByExternalId,
  };
}
